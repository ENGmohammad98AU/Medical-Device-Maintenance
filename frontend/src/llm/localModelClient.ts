import { LOCAL_INFERENCE_TIMEOUT_MS, LOCAL_PREPARATION_TIMEOUT_MS, LOCAL_DOWNLOAD_TIMEOUT_MS,
  localFailure, localModelConfig, type LocalInput, type LocalProgress, type LocalResult } from './localModelContract';

export class LocalModelClient {
  private worker?: Worker;
  private sequence = 0;
  private forceCpu = false;
  private computeDiagnostic?: string;
  private ready = false;
  get isReady() { return this.ready; }
  private pending?: {id: number; key?: string; input?: LocalInput; started: number; inferenceStarted?: number; preparationStarted?: number;
    deadline: number; inferenceBudget: number; resolve: (result: LocalResult) => void; progress: (progress: LocalProgress) => void};
  private timer?: ReturnType<typeof setTimeout>;
  // Session-only, bounded cache. The key includes the complete reference context
  // and its server hash, so edits to the report/device/references require inference.
  private results = new Map<string, {at: number; result: LocalResult}>();
  prepare(onProgress: (progress: LocalProgress) => void): Promise<LocalResult> {
    if (this.ready && !this.pending) return Promise.resolve({status: 'success', revision: localModelConfig.revision,
      latency_ms: 0, preparation_ms: 0, preparation_version: localModelConfig.preparation_version});
    return this.request(undefined, onProgress);
  }
  run(input: LocalInput, onProgress: (progress: LocalProgress) => void, budgetMs = LOCAL_INFERENCE_TIMEOUT_MS): Promise<LocalResult> {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) return Promise.resolve(localFailure('timeout'));
    return this.request(input, onProgress, Math.min(budgetMs, LOCAL_INFERENCE_TIMEOUT_MS));
  }
  private request(input: LocalInput | undefined, onProgress: (progress: LocalProgress) => void,
    inferenceBudget = LOCAL_INFERENCE_TIMEOUT_MS): Promise<LocalResult> {
    if (this.pending) return Promise.resolve(localFailure('load_failed'));
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || !crypto.subtle) {
      return Promise.resolve(localFailure('unsupported_browser'));
    }
    const key = input ? JSON.stringify(input) : undefined;
    for (const [k, entry] of this.results) if (Date.now() - entry.at >= 10 * 60_000) this.results.delete(k);
    const cached = key ? this.results.get(key) : undefined;
    if (cached) {
      const result = structuredClone(cached.result);
      result.reused_result = true;
      result.latency_ms = 0;
      result.inference_ms = 0;
      result.preparation_ms = 0;
      if (result.support) result.support.latency_ms = 0;
      if (result.guidance) result.guidance.latency_ms = 0;
      return Promise.resolve(result);
    }
    return new Promise((resolve) => {
      const id = ++this.sequence;
      const started = performance.now();
      const inferenceStarted = this.ready && input ? started : undefined;
      this.pending = {id, key, input, started, inferenceStarted,
        deadline: started + (inferenceStarted === undefined ? LOCAL_DOWNLOAD_TIMEOUT_MS : inferenceBudget), inferenceBudget,
        resolve, progress: onProgress};
      this.armTimeout();
      this.startWorker();
    });
  }
  private startWorker() {
    if (!this.pending) return;
    const {id, input} = this.pending;
    try {
        const worker = this.worker ??= new Worker(new URL('./localModel.worker.ts', import.meta.url), {type: 'module'});
        worker.onmessage = ({data}: MessageEvent<{id: number; result?: LocalResult; ready?: boolean; progress?: LocalProgress; diagnostic?: string; retry_cpu?: boolean}>) => {
          if (worker !== this.worker || data.id !== this.pending?.id) return;
          // A delayed event must not turn an expired request into a success.
          if (performance.now() >= this.pending.deadline) { this.finishTimeout(); return; }
          // Keep the original GPU error before taking the retry branch. Native
          // preparation logs contain no report; the worker redacts asset URLs.
          if (data.diagnostic) {
            this.computeDiagnostic = data.diagnostic;
            console.warn('Local model:', data.diagnostic);
          }
          if (data.retry_cpu) {
            if (this.forceCpu) { this.finish(localFailure('load_failed')); return; }
            this.forceCpu = true;
            this.ready = false;
            worker.terminate(); this.worker = undefined;
            this.reportProgress({stage: 'loading', compute_backend: 'wasm', cpu_fallback: true});
            // GPU failure never replenishes an already-running deadline.
            this.startWorker(); return;
          }
          if (data.ready) this.ready = true;
          if (data.progress) {
            if ((data.progress.stage === 'initializing' || data.progress.stage === 'warming')
              && this.pending.preparationStarted === undefined && this.pending.inferenceStarted === undefined) {
              this.pending.preparationStarted = performance.now();
              // Download has a separate allowance. Loading cached weights,
              // shader compilation and every warmup share this one deadline,
              // including a GPU-to-CPU retry; progress never replenishes it.
              this.pending.deadline = Math.min(this.pending.deadline, performance.now() + LOCAL_PREPARATION_TIMEOUT_MS);
              this.armTimeout();
            }
            if (data.progress.stage === 'running' && this.pending.inferenceStarted === undefined) {
              this.pending.inferenceStarted = performance.now();
              this.pending.deadline = this.pending.inferenceStarted + this.pending.inferenceBudget;
              this.armTimeout();
            }
            this.reportProgress(data.progress);
          }
          if (data.result) this.finish(data.result);
        };
        worker.onerror = () => { if (worker === this.worker) this.finish(localFailure('load_failed')); };
        worker.postMessage({id, input, force_cpu: this.forceCpu,
          inference_budget_ms: this.pending.inferenceStarted === undefined ? this.pending.inferenceBudget
            : Math.max(0, this.pending.deadline - performance.now())});
      } catch { this.finish(localFailure('load_failed')); }
  }
  private armTimeout() {
    clearTimeout(this.timer);
    if (this.pending) this.timer = setTimeout(() => this.finishTimeout(),
      Math.max(0, this.pending.deadline - performance.now()));
  }
  private reportProgress(progress: LocalProgress) {
    if (this.pending) this.pending.progress({...progress,
      cpu_fallback: this.forceCpu || progress.cpu_fallback,
      started_at: this.pending.started, deadline_at: this.pending.deadline,
      budget_phase: this.pending.inferenceStarted !== undefined ? 'inference'
        : this.pending.preparationStarted !== undefined ? 'preparation' : 'download'});
  }
  private finishTimeout() {
    this.finish({...localFailure('timeout'), timeout_phase: this.pending?.inferenceStarted !== undefined ? 'inference'
      : this.pending?.preparationStarted !== undefined ? 'preparation' : 'download'});
  }
  private finish(result: LocalResult) {
    clearTimeout(this.timer);
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      result = {...result, compute_diagnostic: this.computeDiagnostic,
        latency_ms: Math.min(2700000, Math.round(performance.now() - pending.started)),
        preparation_ms: Math.round((pending.inferenceStarted ?? performance.now()) - pending.started),
        inference_ms: pending.inferenceStarted === undefined ? 0 : Math.round(performance.now() - pending.inferenceStarted)};
    }
    if (pending?.key && result.status === 'success'
      && (pending.input?.support_context?.guidance ? result.guidance?.status === 'success'
        : !pending.input?.support_context || result.support?.status === 'success')) {
      this.results.set(pending.key, {at: Date.now(), result: structuredClone(result)});
      if (this.results.size > 12) this.results.delete(this.results.keys().next().value!);
    }
    if (result.status !== 'success') { this.worker?.terminate(); this.worker = undefined; this.ready = false; }
    pending?.resolve(result);
  }
  cancel() { if (this.pending) this.finish(localFailure('cancelled')); }
  dispose() {
    this.cancel(); this.worker?.terminate(); this.worker = undefined; this.ready = false; this.results.clear();
    // A new model session can try the GPU again after memory or browser settings
    // change. A failed attempt still has at most one CPU retry within a session.
    this.forceCpu = false; this.computeDiagnostic = undefined;
  }
}
