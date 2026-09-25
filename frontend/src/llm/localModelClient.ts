import { localFailure, type LocalInput, type LocalProgress, type LocalResult } from './localModelContract';

export class LocalModelClient {
  private worker?: Worker;
  private sequence = 0;
  private pending?: {id: number; key: string; input: LocalInput; resolve: (result: LocalResult) => void; progress: (progress: LocalProgress) => void};
  private timer?: ReturnType<typeof setTimeout>;
  // Session-only, bounded cache. The key includes the complete reference context
  // and its server hash, so edits to the report/device/references require inference.
  private results = new Map<string, {at: number; result: LocalResult}>();
  run(input: LocalInput, onProgress: (progress: LocalProgress) => void): Promise<LocalResult> {
    if (this.pending) return Promise.resolve(localFailure('load_failed'));
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || !crypto.subtle) {
      return Promise.resolve(localFailure('unsupported_browser'));
    }
    const key = JSON.stringify(input);
    for (const [k, entry] of this.results) if (Date.now() - entry.at >= 10 * 60_000) this.results.delete(k);
    const cached = this.results.get(key);
    if (cached) {
      const result = structuredClone(cached.result);
      result.reused_result = true;
      result.latency_ms = 0;
      if (result.support) result.support.latency_ms = 0;
      return Promise.resolve(result);
    }
    return new Promise((resolve) => {
      const id = ++this.sequence;
      this.pending = {id, key, input, resolve, progress: onProgress};
      this.armTimeout(15 * 60_000);
      try {
        this.worker ??= new Worker(new URL('./localModel.worker.ts', import.meta.url), {type: 'module'});
        this.worker.onmessage = ({data}: MessageEvent<{id: number; result?: LocalResult; progress?: LocalProgress; diagnostic?: string}>) => {
          if (data.id !== this.pending?.id) return;
          if (data.diagnostic) console.warn('Local model:', data.diagnostic);
          if (data.progress) {
            if (data.progress.stage === 'running') this.armTimeout(15 * 60_000);
            this.pending.progress(data.progress);
          }
          if (data.result) this.finish(data.result);
        };
        this.worker.onerror = () => this.finish(localFailure('load_failed'));
        this.worker.postMessage({id, input});
      } catch { this.finish(localFailure('load_failed')); }
    });
  }
  private armTimeout(ms: number) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.finish(localFailure('timeout')), ms);
  }
  private finish(result: LocalResult) {
    clearTimeout(this.timer);
    const pending = this.pending;
    this.pending = undefined;
    if (pending && result.status === 'success'
      && (!pending.input.support_context || result.support?.status === 'success')) {
      this.results.set(pending.key, {at: Date.now(), result: structuredClone(result)});
      if (this.results.size > 12) this.results.delete(this.results.keys().next().value!);
    }
    if (result.status !== 'success') { this.worker?.terminate(); this.worker = undefined; }
    pending?.resolve(result);
  }
  cancel() { this.finish(localFailure('cancelled')); }
  dispose() { this.cancel(); this.worker?.terminate(); this.worker = undefined; this.results.clear(); }
}
