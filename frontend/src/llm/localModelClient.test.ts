import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalModelClient } from './localModelClient';
import { LOCAL_INFERENCE_TIMEOUT_MS, LOCAL_PREPARATION_TIMEOUT_MS, localModelConfig } from './localModelContract';

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
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance']}); FakeWorker.instances = [];
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
    vi.advanceTimersByTime(LOCAL_INFERENCE_TIMEOUT_MS);
    expect((await result).error_code).toBe('timeout'); expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });
  it('does not restart the deadline when reference selection begins or progress repeats', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn());
    const worker = FakeWorker.instances[0];
    worker.message({id: 1, progress: {stage: 'running', task: 'classification'}});
    vi.advanceTimersByTime(30_000);
    worker.message({id: 1, progress: {stage: 'running', task: 'reference_selection'}});
    vi.advanceTimersByTime(LOCAL_INFERENCE_TIMEOUT_MS - 30_000);
    expect(await result).toMatchObject({error_code: 'timeout', inference_ms: LOCAL_INFERENCE_TIMEOUT_MS});
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('keeps the inference deadline through a GPU retry and subsequent loading messages', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn());
    FakeWorker.instances[0].message({id: 1, progress: {stage: 'running'}});
    vi.advanceTimersByTime(40_000);
    FakeWorker.instances[0].message({id: 1, retry_cpu: true});
    const cpu = FakeWorker.instances[1];
    cpu.message({id: 1, progress: {stage: 'loading'}});
    vi.advanceTimersByTime(LOCAL_INFERENCE_TIMEOUT_MS - 40_000);
    expect((await result).error_code).toBe('timeout'); expect(cpu.terminate).toHaveBeenCalledOnce();
  });
  it('prepares without a report, reuses the worker and records preparation separately', async () => {
    const client = new LocalModelClient(); const preparing = client.prepare(vi.fn());
    const worker = FakeWorker.instances[0];
    expect(worker.postMessage).toHaveBeenCalledWith({id: 1, input: undefined, force_cpu: false, inference_budget_ms: LOCAL_INFERENCE_TIMEOUT_MS});
    vi.advanceTimersByTime(120_000);
    worker.message({id: 1, progress: {stage: 'warming'}});
    worker.message({id: 1, ready: true, result: {status: 'success', revision: localModelConfig.revision, latency_ms: 120_000}});
    expect(await preparing).toMatchObject({preparation_ms: 120_000, inference_ms: 0});
    expect(client.isReady).toBe(true);
    expect((await client.prepare(vi.fn())).latency_ms).toBe(0);
    const result = client.run(input, vi.fn());
    vi.advanceTimersByTime(20_000);
    worker.message({id: 2, result: success});
    expect(await result).toMatchObject({preparation_ms: 0, inference_ms: 20_000});
    expect(FakeWorker.instances).toHaveLength(1);
    client.dispose(); expect(client.isReady).toBe(false);
  });
  it('bounds preparation without renewing it at each warmup task', async () => {
    const client = new LocalModelClient(); const result = client.prepare(vi.fn());
    vi.advanceTimersByTime(LOCAL_PREPARATION_TIMEOUT_MS - 1);
    FakeWorker.instances[0].message({id: 1, progress: {stage: 'warming'}});
    vi.advanceTimersByTime(1);
    expect((await result).error_code).toBe('timeout'); expect(client.isReady).toBe(false);
  });
  it('honors a smaller workflow budget and refuses invalid or exhausted budgets', async () => {
    const client = new LocalModelClient();
    for (const budget of [0, -1, NaN, Infinity]) {
      expect((await client.run(input, vi.fn(), budget)).error_code).toBe('timeout');
    }
    expect(FakeWorker.instances).toHaveLength(0);
    const result = client.run(input, vi.fn(), 12_000);
    FakeWorker.instances[0].message({id: 1, progress: {stage: 'running'}});
    vi.advanceTimersByTime(12_000);
    expect((await result).error_code).toBe('timeout');
  });
  it('handles runtime crashes without an unresolved request', async () => {
    const client = new LocalModelClient(); const result = client.run(input, vi.fn());
    FakeWorker.instances[0].onerror?.(); expect((await result).error_code).toBe('load_failed');
  });
  it('releases a failed GPU worker before one CPU retry and ignores late GPU messages', async () => {
    const client = new LocalModelClient(); const progress = vi.fn();
    const result = client.run(input, progress); const gpu = FakeWorker.instances[0];
    gpu.message({id: 1, retry_cpu: true});
    expect(gpu.terminate).toHaveBeenCalledOnce();
    const cpu = FakeWorker.instances[1];
    expect(cpu.postMessage).toHaveBeenCalledWith({id: 1, input, force_cpu: true, inference_budget_ms: LOCAL_INFERENCE_TIMEOUT_MS});
    gpu.message({id: 1, result: {...success, output_token: 'H'}});
    gpu.onerror?.();
    cpu.message({id: 1, result: {...success, runtime: 'wllama-3.6.1/wasm'}});
    expect(await result).toMatchObject({status: 'success', output_token: 'A', runtime: 'wllama-3.6.1/wasm'});
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({cpu_fallback: true}));
    client.dispose();
  });
  it('does not loop CPU retries and cancellation also stops a fallback worker', async () => {
    const client = new LocalModelClient(); const first = client.run(input, vi.fn());
    FakeWorker.instances[0].message({id: 1, retry_cpu: true});
    FakeWorker.instances[1].message({id: 1, retry_cpu: true});
    expect((await first).error_code).toBe('load_failed'); expect(FakeWorker.instances).toHaveLength(2);
    const second = client.run(input, vi.fn()); client.cancel();
    expect((await second).error_code).toBe('cancelled');
    expect(FakeWorker.instances[2].terminate).toHaveBeenCalledOnce();
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
  it('caches only completed generation and invalidates changed generation context', async () => {
    const client = new LocalModelClient();
    const guidance = {version: 'g1', input_sha256: 'a'.repeat(64), device_name: 'Ventilator', report_text: input.report_text};
    const request = {...input, support_context: {...guidance, candidates: [], guidance}};
    const first = client.run(request, vi.fn()); const worker = FakeWorker.instances[0];
    worker.message({id: 1, result: {...success, guidance: {...guidance, status: 'error', error_code: 'timeout'}}});
    await first;
    const second = client.run(request, vi.fn());
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.message({id: 2, result: {...success, guidance: {...guidance, status: 'success', text: 'Completed draft', latency_ms: 12000}}});
    await second;
    const reused = await client.run(request, vi.fn());
    expect(reused.reused_result).toBe(true); expect(reused.guidance?.latency_ms).toBe(0);
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    const changed = client.run({...request, support_context: {...request.support_context, guidance: {...guidance, input_sha256: 'b'.repeat(64)}}}, vi.fn());
    expect(worker.postMessage).toHaveBeenCalledTimes(3);
    client.cancel(); await changed; client.dispose();
  });
});
