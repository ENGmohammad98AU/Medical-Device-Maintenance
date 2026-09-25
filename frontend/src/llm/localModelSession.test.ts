import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalModelClient } from './localModelClient';
import { LocalModelSession } from './localModelSession';
import { localFailure } from './localModelContract';

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
});
