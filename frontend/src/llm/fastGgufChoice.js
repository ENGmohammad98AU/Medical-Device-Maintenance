import {formatQwenMessages} from './ggufChoice.js';
export {formatQwenMessages};

// One model, two independent prompt caches: classification and reference
// selection no longer evict each other's long fixed instructions.
export async function chooseFastGgufToken(model, prompt, labels, maxTokens, allowSpace = false,
  stage = () => {}, onMetrics = () => {}) {
  if (!labels.length || labels.some(label => !/^[A-H]$/.test(label))) throw new Error('invalid_output');
  const alternatives = labels.map(label => JSON.stringify(label));
  if (allowSpace) alternatives.push(...labels.map(label => JSON.stringify(' ' + label)));
  stage('prompt evaluation');
  const response = await model.createCompletion({
    prompt, stream: false, max_tokens: allowSpace ? 2 : 1, temperature: 0,
    repeat_penalty: 1, frequency_penalty: 0, presence_penalty: 0,
    grammar: 'root ::= ' + alternatives.join(' | '),
    seed: 0, cache_prompt: true, id_slot: allowSpace ? 1 : 0,
  });
  // The runtime is loaded with ctx_shift:false. Reject over-budget requests
  // instead of accepting a result from a truncated prompt. v3 exposes the
  // tokenizer count in usage, not as a standalone tokenization API.
  const count = response.usage?.prompt_tokens;
  if (!Number.isInteger(count) || count < 1) throw new Error('invalid_output');
  if (count > maxTokens) throw new Error('input_too_long');
  onMetrics({prompt_tokens: count, cached_tokens: response.timings?.cache_n ?? 0,
    prompt_ms: response.timings?.prompt_ms, predicted_ms: response.timings?.predicted_ms});
  stage('label selection');
  const value = response.choices?.[0]?.text?.trim();
  if (!labels.includes(value)) throw new Error('invalid_output');
  return value;
}
