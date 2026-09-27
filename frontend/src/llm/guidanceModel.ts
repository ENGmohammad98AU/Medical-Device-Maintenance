import type { Wllama } from '@wllama/wllama';
import config from './guidanceModelConfig.json';
import { formatQwenMessages, warmGgufPrefix } from './fastGgufChoice.js';
import { formatQwenUserPrefix } from './ggufChoice.js';

export { config as guidanceModelConfig };
export interface GuidanceReference {
  reference_id: string; symptom: string; evidence: string;
}
export interface GuidanceContext {
  version: string; input_sha256: string; device_name: string; report_text: string;
  references?: GuidanceReference[];
  blocked_reason?: string;
}
export interface GuidanceResult {
  status: 'success' | 'error'; version: string; input_sha256: string; latency_ms: number;
  text?: string; finish_reason?: 'stop'; prompt_tokens?: number; completion_tokens?: number;
  reference_id?: string | null;
  error_code?: 'timeout' | 'input_too_long' | 'invalid_output' | 'load_failed' | 'not_allowed' | 'out_of_scope';
}
type Model = Pick<Wllama, 'createCompletion'>;
const ENGLISH_INSTRUCTION = 'Answer in English only, in fewer than 65 words. '
  + 'Give only external checks; never recommend repair or replacement of parts, even if the reference mentions them.\n';

function prompt(context: GuidanceContext, referenceId?: string | null) {
  if (context.version !== config.version) throw new Error('invalid_output');
  // Bound prefill work without silently truncating the report.
  if (context.report_text.length > 1600 || context.device_name.length > 400) throw new Error('input_too_long');
  const reference = context.references?.find(item => item.reference_id === referenceId);
  if (referenceId && !reference) throw new Error('invalid_output');
  if (reference && reference.evidence.length > 6000) throw new Error('input_too_long');
  // Shorten field labels only; retain every sentence of manufacturer evidence.
  // Put the shared language instruction before report data so preparation can
  // cache it instead of evaluating it again on each slower CPU request.
  const evidence = reference?.evidence.replace(/^(possible_causes|immediate_safety_action|recommended_solution|verification_before_return_to_service):/gm,
    field => ({'possible_causes:': 'Causes:', 'immediate_safety_action:': 'Safety:',
      'recommended_solution:': 'Solution:', 'verification_before_return_to_service:': 'Verification:'}[field]!));
  return formatQwenMessages([{role: 'system', content: config.system_prompt},
    {role: 'user', content: ENGLISH_INSTRUCTION
      + JSON.stringify({device: context.device_name, report: context.report_text,
      reference: reference ? {symptom: reference.symptom, evidence} : null})
      + (reference ? '\nNo replacement advice.'
        : '\nNo manufacturer reference matched. State that the cause is unconfirmed. Suggest one external visual check of the part named in the report. Do not invent components, observations or causes. You have not inspected this device. Do not request alarm details when no alarm is reported.')
      }]);
}

// Restrict the output script only. Sentence structure, wording and number of
// paragraphs are generated, with no answer catalogue or fixed inspection verbs.
const ENGLISH_TEXT_GRAMMAR = 'root ::= [A-Za-z] [\\u0020-\\u007E\\n]*\n';

export function completeGuidance(text: string): string {
  const value = text.trim().split('\n').map(line => line.trim()).join('\n');
  // A cut-off sentence or a leaked reasoning/template token is not a draft.
  if (/(?:اسأل|اسال|استشر|اطلب من).{0,12}(?:المريض|مريض)|\b(?:ask|consult|question)\b.{0,15}\bpatient\b/iu.test(value)) throw new Error('invalid_output');
  if (/\b(?:check|assess|monitor|evaluate|observe|examine)\b.{0,45}\b(?:patient|breathing pattern|respiratory distress)\b/iu.test(value)) throw new Error('invalid_output');
  if (value.length < 20 || value.length > 1200 || /[<>`]|https?:\/\//i.test(value)
    || /[^\x20-\x7e\n]/u.test(value) || !/[A-Za-z]{3}/.test(value)
    || !/[.!?]$/.test(value)) throw new Error('invalid_output');
  return value;
}

export async function warmGuidance(model: Model) {
  await warmGgufPrefix(model, formatQwenUserPrefix([{role: 'system', content: config.system_prompt}],
    ENGLISH_INSTRUCTION + '{"device":"'));
}

export async function generateGuidance(model: Model, context: GuidanceContext, budgetMs: number,
  referenceId?: string | null): Promise<GuidanceResult> {
  const started = performance.now();
  const base = {version: context.version, input_sha256: context.input_sha256};
  const controller = new AbortController();
  // Leave time for the worker to return a failure before the hard client limit.
  const timer = setTimeout(() => controller.abort(), Math.max(0, budgetMs - 1500));
  try {
    if (context.blocked_reason) return {...base, status: 'error', error_code: 'not_allowed', latency_ms: 0};
    if (budgetMs < 2500) throw new Error('timeout');
    const options = {prompt: prompt(context, referenceId), stream: false as const,
      max_tokens: config.max_new_tokens, temperature: 0.2, top_p: 0.8, top_k: 20,
      repeat_penalty: 1.05, seed: 0, cache_prompt: true, grammar: ENGLISH_TEXT_GRAMMAR, abortSignal: controller.signal};
    const response = await model.createCompletion(options);
    // Compiled out of production. CI uses only the synthetic guidanceCases
    // reports, so formatting failures can be diagnosed without patient logs.
    if (import.meta.env.MODE === 'benchmark') console.warn('GENERATION_TRACE=' + JSON.stringify(response));
    if (controller.signal.aborted) throw new Error('timeout');
    if (!Number.isInteger(response.usage?.completion_tokens) || response.usage.completion_tokens < 1
      || response.usage.completion_tokens > config.max_new_tokens) throw new Error('invalid_output');
    if (response.usage.prompt_tokens > config.max_input_tokens) throw new Error('input_too_long');
    if (response.choices[0]?.finish_reason !== 'stop') throw new Error('invalid_output');
    const text = completeGuidance(response.choices[0].text);
    if (!referenceId && !/\b(?:unconfirmed|uncertain|unknown|cannot confirm|not confirmed|not established|insufficient|no matching|no reference)\b/i.test(text)) {
      throw new Error('invalid_output');
    }
    return {...base, status: 'success', text, reference_id: referenceId || null, finish_reason: 'stop',
      prompt_tokens: response.usage.prompt_tokens, completion_tokens: response.usage.completion_tokens,
      latency_ms: Math.round(performance.now() - started)};
  } catch (error) {
    const message = controller.signal.aborted ? 'timeout' : error instanceof Error ? error.message : '';
    return {...base, status: 'error', error_code: message === 'timeout' || message === 'input_too_long' || message === 'invalid_output'
      ? message : 'load_failed', latency_ms: Math.round(performance.now() - started)};
  } finally { clearTimeout(timer); }
}
