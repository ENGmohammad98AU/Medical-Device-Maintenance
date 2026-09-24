import { describe, expect, it, vi } from 'vitest';
import { chooseGgufToken, formatQwenMessages, type ChoiceModel } from './ggufChoice.js';
function fake(logits = [{token: 99, p: 0.9}, {token: 1, p: 0.03}, {token: 2, p: 0.07}]) {
  return {tokenize: vi.fn(async (s: string) => s === 'prompt' ? [10, 11] : s === 'A' ? [1] : s === 'B' ? [2] : [12, 13]),
    createCompletion: vi.fn(async () => ''), getLogits: vi.fn(async () => logits),
    detokenize: vi.fn(async (ids: number[]) => ids[0] === 2 ? 'B' : 'A')} as unknown as ChoiceModel;
}
describe('constrained GGUF decisions', () => {
  it('selects the highest-scoring allowed token', async () => {
    expect(await chooseGgufToken(fake(), 'prompt', ['A', 'B'], 1024)).toBe('B');
  });
  it('cannot select an absent reference', async () => {
    expect(await chooseGgufToken(fake(), 'prompt', ['A'], 1024)).toBe('A');
  });
  it('rejects oversized input before inference', async () => {
    const model = fake(); await expect(chooseGgufToken(model, 'prompt', ['A'], 1)).rejects.toThrow('input_too_long');
    expect(model.createCompletion).not.toHaveBeenCalled();
  });
  it('fails closed on non-finite allowed scores', async () => {
    await expect(chooseGgufToken(fake([{token: 1, p: NaN}]), 'prompt', ['A'], 1024)).rejects.toThrow('invalid_output');
  });
  it('preserves Arabic and the non-thinking prefix', () => {
    expect(formatQwenMessages([{role: 'user', content: 'عطل البطارية'}], 'Choice:')).toBe(
      '<|im_start|>user\nعطل البطارية<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\nChoice:');
  });
});
