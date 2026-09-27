import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferenceThreads, prepareIsolation } from './browserIsolation.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('optional browser isolation', () => {
  function setup() {
    const values = new Map();
    const sw = Object.assign(new EventTarget(), {register: vi.fn(async () => ({})), controller: null as object | null});
    vi.stubGlobal('navigator', {serviceWorker: sw, hardwareConcurrency: 16});
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('crossOriginIsolated', false);
    vi.stubGlobal('sessionStorage', {getItem: (k: string) => values.get(k), setItem: (k: string, v: string) => values.set(k, v)});
    vi.stubGlobal('location', {reload: vi.fn()});
    return sw;
  }
  it('keeps the application usable when service worker registration is blocked', async () => {
    const sw = setup(); sw.register.mockRejectedValue(new Error('blocked'));
    expect(await prepareIsolation('/llm-isolation-worker.js')).toBe(false);
    expect(location.reload).not.toHaveBeenCalled();
  });
  it('bounds startup and never reloads when a late activation could lose form text', async () => {
    vi.useFakeTimers(); const sw = setup();
    const pending = prepareIsolation('/llm-isolation-worker.js');
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toBe(false);
    sw.controller = {}; sw.dispatchEvent(new Event('controllerchange'));
    await Promise.resolve();
    expect(location.reload).not.toHaveBeenCalled();
    expect(await prepareIsolation('/llm-isolation-worker.js')).toBe(false);
    expect(sw.register).toHaveBeenCalledOnce();
  });
  it('prevents a refresh loop if the first refresh did not enable isolation', async () => {
    const sw = setup(); sw.controller = {};
    void prepareIsolation('/llm-isolation-worker.js');
    await vi.waitFor(() => expect(location.reload).toHaveBeenCalledOnce());
    expect(await prepareIsolation('/llm-isolation-worker.js')).toBe(false);
    expect(location.reload).toHaveBeenCalledOnce();
  });
  it('caps parallel work and uses one thread without shared memory isolation', () => {
    setup(); expect(inferenceThreads()).toBe(1);
    vi.stubGlobal('crossOriginIsolated', true);
    expect(inferenceThreads()).toBe(8);
    vi.stubGlobal('SharedArrayBuffer', undefined);
    expect(inferenceThreads()).toBe(1);
  });
  it('preserves the smaller-device limit and reserves desktop capacity for the UI', () => {
    vi.stubGlobal('crossOriginIsolated', true);
    for (const [cores, expected] of [[1, 1], [2, 2], [4, 4], [6, 4], [8, 7], [9, 8], [16, 8]]) {
      vi.stubGlobal('navigator', {hardwareConcurrency: cores, userAgent: 'Desktop'});
      expect(inferenceThreads()).toBe(expected);
    }
    for (const browser of [{userAgent: 'Android'}, {userAgent: 'iPhone'}, {userAgentData: {mobile: true}}]) {
      vi.stubGlobal('navigator', {hardwareConcurrency: 16, ...browser});
      expect(inferenceThreads()).toBe(4);
    }
  });
});
