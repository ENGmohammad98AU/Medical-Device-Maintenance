import config from './localModelConfig.json';
import type { SupportContext, SupportResult } from './supportModelContract';

export { config as localModelConfig };
export type CategoryToken = keyof typeof config.categories;
export interface LocalInput { report_text: string; device_type: string; patient_connected: boolean; support_context?: SupportContext }
export type LocalError = 'cancelled' | 'timeout' | 'unsupported_browser' | 'insufficient_storage' | 'load_failed' | 'input_too_long' | 'invalid_output';
export interface LocalResult {
  status: 'success' | 'error' | 'disabled';
  revision: string;
  output_token?: CategoryToken;
  input_sha256?: string;
  latency_ms: number;
  error_code?: LocalError;
  support?: SupportResult;
}
export interface LocalProgress { stage: 'loading' | 'running'; percent?: number; task?: 'classification' | 'reference_selection' }

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
  cancelled: 'أُلغي تشغيل النموذج المحلي.',
  timeout: 'استغرق تشغيل النموذج وقتًا طويلًا. جرّب جهازًا أسرع أو تابع بالقواعد.',
  unsupported_browser: 'يحتاج هذا النموذج إلى متصفح حديث يدعم WebAssembly Memory64 واتصال HTTPS. جرّب إصدارًا حديثًا من Chrome أو Edge.',
  insufficient_storage: 'مساحة تخزين المتصفح غير كافية للنموذج. افتح الموقع في نافذة عادية بدل التصفح الخاص، ووفّر مساحة لتنزيل نحو 1.1 غيغابايت، ثم أعد المحاولة.',
  load_failed: 'تعذر تحميل النموذج أو تشغيله. تحقق من الاتصال والذاكرة المتاحة ثم أعد المحاولة.',
  input_too_long: 'الوصف والسياق أكبر من سعة النموذج المحلي. اختصر الوصف أو تابع بالقواعد؛ لم يُحذف جزء منه للتحليل.',
  invalid_output: 'لم يُرجع النموذج اختيارًا صالحًا لهذه الخطوة.',
};
export const categoryLabels: Record<string, string> = {
  POWER: 'الطاقة والبطارية', SENSOR: 'الحساسات والقياس', CIRCUIT: 'الدارات الكهربائية',
  MECHANICAL: 'الأجزاء الميكانيكية والتسريب', SOFTWARE: 'البرمجيات والعرض',
  ALARM: 'الإنذارات', OTHER: 'عطل فني آخر', UNKNOWN: 'وصف غير واضح أو ليس بلاغ عطل',
};
