import config from './localModelConfig.json';
import type { GuidanceResult } from './guidanceModel';
import type { SupportContext, SupportResult } from './supportModelContract';

export { config as localModelConfig };
// One budget for all inference tasks. Preparation has its own visible phase.
export const LOCAL_INFERENCE_TIMEOUT_MS = 45_000;
export const LOCAL_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;
export const LOCAL_PREPARATION_TIMEOUT_MS = 120_000;
export type CategoryToken = keyof typeof config.categories;
export interface LocalInput { report_text: string; device_type: string; patient_connected: boolean; support_context?: SupportContext }
export type LocalError = 'cancelled' | 'timeout' | 'unsupported_browser' | 'insufficient_storage' | 'load_failed' | 'input_too_long' | 'invalid_output';
export interface LocalResult {
  status: 'success' | 'error' | 'disabled';
  revision: string;
  prompt_version?: string;
  output_token?: CategoryToken;
  input_sha256?: string;
  latency_ms: number;
  preparation_ms?: number;
  preparation_version?: string;
  preparation_threads?: number;
  inference_ms?: number;
  error_code?: LocalError;
  support?: SupportResult;
  guidance?: GuidanceResult;
  reused_result?: boolean;
  runtime?: 'wllama-3.6.1/wasm' | 'wllama-3.6.1/webgpu';
  timeout_phase?: 'download' | 'preparation' | 'inference';
  compute_diagnostic?: string;
}
export interface LocalProgress { stage: 'loading' | 'initializing' | 'warming' | 'running'; percent?: number; task?: 'classification' | 'reference_selection' | 'scope' | 'generation'; storage_mode?: 'persistent' | 'temporary'; compute_backend?: 'wasm' | 'webgpu'; cpu_fallback?: boolean; started_at?: number; deadline_at?: number; budget_phase?: 'download' | 'preparation' | 'inference' }

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
// Keep device diagnostics in the browser. The API deliberately forbids fields
// outside its result schema; preparation-only metadata is not a fault result.
export function serverModelResult({compute_diagnostic: _diagnostic, timeout_phase: _phase,
  preparation_version: _version, preparation_threads: _threads, ...result}: LocalResult) {
  return result;
}
export function localResultError(result: LocalResult): string {
  if (result.error_code === 'timeout' && result.timeout_phase === 'preparation') {
    return 'Model initialization and preparation exceeded 120 seconds on this device. The running model was stopped; cached model files were not deleted. You can continue with reference analysis.';
  }
  if (result.error_code === 'timeout' && result.timeout_phase === 'download') {
    return 'Model download or browser file access did not finish within 15 minutes. Check the connection and available browser storage.';
  }
  return localErrorText[result.error_code || 'load_failed'];
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
