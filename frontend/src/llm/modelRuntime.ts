import {Wllama} from '@wllama/wllama';
import bundle from './staticPrefixBundle.json';
import type {PrefixManifest} from './staticPrefixState';

export async function modelRuntime() {
  if (import.meta.env.VITE_STATIC_PREFIX_ASSETS) {
    const baseUrl = new URL(`${import.meta.env.BASE_URL}llm/${bundle.id}/`, self.location.origin).href;
    // Prebuild verifies both binaries and every state file against the pinned
    // hashes. Keep the paired runtime outside Vite's source transformation.
    const runtime: typeof import('@wllama/wllama') = await import(/* @vite-ignore */ `${baseUrl}runtime.js`);
    return {Wllama: runtime.Wllama, wasm: `${baseUrl}runtime.wasm`, identity: bundle.manifest.runtime,
      bundled: {manifest: bundle.manifest as PrefixManifest, baseUrl}};
  }
  return {Wllama, wasm: new URL(`${import.meta.env.BASE_URL}llm/wllama-3.6.1.wasm`, self.location.origin).href};
}
