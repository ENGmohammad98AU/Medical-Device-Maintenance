import type {Wllama} from '@wllama/wllama';
import {warmLocalPrompts} from './localModelEngine';
import {localModelConfig} from './localModelContract';

type Phase = Parameters<typeof warmLocalPrompts>[1] extends (task: infer T) => void ? T : never;
type LoadOptions = NonNullable<Parameters<Wllama['loadModel']>[1]>;
export interface PrefixRuntime {
  format: string; wllama: string; llama_cpp: string; js_sha256: string; wasm_sha256: string;
}
interface SlotState {
  slot: number; file: string; bytes: number; sha256: string;
  details: {n_saved: number};
}
export interface PrefixManifest {
  model_sha256: string; runtime: PrefixRuntime; options: LoadOptions;
  prefixes: {phase: Phase; sha256: string}[];
  slots: SlotState[];
}
export type PrefixModel = Pick<Wllama, 'createCompletion' | 'getWorkerResources'> & {
  exportPrefixState?: (slot: number) => Promise<{data: Uint8Array<ArrayBuffer>; details: {n_saved: number}}>;
  importPrefixState?: (slot: number, data: Uint8Array) => Promise<{details: {n_restored: number}}>;
};
export interface PrefixProgress {
  task?: Phase; source: 'stored' | 'bundled' | 'computed'; percent?: number;
  stage?: 'warming' | 'restoring' | 'saving'; fallback?: 'unavailable' | 'slow_network' | 'incompatible';
}
const CACHE_PREFIX = 'mdm-static-prefix-v1-';
const MAX_SLOT_BYTES = 256 * 1024 * 1024;
const digest = async (bytes: BufferSource) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(value => value.toString(16).padStart(2, '0')).join('');
const textDigest = (text: string) => digest(new TextEncoder().encode(text));
// Thread count controls scheduling, not the serialized KV layout. Context,
// backend, model, runtime and prompt identities must still match exactly.
const stateOptions = (options: LoadOptions) => Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'n_threads'));

async function describePrefixes() {
  const rows: PrefixManifest['prefixes'] = [];
  let phase: Phase = 'classification';
  // Read the exact production prompts without executing a model or using report data.
  await warmLocalPrompts({createCompletion: async (request: {prompt: string}) => {
    rows.push({phase, sha256: await textDigest(request.prompt)});
  }} as unknown as Pick<Wllama, 'createCompletion'>, task => {phase = task;});
  return rows;
}
function sameProfile(manifest: PrefixManifest, expected: Omit<PrefixManifest, 'slots'>) {
  return manifest?.model_sha256 === expected.model_sha256
    && JSON.stringify(manifest.runtime) === JSON.stringify(expected.runtime)
    && JSON.stringify(stateOptions(manifest.options)) === JSON.stringify(stateOptions(expected.options))
    && JSON.stringify(manifest.prefixes) === JSON.stringify(expected.prefixes)
    && Array.isArray(manifest.slots) && manifest.slots.length === 4
    && manifest.slots.every((row, slot) => row.slot === slot && row.file === `slot-${slot}.bin`
      && Number.isInteger(row.bytes) && row.bytes >= 32 && row.bytes <= MAX_SLOT_BYTES
      && /^[0-9a-f]{64}$/.test(row.sha256) && Number.isInteger(row.details?.n_saved) && row.details.n_saved >= 100);
}
async function verifiedBytes(response: Response | undefined, row: SlotState, progress: (bytes: number) => void = () => {}) {
  if (!response?.ok || !response.body) throw new Error('prefix_state_unavailable');
  const reader = response.body.getReader();
  let length = 0;
  const bounded = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const {done, value} = await reader.read();
      if (done) {controller.close(); return;}
      length += value.byteLength;
      if (length > row.bytes) {
        await reader.cancel(); controller.error(new Error('prefix_state_size')); return;
      }
      progress(length);
      controller.enqueue(value);
    },
    cancel(reason) {return reader.cancel(reason);},
  });
  const bytes = new Uint8Array(await new Response(bounded).arrayBuffer());
  if (bytes.byteLength !== row.bytes || await digest(bytes) !== row.sha256) throw new Error('prefix_state_integrity');
  return bytes;
}

