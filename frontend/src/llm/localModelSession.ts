import { LocalModelClient } from './localModelClient';
import { localFailure, type LocalInput, type LocalProgress } from './localModelContract';

// Keep one loaded model across React routes. Release it after ten minutes away
// from model screens, or immediately at logout. No reports are persisted to disk.
export class LocalModelSession {
  private users = 0;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private owner?: symbol;
  constructor(private client = new LocalModelClient()) {}

  acquire() {
    clearTimeout(this.idleTimer);
    this.users++;
    const id = Symbol();
    let released = false;
    const cancel = () => {
      if (this.owner === id) { this.owner = undefined; this.client.cancel(); }
    };
    return {
      run: async (input: LocalInput, progress: (value: LocalProgress) => void) => {
        if (released) return localFailure('cancelled');
        if (this.owner) return localFailure('load_failed');
        this.owner = id;
        try { return await this.client.run(input, progress); }
        finally { if (this.owner === id) this.owner = undefined; }
      },
      cancel,
      release: () => {
        if (released) return;
        released = true;
        cancel();
        if (--this.users === 0) this.idleTimer = setTimeout(() => this.reset(), 10 * 60_000);
      },
    };
  }

  reset() {
    clearTimeout(this.idleTimer);
    this.owner = undefined;
    this.client.dispose();
  }
}

export const localModelSession = new LocalModelSession();
