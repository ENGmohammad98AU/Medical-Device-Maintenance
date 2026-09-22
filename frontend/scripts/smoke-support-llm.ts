/** Opt-in real WASM inference. Synthetic development cases, not a clinical benchmark. */
import * as ort from 'onnxruntime-web';
import config from '../src/llm/localModelConfig.json';
import supportConfig from '../src/llm/supportModelConfig.json';
import cases from '../src/llm/supportSmokeCases.json';
import type { SupportCandidate } from '../src/llm/supportModelContract';

(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort;
const {env, pipeline} = await import('@huggingface/transformers');
const {selectSupportLocally} = await import('../src/llm/localModelEngine');
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url).href;
const path = process.env.LOCAL_MODEL_PATH;
if (path) env.allowRemoteModels = false;
const generator = await pipeline<'text-generation'>('text-generation', path || config.model, {
  dtype: 'q4', device: 'auto', revision: config.revision,
  session_options: {...config.wasm_session_options, graphOptimizationLevel: 'disabled', executionProviders: ['wasm']},
});
try {
  for (const test of cases) {
    const started = performance.now();
    const token = await selectSupportLocally(generator, {
      version: supportConfig.version, input_sha256: '0'.repeat(64),
      report_text: test.report_text, device_name: 'Medical ventilator', candidates: test.candidates as SupportCandidate[],
    });
    console.log(JSON.stringify({name: test.name, token, expected: test.expected,
      passed: token === test.expected, inference_ms: Math.round(performance.now() - started)}));
    if (token !== test.expected) process.exitCode = 1;
  }
} finally { await generator.dispose(); }
