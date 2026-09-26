import type {LoadModelParams} from '@wllama/wllama';
export type ComputeBackend = 'wasm' | 'webgpu';
export function selectComputeBackend(forceCpu?: boolean): Promise<ComputeBackend>;
export function runtimeLoadOptions(config: {context_tokens: number; batch_tokens: number}, threads: number, backend: ComputeBackend): LoadModelParams;
