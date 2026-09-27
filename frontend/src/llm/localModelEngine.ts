import { categoryToken, localModelConfig as config, type LocalInput } from './localModelContract';
import { supportMessages, supportToken, supportModelConfig, type SupportContext } from './supportModelContract';
import { chooseFastGgufToken as chooseGgufToken, formatQwenMessages, warmGgufPrefix, type FastChoiceModel as ChoiceModel } from './fastGgufChoice.js';
import { formatQwenUserPrefix } from './ggufChoice.js';
import { warmGuidance } from './guidanceModel';
import { normalizeReportText } from './reportText.js';

export async function classifyLocally(model: ChoiceModel, input: LocalInput) {
  const messages = [{role: 'system', content: config.system_prompt}, ...config.examples,
    {role: 'user', content: normalizeReportText(input.report_text, config.report_spelling)}];
  return categoryToken(await chooseGgufToken(model, formatQwenMessages(messages),
    Object.keys(config.categories), config.max_input_tokens, false, undefined,
    import.meta.env.MODE === 'benchmark' ? metrics => console.warn('CLASSIFICATION_TRACE=' + JSON.stringify(metrics)) : undefined));
}
export async function selectSupportLocally(model: ChoiceModel, context: SupportContext) {
  const labels = context.candidates.length ? [...context.candidates.map(c => c.label), 'D'] : ['D', 'E'];
  return supportToken(await chooseGgufToken(model,
    formatQwenMessages(supportMessages(context), supportModelConfig.answer_prefix),
    labels, supportModelConfig.max_input_tokens, true), context.candidates);
}

// Populate all four stable prefixes before accepting reports. Preparation uses
// no report data, and never evaluates the disposable empty-report suffixes.
export async function warmLocalPrompts(model: ChoiceModel,
  progress: (task: 'classification' | 'reference_selection' | 'scope' | 'generation') => void) {
  progress('classification');
  await warmGgufPrefix(model, formatQwenUserPrefix([{role: 'system', content: config.system_prompt}, ...config.examples]));
  progress('reference_selection');
  await warmGgufPrefix(model, formatQwenUserPrefix([{role: 'system', content: supportModelConfig.system_prompt},
    ...supportModelConfig.examples], 'Device: '));
  progress('scope');
  await warmGgufPrefix(model, formatQwenUserPrefix([{role: 'system', content: supportModelConfig.scope_prompt},
    ...supportModelConfig.scope_examples]));
  progress('generation');
  await warmGuidance(model);
}
