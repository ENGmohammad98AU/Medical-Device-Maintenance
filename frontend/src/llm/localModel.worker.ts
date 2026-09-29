/// <reference lib="webworker" />
import type { Wllama } from '@wllama/wllama';
import { inferenceThreads } from './browserIsolation.js';
import { loadGgufModel, type StorageMode } from './modelStorage.js';
import {selectComputeBackend, runtimeLoadOptions, type ComputeBackend} from './computeBackend.js';
import { analyzeLocally, warmLocalPrompts } from './localModelEngine';
import {modelRuntime} from './modelRuntime';
import {prepareStaticPrefixState} from './staticPrefixState';
import { generateGuidance, type GuidanceResult } from './guidanceModel';
import type { SupportResult } from './supportModelContract';
import { inputHash, localFailure, localModelConfig as config, type LocalInput, type LocalError } from './localModelContract';

// wllama resolves assets against document.baseURI. In this outer worker,
// provide only that URL base. The runtime itself starts a dedicated worker.
Object.defineProperty(globalThis, 'document', {value: {baseURI: self.location.href}});
let generator: Promise<Wllama> | undefined;
let storageMode: StorageMode | undefined;
let computeBackend: ComputeBackend = 'wasm';
let preparation: {source: 'stored' | 'bundled' | 'computed'; persisted: boolean} | undefined;
self.addEventListener('message', async (event: MessageEvent<{id: number; input?: LocalInput; force_cpu?: boolean;
  inference_budget_ms?: number; serial_analysis?: boolean; benchmark_threads?: number}>) => {
  const {id, input} = event.data;
  const started = performance.now();
  let loading = true;
  try {
    if (!generator) self.postMessage({id, progress: {stage: 'loading', storage_mode: storageMode}});
    if (!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,5,3,1,4,1]))) throw new Error('unsupported_browser');
    generator ??= (async () => {
      computeBackend = await selectComputeBackend(event.data.force_cpu);
      const runtime = await modelRuntime();
      const model = new runtime.Wllama({default: runtime.wasm},
      {suppressNativeLog: true, logger: {debug() {}, log() {}, warn() {}, error() {}}});
      const threads = import.meta.env.MODE === 'benchmark' && [1, 4, 8].includes(event.data.benchmark_threads ?? 0)
        ? event.data.benchmark_threads! : inferenceThreads();
      const loadOptions = runtimeLoadOptions(config, threads, computeBackend);
      await loadGgufModel(model, `https://huggingface.co/${config.model}/resolve/${config.revision}/${config.model_file}`, {
        ...loadOptions,
        progressCallback: ({loaded, total}) => self.postMessage({id, progress: {stage: 'loading', storage_mode: storageMode, compute_backend: computeBackend,
          percent: total ? Math.min(100, 100 * loaded / total) : undefined}}),
      }, config.model_file_bytes, mode => {
        storageMode = mode;
        self.postMessage({id, progress: {stage: 'loading', storage_mode: mode, compute_backend: computeBackend}});
      }, () => self.postMessage({id, progress: {stage: 'initializing', storage_mode: storageMode, compute_backend: computeBackend}}));
      if (runtime.identity) preparation = await prepareStaticPrefixState(model, runtime.identity, loadOptions,
        progress => self.postMessage({id, progress: {
          stage: progress.stage ?? 'warming', task: progress.task, percent: progress.percent,
          preparation_source: progress.source, preparation_fallback: progress.fallback,
          storage_mode: storageMode, compute_backend: computeBackend, backend_ready: true,
        }}), runtime.bundled);
      else {
        await warmLocalPrompts(model, task => self.postMessage({id, progress: {
          stage: 'warming', task, storage_mode: storageMode, compute_backend: computeBackend, backend_ready: true}}));
        preparation = {source: 'computed', persisted: false};
      }
      return model;
    })();
    const loaded = await generator;
    self.postMessage({id, ready: true});
    if (!input) {
      self.postMessage({id, result: {status: 'success', revision: config.revision,
        preparation_version: config.preparation_version, preparation_threads: loaded.getNumThreads(),
        preparation_source: preparation?.source, preparation_cached: preparation?.persisted,
        runtime: `wllama-3.6.1/${computeBackend}`, latency_ms: Math.round(performance.now() - started)}});
      return;
    }
    loading = false;
    const inferenceStarted = performance.now();
    const {output_token, selection, support_ms} = await analyzeLocally(loaded, input,
      !(import.meta.env.MODE === 'benchmark' && event.data.serial_analysis),
      task => self.postMessage({id, progress: {stage: 'running', task, storage_mode: storageMode,
        compute_backend: computeBackend, backend_ready: true}}));
    let support: SupportResult | undefined;
    let guidance: GuidanceResult | undefined;
    if (input.support_context) {
      const context = input.support_context;
      try {
        if (selection.status === 'rejected') throw selection.reason;
        if (selection.value === undefined) throw new Error('invalid_output');
        support = {status: 'success', version: context.version, input_sha256: context.input_sha256,
          output_token: selection.value, latency_ms: support_ms};
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (computeBackend === 'webgpu' && message !== 'input_too_long' && message !== 'invalid_output') throw error;
        support = {status: 'error', version: context.version, input_sha256: context.input_sha256,
          error_code: message === 'input_too_long' || message === 'invalid_output' ? message : 'load_failed',
          latency_ms: support_ms};
      }
    }
    if (input.support_context?.guidance) {
      const context = input.support_context.guidance;
      const referenceId = input.support_context.candidates.find(candidate => candidate.label === support?.output_token)?.reference_id;
      self.postMessage({id, progress: {stage: 'running', task: 'generation', storage_mode: storageMode, compute_backend: computeBackend, backend_ready: true}});
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
      const diagnostic = loading ? message.replace(/https?:\/\/\S+/g, '[model asset]').slice(0, 500)
        : error instanceof Error ? error.name : 'runtime error';
      self.postMessage({id, retry_cpu: true, cpu_fallback_reason: loading ? 'initialization_failed' : 'inference_failed',
        diagnostic: `GPU ${loading ? 'preparation' : 'inference'}: ${diagnostic}`});
      return;
    }
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
