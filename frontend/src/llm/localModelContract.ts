import config from './localModelConfig.json';
import type { GuidanceResult } from './guidanceModel';
import type { SupportContext, SupportResult } from './supportModelContract';

export { config as localModelConfig };
// One budget for all inference tasks. Preparation has its own visible phase.
export const LOCAL_INFERENCE_TIMEOUT_MS = 45_000;
export const LOCAL_PREPARATION_TIMEOUT_MS = 15 * 60_000;
export type CategoryToken = keyof typeof config.categories;
export interface LocalInput { report_text: string; device_type: string; patient_connected: boolean; support_context?: SupportContext; selection_only?: boolean }
export type LocalError = 'cancelled' | 'timeout' | 'unsupported_browser' | 'insufficient_storage' | 'load_failed' | 'input_too_long' | 'invalid_output';
export interface LocalResult {
  status: 'success' | 'error' | 'disabled';
  revision: string;
  prompt_version?: string;
  output_token?: CategoryToken;
  selection_only?: boolean;
  input_sha256?: string;
  latency_ms: number;
  preparation_ms?: number;
  preparation_version?: string;
  preparation_threads?: number;
  preparation_source?: 'stored' | 'bundled' | 'computed';
  preparation_cached?: boolean;
  inference_ms?: number;
  error_code?: LocalError;
  support?: SupportResult;
  guidance?: GuidanceResult;
  reused_result?: boolean;
  runtime?: 'wllama-3.6.1/wasm' | 'wllama-3.6.1/webgpu';
}
export interface LocalProgress {
  stage: 'loading' | 'initializing' | 'restoring' | 'warming' | 'saving' | 'running'; percent?: number;
  task?: 'classification' | 'reference_selection' | 'scope' | 'generation' | 'analysis';
  storage_mode?: 'persistent' | 'temporary'; compute_backend?: 'wasm' | 'webgpu'; backend_ready?: boolean;
  preparation_source?: 'stored' | 'bundled' | 'computed';
  preparation_fallback?: 'unavailable' | 'slow_network' | 'incompatible';
  cpu_fallback?: boolean; cpu_fallback_reason?: 'initialization_failed' | 'inference_failed';
  stage_started_at?: number; operation_started_at?: number;
}

// The server uses the same ordering. This detects stale input, not tampering.
export function serializeInput(input: LocalInput): string {
  return JSON.stringify({report_text: input.report_text.trim(), device_type: input.device_type, patient_connected: input.patient_connected});
}
export async function inputHash(input: LocalInput): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serializeInput(input)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function categoryToken(value: string): CategoryToken {
  if (!Object.prototype.hasOwnProperty.call(config.categories, value)) throw new Error('invalid_output');
  return value as CategoryToken;
}
export function localFailure(error_code: LocalError): LocalResult {
  return {status: 'error', revision: config.revision, latency_ms: 0, error_code};
}
export const localErrorText: Record<LocalError, string> = {
  cancelled: 'Local model execution was cancelled.',
  timeout: 'The shared 45-second inference budget expired. You can continue with reference analysis or retry the local model.',
  unsupported_browser: 'This model needs HTTPS and a recent browser supporting WebAssembly Memory64. Try a current version of Chrome or Edge.',
  insufficient_storage: 'Browser storage is insufficient. Use a regular browser window, free space for the approximately 1.1 GB model, and retry.',
  load_failed: 'The model could not load or run. Check the connection and available memory, then retry.',
  input_too_long: 'The report and context exceed local model capacity. Shorten the report or continue with rules; input was not silently truncated.',
  invalid_output: 'The model did not return a valid result for this step.',
};
export const categoryLabels: Record<string, string> = {
  POWER: 'Power and battery', SENSOR: 'Sensors and measurement', CIRCUIT: 'Electrical circuits',
  MECHANICAL: 'Mechanical parts and leaks', SOFTWARE: 'Software and display',
  ALARM: 'Alarms', OTHER: 'Other technical fault', UNKNOWN: 'Unclear or not a fault report',
};
