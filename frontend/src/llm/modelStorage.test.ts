import { afterEach, expect, it, vi } from 'vitest';
import { loadGgufModel } from './modelStorage.js';

const url = 'https://example.test/model.gguf';
afterEach(() => vi.unstubAllGlobals());
function setup(quota = 100_000_000) {
  vi.stubGlobal('navigator', {storage: {estimate: vi.fn(async () => ({quota, usage: 0}))}});
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));
  const cached = {url, validate: () => 'valid', open: vi.fn(async () => [new Blob(['abc'])]), remove: vi.fn()};
  const model = {modelManager: {getModels: vi.fn(async () => [] as typeof cached[]), downloadModel: vi.fn(async () => cached)}, loadModel: vi.fn(async () => {})};
  const run = () => loadGgufModel(model as unknown as Parameters<typeof loadGgufModel>[0], url, {}, 3);
  return {model, cached, run};
}
it('reuses a valid cache even with no free quota', async () => {
  const {model, cached, run} = setup(0); model.modelManager.getModels.mockResolvedValue([cached]);
  expect(await run()).toBe('persistent'); expect(fetch).not.toHaveBeenCalled();
  expect(model.modelManager.downloadModel).not.toHaveBeenCalled();
});
it('loads a temporary Blob when quota is insufficient', async () => {
  const {model, run} = setup(0); expect(await run()).toBe('temporary');
  expect(model.modelManager.downloadModel).not.toHaveBeenCalled();
  expect(model.loadModel.mock.calls.length).toBe(1);
});
it('recovers from quota failure and removes only this incomplete model', async () => {
  const {model, cached, run} = setup();
  const incomplete = {...cached, validate: () => 'invalid', remove: vi.fn()};
  const other = {...incomplete, url: 'https://example.test/other', remove: vi.fn()};
  model.modelManager.getModels.mockResolvedValue([incomplete, other]);
  model.modelManager.downloadModel.mockRejectedValue(new DOMException('full', 'QuotaExceededError'));
  expect(await run()).toBe('temporary'); expect(incomplete.remove).toHaveBeenCalled();
  expect(other.remove).not.toHaveBeenCalled();
});
it('works when persistent storage cannot be read', async () => {
  const {model, run} = setup(); model.modelManager.getModels.mockRejectedValue(new DOMException('blocked', 'SecurityError'));
  expect(await run()).toBe('temporary'); expect(model.loadModel).toHaveBeenCalledOnce();
});
it('rejects a truncated download before native loading', async () => {
  const {model, run} = setup(0); vi.mocked(fetch).mockResolvedValue(new Response('ab'));
  await expect(run()).rejects.toThrow('model_size_mismatch'); expect(model.loadModel).not.toHaveBeenCalled();
});
it('does not retry native runtime failures as storage problems', async () => {
  const {model, run} = setup(); model.loadModel.mockRejectedValue(new Error('native failure'));
  await expect(run()).rejects.toThrow('native failure'); expect(fetch).not.toHaveBeenCalled();
  expect(model.loadModel).toHaveBeenCalledOnce();
});
