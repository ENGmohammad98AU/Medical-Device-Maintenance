/** Optional real inference check. Downloads public weights; no key or API fees.
 * Runs the shared classification engine on native CPU, not browser WASM.
 * LOCAL_MODEL_PATH can point to a verified offline copy of the pinned revision.
 */
import { env, pipeline } from '@huggingface/transformers';
import { classifyLocally } from '../src/llm/localModelEngine';
import config from '../src/llm/localModelConfig.json';
import cases from '../src/llm/smokeCases.json';

const path = process.env.LOCAL_MODEL_PATH;
if (path) env.allowRemoteModels = false;
const start = performance.now();
const generator = await pipeline<'text-generation'>('text-generation', path || config.model, {
  dtype: 'q4', device: 'cpu', revision: config.revision, session_options: {intraOpNumThreads: 2},
});
console.log(JSON.stringify({model: config.model, revision: config.revision, dtype: config.dtype,
  execution: 'native CPU; browser execution requires a separate check', load_ms: Math.round(performance.now() - start)}));
try {
  for (const test of cases) {
    const started = performance.now();
    const token = await classifyLocally(generator, test);
    const category = config.categories[token];
    console.log(JSON.stringify({name: test.name, category, expected: test.expected,
      matches_example: category === test.expected, inference_ms: Math.round(performance.now() - started)}));
    if (category !== test.expected) process.exitCode = 1;
  }
} finally { await generator.dispose(); }
