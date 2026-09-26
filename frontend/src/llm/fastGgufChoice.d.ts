import type { Wllama } from '@wllama/wllama';
export type FastChoiceModel = Pick<Wllama, 'createCompletion'>;
export {formatQwenMessages} from './ggufChoice.js';
export interface InferenceMetrics {prompt_tokens: number; cached_tokens: number; prompt_ms?: number; predicted_ms?: number}
export function chooseFastGgufToken(model: FastChoiceModel, prompt: string, labels: string[], maxTokens: number,
  allowSpace?: boolean, stage?: (stage: string) => void, onMetrics?: (metrics: InferenceMetrics) => void): Promise<string>;
