import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createReadStream, createWriteStream} from 'node:fs';
import {readFile, stat, mkdir, writeFile} from 'node:fs/promises';
import {resolve, relative, isAbsolute, extname} from 'node:path';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable, Transform} from 'node:stream';
import {cpus, platform} from 'node:os';
import {pathToFileURL} from 'node:url';

const {chromium} = await import(pathToFileURL(resolve('frontend/node_modules/playwright/index.mjs')));
const root = resolve('frontend/benchmark-results/prefix-cache');
const generate = process.argv.includes('--generate');
const quick = process.argv.includes('--quick');
const config = JSON.parse(await readFile('frontend/src/llm/localModelConfig.json', 'utf8'));
const modelFile = resolve('.cache/models', config.model_file);
await mkdir(resolve('.cache/models'), {recursive: true});
try { await stat(modelFile); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`);
  if (!response.ok || !response.body) throw new Error(`Model download failed: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelFile));
}
const hashFile = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
assert.equal((await stat(modelFile)).size, config.model_file_bytes);
assert.equal(await hashFile(modelFile), config.model_file_sha256);
const runtime = JSON.parse(await readFile(resolve(root, 'runtime-manifest.json'), 'utf8'));
assert.equal(await hashFile(resolve(root, 'runtime.js')), runtime.js_sha256);
assert.equal(await hashFile(resolve(root, 'runtime.wasm')), runtime.wasm_sha256);
const result = {platform: platform(), cpu: cpus()[0]?.model, model_sha256: config.model_file_sha256,
  runtime, started_at: new Date().toISOString(), runs: []};
const resultFile = resolve(root, `results-${platform()}.json`);
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname));
    const rel = relative(root, path);
    if (rel.startsWith('..') || isAbsolute(rel)) {res.writeHead(403).end(); return;}
    const headers = {'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'};
    if (req.method === 'PUT' && generate && /^\/slot-[0-3]\.bin$/.test(url.pathname)) {
      let bytes = 0;
      const limit = new Transform({transform(chunk, _, callback) {
        bytes += chunk.length;
        callback(bytes > 256 * 1024 * 1024 ? new Error('State too large') : null, chunk);
      }});
      await pipeline(req, limit, createWriteStream(path));
      res.writeHead(201, headers).end(); return;
    }
    if (req.method !== 'GET') {res.writeHead(405).end(); return;}
    const file = url.pathname === '/model.gguf' ? modelFile
      : url.pathname === '/' ? resolve(root, 'index.html') : path;
    const type = {'.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wasm': 'application/wasm'}[extname(file)] || 'application/octet-stream';
    res.writeHead(200, {...headers, 'Content-Type': type, 'Content-Length': (await stat(file)).size});
    const stream = createReadStream(file);
    stream.pipe(res);
    res.on('close', () => stream.destroy());
  } catch (error) {if (!res.headersSent) res.writeHead(500); res.end(String(error));}
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser;
async function session(kind) {
  // A new browser process proves that no live worker or in-memory KV survived.
  browser = await chromium.launch({headless: true});
  result.browser = browser.version();
  const page = await browser.newPage();
  page.on('console', message => {
    const text = message.text();
    if (/^(WARM_STAGE|CLASSIFICATION_CASE|SUPPORT_CASE|GUIDANCE_CASE)=/.test(text)) console.log(text);
    else if (message.type() === 'error') console.error('BROWSER_ERROR=' + text.slice(0, 1500));
  });
  page.on('pageerror', error => console.error('PAGE_ERROR=' + error.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.prefixBenchmark);
  const row = {kind, ...await page.evaluate(stock => window.prefixBenchmark.load(stock), kind === 'stock')};
  result.runs.push(row);
  console.log('MODEL_LOAD=' + JSON.stringify(row));
  if (kind === 'restored') row.preparation = await page.evaluate(() => window.prefixBenchmark.restore());
  else row.preparation = await page.evaluate(() => window.prefixBenchmark.warm());
  row.ready_ms = row.load_ms + (row.preparation.warm_ms ?? row.preparation.restore_ms);
  console.log('PREPARATION=' + JSON.stringify(row));
  if (kind === 'producer') {
    const manifest = {...await page.evaluate(() => window.prefixBenchmark.save()), runtime};
    for (const slot of manifest.slots) {
      assert.equal(await hashFile(resolve(root, slot.file)), slot.sha256);
      assert.equal((await stat(resolve(root, slot.file))).size, slot.bytes);
    }
    await writeFile(resolve(root, 'prefix-manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('STATIC_STATE=' + JSON.stringify(manifest));
  } else row.checks = await page.evaluate(quick => window.prefixBenchmark.checks(quick), quick);
  await writeFile(resultFile, JSON.stringify(result, null, 2));
  await browser.close(); browser = null;
  return row;
}
try {
  const baseline = await session(generate ? 'producer' : 'stock');
  const restored = await session('restored');
  assert.ok(restored.ready_ms < baseline.ready_ms * 0.5, 'Preparation must improve by at least 50%');
  const {classification, support, guidance} = restored.checks;
  const correct = classification.filter(row => row.actual === row.expected).length;
  assert.ok(correct >= (quick ? 1 : 38), `Classifier accuracy fell: ${correct}/${classification.length}`);
  assert.ok(support.every(row => row.actual === row.expected), 'Support selection regressed');
  assert.ok(classification[0].traces[0].timings.cache_n >= 800, 'Classifier prefix was recomputed');
  assert.ok(support[0].traces[0].timings.cache_n >= 440, 'Reference prefix was recomputed');
  assert.ok(support[2].traces[0].timings.cache_n >= 210, 'Scope prefix was recomputed');
  assert.ok(guidance[0].traces.at(-1).timings.cache_n >= 260, 'Guidance prefix was recomputed');
  if (baseline.checks) {
    assert.deepEqual(classification.map(row => row.token), baseline.checks.classification.map(row => row.token),
      'Restoring state changed classifier outputs');
    assert.deepEqual(support.map(row => row.actual), baseline.checks.support.map(row => row.actual),
      'Restoring state changed support outputs');
    result.guidance_comparison = guidance.map((row, i) => ({name: row.name,
      stock_status: baseline.checks.guidance[i].result.status, restored_status: row.result.status,
      same_text: row.result.text === baseline.checks.guidance[i].result.text,
      stock_ms: baseline.checks.guidance[i].latency_ms, restored_ms: row.latency_ms}));
    for (let i = 0; i < guidance.length; i++) {
      const before = baseline.checks.guidance[i].result;
      const after = guidance[i].result;
      if (before.status === 'success' && after.status === 'success') assert.equal(after.text, before.text,
        `Static state changed generated text for ${guidance[i].name}`);
    }
  }
  result.summary = {stock_ready_ms: baseline.ready_ms, restored_ready_ms: restored.ready_ms,
    speedup: Math.round(baseline.ready_ms / restored.ready_ms * 10) / 10,
    classification: `${correct}/${classification.length}`, support: `${support.length}/${support.length}`,
    generation_success: guidance.filter(row => row.result.status === 'success').length,
    generation_total: guidance.length};
  console.log('PREFIX_CACHE_SUMMARY=' + JSON.stringify(result.summary));
} catch (error) {
  result.error = error.stack;
  throw error;
} finally {
  await writeFile(resultFile, JSON.stringify(result, null, 2));
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
