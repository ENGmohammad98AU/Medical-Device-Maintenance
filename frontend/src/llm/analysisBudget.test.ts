import {afterEach, describe, expect, it, vi} from 'vitest';
import {ANALYSIS_TIMEOUT_MS, createAnalysisBudget} from './analysisBudget';

afterEach(() => vi.useRealTimers());
describe('complete prepared analysis deadline', () => {
  it('shares one deadline across API calls and reserves time for final validation', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance']}); const cancel = vi.fn(); const budget = createAnalysisBudget(cancel);
    const auth = budget.requestOptions();
    vi.advanceTimersByTime(8_000);
    expect(budget.requestOptions(6_000).timeout).toBe(6_000);
    expect(budget.inferenceMs()).toBe(37_000);
    vi.advanceTimersByTime(37_000);
    expect(budget.requestOptions().timeout).toBe(10_000);
    expect(budget.inferenceMs()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(auth.signal.aborted).toBe(true); expect(cancel).toHaveBeenCalledOnce();
    expect(budget.expired).toBe(true); expect(() => budget.requestOptions()).toThrow('55');
    budget.dispose();
  });
  it('does not cancel a later request after a successful workflow', () => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance']}); const cancel = vi.fn(); const budget = createAnalysisBudget(cancel);
    budget.dispose(); vi.advanceTimersByTime(ANALYSIS_TIMEOUT_MS);
    expect(cancel).not.toHaveBeenCalled();
  });
});
