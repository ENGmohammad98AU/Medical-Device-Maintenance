import config from './supportModelConfig.json';
import type { LocalError } from './localModelContract';

export { config as supportModelConfig };
export type SupportToken = 'A' | 'B' | 'C' | 'D' | 'E';
export interface SupportCandidate { label: 'A' | 'B' | 'C'; reference_id: string; symptom: string }
export interface SupportContext {
  version: string; input_sha256: string; report_text: string; device_name: string;
  candidates: SupportCandidate[];
}
export interface SupportResult {
  status: 'success' | 'error'; version: string; input_sha256: string;
  output_token?: SupportToken; latency_ms: number; error_code?: LocalError;
}
export function supportToken(value: string, candidates: SupportCandidate[]): SupportToken {
  if (!['D', 'E', ...candidates.map((c) => c.label)].includes(value)) throw new Error('invalid_output');
  return value as SupportToken;
}
export function supportMessages(context: SupportContext) {
  if (context.version !== config.version || context.candidates.length > 3
    || context.candidates.some((c, i) => c.label !== ['A', 'B', 'C'][i])) throw new Error('invalid_output');
  if (!context.candidates.length) return [{role: 'system', content: config.scope_prompt}, ...config.scope_examples,
    {role: 'user', content: context.report_text}];
  const references = context.candidates.map((c) => `${c.label}: ${c.symptom}`).join('\n');
  return [{role: 'system', content: config.system_prompt}, ...config.examples,
    {role: 'user', content: `Device: ${context.device_name}\nRequest: ${context.report_text}\nReferences:\n${references}`}];
}
