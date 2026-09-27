// Read-only check of public model assets and backend version. No sign-in or maintenance writes.
import {readFile, writeFile} from 'node:fs/promises';
const base = 'https://medical-app-frontend-8iiq.onrender.com/';
const api = 'https://medical-app-api-inl9.onrender.com/';
const expected = JSON.parse(await readFile(new URL('../src/llm/localModelConfig.json', import.meta.url), 'utf8'));
const guidance = JSON.parse(await readFile(new URL('../src/llm/guidanceModelConfig.json', import.meta.url), 'utf8'));
const engine = expected.runtime.split('/')[0];
async function resource(path, origin = base) {
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) throw new Error('Unexpected asset origin');
  const response = await fetch(url, {headers: {'Cache-Control': 'no-cache'}, redirect: 'error', signal: AbortSignal.timeout(10000)});
  if ([401, 403, 429].includes(response.status)) { const error = new Error('Public deployment check refused: HTTP ' + response.status); error.fatal = true; throw error; }
  if (!response.ok) throw new Error('Deployment asset HTTP ' + response.status);
  return response;
}
async function verify() {
  const candidate = await (await resource('llm/candidate.json')).json();
  if (JSON.stringify(candidate.config) !== JSON.stringify(expected)) throw new Error('Waiting for the expected model manifest');
  const html = await (await resource('local-model')).text();
  const entry = html.match(/<script[^>]+src=["']([^"']+)["']/)?.[1];
  if (!entry) throw new Error('Frontend entry script is missing');
  const app = await (await resource(entry)).text();
  const worker = app.match(/["']([^"']*localModel\.worker-[^"']+\.js)["']/)?.[1];
  if (!worker) throw new Error('Production model worker is missing');
  const workerUrl = new URL(worker, new URL(entry, base)).href;
  const code = await (await resource(workerUrl)).text();
  if (!code.includes(engine + '/') || !code.includes(engine + '.wasm')) throw new Error('Waiting for the expected production worker');
  if (expected.preparation_version && !code.includes(expected.preparation_version)) throw new Error('Waiting for the expected preparation worker');
  if (!app.includes(guidance.version) || !code.includes(guidance.version)) throw new Error('Waiting for the English generation frontend');
  const health = await (await resource('health', api)).json();
  if (health.status !== 'healthy' || health.guidance_version !== guidance.version || health.output_language !== 'en') {
    throw new Error('Waiting for the matching English generation backend');
  }
  for (const name of [engine + '.wasm', 'wllama.wasm', 'wllama-multi.wasm']) {
    const response = await resource('llm/' + name);
    const reader = response.body.getReader();
    let magic = Buffer.alloc(0);
    while (magic.length < 4) {
      const chunk = await reader.read(); if (chunk.done) break;
      magic = Buffer.concat([magic, Buffer.from(chunk.value).subarray(0, 4 - magic.length)]);
    }
    await reader.cancel();
    if (magic.toString('hex') !== '0061736d') throw new Error('Invalid WASM asset: ' + name);
  }
  return {checked_at: new Date().toISOString(), origin: base, runtime: expected.runtime,
    model_revision: expected.revision, manifest_match: true, entry, worker, legacy_assets_present: true,
    preparation_version: expected.preparation_version,
    guidance_version: guidance.version, output_language: health.output_language, api_origin: api, backend_healthy: true,
    scope: 'Public frontend assets and backend version only; authenticated report processing and GPU hardware are not checked.'};
}
let failure;
for (let attempt = 1; attempt <= 24; attempt++) {
  try {
    const result = await verify();
    await writeFile('deployment-verification.json', JSON.stringify(result, null, 2) + '\n');
    console.log('DEPLOYMENT_VERIFIED=' + JSON.stringify(result));
    failure = undefined; break;
  } catch (error) {
    if (error.fatal) throw error;
    failure = error; console.log('Deployment check ' + attempt + ': ' + error.message);
    if (attempt < 24) await new Promise(resolve => setTimeout(resolve, 20000));
  }
}
if (failure) throw failure;
