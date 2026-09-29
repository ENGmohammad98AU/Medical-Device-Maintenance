import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {webcrypto} from 'node:crypto';
import {prepareStaticPrefixState, type PrefixManifest, type PrefixModel, type PrefixRuntime} from './staticPrefixState';
import {runtimeLoadOptions} from './computeBackend.js';
import {localModelConfig} from './localModelContract';

const runtime: PrefixRuntime = {format: 'mdm-static-prefix-prototype-v1', wllama: 'test-wllama', llama_cpp: 'test-llama',
  js_sha256: 'a'.repeat(64), wasm_sha256: 'b'.repeat(64)};
const options = runtimeLoadOptions(localModelConfig, 4, 'wasm');
const buckets = new Map<string, Map<string, Response>>();
const address = (request: RequestInfo | URL) => typeof request === 'string' ? request : request instanceof URL ? request.href : request.url;
function model(compat = false) {
  return {
    createCompletion: vi.fn(async () => ({})),
    getWorkerResources: () => ({compat}),
    exportPrefixState: vi.fn(async (slot: number) => ({data: new Uint8Array(64).fill(slot + 1), details: {n_saved: 200 + slot}})),
    importPrefixState: vi.fn(async (slot: number) => ({details: {n_restored: 200 + slot}})),
  } as unknown as PrefixModel;
}
const prepare = (value: PrefixModel, identity = runtime, loadOptions = options) => prepareStaticPrefixState(value, identity, loadOptions, () => {});
function bucket() {return [...buckets.values()][0];}
async function manifest() {
  const entry = [...bucket()].find(([url]) => url.endsWith('/manifest.json'))!;
  return await entry[1].clone().json() as PrefixManifest;
}
beforeEach(() => {
  buckets.clear();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('location', {href: 'https://example.test/llm/model.worker.js'});
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
  vi.stubGlobal('caches', {open: vi.fn(async (name: string) => {
    if (!buckets.has(name)) buckets.set(name, new Map());
    const files = buckets.get(name)!;
    return {
      match: async (url: RequestInfo | URL) => files.get(address(url))?.clone(),
      put: async (url: RequestInfo | URL, response: Response) => {files.set(address(url), response.clone());},
      delete: async (url: RequestInfo | URL) => files.delete(address(url)),
    };
  })});
});
afterEach(() => vi.unstubAllGlobals());

