// Historical Qwen3-0.6B ONNX baseline, not the current deployed model.
/** Real WASM regression check in Node. This does not replace the live-browser check.
 * The default ONNX optimizer aborted for this pinned model, despite native CPU
 * tests passing. Keep this opt-in: it downloads approximately 950 MB of assets.
 */
import * as ort from 'onnxruntime-web';
import config from '../src/llm/onnxBaselineConfig.json';
import cases from '../src/llm/smokeCases.json';

// Transformers.js explicitly supports supplying a runtime through this symbol.
// Load the shared classification engine only after installing the WASM runtime.
(globalThis as unknown as Record<symbol, unknown>)[Symbol.for('onnxruntime')] = ort;
const {env, pipeline} = await import('@huggingface/transformers');
const {classifyLocally} = await import('../src/llm/onnxBaselineEngine');
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url).href;
const path = process.env.LOCAL_MODEL_PATH;
if (path) env.allowRemoteModels = false;
const started = performance.now();
const generator = await pipeline<'text-generation'>('text-generation', path || config.model, {
  dtype: 'q4', device: 'auto', revision: config.revision,
  session_options: {...config.wasm_session_options, graphOptimizationLevel: 'disabled', executionProviders: ['wasm']},
});
console.log(JSON.stringify({model: config.model, revision: config.revision,
  execution: 'single-thread WASM in Node', load_ms: Math.round(performance.now() - started)}));
try {
  for (const test of cases) {
    const start = performance.now();
    const token = await classifyLocally(generator, test);
    const category = config.categories[token];
    console.log(JSON.stringify({name: test.name, category, expected: test.expected,
      matches_example: category === test.expected, inference_ms: Math.round(performance.now() - start)}));
    if (category !== test.expected) process.exitCode = 1;
  }
} finally { await generator.dispose(); }
