/// <reference lib="webworker" />
import { env, pipeline, type TextGenerationPipeline } from '@huggingface/transformers';
import { classifyLocally } from './localModelEngine';
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
  try {
    self.postMessage({id, progress: {stage: 'loading'}});
    generator ??= pipeline<'text-generation'>('text-generation', config.model, {
      dtype: 'q4', device: 'wasm', revision: config.revision,
      progress_callback: (event) => {
        if (event.status === 'progress' && event.file.endsWith('.onnx')) {
          self.postMessage({id, progress: {stage: 'loading', percent: Math.min(100, event.progress)}});
        }
      },
    });
    const loaded = await generator;
    self.postMessage({id, progress: {stage: 'running'}});
    const output_token = await classifyLocally(loaded, input);
    self.postMessage({id, result: {
      status: 'success', revision: config.revision, output_token,
      input_sha256: await inputHash(input), latency_ms: Math.round(performance.now() - started),
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code: LocalError = message === 'input_too_long' || message === 'invalid_output' ? message : 'load_failed';
    self.postMessage({id, result: {...localFailure(code), latency_ms: Math.round(performance.now() - started)}});
  }
});
