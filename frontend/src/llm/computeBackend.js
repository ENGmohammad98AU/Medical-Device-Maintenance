export async function selectComputeBackend(forceCpu = false, onReason = () => {}) {
  const cpu = reason => { onReason(reason); return 'wasm'; };
  if (forceCpu) return 'wasm';
  if (!navigator.gpu) return cpu('WebGPU is unavailable in this browser worker.');
  if (!WebAssembly.Suspending) return cpu('WebAssembly JSPI is unavailable in this browser worker.');
  let timer;
  let timedOut = false;
  try {
    const adapter = await Promise.race([
      // Match the pinned llama.cpp WebGPU backend, which requests the default
      // adapter. Probing a different adapter can advertise unusable GPU support.
      navigator.gpu.requestAdapter(),
      new Promise(resolve => {timer = setTimeout(() => { timedOut = true; resolve(null); }, 3000);}),
    ]);
    if (!adapter) return cpu(timedOut ? 'GPU adapter lookup exceeded 3 seconds.' : 'The browser returned no GPU adapter.');
    if (adapter.isFallbackAdapter || adapter.info?.isFallbackAdapter) return cpu('The browser supplied a software GPU adapter.');
    // The pinned native backend registers no GPU device without ShaderF16.
    // Adapter availability alone must not label a CPU run as GPU acceleration.
    if (!adapter.features?.has('shader-f16')) return cpu('The GPU adapter lacks shader-f16, which this model runtime requires.');
    return 'webgpu';
  } catch { return cpu('GPU adapter lookup failed.'); }
  finally { clearTimeout(timer); }
}

export function runtimeLoadOptions(config, threads, backend) {
  return {n_ctx: config.context_tokens, n_batch: config.batch_tokens, n_ubatch: config.batch_tokens,
    n_threads: threads, n_gpu_layers: backend === 'webgpu' ? 99999 : 0,
    n_parallel: config.parallel_slots ?? 3, kv_unified: false, ctx_shift: false, cache_idle_slots: true, seed: 0};
}
