import {afterEach, describe, expect, it, vi} from 'vitest';
import {selectComputeBackend, runtimeLoadOptions} from './computeBackend.js';
describe('local compute selection', () => {
  afterEach(() => {vi.unstubAllGlobals(); vi.useRealTimers();});
  function browser(adapter: unknown) {
    const requestAdapter = vi.fn(async () => adapter);
    vi.stubGlobal('navigator', {gpu: {requestAdapter}});
    vi.stubGlobal('WebAssembly', {Suspending: function () {}});
    return requestAdapter;
  }
  it('uses WebGPU only when a hardware adapter and JSPI are available', async () => {
    browser({info: {isFallbackAdapter: false}});
    expect(await selectComputeBackend()).toBe('webgpu');
    vi.stubGlobal('WebAssembly', {});
    expect(await selectComputeBackend()).toBe('wasm');
  });
  it('uses CPU for unavailable, software or rejected adapters and forced retry', async () => {
    for (const adapter of [null, {isFallbackAdapter: true}, {info: {isFallbackAdapter: true}}]) {
      browser(adapter); expect(await selectComputeBackend()).toBe('wasm');
    }
    const probe = browser({});
    expect(await selectComputeBackend(true)).toBe('wasm'); expect(probe).not.toHaveBeenCalled();
    probe.mockRejectedValue(new Error('unavailable'));
    expect(await selectComputeBackend()).toBe('wasm');
  });
  it('does not leave analysis waiting on an unresponsive GPU probe', async () => {
    vi.useFakeTimers(); browser({}).mockReturnValue(new Promise(() => {}));
    const diagnostic = vi.fn();
    const selected = selectComputeBackend(false, diagnostic);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await selected).toBe('wasm');
    expect(diagnostic).toHaveBeenCalledWith('GPU adapter lookup exceeded 3 seconds.');
  });
  it('keeps classification, reference and scope prefixes in three bounded contexts', () => {
    const options = runtimeLoadOptions({context_tokens: 4608, batch_tokens: 512, parallel_slots: 3}, 4, 'wasm');
    expect(options).toMatchObject({n_ctx: 4608, n_parallel: 3, kv_unified: false, ctx_shift: false,
      n_threads: 4, n_batch: 512, n_ubatch: 512, n_gpu_layers: 0});
  });
});
