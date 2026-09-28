import { LocalModelClient } from './localModelClient';
import { localFailure, type LocalInput, type LocalProgress, type LocalResult } from './localModelContract';

// Keep one loaded model across React routes. Release it after ten minutes away
// from model screens, or immediately at logout. No reports are persisted to disk.
export class LocalModelSession {
  private users = 0;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private owner?: symbol;
  private preparation?: Promise<LocalResult>;
  private preparationProgress?: LocalProgress;
  private preparationListeners = new Map<symbol, (value: LocalProgress) => void>();
  constructor(private client = new LocalModelClient()) {}

  private startPreparation() {
    // Preparation contains only static prompts, so navigation can leave it
    // running. Defer startup until the first lease has registered its listener;
    // logout or cancellation before this microtask must prevent startup too.
    const preparation = Promise.resolve().then(() => {
      if (this.preparation !== preparation) return localFailure('cancelled');
      return this.client.prepare(value => {
        if (this.preparation !== preparation) return;
        this.preparationProgress = value;
        for (const listener of this.preparationListeners.values()) listener(value);
      });
    }).finally(() => {
      if (this.preparation === preparation) this.clearPreparation();
    });
    this.preparation = preparation;
    return preparation;
  }

  private clearPreparation() {
    this.preparation = undefined;
    this.preparationProgress = undefined;
    this.preparationListeners.clear();
  }

  acquire() {
    clearTimeout(this.idleTimer);
    this.users++;
    const id = Symbol();
    const client = this.client;
    const session = this;
    let released = false;
    const cancel = () => {
      if (this.owner === id) { this.owner = undefined; this.client.cancel(); }
      else if (this.preparationListeners.has(id)) {
        this.clearPreparation(); this.client.cancel();
      }
    };
    return {
      get isReady() { return !released && client.isReady; },
      get isPreparing() { return !released && Boolean(session.preparation); },
      prepare: async (progress: (value: LocalProgress) => void) => {
        if (released) return localFailure('cancelled');
        if (this.owner) return localFailure('load_failed');
        const preparation = this.preparation ?? this.startPreparation();
        this.preparationListeners.set(id, progress);
        if (this.preparationProgress) progress(this.preparationProgress);
        return preparation;
      },
      run: async (input: LocalInput, progress: (value: LocalProgress) => void, budgetMs?: number) => {
        if (released) return localFailure('cancelled');
        if (this.owner || this.preparation) return localFailure('load_failed');
        this.owner = id;
        try { return await this.client.run(input, progress, budgetMs); }
        finally { if (this.owner === id) this.owner = undefined; }
      },
      cancel,
      release: () => {
        if (released) return;
        released = true;
        // Detach this screen's progress callback without throwing away static
        // prefix work. Report inference still belongs to its requesting screen.
        this.preparationListeners.delete(id);
        cancel();
        if (--this.users === 0) this.idleTimer = setTimeout(() => this.reset(), 10 * 60_000);
      },
    };
  }

  reset() {
    clearTimeout(this.idleTimer);
    this.owner = undefined;
    this.clearPreparation();
    this.client.dispose();
  }
}

export const localModelSession = new LocalModelSession();
