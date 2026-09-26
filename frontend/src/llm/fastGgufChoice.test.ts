import {describe, expect, it, vi} from 'vitest';
import {chooseFastGgufToken, type FastChoiceModel} from './fastGgufChoice.js';
const fake = (text = 'B', tokens = 100) => ({createCompletion: vi.fn(async () => ({
  choices: [{text}], usage: {prompt_tokens: tokens}, timings: {cache_n: 80, prompt_ms: 50},
}))}) as unknown as FastChoiceModel;
describe('runtime v3 constrained selection', () => {
  it('requests prefix reuse for both tasks and constrains their output', async () => {
    const model = fake(); const metrics = vi.fn();
    expect(await chooseFastGgufToken(model, 'classify', ['A', 'B'], 1024, false, undefined, metrics)).toBe('B');
    await chooseFastGgufToken(model, 'support', ['B', 'D'], 1024, true);
    await chooseFastGgufToken(model, 'classify another', ['A', 'B'], 1024);
    const calls = vi.mocked(model.createCompletion).mock.calls.map(([p]) => p);
    expect(calls).toEqual([
      expect.objectContaining({cache_prompt: true, max_tokens: 1, grammar: 'root ::= "A" | "B"', temperature: 0}),
      expect.objectContaining({cache_prompt: true, max_tokens: 2, grammar: 'root ::= "B" | "D" | " B" | " D"'}),
      expect.objectContaining({cache_prompt: true}),
    ]);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({prompt_tokens: 100, cached_tokens: 80}));
  });
  it('accepts a leading space but never an unlisted reference or explanation', async () => {
    expect(await chooseFastGgufToken(fake(' B'), 'p', ['B', 'D'], 1024, true)).toBe('B');
    for (const output of ['C', 'B: repair it', '']) {
      await expect(chooseFastGgufToken(fake(output), 'p', ['B', 'D'], 1024, true)).rejects.toThrow('invalid_output');
    }
  });
  it('never accepts output when the prompt exceeds its budget or usage is missing', async () => {
    await expect(chooseFastGgufToken(fake('B', 1025), 'p', ['B'], 1024)).rejects.toThrow('input_too_long');
    await expect(chooseFastGgufToken(fake('B', NaN), 'p', ['B'], 1024)).rejects.toThrow('invalid_output');
  });
  it('rejects invalid labels before calling the runtime', async () => {
    const model = fake();
    await expect(chooseFastGgufToken(model, 'p', ['B"'], 1024)).rejects.toThrow('invalid_output');
    expect(model.createCompletion).not.toHaveBeenCalled();
  });
});
