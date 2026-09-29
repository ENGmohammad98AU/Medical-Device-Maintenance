// Exercise the built application, its client, and its production model worker.
// Run only in a normal/CI browser environment; no inference or clocks are mocked.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream, createWriteStream} from 'node:fs';
import {readFile, writeFile, mkdir, stat, mkdtemp, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {resolve, relative, isAbsolute, extname, join} from 'node:path';
import {tmpdir, cpus, platform} from 'node:os';
import {pathToFileURL} from 'node:url';

const {chromium} = await import(pathToFileURL(resolve('frontend/node_modules/playwright/index.mjs')));
const readJSON = async path => JSON.parse(await readFile(path, 'utf8'));
const config = await readJSON('frontend/src/llm/localModelConfig.json');
const supportConfig = await readJSON('frontend/src/llm/supportModelConfig.json');
const guidanceConfig = await readJSON('frontend/src/llm/guidanceModelConfig.json');
const guidanceCases = await readJSON('frontend/src/llm/guidanceCases.json');
const classificationCases = await readJSON('frontend/src/llm/benchmarkCases.json');
const supportCases = await readJSON('frontend/src/llm/supportSmokeCases.json');
const bundle = await readJSON('frontend/src/llm/staticPrefixBundle.json');
const baseline = await readJSON('tools/prefix-cache/benchmark-baseline.json');
assert.equal(createHash('sha256').update(await readFile('frontend/src/llm/benchmarkCases.json')).digest('hex'), baseline.dataset_sha256);
assert.equal(config.model_file_sha256, baseline.model_sha256);
const threads = Number(process.env.BENCHMARK_THREADS || 4);
const full = threads === 4;
const root = resolve('frontend/dist');
const modelFile = resolve('.cache/models', config.model_file);
await mkdir(resolve('.cache/models'), {recursive: true});
try {await stat(modelFile);} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`);
  if (!response.ok || !response.body) throw new Error(`Model download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelFile));
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(modelFile)) hash.update(chunk);
assert.equal(hash.digest('hex'), config.model_file_sha256);
assert.equal((await stat(modelFile)).size, config.model_file_bytes);

const result = {platform: platform(), cpu: cpus()[0]?.model, threads_requested: threads,
  model_sha256: config.model_file_sha256, bundle: bundle.id, measured_at: new Date().toISOString(),
  transfer_note: 'Model and static states served from localhost; Internet transfer excluded.', sessions: []};
const output = resolve(`frontend/benchmark-results/prefix-integration-${threads}.json`);
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let file = path === '/benchmark-model.gguf' ? modelFile : resolve(root, '.' + path);
    const rel = relative(root, file);
    if (file !== modelFile && (rel.startsWith('..') || isAbsolute(rel))) {res.writeHead(403).end(); return;}
    let info;
    try {info = await stat(file); if (!info.isFile()) throw new Error('Not a file');}
    catch {file = join(root, 'index.html'); info = await stat(file);}
    const types = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css'};
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Content-Length': info.size,
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless',
      'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'no-store'});
    const stream = createReadStream(file); stream.pipe(res); res.on('close', () => stream.destroy());
  } catch (error) {if (!res.headersSent) res.writeHead(500); res.end(String(error));}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(join(tmpdir(), 'mdm-prefix-integration-'));
