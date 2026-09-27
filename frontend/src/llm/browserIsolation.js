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
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === 'undefined') return 1;
  const cores = Math.max(1, navigator.hardwareConcurrency || 1);
  const mobile = navigator.userAgentData?.mobile || /Android|iPhone|iPad/i.test(navigator.userAgent || '');
  // Keep the existing cap on smaller/mobile devices. Larger desktops can use
  // more cores, while reserving a logical processor for the application UI.
  return !mobile && cores >= 8 ? Math.min(8, cores - 1) : Math.min(4, cores);
}
