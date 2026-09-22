/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import { classifyLocally, selectSupportLocally } from './localModelEngine';
import type { SupportResult } from './supportModelContract';
import { inputHash, localFailure, localModelConfig as config, type LocalInput, type LocalError } from './localModelContract';

env.allowLocalModels = false;
// CPU/WASM requires neither WebGPU nor cross-origin isolation.
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
env.backends.onnx.wasm!.wasmPaths = new URL(`${import.meta.env.BASE_URL}onnx/`, self.location.origin).href;
let generator: Promise<TextGenerationPipeline> | undefined;
self.addEventListener('message', async (event: MessageEvent<{id: number; input: LocalInput}>) => {
  const {id, input} = event.data;
  const started = performance.now();
  let loading = true;
  try {
    self.postMessage({id, progress: {stage: 'loading'}});
    generator ??= pipeline<'text-generation'>('text-generation', config.model, {
      dtype: 'q4', device: 'wasm', revision: config.revision,
      // The default graph optimizations abort for this pinned q4 model on WASM.
      // Avoid optimizer/prepacking copies and arena growth in the browser.
      session_options: {...config.wasm_session_options, graphOptimizationLevel: 'disabled'},
      progress_callback: (event) => {
        if (event.status === 'progress' && event.file.endsWith('.onnx')) {
          self.postMessage({id, progress: {stage: 'loading', percent: Math.min(100, event.progress)}});
        }
      },
    });
    const loaded = await generator;
    loading = false;
    self.postMessage({id, progress: {stage: 'running', task: 'classification'}});
    const output_token = await classifyLocally(loaded, input);
    let support: SupportResult | undefined;
    if (input.support_context) {
      self.postMessage({id, progress: {stage: 'running', task: 'reference_selection'}});
      const supportStarted = performance.now();
      const context = input.support_context;
      try {
        support = {status: 'success', version: context.version, input_sha256: context.input_sha256,
          output_token: await selectSupportLocally(loaded, context), latency_ms: Math.round(performance.now() - supportStarted)};
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        support = {status: 'error', version: context.version, input_sha256: context.input_sha256,
          error_code: message === 'input_too_long' || message === 'invalid_output' ? message : 'load_failed',
          latency_ms: Math.round(performance.now() - supportStarted)};
      }
    }
    self.postMessage({id, result: {
      status: 'success', revision: config.revision, output_token, support,
      input_sha256: await inputHash(input), latency_ms: Math.round(performance.now() - started),
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code: LocalError = message === 'input_too_long' || message === 'invalid_output' ? message : 'load_failed';
    // Loading has no report text. Keep diagnostics local and strip resource URLs;
    // inference failures expose only the exception name, never user input.
    const diagnostic = loading ? message.replace(/https?:\/\/\S+/g, '[model asset]').slice(0, 500)
      : error instanceof Error ? error.name : 'runtime error';
    self.postMessage({id, diagnostic: `${loading ? 'load' : 'inference'}: ${diagnostic}`});
    self.postMessage({id, result: {...localFailure(code), latency_ms: Math.round(performance.now() - started)}});
  }
});
