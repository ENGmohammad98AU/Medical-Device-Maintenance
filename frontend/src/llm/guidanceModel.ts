import type { Wllama } from '@wllama/wllama';
import config from './guidanceModelConfig.json';
import { formatQwenMessages } from './fastGgufChoice.js';

export { config as guidanceModelConfig };
export interface GuidanceContext {
  version: string; input_sha256: string; device_name: string; report_text: string;
  blocked_reason?: string;
}
export interface GuidanceResult {
  status: 'success' | 'error'; version: string; input_sha256: string; latency_ms: number;
  text?: string; finish_reason?: 'stop'; prompt_tokens?: number; completion_tokens?: number;
  error_code?: 'timeout' | 'input_too_long' | 'invalid_output' | 'load_failed' | 'not_allowed' | 'out_of_scope';
}
type Model = Pick<Wllama, 'createCompletion'>;

function prompt(context: GuidanceContext) {
  if (context.version !== config.version) throw new Error('invalid_output');
  // Bound prefill work without silently truncating the report.
  if (context.report_text.length > 1600 || context.device_name.length > 400) throw new Error('input_too_long');
  return formatQwenMessages([{role: 'system', content: config.system_prompt},
    {role: 'user', content: JSON.stringify({device: context.device_name, report: context.report_text})
      + (/[\u0600-\u06ff]/u.test(context.report_text) ? '\nبالعربية للفني: أمرَا فحص قصيران فقط، دون أسئلة.' : '\nWrite the two steps in English for this fault.')}]);
}

export function completeGuidance(text: string): string {
  const value = text.trim().split('\n').map(line => line.trim()).join('\n');
  // A cut-off sentence or a leaked reasoning/template token is not a draft.
  if (/(?:اسأل|اسال|استشر|اطلب من).{0,12}(?:المريض|مريض)|\b(?:ask|consult|question)\b.{0,15}\bpatient\b/iu.test(value)) throw new Error('invalid_output');
  if (value.length < 20 || value.length > 800 || /[<>]|https?:\/\//i.test(value)
    || !/^1[.)] [^\n]+[.؟!?]\n+2[.)] [^\n]+[.؟!?]$/u.test(value)) throw new Error('invalid_output');
  return value;
}

export async function warmGuidance(model: Model) {
  const options = {prompt: prompt({version: config.version, input_sha256: '', device_name: '', report_text: ''}),
    stream: false as const, max_tokens: 1, temperature: 0, cache_prompt: true, seed: 0};
  await model.createCompletion(options);
}

export async function generateGuidance(model: Model, context: GuidanceContext, budgetMs: number): Promise<GuidanceResult> {
  const started = performance.now();
  const base = {version: context.version, input_sha256: context.input_sha256};
  const controller = new AbortController();
  // Leave time for the worker to return a failure before the hard client limit.
  const timer = setTimeout(() => controller.abort(), Math.max(0, budgetMs - 1500));
  try {
    if (context.blocked_reason) return {...base, status: 'error', error_code: 'not_allowed', latency_ms: 0};
    if (budgetMs < 2500) throw new Error('timeout');
    const options = {prompt: prompt(context), stream: false as const,
      max_tokens: config.max_new_tokens, temperature: 0.2, top_p: 0.8, top_k: 20,
      repeat_penalty: 1.05, seed: 0, cache_prompt: true, abortSignal: controller.signal};
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
    if (/[\u0600-\u06ff]/u.test(context.report_text) && !/[\u0600-\u06ff]/u.test(text)) throw new Error('invalid_output');
    return {...base, status: 'success', text, finish_reason: 'stop',
      prompt_tokens: response.usage.prompt_tokens, completion_tokens: response.usage.completion_tokens,
      latency_ms: Math.round(performance.now() - started)};
  } catch (error) {
    const message = controller.signal.aborted ? 'timeout' : error instanceof Error ? error.message : '';
    return {...base, status: 'error', error_code: message === 'timeout' || message === 'input_too_long' || message === 'invalid_output'
      ? message : 'load_failed', latency_ms: Math.round(performance.now() - started)};
  } finally { clearTimeout(timer); }
}
