export async function selectComputeBackend(forceCpu = false) {
  if (forceCpu || !navigator.gpu || !WebAssembly.Suspending) return 'wasm';
  let timer;
  try {
    const adapter = await Promise.race([
      navigator.gpu.requestAdapter({powerPreference: 'high-performance'}),
      new Promise(resolve => {timer = setTimeout(() => resolve(null), 3000);}),
    ]);
    if (!adapter || adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) return 'wasm';
    return 'webgpu';
  } catch { return 'wasm'; }
  finally { clearTimeout(timer); }
}

export function runtimeLoadOptions(config, threads, backend) {
  return {n_ctx: config.context_tokens, n_batch: config.batch_tokens, n_ubatch: config.batch_tokens,
    n_threads: threads, n_gpu_layers: backend === 'webgpu' ? 99999 : 0,
    n_parallel: 2, kv_unified: false, ctx_shift: false, cache_idle_slots: true, seed: 0};
}
