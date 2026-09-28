// Controlled production-worker experiment. Every variant uses identical model
// bytes, prompts and deadlines on one host. Failed variants remain in evidence.
import assert from 'node:assert/strict';
import {createReadStream, createWriteStream} from 'node:fs';
import {readFile, writeFile, mkdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const config = JSON.parse(await readFile('src/llm/localModelConfig.json', 'utf8'));
const directory = 'benchmark-results';
await mkdir(directory, {recursive: true});
const modelFile = resolve(process.env.LLM_MODEL_FILE || `${directory}/runtime-model.gguf`);
if (!(await stat(modelFile).catch(() => null))) {
  const response = await fetch(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`,
    {signal: AbortSignal.timeout(5 * 60_000)});
  assert.ok(response.ok, `Model download: ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelFile, {flags: 'wx'}));
}
const hash = createHash('sha256');
for await (const chunk of createReadStream(modelFile)) hash.update(chunk);
assert.equal(hash.digest('hex'), config.model_file_sha256, 'Do not compare different model weights');
const comparison = {model: config.model, revision: config.revision, sha256: config.model_file_sha256,
  note: 'Same Windows host; real production worker; same prompts and 120s preparation/45s inference deadlines. Download excluded from phase sums. No exact-answer reuse.', rows: []};
async function measure(threads, ubatch, flashAttn = 'auto') {
  const suffix = `-t${threads}-u${ubatch}${flashAttn === false ? '-no-fa' : ''}`;
  console.log(`RUNTIME_VARIANT=${suffix}`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/benchmark-prepared.mjs', '--generation', '--probe'], {
      stdio: 'inherit', env: {...process.env, LLM_MODEL_FILE: modelFile,
        LLM_THREADS: String(threads), LLM_UBATCH: String(ubatch), LLM_FLASH_ATTN: flashAttn === false ? '0' : '', BENCHMARK_RESULT_SUFFIX: suffix},
    });
    child.on('error', reject); child.on('exit', resolve);
  });
  const result = JSON.parse(await readFile(`${directory}/prepared-generation${suffix}.json`, 'utf8'));
  const preparationCompute = (result.preparation_stages || []).filter(stage => stage.stage !== 'loading')
    .reduce((sum, stage) => sum + stage.ms, 0);
  comparison.rows.push({threads, ubatch, flash_attn: flashAttn, exit_code: exitCode, preparation_compute_ms: preparationCompute, result});
  await writeFile(`${directory}/runtime-comparison.json`, JSON.stringify(comparison, null, 2) + '\n');
}
// Ordered, never concurrent: competing models would invalidate CPU timings.
if (process.argv.includes('--attention')) {
  await measure(4, 512);
  await measure(4, 512, false);
  await measure(4, 128, false);
} else {
  for (const threads of [4, 2, 1]) await measure(threads, 512);
  const finished = comparison.rows.filter(row => row.result.completed && row.result.rows.every(item => item.correct));
  const fastest = finished.sort((a, b) => a.preparation_compute_ms - b.preparation_compute_ms)[0];
  await measure(fastest?.threads || 2, 128);
}
comparison.completed = true;
await writeFile(`${directory}/runtime-comparison.json`, JSON.stringify(comparison, null, 2) + '\n');
console.log('RUNTIME_COMPARISON=' + JSON.stringify(comparison.rows.map(({threads, ubatch, flash_attn, exit_code, preparation_compute_ms, result}) =>
  ({threads, ubatch, flash_attn, exit_code, preparation_compute_ms, completed: result.completed, stages: result.preparation_stages,
    mean_ms: result.mean_ms, max_ms: result.max_ms, error: result.error}))));
// This job is diagnostic, not the release gate. The full production benchmark
// must still pass before any candidate runtime policy is shipped.
