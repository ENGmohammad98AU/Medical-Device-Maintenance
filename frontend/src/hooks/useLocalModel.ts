import { useEffect, useRef, useState } from 'react';
import { localModelSession } from '../llm/localModelSession';
import { localFailure, type LocalInput, type LocalProgress, type LocalResult } from '../llm/localModelContract';

export function useLocalModel() {
  const client = useRef<ReturnType<typeof localModelSession.acquire>>();
  const [progress, setProgress] = useState<LocalProgress | null>(null);
  const [ready, setReady] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparation, setPreparation] = useState<LocalResult | null>(null);
  const prepare = async (lease = client.current) => {
    if (!lease) return localFailure('cancelled');
    setPreparing(true); setPreparation(null); setProgress({stage: 'loading'});
    const result = await lease.prepare(value => { if (client.current === lease) setProgress(value); });
    if (client.current === lease) {
      setProgress(null); setPreparing(false); setPreparation(result); setReady(lease.isReady);
    }
    return result;
  };
  useEffect(() => {
    client.current = localModelSession.acquire();
    setReady(client.current.isReady);
    // A different route may already be preparing this session's model. Join
    // that work and show its current phase instead of starting another worker.
    if (client.current.isPreparing) void prepare(client.current);
    return () => { client.current?.release(); client.current = undefined; };
  }, []);
  return {
    progress, ready, preparing, preparation,
    prepare: () => prepare(),
    run: async (input: LocalInput, budgetMs?: number) => {
      const lease = client.current;
      if (!lease) return localFailure('cancelled');
      setProgress({stage: 'loading'});
      const result = await lease.run(input, (value) => { if (client.current === lease) setProgress(value); }, budgetMs);
      if (client.current === lease) { setProgress(null); setReady(lease.isReady); }
      return result;
    },
    cancel: () => client.current?.cancel(),
  };
}