let context, page;
let sequence = 100;
async function openSession(kind, slow = false) {
  context = await chromium.launchPersistentContext(profile, {headless: true});
  result.browser = context.browser().version();
  page = context.pages()[0];
  const row = {kind, transfers: {model: 0, states: 0, state_bytes: 0}, preparation: null, progress: []};
  result.sessions.push(row);
  await context.addInitScript(({threads}) => {
    window.__results = [];
    window.__progress = [];
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        if (!String(args[0]).includes('localModel.worker')) return;
        window.__modelWorker = this;
        const send = this.postMessage.bind(this);
        this.postMessage = message => send({...message, force_cpu: true, benchmark_threads: threads,
          serial_analysis: message.serial_analysis ?? window.__serialAnalysis});
        this.addEventListener('message', ({data}) => {
          if (data.progress) window.__progress.push({...data.progress, at: performance.now()});
          if (data.result) window.__results.push(data.result);
        });
      }
    };
  }, {threads});
  page.on('pageerror', error => console.error('PAGE_ERROR=' + error.message));
  page.on('console', message => {
    if (message.text().startsWith('Local model:')) console.log(message.text());
  });
  page.on('request', request => {
    if (request.url().endsWith('/benchmark-model.gguf')) row.transfers.model++;
    const slot = request.url().match(/\/slot-([0-3])\.bin$/);
    if (slot) {row.transfers.states++; row.transfers.state_bytes += bundle.manifest.slots[Number(slot[1])].bytes;}
  });
  await context.route(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`,
    route => route.fulfill({status: 307, headers: {location: origin + '/benchmark-model.gguf', 'Access-Control-Allow-Origin': '*'}}));
  if (slow) await context.route('**/slot-*.bin', async route => {
    // A real blocked request exercises the five-second watchdog and native
    // warmup fallback; it does not alter inference or the application's timers.
    await new Promise(resolve => setTimeout(resolve, 6500));
    await route.abort('failed').catch(() => {});
  });
  await page.goto(origin + '/local-model');
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  const start = performance.now();
  await page.getByRole('button', {name: 'تجهيز النموذج مسبقًا', exact: true}).click();
  await page.waitForFunction(() => window.__results.length > 0, null, {timeout: 15 * 60_000});
  row.wall_ms = Math.round(performance.now() - start);
  row.preparation = await page.evaluate(() => window.__results.at(-1));
  row.progress = await page.evaluate(() => window.__progress);
  assert.equal(row.preparation.status, 'success', JSON.stringify(row.preparation));
  await page.getByText('النموذج جاهز.', {exact: false}).waitFor();
  const events = row.progress;
  row.phases = events.filter((event, index) => index === 0 || event.stage !== events[index - 1].stage
    || event.task !== events[index - 1].task || event.preparation_source !== events[index - 1].preparation_source);
  row.init_and_preparation_ms = Math.round(events.at(-1).at - (events.find(event => event.stage === 'initializing')?.at ?? events[0].at));
  console.log('PRODUCTION_PREPARATION=' + JSON.stringify({...row, progress: undefined}));
  await writeFile(output, JSON.stringify(result, null, 2));
  return row;
}
async function closeSession() {await context.close(); context = null;}
async function infer(input, serial = false) {
  const id = ++sequence;
  const start = performance.now();
  const measured = await page.evaluate(({input, id, serial}) => new Promise((resolve, reject) => {
    const worker = window.__modelWorker;
    const timer = setTimeout(() => {worker.removeEventListener('message', listener); reject(new Error('Production inference timed out'));}, 46_000);
    const listener = ({data}) => {
      if (data.id !== id || !data.result) return;
      clearTimeout(timer); worker.removeEventListener('message', listener); resolve(data.result);
    };
    worker.addEventListener('message', listener);
    worker.postMessage({id, input, serial_analysis: serial, inference_budget_ms: 45_000});
  }), {input, id, serial});
  return {...measured, wall_ms: Math.round(performance.now() - start)};
}
async function guidance(serial) {
  const rows = [];
  result[serial ? 'serial_guidance' : 'parallel_guidance'] = rows;
  await page.evaluate(serial => {window.__serialAnalysis = serial;}, serial);
  await page.getByRole('combobox').nth(0).click();
  await page.getByRole('option', {name: 'توليد إرشادات نصية قصيرة', exact: true}).click();
  for (const sample of guidanceCases) {
    // Use the UI/client for guidance so its real hard deadline can terminate
    // unresponsive WASM. A raw-worker listener would bypass that protection.
    const prepare = page.getByRole('button', {name: 'تجهيز النموذج مسبقًا', exact: true});
    if (await prepare.isEnabled()) {
      await prepare.click();
      await page.getByText('النموذج جاهز.', {exact: false}).waitFor({timeout: 30_000});
    }
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', {name: sample.name, exact: true}).click();
    const before = await page.evaluate(() => window.__results.length);
    const start = performance.now();
    await page.getByRole('button', {name: 'تشغيل النموذج مجانًا', exact: true}).click();
    await page.waitForFunction(before => window.__results.length > before
      || Array.from(document.querySelectorAll('[role="alert"]')).some(node => node.textContent.includes('The shared 45-second inference budget expired.')),
    before, {timeout: 48_000});
    const received = await page.evaluate(before => window.__results.length > before ? window.__results.at(-1) : null, before);
    const measured = {...(received || {status: 'error', error_code: 'timeout', client_timeout: true}),
      wall_ms: Math.round(performance.now() - start)};
    rows.push({name: sample.name, ...measured});
    console.log('PRODUCTION_GUIDANCE=' + JSON.stringify({serial, ...rows.at(-1)}));
    if (full) {
      assert.equal(measured.status, 'success');
      assert.equal(measured.support?.status, 'success');
      assert.ok(measured.wall_ms < 45_000);
    } else {
      assert.ok(measured.status === 'success' || measured.error_code === 'timeout');
      assert.ok(measured.wall_ms < 46_000, 'Single-thread UI did not enforce the hard deadline');
    }
  }
  const prepare = page.getByRole('button', {name: 'تجهيز النموذج مسبقًا', exact: true});
  if (await prepare.isEnabled()) {
    await prepare.click();
    await page.getByText('النموذج جاهز.', {exact: false}).waitFor({timeout: 30_000});
  }
  return rows;
}
try {
  const first = await openSession('first-visit');
  assert.equal(first.preparation.preparation_source, 'bundled');
  assert.equal(first.preparation.preparation_cached, true);
  assert.equal(first.transfers.states, 4);
  assert.ok(!first.progress.some(event => event.stage === 'warming'));
  if (full) result.serial_guidance = await guidance(true);
  await closeSession();

  const repeat = await openSession('fresh-browser-saved-state');
  assert.equal(repeat.preparation.preparation_source, 'stored');
  assert.equal(repeat.transfers.states, 0);
  assert.equal(repeat.transfers.model, 0);
  assert.ok(repeat.init_and_preparation_ms < 30_000, 'Saved preparation took too long');
  assert.ok(!repeat.progress.some(event => event.stage === 'warming'));
  result.parallel_guidance = await guidance(false);
  result.classification = [];
  for (const [index, sample] of classificationCases.entries()) {
    const measured = await infer({report_text: sample.report_text, device_type: sample.device_type, patient_connected: sample.patient_connected});
    const row = {name: sample.name, expected: sample.expected, actual: config.categories[measured.output_token], ...measured};
    result.classification.push(row);
    assert.equal(measured.status, 'success');
    assert.equal(sample.name, baseline.classification[index].name);
    assert.equal(measured.output_token, baseline.classification[index].token, `Classifier changed: ${sample.name}`);
  }
  result.support = [];
  for (const sample of supportCases) {
    const measured = await infer({report_text: sample.report_text, device_type: 'VENTILATOR', patient_connected: false,
      support_context: {...sample, device_name: 'Medical ventilator', version: supportConfig.version, input_sha256: '0'.repeat(64)}});
    result.support.push({name: sample.name, ...measured});
    assert.equal(measured.support?.output_token, sample.expected);
  }
  if (full) {
    for (let index = 0; index < guidanceCases.length; index++) {
      const before = result.serial_guidance[index], after = result.parallel_guidance[index];
      assert.equal(after.output_token, before.output_token);
      assert.equal(after.support.output_token, before.support.output_token);
      if (before.guidance.status === 'success') {
        assert.equal(after.guidance.status, 'success', `Generation regressed: ${after.name}`);
        assert.equal(after.guidance.text, before.guidance.text, `Generated text changed: ${after.name}`);
      }
    }
    const sum = rows => rows.reduce((total, row) => total + row.wall_ms, 0);
    result.comparison = {serial_ms: sum(result.serial_guidance), parallel_ms: sum(result.parallel_guidance),
      serial_success: result.serial_guidance.filter(row => row.guidance.status === 'success').length,
      parallel_success: result.parallel_guidance.filter(row => row.guidance.status === 'success').length};
    result.comparison.faster = result.comparison.parallel_ms < result.comparison.serial_ms * 0.95;
    // Corrupt only our first static slot. Keep cached weights intact.
    await page.evaluate(async () => {
      for (const key of await caches.keys()) if (key.startsWith('mdm-static-prefix-v1-')) {
        const cache = await caches.open(key);
        const request = (await cache.keys()).find(request => request.url.endsWith('slot-0.bin'));
        await cache.put(request, new Response(new Uint8Array(64)));
      }
    });
    await closeSession();
    const fallback = await openSession('corrupt-state-and-slow-network', true);
    assert.equal(fallback.preparation.preparation_source, 'computed');
    assert.equal(fallback.preparation.preparation_cached, true);
    assert.ok(fallback.progress.some(event => event.preparation_fallback === 'slow_network'));
    assert.deepEqual(fallback.progress.filter(event => event.stage === 'warming').map(event => event.task),
      ['classification', 'reference_selection', 'scope', 'generation']);
    await closeSession();
    const repaired = await openSession('fresh-browser-after-repair');
    assert.equal(repaired.preparation.preparation_source, 'stored');
    assert.equal(repaired.transfers.states, 0);
  }
  result.completed = true;
  console.log('PRODUCTION_SUMMARY=' + JSON.stringify({completed: true, threads, comparison: result.comparison,
    classification: result.classification.filter(row => row.actual === row.expected).length,
    guidance_success: result.parallel_guidance.filter(row => row.guidance?.status === 'success').length}));
} catch (error) {result.error = error.stack; throw error;}
finally {
  await writeFile(output, JSON.stringify(result, null, 2));
  if (context) {
    await page.screenshot({path: output.replace('.json', '.png'), fullPage: true}).catch(() => {});
    await closeSession();
  }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
}
