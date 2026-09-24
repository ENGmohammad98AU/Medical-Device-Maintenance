// OPFS is an optimization, not a prerequisite for running the model.
// Setting wllama's useCache:false still writes OPFS; temporary mode must instead
// pass a downloaded Blob directly to loadModel(). Never clear unrelated files.
const storageError = error => ['QuotaExceededError', 'SecurityError', 'NotAllowedError',
  'NotSupportedError', 'InvalidStateError'].includes(error?.name);

async function removeIncomplete(manager, url) {
  try {
    for (const item of await manager.getModels({includeInvalid: true})) {
      if (item.url === url && item.validate() !== 'valid') await item.remove();
    }
  } catch { /* Cleanup is best-effort when storage itself is unavailable. */ }
}

async function temporaryBlob(url, expectedBytes, progress) {
  const response = await fetch(url, {credentials: 'omit', cache: 'no-store'});
  if (!response.ok) throw new Error(`model_download_http_${response.status}`);
  if (!response.body) throw new Error('model_download_empty');
  const reader = response.body.getReader();
  let loaded = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      const chunk = await reader.read();
      if (chunk.done) { controller.close(); return; }
      loaded += chunk.value.byteLength;
      if (loaded > expectedBytes) {
        await reader.cancel(); throw new Error('model_size_mismatch');
      }
      progress?.({loaded, total: expectedBytes});
      controller.enqueue(chunk.value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });
  return new Response(stream).blob();
}

export async function loadGgufModel(model, url, options, expectedBytes, onMode = () => {}) {
  const manager = model.modelManager;
  let blobs;
  let mode = 'persistent';
  let models;
  try { models = await manager.getModels({includeInvalid: true}); }
  catch { mode = 'temporary'; }
  if (models) {
    const cached = models.find(item => item.url === url && item.validate() === 'valid');
    if (cached) {
      try { blobs = await cached.open(); }
      catch { mode = 'temporary'; }
    } else {
      await removeIncomplete(manager, url);
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (Number.isFinite(estimate?.quota) && Number.isFinite(estimate?.usage)
          && estimate.quota - estimate.usage < expectedBytes + 8 * 1024 * 1024) mode = 'temporary';
      } catch { mode = 'temporary'; }
      if (mode === 'persistent') {
        onMode(mode);
        try {
          const downloaded = await manager.downloadModel(url, options);
          blobs = await downloaded.open();
        } catch (error) {
          if (!storageError(error)) throw error;
          await removeIncomplete(manager, url);
          mode = 'temporary';
        }
      }
    }
  }
  onMode(mode);
  if (!blobs) blobs = [await temporaryBlob(url, expectedBytes, options.progressCallback)];
  if (blobs.reduce((sum, blob) => sum + blob.size, 0) !== expectedBytes) throw new Error('model_size_mismatch');
  // Outside the storage catch: a runtime failure must not trigger a second load.
  await model.loadModel(blobs, options);
  return mode;
}
