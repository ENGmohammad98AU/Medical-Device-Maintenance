import type { Wllama } from 'wllama-v2';
export type ChoiceModel = Pick<Wllama, 'tokenize' | 'createCompletion' | 'getLogits' | 'detokenize'>;
export function formatQwenMessages(messages: {role: string; content: string}[], prefix?: string): string;
export function chooseGgufToken(model: ChoiceModel, prompt: string, labels: string[], maxTokens: number, allowSpace?: boolean, stage?: (stage: string) => void): Promise<string>;
