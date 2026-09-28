import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalModelClient } from './localModelClient';
import { LocalModelSession } from './localModelSession';
import { localFailure, localModelConfig, type LocalProgress, type LocalResult } from './localModelContract';

const prepared: LocalResult = {status: 'success', revision: localModelConfig.revision, latency_ms: 60_000};

afterEach(() => vi.useRealTimers());
describe('model ownership across screens', () => {
  it('keeps the model for navigation, bounds idle memory, and clears it on logout', async () => {
    vi.useFakeTimers();
    const client = new LocalModelClient();
    const dispose = vi.spyOn(client, 'dispose');
    const session = new LocalModelSession(client);
    const first = session.acquire(); first.release();
    vi.advanceTimersByTime(1000);
    const second = session.acquire();
    vi.advanceTimersByTime(10 * 60_000);
    expect(dispose).not.toHaveBeenCalled();
    second.release(); vi.advanceTimersByTime(10 * 60_000);
    expect(dispose).toHaveBeenCalledOnce();
    const third = session.acquire(); session.reset();
    expect(dispose).toHaveBeenCalledTimes(2); third.release();
  });
  it('only lets the owner cancel active inference', async () => {
    const client = new LocalModelClient();
    let finish!: (value: ReturnType<typeof localFailure>) => void;
    vi.spyOn(client, 'run').mockImplementation(() => new Promise(resolve => {finish = resolve;}));
    const cancel = vi.spyOn(client, 'cancel').mockImplementation(() => finish(localFailure('cancelled')));
    const session = new LocalModelSession(client);
    const first = session.acquire(), second = session.acquire();
    const pending = first.run({report_text: 'Battery fault', device_type: 'VENTILATOR', patient_connected: false}, vi.fn());
    second.release(); expect(cancel).not.toHaveBeenCalled();
    first.release(); expect((await pending).error_code).toBe('cancelled');
    session.reset();
  });
  it('continues one preparation across navigation and replays progress to the new screen', async () => {
    const client = new LocalModelClient();
    let finish!: (result: LocalResult) => void;
    let reportProgress!: (value: LocalProgress) => void;
    let ready = false;
    vi.spyOn(client, 'isReady', 'get').mockImplementation(() => ready);
    const prepare = vi.spyOn(client, 'prepare').mockImplementation(progress => {
      reportProgress = progress;
      return new Promise(resolve => { finish = resolve; });
    });
    const cancel = vi.spyOn(client, 'cancel');
    const session = new LocalModelSession(client);
    const first = session.acquire(); const firstProgress = vi.fn();
    const pending = first.prepare(firstProgress);
    await Promise.resolve();
    reportProgress({stage: 'warming', task: 'classification'});
    first.release();
    expect(cancel).not.toHaveBeenCalled();
    const second = session.acquire(); const secondProgress = vi.fn();
    expect(second.isPreparing).toBe(true);
    const joined = second.prepare(secondProgress);
    expect(secondProgress).toHaveBeenLastCalledWith({stage: 'warming', task: 'classification'});
    reportProgress({stage: 'warming', task: 'reference_selection'});
    expect(firstProgress).toHaveBeenCalledTimes(1);
    expect(secondProgress).toHaveBeenLastCalledWith({stage: 'warming', task: 'reference_selection'});
    ready = true;
    finish(prepared);
    expect(await joined).toEqual(await pending);
    expect(second.isReady).toBe(true); expect(second.isPreparing).toBe(false);
    expect(prepare).toHaveBeenCalledOnce(); expect(cancel).not.toHaveBeenCalled();
    second.release(); session.reset();
  });
  it('blocks inference during preparation and lets explicit cancellation start a fresh attempt', async () => {
    const client = new LocalModelClient();
    const completions: ((result: LocalResult) => void)[] = [];
    const prepare = vi.spyOn(client, 'prepare').mockImplementation(() => new Promise(resolve => completions.push(resolve)));
    vi.spyOn(client, 'cancel').mockImplementation(() => completions[completions.length - 1]?.(localFailure('cancelled')));
    const run = vi.spyOn(client, 'run');
    const session = new LocalModelSession(client); const lease = session.acquire();
    const first = lease.prepare(vi.fn()); await Promise.resolve();
    expect((await lease.run({report_text: 'Battery fault', device_type: 'VENTILATOR', patient_connected: false}, vi.fn())).error_code)
      .toBe('load_failed');
    expect(run).not.toHaveBeenCalled();
    lease.cancel();
    const nextProgress = vi.fn(); const next = lease.prepare(nextProgress);
    expect((await first).error_code).toBe('cancelled');
    expect(lease.isPreparing).toBe(true);
    // A late completion from the cancelled job must not clear the new job.
    expect(prepare).toHaveBeenCalledTimes(2);
    completions[1](prepared);
    expect((await next).status).toBe('success'); expect(lease.isPreparing).toBe(false);
    lease.release(); session.reset();
  });
  it('still releases background preparation after the idle limit', async () => {
    vi.useFakeTimers();
    const client = new LocalModelClient();
    let finish!: (result: LocalResult) => void;
    vi.spyOn(client, 'prepare').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const cancel = vi.spyOn(client, 'cancel').mockImplementation(() => finish(localFailure('cancelled')));
    const session = new LocalModelSession(client); const lease = session.acquire();
    const pending = lease.prepare(vi.fn()); await Promise.resolve();
    lease.release(); vi.advanceTimersByTime(10 * 60_000 - 1);
    expect(cancel).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect((await pending).error_code).toBe('cancelled');
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('does not start a queued preparation after logout', async () => {
    const client = new LocalModelClient();
    const prepare = vi.spyOn(client, 'prepare');
    const session = new LocalModelSession(client); const lease = session.acquire();
    const pending = lease.prepare(vi.fn()); session.reset();
    expect((await pending).error_code).toBe('cancelled');
    expect(prepare).not.toHaveBeenCalled(); expect(lease.isPreparing).toBe(false);
    lease.release(); session.reset();
  });
});
