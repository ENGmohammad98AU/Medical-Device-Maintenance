/// <reference lib="webworker" />
import { Wllama } from '@wllama/wllama';
import { inferenceThreads } from './browserIsolation.js';
import { classifyLocally, selectSupportLocally } from './localModelEngine';
import type { SupportResult } from './supportModelContract';
import { inputHash, localFailure, localModelConfig as config, type LocalInput, type LocalError } from './localModelContract';

// wllama 2.4 resolves assets against document.baseURI. In this outer worker,
// provide only that URL base. The runtime itself starts a dedicated worker.
Object.defineProperty(globalThis, 'document', {value: {baseURI: self.location.href}});
let generator: Promise<Wllama> | undefined;
self.addEventListener('message', async (event: MessageEvent<{id: number; input: LocalInput}>) => {
  const {id, input} = event.data;
  const started = performance.now();
  let loading = true;
  try {
    self.postMessage({id, progress: {stage: 'loading'}});
    if (!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,5,3,1,4,1]))) throw new Error('unsupported_browser');
    generator ??= (async () => {
      const model = new Wllama({
        'single-thread/wllama.wasm': new URL(`${import.meta.env.BASE_URL}llm/wllama.wasm`, self.location.origin).href,
        'multi-thread/wllama.wasm': new URL(`${import.meta.env.BASE_URL}llm/wllama-multi.wasm`, self.location.origin).href},
      {suppressNativeLog: true, logger: {debug() {}, log() {}, warn() {}, error() {}}});
      await model.loadModelFromUrl(`https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`, {
        n_ctx: config.context_tokens, n_batch: config.batch_tokens, n_threads: inferenceThreads(), seed: 0,
        progressCallback: ({loaded, total}) => self.postMessage({id, progress: {stage: 'loading',
          percent: total ? Math.min(100, 100 * loaded / total) : undefined}}),
      });
      return model;
    })();
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
    const code: LocalError = error instanceof Error && error.name === 'QuotaExceededError' ? 'insufficient_storage'
      : message === 'input_too_long' || message === 'invalid_output' || message === 'unsupported_browser' ? message : 'load_failed';
    // Loading has no report text. Keep diagnostics local and strip resource URLs;
    // inference failures expose only the exception name, never user input.
    const diagnostic = loading ? message.replace(/https?:\/\/\S+/g, '[model asset]').slice(0, 500)
      : error instanceof Error ? error.name : 'runtime error';
    self.postMessage({id, diagnostic: `${loading ? 'load' : 'inference'}: ${diagnostic}`});
    self.postMessage({id, result: {...localFailure(code), latency_ms: Math.round(performance.now() - started)}});
  }
});