describe('static prefix state preparation', () => {
  it('warms only static prompts once, then restores all slots in a fresh model', async () => {
    const first = model();
    expect(await prepare(first)).toEqual({source: 'computed', persisted: true});
    expect(first.createCompletion).toHaveBeenCalledTimes(4);
    const saved = await manifest();
    expect(saved.prefixes.map(row => row.phase)).toEqual(['classification', 'reference_selection', 'scope', 'generation']);
    const second = model();
    expect(await prepare(second)).toEqual({source: 'stored', persisted: true});
    expect(second.importPrefixState).toHaveBeenCalledTimes(4);
    expect(second.createCompletion).not.toHaveBeenCalled();
    expect(second.exportPrefixState).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('never sends corrupted bytes to the native engine and rebuilds safely', async () => {
    await prepare(model());
    const file = [...bucket().keys()].find(url => url.endsWith('slot-0.bin'))!;
    bucket().set(file, new Response(new Uint8Array(64).fill(99)));
    const next = model();
    expect((await prepare(next)).source).toBe('computed');
    expect(next.importPrefixState).not.toHaveBeenCalled();
    expect(next.createCompletion).toHaveBeenCalledTimes(4);
    expect((await prepare(model())).source).toBe('stored');
  });
  it('rejects a changed prompt hash even if the cache name still matches', async () => {
    await prepare(model());
    const altered = await manifest();
    altered.prefixes[0].sha256 = '0'.repeat(64);
    const url = [...bucket().keys()].find(url => url.endsWith('/manifest.json'))!;
    bucket().set(url, new Response(JSON.stringify(altered)));
    const next = model();
    expect((await prepare(next)).source).toBe('computed');
    expect(next.importPrefixState).not.toHaveBeenCalled();
  });
  it('does not reuse state with a different runtime binary or context configuration', async () => {
    await prepare(model());
    const changedRuntime = model();
    expect((await prepare(changedRuntime, {...runtime, wasm_sha256: 'c'.repeat(64)})).source).toBe('computed');
    expect(changedRuntime.importPrefixState).not.toHaveBeenCalled();
    const changedContext = model();
    expect((await prepare(changedContext, runtime, {...options, n_ctx: 8192})).source).toBe('computed');
    expect(changedContext.importPrefixState).not.toHaveBeenCalled();
  });
  it('reuses a CPU state across thread counts without allowing a backend change', async () => {
    await prepare(model());
    const next = model();
    expect((await prepare(next, runtime, {...options, n_threads: 1})).source).toBe('stored');
    expect(next.importPrefixState).toHaveBeenCalledTimes(4);
    const gpu = model();
    expect((await prepare(gpu, runtime, {...options, n_gpu_layers: 99999})).source).toBe('computed');
    expect(gpu.importPrefixState).not.toHaveBeenCalled();
    expect(gpu.exportPrefixState).not.toHaveBeenCalled();
  });
  it('bounds an unresponsive bundle request and computes instead', async () => {
    await prepare(model());
    const prepared = await manifest();
    buckets.clear();
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url: URL, init: RequestInit) => new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), {once: true});
      })));
      const progress = vi.fn();
      const next = model();
      const work = prepareStaticPrefixState(next, runtime, options, progress, {
        manifest: prepared, baseUrl: 'https://example.test/llm/prefix-state/',
      });
      // Hashing and Response streams use real I/O, so allow the request to start.
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(5000);
      expect((await work).source).toBe('computed');
      expect(progress).toHaveBeenCalledWith(expect.objectContaining({stage: 'warming', fallback: 'slow_network'}));
      expect(next.importPrefixState).not.toHaveBeenCalled();
    } finally {vi.useRealTimers();}
  });
  it('uses verified bundled state on a first visit and retains it for the next visit', async () => {
    await prepare(model());
    const prepared = await manifest();
    const states = new Map([...bucket()].filter(([url]) => url.endsWith('.bin')).map(([url, response]) => [url.split('/').pop(), response]));
    buckets.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: URL) => states.get(url.pathname.split('/').pop())!.clone()));
    const next = model();
    expect(await prepareStaticPrefixState(next, runtime, options, () => {}, {
      manifest: prepared, baseUrl: 'https://example.test/llm/prefix-state/',
    })).toEqual({source: 'bundled', persisted: true});
    expect(next.createCompletion).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect((await prepare(model())).source).toBe('stored');
  });
  it('returns a ready model when persistent storage cannot be used', async () => {
    vi.stubGlobal('caches', {open: vi.fn().mockRejectedValue(new DOMException('Full', 'QuotaExceededError'))});
    const next = model();
    expect(await prepare(next)).toEqual({source: 'computed', persisted: false});
    expect(next.createCompletion).toHaveBeenCalledTimes(4);
    expect(next.exportPrefixState).not.toHaveBeenCalled();
  });
  it('does not call the new native action on an upstream compatibility worker', async () => {
    const next = model(true);
    expect(await prepare(next)).toEqual({source: 'computed', persisted: false});
    expect(next.importPrefixState).not.toHaveBeenCalled();
    expect(next.exportPrefixState).not.toHaveBeenCalled();
  });
  it('falls back after native rejection and does not hide a genuine warmup failure', async () => {
    await prepare(model());
    const next = model();
    vi.mocked(next.importPrefixState!).mockRejectedValue(new Error('KV layout mismatch'));
    expect((await prepare(next)).source).toBe('computed');
    const broken = model();
    vi.mocked(broken.importPrefixState!).mockRejectedValue(new Error('KV layout mismatch'));
    vi.mocked(broken.createCompletion).mockRejectedValue(new Error('Model failure'));
    await expect(prepare(broken)).rejects.toThrow('Model failure');
    expect(broken.exportPrefixState).not.toHaveBeenCalled();
  });
});
