import { useEffect, useRef, useState } from 'react';
import { localModelSession } from '../llm/localModelSession';
import { localFailure, type LocalInput, type LocalProgress } from '../llm/localModelContract';

export function useLocalModel() {
  const client = useRef<ReturnType<typeof localModelSession.acquire>>();
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  useEffect(() => {
    client.current = localModelSession.acquire();
    return () => { client.current?.release(); client.current = undefined; };
  }, []);
  return {
    progress,
    run: async (input: LocalInput) => {
      const lease = client.current;
      if (!lease) return localFailure('cancelled');
      setProgress({stage: 'loading'});
      const result = await lease.run(input, (value) => { if (client.current === lease) setProgress(value); });
      if (client.current === lease) setProgress(null);
      return result;
    },
    cancel: () => client.current?.cancel(),
  };
}
