import {LOCAL_INFERENCE_TIMEOUT_MS} from './localModelContract';

export const ANALYSIS_TIMEOUT_MS = 55_000;
export const ANALYSIS_TIMEOUT_TEXT = 'انتهت مهلة معالجة البلاغ (55 ثانية). لم يكتمل التحليل؛ تحقق من اتصال الخادم أو استخدم التحليل السريع بالمراجع.';

// Bound the complete prepared workflow, including authentication, retrieval and
// final server validation. An aborted write is never automatically retried.
export function createAnalysisBudget(cancelInference: () => void) {
  const controller = new AbortController();
  const deadline = performance.now() + ANALYSIS_TIMEOUT_MS;
  const timer = setTimeout(() => { controller.abort(); cancelInference(); }, ANALYSIS_TIMEOUT_MS);
  const remaining = () => Math.max(0, deadline - performance.now());
  return {
    requestOptions: (capMs = ANALYSIS_TIMEOUT_MS) => {
      if (controller.signal.aborted || remaining() <= 0) throw new Error(ANALYSIS_TIMEOUT_TEXT);
      return {signal: controller.signal, timeout: Math.max(1, Math.ceil(Math.min(capMs, remaining())))};
    },
    // Reserve ten seconds for reference verification and persisting the result.
    inferenceMs: () => Math.max(0, Math.min(LOCAL_INFERENCE_TIMEOUT_MS, remaining() - 10_000)),
    get expired() { return controller.signal.aborted || remaining() <= 0; },
    dispose: () => clearTimeout(timer),
  };
}
