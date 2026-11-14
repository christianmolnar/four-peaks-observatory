import { loadCatalog } from '../catalog/loader';
import type { PlanTarget } from '../plan';
import type { RankResult } from '../plan/rank';
import { isSuperseded, rankChunked, SupersededError } from './chunked';
import { createWorkerHandler } from './handler';
import type { TonightQuery, WorkerRequest, WorkerResponse } from './handler';

export { isSuperseded, SupersededError };
export type { TonightQuery };

/** The part of a Worker the ranker uses, so a test can stand in for one. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: { data: WorkerResponse }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

export interface TonightOptions {
  /** Makes the worker; defaults to the bundled `worker.ts`. Return null for "no worker": the call runs on this thread. */
  createWorker?: () => WorkerLike | null | Promise<WorkerLike | null>;
  /** The catalog for the main-thread path; defaults to the app-wide lazy loader. The worker always uses its own. */
  loadTargets?: () => Promise<readonly PlanTarget[]>;
  /** Chunking of the main-thread path. */
  chunkSize?: number;
  yieldNow?: () => Promise<void>;
}

async function defaultWorker(): Promise<WorkerLike | null> {
  if (typeof Worker === 'undefined') return null;
  return (await import('./spawn')).spawnTonightWorker() as unknown as WorkerLike;
}

/**
 * Tonight's best targets over the whole catalog, off the main thread. Uses a Web Worker where there is one and
 * otherwise (jest, old browsers) runs the same ranking here in chunks with an `await` between them.
 *
 * A newer call supersedes an older one still running: the older promise rejects with a `SupersededError`
 * (test with `isSuperseded`), and its work stops at the next chunk. Any other rejection is a real failure.
 */
export function createTonightRanker(options: TonightOptions = {}): (query: TonightQuery) => Promise<RankResult> {
  let seq = 0;
  let worker: Promise<WorkerLike | null> | null = null;
  const waiting = new Map<number, { resolve: (r: RankResult) => void; reject: (e: unknown) => void }>();

  const failAll = (error: Error): void => {
    for (const w of waiting.values()) w.reject(error);
    waiting.clear();
  };

  const start = (): Promise<WorkerLike | null> => {
    const make = options.createWorker ?? defaultWorker;
    return Promise.resolve()
      .then(make)
      .then((w) => {
        if (w === null) return null;
        w.onmessage = ({ data }) => {
          const w2 = waiting.get(data.id);
          if (w2 === undefined) return; // answered, or superseded already
          waiting.delete(data.id);
          if (data.kind === 'result') w2.resolve(data.result);
          else if (data.kind === 'superseded') w2.reject(new SupersededError());
          else w2.reject(new Error(`Tonight worker failed: ${data.message}`));
        };
        w.onerror = (e) => {
          worker = null; // the next call starts a fresh worker
          w.terminate(); // an error event does not stop a worker, and it holds its own copy of the catalog
          failAll(new Error(`Tonight worker crashed: ${e.message ?? 'unknown error'}`));
        };
        return w;
      })
      .catch((e: unknown) => {
        // The worker could not be made at all (blocked, unsupported): this thread does the work, and says so once.
        console.warn('Tonight worker unavailable, ranking on the main thread:', e);
        return null;
      });
  };

  return async (query) => {
    const id = ++seq;
    for (const [oldId, w] of waiting) {
      w.reject(new SupersededError());
      waiting.delete(oldId);
    }
    worker ??= start();
    const w = await worker;
    if (id !== seq) throw new SupersededError();
    if (w !== null) {
      return new Promise<RankResult>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        w.postMessage({ id, query });
      });
    }
    const loadTargets = options.loadTargets ?? (async () => (await loadCatalog()).targets);
    const targets = await loadTargets();
    return rankChunked({ ...query, targets }, { isCurrent: () => id === seq, chunkSize: options.chunkSize, yieldNow: options.yieldNow });
  };
}

/** The app-wide ranker. */
export const rankTonightAsync = createTonightRanker();

// The worker-side handler is exported for tests and for anything that wants to host it elsewhere.
export { createWorkerHandler };
