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
    const progress = vi.fn(); const second = client.run({...input, report_text: 'Sensor is disconnected'}, progress);
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
  it('reuses only the same complete input and reports reuse without old timing', async () => {
    const client = new LocalModelClient();
    const context = {version: 'v1', input_sha256: 'a'.repeat(64), report_text: input.report_text,
      device_name: 'Ventilator', candidates: [{label: 'A' as const, reference_id: 'R1', symptom: 'Battery fault'}]};
    const request = {...input, support_context: context};
    const first = client.run(request, vi.fn());
    const worker = FakeWorker.instances[0];
    worker.message({id: 1, result: {...success, support: {status: 'success', version: 'v1',
      input_sha256: context.input_sha256, output_token: 'A', latency_ms: 10}}});
    await first;
    const reused = await client.run(request, vi.fn());
    expect(reused.reused_result).toBe(true); expect(reused.latency_ms).toBe(0);
    expect(reused.support?.latency_ms).toBe(0); expect(worker.postMessage).toHaveBeenCalledOnce();
    const changes = [
      {...request, report_text: 'Another fault'}, {...request, device_type: 'MONITOR'},
      {...request, patient_connected: true},
      {...request, support_context: {...context, input_sha256: 'b'.repeat(64)}},
      {...request, support_context: {...context, version: 'v2'}},
      {...request, support_context: {...context, candidates: [{...context.candidates[0], symptom: 'Changed reference'}]}},
    ];
    for (const changed of changes) {
      const result = client.run(changed, vi.fn());
      const calls = FakeWorker.instances[FakeWorker.instances.length - 1].postMessage.mock.calls;
      expect(calls[calls.length - 1][0].input).toEqual(changed);
      client.cancel(); await result;
    }
    client.dispose();
  });
  it('expires cached results and clears them at logout/dispose', async () => {
    const client = new LocalModelClient();
    const first = client.run(input, vi.fn());
    FakeWorker.instances[0].message({id: 1, result: success}); await first;
    vi.advanceTimersByTime(10 * 60_000);
    const second = client.run(input, vi.fn());
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledTimes(2);
    FakeWorker.instances[0].message({id: 2, result: success}); await second;
    client.dispose();
    const third = client.run(input, vi.fn());
    expect(FakeWorker.instances).toHaveLength(2);
    client.cancel(); await third;
  });
  it('does not cache a failed reference selection', async () => {
    const client = new LocalModelClient();
    const request = {...input, support_context: {version: 'v1', input_sha256: 'a'.repeat(64),
      device_name: 'Ventilator', report_text: input.report_text, candidates: []}};
    const first = client.run(request, vi.fn());
    FakeWorker.instances[0].message({id: 1, result: {...success, support: {status: 'error'}}}); await first;
    const second = client.run(request, vi.fn());
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledTimes(2);
    client.cancel(); await second;
  });
});
