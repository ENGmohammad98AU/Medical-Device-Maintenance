import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalModelClient } from './localModelClient';
import { localModelConfig } from './localModelContract';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: {data: unknown}) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  message(data: unknown) { this.onmessage?.({data}); }
}
const input = {report_text: 'Battery does not charge', device_type: 'VENTILATOR', patient_connected: false};
const success = {status: 'success', revision: localModelConfig.revision, output_token: 'A', latency_ms: 20};
describe('local inference lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers(); FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('crypto', {subtle: {}});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('reuses a successful worker and ignores results from an older request', async () => {
    const client = new LocalModelClient();
    const first = client.run(input, vi.fn()); const worker = FakeWorker.instances[0];
    worker.message({id: 1, result: success}); expect((await first).status).toBe('success');
    const progress = vi.fn(); const second = client.run(input, progress);
    worker.message({id: 1, result: success}); worker.message({id: 2, progress: {stage: 'running'}});
    expect(progress).toHaveBeenCalledOnce();
    worker.message({id: 2, result: success}); expect((await second).status).toBe('success');
    expect(FakeWorker.instances).toHaveLength(1); client.dispose();
  });
  it('cancels loading and permits a clean retry', async () => {
    const client = new LocalModelClient(); const first = client.run(input, vi.fn());
    client.cancel(); expect((await first).error_code).toBe('cancelled');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const second = client.run(input, vi.fn()); FakeWorker.instances[1].message({id: 2, result: success});
    expect((await second).status).toBe('success'); client.dispose();
  });
  it('bounds inference time and terminates computation', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn());
    FakeWorker.instances[0].message({id: 1, progress: {stage: 'running'}});
    vi.advanceTimersByTime(15 * 60_000);
    expect((await result).error_code).toBe('timeout'); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it('handles runtime crashes without an unresolved request', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn());
    FakeWorker.instances[0].onerror?.(); expect((await result).error_code).toBe('load_failed');
  });
  it('rejects unsupported browsers before downloading', async () => {
    vi.stubGlobal('Worker', undefined);
    expect((await new LocalModelClient().run(input, vi.fn())).error_code).toBe('unsupported_browser');
    expect(FakeWorker.instances).toHaveLength(0);
  });
  it('settles an in-flight request on unmount/dispose', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn()); client.dispose();
    expect((await result).error_code).toBe('cancelled');
  });
});
