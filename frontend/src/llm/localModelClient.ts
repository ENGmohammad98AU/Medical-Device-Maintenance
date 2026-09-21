import { localFailure, type LocalInput, type LocalProgress, type LocalResult } from './localModelContract';

export class LocalModelClient {
  private worker?: Worker;
  private sequence = 0;
  private pending?: {id: number; resolve: (result: LocalResult) => void; progress: (progress: LocalProgress) => void};
  private timer?: ReturnType<typeof setTimeout>;
  run(input: LocalInput, onProgress: (progress: LocalProgress) => void): Promise<LocalResult> {
    if (this.pending) return Promise.resolve(localFailure('load_failed'));
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined' || !crypto.subtle) {
      return Promise.resolve(localFailure('unsupported_browser'));
    }
    return new Promise((resolve) => {
      const id = ++this.sequence;
      this.pending = {id, resolve, progress: onProgress};
      this.armTimeout(15 * 60_000);
      try {
        this.worker ??= new Worker(new URL('./localModel.worker.ts', import.meta.url), {type: 'module'});
        this.worker.onmessage = ({data}: MessageEvent<{id: number; result?: LocalResult; progress?: LocalProgress}>) => {
          if (data.id !== this.pending?.id) return;
          if (data.progress) {
            if (data.progress.stage === 'running') this.armTimeout(120_000);
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
    if (result.status !== 'success') { this.worker?.terminate(); this.worker = undefined; }
    pending?.resolve(result);
  }
  cancel() { this.finish(localFailure('cancelled')); }
  dispose() { this.cancel(); this.worker?.terminate(); this.worker = undefined; }
}
