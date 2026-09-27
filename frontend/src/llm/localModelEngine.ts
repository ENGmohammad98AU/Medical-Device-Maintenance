import { categoryToken, localModelConfig as config, type LocalInput } from './localModelContract';
import { supportMessages, supportToken, supportModelConfig, type SupportContext } from './supportModelContract';
import { chooseFastGgufToken as chooseGgufToken, formatQwenMessages, type FastChoiceModel as ChoiceModel } from './fastGgufChoice.js';
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

// Populate all four stable prompt prefixes before accepting reports. These
// synthetic, empty inputs never become report results or enter the result cache.
export async function warmLocalPrompts(model: ChoiceModel,
  progress: (task: 'classification' | 'reference_selection' | 'scope' | 'generation') => void) {
  progress('classification');
  await classifyLocally(model, {report_text: '', device_type: '', patient_connected: false});
  const context: SupportContext = {version: supportModelConfig.version, input_sha256: '',
    report_text: '', device_name: '', candidates: [{label: 'A', reference_id: '', symptom: ''}]};
  progress('reference_selection');
  await selectSupportLocally(model, context);
  progress('scope');
  await selectSupportLocally(model, {...context, candidates: []});
  progress('generation');
  await warmGuidance(model);
}
