import { LogitsProcessor, LogitsProcessorList, Tensor, type TextGenerationPipeline } from '@huggingface/transformers';
import { categoryToken, localModelConfig as config, type LocalInput } from './localModelContract';
import { supportMessages, supportToken, supportModelConfig, type SupportContext } from './supportModelContract';

// Both tasks choose one constrained token. Repair text remains server-owned.
export class CategoryLogitsProcessor extends LogitsProcessor {
  private readonly allowed: Set<number>;
  constructor(ids: number[]) { super(); this.allowed = new Set(ids); }
  _call(_inputIds: bigint[][], logits: Tensor): Tensor {
    const data = logits.data as Float32Array;
    const width = logits.dims[logits.dims.length - 1];
    if (![...this.allowed].some((id) => Number.isFinite(Number(data[id])))) throw new Error('invalid_output');
    for (let i = 0; i < data.length; i++) if (!this.allowed.has(i % width)) data[i] = -Infinity;
    return logits;
  }
}
export async function classifyLocally(generator: TextGenerationPipeline, input: LocalInput) {
  const messages = [{role: 'system', content: config.system_prompt}, ...config.examples, {role: 'user', content: input.report_text.trim()}];
  return categoryToken(await chooseToken(generator, messages, Object.keys(config.categories), config.max_input_tokens));
}

export async function selectSupportLocally(generator: TextGenerationPipeline, context: SupportContext) {
  const labels = context.candidates.length ? [...context.candidates.map((c) => c.label), 'D'] : ['D', 'E'];
  return supportToken((await chooseToken(generator, supportMessages(context), labels,
    supportModelConfig.max_input_tokens, supportModelConfig.answer_prefix)).trim(), context.candidates);
}

async function chooseToken(generator: TextGenerationPipeline, messages: {role: string; content: string}[], labels: string[], maxTokens: number, prefix = '') {
  const options = {add_generation_prompt: true, return_dict: true, enable_thinking: false};
  // A fixed assistant prefix cues a choice value, rather than unconstrained prose.
  // Only the following choice token is generated; this is not JSON generation.
  const encoded = (prefix ? generator.tokenizer((generator.tokenizer.apply_chat_template(messages,
    {...options, tokenize: false}) as string) + prefix) : generator.tokenizer.apply_chat_template(messages, options)
  ) as {input_ids: Tensor; attention_mask: Tensor};
  const length = encoded.input_ids.dims[1];
  if (length > maxTokens) throw new Error('input_too_long');
  const ids = labels.flatMap((label) => {
    const tokens = generator.tokenizer.encode(label, {add_special_tokens: false});
    if (tokens.length !== 1) throw new Error('invalid_output');
    const spaced = prefix ? generator.tokenizer.encode(` ${label}`, {add_special_tokens: false}) : [];
    return [...tokens, ...(spaced.length === 1 ? spaced : [])];
  });
  const processors = new LogitsProcessorList();
  processors.push(new CategoryLogitsProcessor(ids));
  const generation = {...encoded, max_new_tokens: config.max_new_tokens, do_sample: false, logits_processor: processors};
  const output = await generator.model.generate(generation);
  if (!(output instanceof Tensor)) throw new Error('invalid_output');
  return generator.tokenizer.decode(output.slice(null, length, null), {skip_special_tokens: true});
}
