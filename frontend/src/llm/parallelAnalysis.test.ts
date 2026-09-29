import {describe, expect, it, vi} from 'vitest';
import type {Wllama} from '@wllama/wllama';
import {analyzeLocally} from './localModelEngine';
import {supportModelConfig} from './supportModelContract';

const input = {report_text: 'Battery low', device_type: 'VENTILATOR', patient_connected: false,
  support_context: {version: supportModelConfig.version, input_sha256: '0'.repeat(64),
    device_name: 'Hamilton C6', report_text: 'Battery low', candidates: []}};
const completion = (text: string) => ({choices: [{text}], usage: {prompt_tokens: 300}});

describe('independent classification and support', () => {
  it('starts both requests before waiting for either result', async () => {
    const resolve: ((value: unknown) => void)[] = [];
    const createCompletion = vi.fn(() => new Promise(done => resolve.push(done)));
    const work = analyzeLocally({createCompletion} as unknown as Pick<Wllama, 'createCompletion'>, input, true);
    expect(createCompletion).toHaveBeenCalledTimes(2);
    resolve[1](completion('D'));
    resolve[0](completion('A'));
    expect(await work).toMatchObject({output_token: 'A', selection: {status: 'fulfilled', value: 'D'}});
  });
  it('waits for the support request to settle before propagating a classifier failure', async () => {
    let finishSupport: (value: unknown) => void = () => {};
    const createCompletion = vi.fn().mockRejectedValueOnce(new Error('Classification failed'))
      .mockImplementationOnce(() => new Promise(done => {finishSupport = done;}));
    let finished = false;
    const work = analyzeLocally({createCompletion} as unknown as Pick<Wllama, 'createCompletion'>, input, true)
      .catch(error => {finished = true; return error.message;});
    await Promise.resolve(); await Promise.resolve();
    expect(finished).toBe(false);
    finishSupport(completion('D'));
    expect(await work).toBe('Classification failed');
  });
});
