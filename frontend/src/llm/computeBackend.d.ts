import type {LoadModelParams} from '@wllama/wllama';
export type ComputeBackend = 'wasm' | 'webgpu';
export function selectComputeBackend(forceCpu?: boolean, onReason?: (reason: string) => void): Promise<ComputeBackend>;
export function runtimeLoadOptions(config: {context_tokens: number; batch_tokens: number; parallel_slots?: number}, threads: number, backend: ComputeBackend): LoadModelParams;
