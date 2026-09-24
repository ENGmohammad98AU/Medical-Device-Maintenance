// Fixed Qwen3 non-thinking text chat template matching the v2 experiment.
export function formatQwenMessages(messages, prefix = '') {
  return messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('')
    + '<|im_start|>assistant\n<think>\n\n</think>\n\n' + prefix;
}
export async function chooseGgufToken(model, prompt, labels, maxTokens, allowSpace = false, stage = () => {}) {
  stage('tokenization');
  const tokens = await model.tokenize(prompt, true);
  if (tokens.length > maxTokens) throw new Error('input_too_long');
  const allowed = new Set();
  for (const label of labels) {
    const ids = await model.tokenize(label, false);
    if (ids.length !== 1) throw new Error('invalid_output');
    allowed.add(ids[0]);
    if (allowSpace) {
      const spaced = await model.tokenize(' ' + label, false);
      if (spaced.length === 1) allowed.add(spaced[0]);
    }
  }
  // Evaluate the prompt only. Wllama removes a differing suffix on cache reuse.
  stage('prompt evaluation');
  await model.createCompletion(prompt, {nPredict: 0, useCache: true, sampling: {temp: 0, penalty_repeat: 1}});
  stage('label selection');
  const choices = (await model.getLogits(-1)).filter(x => allowed.has(x.token) && Number.isFinite(x.p) && x.p > 0);
  choices.sort((a, b) => b.p - a.p);
  if (!choices.length) throw new Error('invalid_output');
  const value = (await model.detokenize([choices[0].token], true)).trim();
  if (!labels.includes(value)) throw new Error('invalid_output');
  return value;
}
