import { categoryToken, localModelConfig as config, type LocalInput } from './localModelContract';
import { supportMessages, supportToken, supportModelConfig, type SupportContext } from './supportModelContract';
import { chooseGgufToken, formatQwenMessages, type ChoiceModel } from './ggufChoice.js';

export async function classifyLocally(model: ChoiceModel, input: LocalInput) {
  const messages = [{role: 'system', content: config.system_prompt}, ...config.examples,
    {role: 'user', content: input.report_text.trim()}];
  return categoryToken(await chooseGgufToken(model, formatQwenMessages(messages),
    Object.keys(config.categories), config.max_input_tokens));
}
export async function selectSupportLocally(model: ChoiceModel, context: SupportContext) {
  const labels = context.candidates.length ? [...context.candidates.map(c => c.label), 'D'] : ['D', 'E'];
  return supportToken(await chooseGgufToken(model,
    formatQwenMessages(supportMessages(context), supportModelConfig.answer_prefix),
    labels, supportModelConfig.max_input_tokens, true), context.candidates);
}
