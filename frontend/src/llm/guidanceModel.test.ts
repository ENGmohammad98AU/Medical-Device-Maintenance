import {afterEach, describe, expect, it, vi} from 'vitest';
import type { Wllama } from '@wllama/wllama';
import {generateGuidance, guidanceModelConfig as config} from './guidanceModel';

const context = {version: config.version, input_sha256: 'a'.repeat(64), device_name: 'Hamilton C6', report_text: 'The trolley wheel is jammed.'};
const text = '1. افحص العجلة بصريًا بحثًا عن عائق.\n2. سجّل موضع التعليق وحالة الفرامل الظاهرة.';
const response = {choices: [{text, finish_reason: 'stop'}], usage: {prompt_tokens: 220, completion_tokens: 42}};
function model(value = response) {
  const createCompletion = vi.fn(async () => value);
  return {instance: {createCompletion} as unknown as Pick<Wllama, 'createCompletion'>, createCompletion};
}
describe('bounded free generation', () => {
  afterEach(() => vi.useRealTimers());
  it('decodes free text without a letter-choice grammar', async () => {
    const m = model();
    expect(await generateGuidance(m.instance, context, 40000)).toMatchObject({status: 'success', text});
    const options = m.createCompletion.mock.calls[0] as unknown as [{prompt: string; grammar?: string; max_tokens: number}];
    expect(options[0].grammar).toBeUndefined();
    expect(options[0].prompt).toContain(context.report_text);
    expect(options[0].max_tokens).toBe(config.max_new_tokens);
  });
  it('does not display token-limit cutoffs or reasoning text', async () => {
    for (const value of [
      {...response, choices: [{text, finish_reason: 'length'}]},
      {...response, choices: [{text: text.slice(0, -4), finish_reason: 'stop'}]},
      {...response, choices: [{text: '<think>draft</think>' + text, finish_reason: 'stop'}]},
    ]) expect(await generateGuidance(model(value).instance, context, 40000)).toMatchObject({status: 'error', error_code: 'invalid_output'});
  });
  it('does not spend tokens on blocked, oversized or exhausted requests', async () => {
    const m = model();
    expect((await generateGuidance(m.instance, {...context, blocked_reason: 'PATIENT'}, 40000)).error_code).toBe('not_allowed');
    expect((await generateGuidance(m.instance, {...context, report_text: 'x'.repeat(1601)}, 40000)).error_code).toBe('input_too_long');
    expect((await generateGuidance(m.instance, context, 1000)).error_code).toBe('timeout');
    expect(m.createCompletion).not.toHaveBeenCalled();
  });
  it('aborts inside the remaining shared deadline and discards late output', async () => {
    vi.useFakeTimers();
    const createCompletion = vi.fn(() => new Promise(resolve => setTimeout(() => resolve(response), 5000)));
    const pending = generateGuidance({createCompletion} as unknown as Pick<Wllama, 'createCompletion'>, context, 5000);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({status: 'error', error_code: 'timeout'});
    expect(await pending).not.toHaveProperty('text');
  });
});
