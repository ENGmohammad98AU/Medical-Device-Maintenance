// Called before enabling forms. At most one initial refresh; never refresh later
// in response to a worker update, when a user could have unsaved report text.
export async function prepareIsolation(workerUrl) {
  if (globalThis.crossOriginIsolated) return true;
  if (!globalThis.isSecureContext || !navigator.serviceWorker) return false;
  const key = 'llm-isolation-refresh-v1';
  let timeout;
  let onController;
  try {
    // Without a persistent loop guard, do not attempt an automatic refresh.
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, 'attempted');
    const controlled = new Promise(resolve => {
      onController = () => resolve();
      navigator.serviceWorker.addEventListener('controllerchange', onController);
    });
    const ready = (async () => {
      await navigator.serviceWorker.register(workerUrl, {updateViaCache: 'none'});
      if (!navigator.serviceWorker.controller) await controlled;
      return true;
    })();
    const bounded = new Promise(resolve => {timeout = setTimeout(() => resolve(false), 4000);});
    if (await Promise.race([ready, bounded])) {
      location.reload();
      // Do not render an editable form in the short interval before navigation.
      return await new Promise(() => {});
    }
  } catch { /* Single-thread fallback remains usable if registration is blocked. */ }
  finally {
    clearTimeout(timeout);
    if (onController) navigator.serviceWorker.removeEventListener('controllerchange', onController);
  }
  return false;
}

export function inferenceThreads() {
  return globalThis.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'
    ? Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1)) : 1;
}