// Call once after loadModel and before the worker accepts a report. Only the
// four static warmup prompts may be present when saving a reusable startup state.
export async function prepareStaticPrefixState(model: PrefixModel, runtime: PrefixRuntime, options: LoadOptions,
  onProgress: (progress: PrefixProgress) => void,
  bundled?: {manifest: PrefixManifest; baseUrl: string},
  requiredPhases?: Phase[]) {
  let fallback: PrefixProgress['fallback'];
  const warm = () => warmLocalPrompts(model, task => onProgress({task, source: 'computed', stage: 'warming', fallback}));
  // Compatibility workers come from the upstream package and do not expose this bridge.
  if (!model.exportPrefixState || !model.importPrefixState || model.getWorkerResources().compat || options.n_gpu_layers !== 0) {
    await warm(); return {source: 'computed' as const, persisted: false};
  }
  const expected = {model_sha256: localModelConfig.model_file_sha256, runtime, options,
    prefixes: await describePrefixes()};
  const key = CACHE_PREFIX + await textDigest(JSON.stringify({...expected, options: stateOptions(options)}));
  const baseUrl = new URL(`/__mdm_static_prefix__/${key}/`, globalThis.location.href).href;
  const manifestUrl = new URL('manifest.json', baseUrl).href;
  let cache: Cache | undefined;
  try {cache = await caches.open(key);} catch { /* Persistent state is optional. */ }

  async function restore(manifest: PrefixManifest, source: 'stored' | 'bundled', remote?: string) {
    if (!sameProfile(manifest, expected)) throw new Error('prefix_state_incompatible');
    let persisted = !!cache;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    let stalled: ReturnType<typeof setTimeout> | undefined;
    let remoteStarted = 0;
    let remoteBytes = 0;
    let previousLoaded = 0;
    const watchTransfer = (loaded: number) => {
      clearTimeout(stalled);
      stalled = setTimeout(() => controller.abort(), 5000);
      remoteBytes += loaded - previousLoaded;
      previousLoaded = loaded;
      const elapsed = performance.now() - remoteStarted;
      // A short throughput sample prevents adding minutes of download to an
      // eventual CPU fallback. Normal warmup is then saved for the next visit.
      if (elapsed >= 3000 && remoteBytes > 0 && totalBytes * elapsed / remoteBytes > 60_000) controller.abort();
    };
    const selectedRows = requiredPhases?.length
      ? manifest.slots.filter((_, index) => requiredPhases.includes(manifest.prefixes[index].phase))
      : manifest.slots;
    if (!selectedRows.length) throw new Error('prefix_state_incompatible');
    const totalBytes = selectedRows.reduce((sum, row) => sum + row.bytes, 0);
    let completedBytes = 0;
    let lastPercent = -1;
    try {
      for (const row of selectedRows) {
        const progress = (loaded: number) => {
          const percent = Math.floor(100 * (completedBytes + loaded) / totalBytes);
          if (percent !== lastPercent) {
            lastPercent = percent;
            // Native slots are assigned by the runtime, not by warmup order.
            // Restoration reports byte progress without inventing a phase.
            onProgress({source, percent, stage: 'restoring'});
          }
        };
        progress(0);
        const url = new URL(row.file, baseUrl).href;
        let bytes: Uint8Array<ArrayBuffer> | undefined;
        try {bytes = await verifiedBytes(await cache?.match(url), row, progress);} catch { /* Retry only this static file. */ }
        if (!bytes && remote) {
          remoteStarted ||= performance.now();
          previousLoaded = 0;
          watchTransfer(0);
          try {
            bytes = await verifiedBytes(await fetch(new URL(row.file, remote), {
              credentials: 'omit', cache: 'force-cache', signal: controller.signal,
            }), row, loaded => {watchTransfer(loaded); progress(loaded);});
          } catch (error) {
            if (controller.signal.aborted) throw new Error('prefix_state_slow_network');
            throw error;
          } finally {clearTimeout(stalled);}
        }
        if (!bytes) throw new Error('prefix_state_unavailable');
        const restored = await model.importPrefixState!(row.slot, bytes);
        if (restored.details.n_restored !== row.details.n_saved) throw new Error('prefix_state_token_mismatch');
        if (cache && source === 'bundled') {
          try {await cache.put(url, new Response(bytes));} catch {persisted = false;}
        }
        completedBytes += row.bytes;
      }
      if (cache && persisted && selectedRows.length === manifest.slots.length) {
        try {await cache.put(manifestUrl, new Response(JSON.stringify(manifest)));} catch {persisted = false;}
      } else if (selectedRows.length !== manifest.slots.length) {
        persisted = false;
      }
      onProgress({source, percent: 100, stage: 'restoring'});
      return {source, persisted};
    } finally {clearTimeout(timer); clearTimeout(stalled);}
  }

  if (cache) {
    try {
      const cached = await cache.match(manifestUrl);
      if (cached) return await restore(await cached.json(), 'stored');
    } catch {
      // Never treat a partial or stale state as ready. Existing valid slots are
      // safe to reuse during normal warmup; the native validator clears failed slots.
      try {await cache.delete(manifestUrl);} catch { /* Storage may be unavailable. */ }
    }
  }
  if (bundled) {
    const connection = (navigator as Navigator & {connection?: {saveData?: boolean; effectiveType?: string}}).connection;
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '')) fallback = 'slow_network';
    else try {return await restore(bundled.manifest, 'bundled', bundled.baseUrl);} catch (error) {
      fallback = error instanceof Error && error.message === 'prefix_state_incompatible' ? 'incompatible'
        : error instanceof Error && error.message === 'prefix_state_slow_network' ? 'slow_network' : 'unavailable';
    }
  }

  await warm();
  let persisted = false;
  if (cache) {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate && Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)
        && estimate.quota! - estimate.usage! < 210 * 1024 * 1024) return {source: 'computed' as const, persisted};
      const slots: SlotState[] = [];
      for (let slot = 0; slot < 4; slot++) {
        onProgress({source: 'computed', stage: 'saving', percent: slot * 25});
        const {data, details} = await model.exportPrefixState(slot);
        if (data.byteLength < 32 || data.byteLength > MAX_SLOT_BYTES || details.n_saved < 100) throw new Error('prefix_state_invalid_export');
        const row = {slot, file: `slot-${slot}.bin`, bytes: data.byteLength, sha256: await digest(data), details};
        slots.push(row);
        await cache.put(new URL(row.file, baseUrl).href, new Response(data));
      }
      // Write the manifest last, after every static state file has been saved.
      const manifest = {...expected, slots};
      if (!sameProfile(manifest, expected)) throw new Error('prefix_state_invalid_export');
      await cache.put(manifestUrl, new Response(JSON.stringify(manifest)));
      persisted = true;
      onProgress({source: 'computed', stage: 'saving', percent: 100});
    } catch { /* Failure to save must not discard a ready model. */ }
  }
  return {source: 'computed' as const, persisted};
}
