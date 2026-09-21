import { useEffect, useRef, useState } from 'react';
import { LocalModelClient } from '../llm/localModelClient';
import type { LocalInput, LocalProgress } from '../llm/localModelContract';

export function useLocalModel() {
  const client = useRef<LocalModelClient>();
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  useEffect(() => () => client.current?.dispose(), []);
  return {
    progress,
    run: async (input: LocalInput) => {
      client.current ??= new LocalModelClient();
      setProgress({stage: 'loading'});
      const result = await client.current.run(input, setProgress);
      setProgress(null);
      return result;
    },
    cancel: () => client.current?.cancel(),
  };
}
