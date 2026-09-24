import type { Wllama } from '@wllama/wllama';
export type StorageMode = 'persistent' | 'temporary';
export function loadGgufModel(
  model: Pick<Wllama, 'modelManager' | 'loadModel'>,
  url: string,
  options: NonNullable<Parameters<Wllama['loadModel']>[1]> & {progressCallback?: (progress: {loaded: number; total: number}) => void},
  expectedBytes: number,
  onMode?: (mode: StorageMode) => void,
): Promise<StorageMode>;
