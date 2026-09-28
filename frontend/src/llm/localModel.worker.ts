/// <reference lib="webworker" />
import { Wllama, LogLevel } from '@wllama/wllama';
import { inferenceThreads } from './browserIsolation.js';
import { loadGgufModel, type StorageMode } from './modelStorage.js';
import {selectComputeBackend, runtimeLoadOptions, type ComputeBackend} from './computeBackend.js';
import { classifyLocally, selectSupportLocally, warmLocalPrompts } from './localModelEngine';
import { generateGuidance, type GuidanceResult } from './guidanceModel';
import type { SupportResult } from './supportModelContract';
import { inputHash, localFailure, localModelConfig as config, type LocalInput, type LocalError } from './localModelContract';

// wllama resolves assets against document.baseURI. In this outer worker,
// provide only that URL base. The runtime itself starts a dedicated worker.
Object.defineProperty(globalThis, 'document', {value: {baseURI: self.location.href}});
let generator: Promise<Wllama> | undefined;
let storageMode: StorageMode | undefined;
let computeBackend: ComputeBackend = 'wasm';
const preparationLog: string[] = [];
let recordPreparation = false;
const cleanDiagnostic = (message: string) => message.replace(/https?:\/\/\S+/g, '[model asset]').replace(/\s+/g, ' ').slice(0, 600);
function rememberPreparation(...args: unknown[]) {
  if (!recordPreparation) return;
  const text = cleanDiagnostic(args.map(arg => typeof arg === 'string' ? arg : arg instanceof Error ? arg.message : '').join(' '));
  if (text) preparationLog.push(text);
  if (preparationLog.length > 4) preparationLog.shift();
}
self.addEventListener('message', async (event: MessageEvent<{id: number; input?: LocalInput; force_cpu?: boolean; inference_budget_ms?: number;
  benchmark_runtime?: {threads: number; ubatch: number; flash_attn?: boolean}}>) => {
  const {id, input} = event.data;
  const started = performance.now();
  let loading = true;
  try {
    if (!generator) self.postMessage({id, progress: {stage: 'loading', storage_mode: storageMode}});
    if (!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,5,3,1,4,1]))) throw new Error('unsupported_browser');
    generator ??= (async () => {
      computeBackend = await selectComputeBackend(event.data.force_cpu,
        reason => self.postMessage({id, diagnostic: reason}));
      preparationLog.length = 0;
      recordPreparation = true;
      let initializing = false;
      try {
        const model = new Wllama({
          default: new URL(`${import.meta.env.BASE_URL}llm/wllama-3.6.1.wasm`, self.location.origin).href},
        {suppressNativeLog: false, logger: {debug() {}, log() {}, warn: rememberPreparation, error: rememberPreparation}});
        const options = runtimeLoadOptions(config, inferenceThreads(), computeBackend);
        // Controlled, same-host CI measurements only. Vite removes this branch
        // from production, so reports cannot change runtime resource limits.
        if (import.meta.env.MODE === 'benchmark' && event.data.benchmark_runtime) {
          const {threads, ubatch} = event.data.benchmark_runtime;
          if (![1, 2, 3, 4, 8].includes(threads) || ![128, 256, 512].includes(ubatch)) throw new Error('invalid_benchmark_runtime');
          options.n_threads = threads;
          options.n_ubatch = ubatch;
          if (event.data.benchmark_runtime.flash_attn === false) options.flash_attn = false;
        }
        await loadGgufModel(model, `https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`, {
          ...options,
          log_level: LogLevel.WARN,
          progressCallback: ({loaded, total}) => self.postMessage({id, progress: {stage: initializing ? 'initializing' : 'loading', storage_mode: storageMode, compute_backend: computeBackend,
            percent: total ? Math.min(100, 100 * loaded / total) : undefined}}),
        }, config.model_file_bytes, mode => {
          storageMode = mode;
          self.postMessage({id, progress: {stage: 'loading', storage_mode: mode, compute_backend: computeBackend}});
        }, () => {
          initializing = true;
          self.postMessage({id, progress: {stage: 'initializing', storage_mode: storageMode, compute_backend: computeBackend}});
        });
        await warmLocalPrompts(model, task => self.postMessage({id, progress: {
          stage: 'warming', task, storage_mode: storageMode, compute_backend: computeBackend}}));
        return model;
      } finally {
        // The logger must not retain report text during later inference. This
        // flag belongs to the model initialization, not the first request.
        recordPreparation = false;
      }
    })();
    const loaded = await generator;
    self.postMessage({id, ready: true});
    if (!input) {
      self.postMessage({id, result: {status: 'success', revision: config.revision,
        preparation_version: config.preparation_version, preparation_threads: loaded.getNumThreads(),
        runtime: `wllama-3.6.1/${computeBackend}`, latency_ms: Math.round(performance.now() - started)}});
      return;
    }
    loading = false;
    self.postMessage({id, progress: {stage: 'running', task: 'classification', storage_mode: storageMode, compute_backend: computeBackend}});
    const inferenceStarted = performance.now();
    const output_token = await classifyLocally(loaded, input);
    let support: SupportResult | undefined;
    let guidance: GuidanceResult | undefined;
    if (input.support_context) {
      self.postMessage({id, progress: {stage: 'running', task: 'reference_selection', storage_mode: storageMode, compute_backend: computeBackend}});
      const supportStarted = performance.now();
      const context = input.support_context;
      try {
        support = {status: 'success', version: context.version, input_sha256: context.input_sha256,
          output_token: await selectSupportLocally(loaded, context), latency_ms: Math.round(performance.now() - supportStarted)};
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (computeBackend === 'webgpu' && message !== 'input_too_long' && message !== 'invalid_output') throw error;
        support = {status: 'error', version: context.version, input_sha256: context.input_sha256,
          error_code: message === 'input_too_long' || message === 'invalid_output' ? message : 'load_failed',
          latency_ms: Math.round(performance.now() - supportStarted)};
      }
    }
    if (input.support_context?.guidance) {
      const context = input.support_context.guidance;
      const referenceId = input.support_context.candidates.find(candidate => candidate.label === support?.output_token)?.reference_id;
      self.postMessage({id, progress: {stage: 'running', task: 'generation', storage_mode: storageMode, compute_backend: computeBackend}});
      guidance = output_token === 'H' || support?.output_token === 'E'
        ? {status: 'error', version: context.version, input_sha256: context.input_sha256, latency_ms: 0, error_code: 'out_of_scope'}
        : support?.status !== 'success'
        ? {status: 'error', version: context.version, input_sha256: context.input_sha256, latency_ms: 0, error_code: 'not_allowed'}
        : await generateGuidance(loaded, context,
          Math.min(45_000, event.data.inference_budget_ms ?? 45_000) - (performance.now() - inferenceStarted), referenceId);
      if (computeBackend === 'webgpu' && guidance.error_code === 'load_failed') throw new Error('generation_failed');
    }
    self.postMessage({id, result: {
      status: 'success', revision: config.revision, output_token, support, guidance,
      prompt_version: config.prompt_version,
      runtime: `wllama-3.6.1/${computeBackend}`,
      input_sha256: await inputHash(input), latency_ms: Math.round(performance.now() - started),
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (computeBackend === 'webgpu' && message !== 'input_too_long' && message !== 'invalid_output') {
      // The client terminates this entire worker before a single CPU retry,
      // releasing the failed GPU runtime instead of keeping two models loaded.
      const detail = loading ? cleanDiagnostic([message, ...preparationLog].filter(Boolean).join(' | '))
        : error instanceof Error ? error.name : 'runtime error';
      self.postMessage({id, retry_cpu: true, diagnostic: `GPU ${loading ? 'preparation' : 'inference'} failed: ${detail || 'runtime failure'}`});
      return;
    }
    const code: LocalError = error instanceof Error && error.name === 'QuotaExceededError' ? 'insufficient_storage'
      : message === 'input_too_long' || message === 'invalid_output' || message === 'unsupported_browser' ? message : 'load_failed';
    // Loading has no report text. Keep diagnostics local and strip resource URLs;
    // inference failures expose only the exception name, never user input.
    const diagnostic = loading ? cleanDiagnostic([message, ...preparationLog].filter(Boolean).join(' | '))
      : error instanceof Error ? error.name : 'runtime error';
    self.postMessage({id, diagnostic: `${loading ? 'load' : 'inference'}: ${diagnostic}`});
    self.postMessage({id, result: {...localFailure(code), latency_ms: Math.round(performance.now() - started)}});
  }
});
