import {describe, expect, it, vi} from 'vitest';
import type {Wllama} from '@wllama/wllama';
import {classifyLocally, selectSupportLocally, warmLocalPrompts} from './localModelEngine';
import {supportModelConfig, type SupportContext} from './supportModelContract';
import {generateGuidance, guidanceModelConfig} from './guidanceModel';

describe('preparation prefixes', () => {
  it('warms exactly the prefixes consumed by real classification, selection, scope and generation', async () => {
    const completion = (text: string) => ({choices: [{text, finish_reason: 'stop'}],
      usage: {prompt_tokens: 400, completion_tokens: 20}});
    const createCompletion = vi.fn(async () => completion('A'));
    const model = {createCompletion} as unknown as Pick<Wllama, 'createCompletion'>;
    const progress = vi.fn();
    await warmLocalPrompts(model, progress);
    const calls = createCompletion.mock.calls as unknown as [{prompt: string; max_tokens: number}][];
    const prefixes = calls.map(([options]) => options.prompt);
    expect(progress.mock.calls.map(([task]) => task)).toEqual(['classification', 'reference_selection', 'scope', 'generation']);
    expect(new Set(prefixes).size).toBe(4);
    expect(calls.every(([options]) => options.max_tokens === 1)).toBe(true);
    const lastPrompt = () => (createCompletion.mock.calls[createCompletion.mock.calls.length - 1] as unknown as [{prompt: string}])[0].prompt;
    for (const report of ['The battery will not charge.', 'البطارية لا تشحن.']) {
      await classifyLocally(model, {report_text: report, device_type: 'VENTILATOR', patient_connected: false});
      expect(lastPrompt().startsWith(prefixes[0])).toBe(true);
      expect(lastPrompt()).toContain(report);
    }
    const context: SupportContext = {version: supportModelConfig.version, input_sha256: 'a'.repeat(64),
      device_name: 'Hamilton C6', report_text: 'Battery low',
      candidates: [{label: 'A', reference_id: 'HAM-C6-001', symptom: 'Battery low'}]};
    await selectSupportLocally(model, context);
    expect(lastPrompt().startsWith(prefixes[1])).toBe(true);
    createCompletion.mockResolvedValueOnce(completion('D'));
    await selectSupportLocally(model, {...context, candidates: []});
    expect(lastPrompt().startsWith(prefixes[2])).toBe(true);
    createCompletion.mockResolvedValueOnce(completion('The cause is unconfirmed. Check the wheel for visible debris.'));
    const guidance = await generateGuidance(model, {version: guidanceModelConfig.version,
      input_sha256: 'a'.repeat(64), device_name: 'Hamilton C6', report_text: 'The wheel is jammed.'}, 40_000);
    expect(guidance.status).toBe('success');
    expect(lastPrompt().startsWith(prefixes[3])).toBe(true);
    expect(prefixes[3]).not.toContain('No manufacturer reference matched.');
  });
  it('does not mark later stages ready after a warmup failure', async () => {
    const model = {createCompletion: vi.fn().mockRejectedValue(new Error('runtime failure'))};
    const progress = vi.fn();
    await expect(warmLocalPrompts(model as unknown as Pick<Wllama, 'createCompletion'>, progress)).rejects.toThrow('runtime failure');
    expect(progress.mock.calls).toEqual([['classification']]);
  });
});
