// Exercise the actual production worker and UI, including all three prompt
// families. A locally supplied, SHA-verified model avoids repeated downloads.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {readFile, stat, mkdir, writeFile, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve, relative, isAbsolute, extname, join} from 'node:path';
import {tmpdir, cpus, platform} from 'node:os';
import {chromium} from 'playwright';

const baseline = process.argv.includes('--baseline');
const generation = process.argv.includes('--generation');
const root = resolve(process.env.BENCHMARK_DIST || 'dist');
const config = JSON.parse(await readFile('src/llm/localModelConfig.json', 'utf8'));
const cases = JSON.parse(await readFile('src/llm/supportSmokeCases.json', 'utf8'));
const deviceCases = JSON.parse(await readFile('src/llm/deviceRegressionCases.json', 'utf8'));
const supportConfig = JSON.parse(await readFile('src/llm/supportModelConfig.json', 'utf8'));
const generationCases = JSON.parse(await readFile('src/llm/guidanceCases.json', 'utf8'));
const localModel = process.env.LLM_MODEL_FILE;
if (localModel) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(localModel)) hash.update(chunk);
  assert.equal(hash.digest('hex'), config.model_file_sha256, 'Model weights must match the pinned manifest');
}
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const headers = {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless',
      'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin'};
    if (path === '/benchmark-model.gguf' && localModel) {
      res.writeHead(200, {...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': (await stat(localModel)).size});
      const stream = createReadStream(localModel); stream.pipe(res);
      res.on('close', () => stream.destroy()); return;
    }
    let file = resolve(root, '.' + path);
    const rel = relative(root, file);
    if (rel.startsWith('..') || isAbsolute(rel)) { res.writeHead(403).end(); return; }
    let data;
    try { data = await readFile(file); }
    catch { file = join(root, 'index.html'); data = await readFile(file); }
    const types = {'.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css'};
    res.writeHead(200, {...headers, 'Content-Type': types[extname(file)] || 'text/html'}).end(data);
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise(resolve => server.listen(4175, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:4175';
const profile = await mkdtemp(join(tmpdir(), 'prepared-llm-'));
const context = await chromium.launchPersistentContext(profile, {headless: true,
  executablePath: process.env.BROWSER_EXECUTABLE || undefined, args: ['--no-sandbox']});
const page = context.pages()[0];
page.on('pageerror', error => console.error(error.message));
page.on('console', msg => {
  if (msg.type() === 'warning' || msg.type() === 'error')
    console.log(msg.text().slice(0, msg.text().startsWith('GENERATION_TRACE=') ? 6000 : 300));
});
await context.addInitScript(() => {
  // Collect real worker results without replacing inference or timers.
  window.__modelResults = [];
  const NativeWorker = window.Worker;
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args);
      if (String(args[0]).includes('localModel.worker')) window.__localModelWorker = this;
      this.addEventListener('message', event => {
      if (event.data.progress?.stage === 'running') console.warn('INFERENCE_STAGE=' + JSON.stringify({id: event.data.id, task: event.data.progress.task}));
      if (event.data.result) window.__modelResults.push(event.data.result);
    }); }
  };
});
if (localModel) await context.route(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`,
  route => route.fulfill({status: 307, headers: {location: origin + '/benchmark-model.gguf', 'Access-Control-Allow-Origin': '*'}}));
const result = {kind: generation ? 'prepared-generation' : baseline ? 'unprepared-baseline' : 'prepared-production', model: config.model,
  revision: config.revision, model_sha256: config.model_file_sha256, browser: context.browser().version(),
  measured_at: new Date().toISOString(), machine: {os: platform(), cpu: cpus()[0]?.model, logical_cpus: cpus().length},
  model_source: localModel ? 'SHA-verified local file; Internet download excluded' : 'model host',
  preparation_ms: 0, rows: []};
await mkdir('benchmark-results', {recursive: true});
try {
  await page.goto(origin + '/local-model');
  result.browser_threads = await page.evaluate(() => Math.min(4, navigator.hardwareConcurrency));
  result.isolated = await page.evaluate(() => crossOriginIsolated);
  assert.equal(result.isolated, true);
  if (!baseline) {
    const start = performance.now();
    await page.getByRole('button', {name: 'تجهيز النموذج مسبقًا', exact: true}).click();
    await page.getByText('النموذج جاهز.', {exact: false}).waitFor({timeout: 15 * 60_000});
    result.preparation_ms = Math.round(performance.now() - start);
    console.log('PREPARATION_MS=' + result.preparation_ms);
  }
  if (generation) {
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', {name: 'توليد إرشادات نصية قصيرة', exact: true}).click();
    // Exercise Arabic first, then switch languages and devices on the same
    // prepared worker. Every case still must independently pass the deadline.
    for (const sample of [...generationCases.slice(-1), ...generationCases.slice(0, -1)]) {
      console.log('GENERATION_CASE_START=' + sample.name);
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', {name: sample.name, exact: true}).click();
      const before = await page.evaluate(() => window.__modelResults.length);
      const start = performance.now();
      await page.getByRole('button', {name: 'تشغيل النموذج مجانًا', exact: true}).click();
      await page.waitForFunction(n => window.__modelResults.length > n, before, {timeout: 50_000});
      const measured = await page.evaluate(() => window.__modelResults.at(-1));
      const row = {name: sample.name, report_text: sample.report_text, wall_ms: Math.round(performance.now() - start), ...measured};
      result.rows.push(row); console.log('GENERATED_CASE=' + JSON.stringify(row));
      row.correct = measured.status === 'success' && measured.guidance?.status === 'success'
        && new RegExp(sample.relevance, 'i').test(measured.guidance.text) && row.wall_ms < 45_000;
      assert.equal(measured.reused_result, undefined);
      if (measured.guidance?.status === 'success') await page.getByTestId('generation-preview').waitFor();
    }
    assert.ok(result.rows.every(row => row.correct), JSON.stringify(result.rows.filter(row => !row.correct)));
  }
  // Alternate references and no-reference requests, then return to references.
  // Every report is distinct; no exact-result cache can satisfy these requests.
  for (const index of (generation ? [] : [0, 2, 1, 4, 3, 5])) {
    const sample = cases[index];
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', {name: sample.name, exact: true}).click();
    const before = await page.evaluate(() => window.__modelResults.length);
    const start = performance.now();
    await page.getByRole('button', {name: 'تشغيل النموذج مجانًا', exact: true}).click();
    await page.waitForFunction(n => window.__modelResults.length > n, before, {timeout: baseline ? 15 * 60_000 : 50_000});
    const measured = await page.evaluate(() => window.__modelResults.at(-1));
    const row = {name: sample.name, expected: sample.expected, wall_ms: Math.round(performance.now() - start), ...measured};
    result.rows.push(row); console.log('PREPARED_CASE=' + JSON.stringify(row));
    assert.equal(measured.status, 'success');
    assert.equal(measured.support?.status, 'success');
    assert.equal(measured.support?.output_token, sample.expected);
    assert.equal(measured.reused_result, undefined);
    if (!baseline) assert.ok(row.wall_ms < 45_000, 'Fresh classification and reference selection must finish within the shared inference budget');
    await page.getByText(/اكتمل تشغيل النموذج على هذا المتصفح/).waitFor();
  }
  // Exercise production inference for the three supported device types. These
  // synthetic contexts are checked against the real server candidate builder
  // by test_device_support_regressions.py; no classification is mocked here.
  result.device_rows = [];
  for (const [index, sample] of (baseline || generation ? [] : deviceCases).entries()) {
    const start = performance.now();
    const measured = await page.evaluate(async ({sample, version, id}) => {
      const worker = window.__localModelWorker;
      if (!worker) throw new Error('Production model worker was not captured');
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { worker.removeEventListener('message', listener); reject(new Error('Device regression timeout')); }, 45_000);
        const listener = event => {
          if (event.data.id === id && event.data.result) {
            clearTimeout(timer); worker.removeEventListener('message', listener); resolve(event.data.result);
          }
        };
        worker.addEventListener('message', listener);
        worker.postMessage({id, input: {report_text: sample.report_text, device_type: sample.device_type,
          patient_connected: false, support_context: {version, input_sha256: '0'.repeat(64),
            report_text: sample.report_text, device_name: sample.device_name, candidates: sample.candidates}}});
      });
    }, {sample, version: supportConfig.version, id: 10_000 + index});
    const row = {name: sample.name, expected_category: sample.expected_category,
      predicted_category: config.categories[measured.output_token], expected_support: sample.expected_support,
      wall_ms: Math.round(performance.now() - start), ...measured};
    result.device_rows.push(row); console.log('DEVICE_REGRESSION=' + JSON.stringify(row));
    row.correct = measured.status === 'success' && measured.prompt_version === config.prompt_version
      && row.predicted_category === sample.expected_category && measured.support?.output_token === sample.expected_support
      && row.wall_ms < 45_000;
  }
  assert.ok(result.device_rows.every(row => row.correct), JSON.stringify(result.device_rows.filter(row => !row.correct)));
  result.mean_ms = Math.round(result.rows.reduce((n, r) => n + r.wall_ms, 0) / result.rows.length);
  result.max_ms = Math.max(...result.rows.map(r => r.wall_ms));
  result.completed = true;
} catch (error) { result.error = String(error); throw error; }
finally {
  await writeFile(`benchmark-results/${result.kind}.json`, JSON.stringify(result, null, 2) + '\n');
  await page.screenshot({path: `benchmark-results/${result.kind}.png`, fullPage: true}).catch(() => {});
  await context.close(); await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
}
