import type { RankInput, RankResult } from '../plan/rank';
import type { PlanTarget } from '../plan';
import { isSuperseded, rankChunked } from './chunked';
import type { ChunkedOptions } from './chunked';

/** What a caller asks for: everything `rankTargets` takes except the targets, which come from the catalog. */
export type TonightQuery = Omit<RankInput, 'targets'>;

export interface WorkerRequest {
  id: number;
  query: TonightQuery;
}

export type WorkerResponse =
  | { id: number; kind: 'result'; result: RankResult }
  | { id: number; kind: 'superseded' }
  | { id: number; kind: 'error'; message: string };

/**
 * The worker's side, apart from the worker globals so it can be tested: a request arrives, the catalog is loaded
 * (once, by the loader the worker is given), the ranking runs in chunks, and a newer request cuts an older one short.
 */
export function createWorkerHandler(
  post: (response: WorkerResponse) => void,
  loadTargets: () => Promise<readonly PlanTarget[]>,
  chunking: Pick<ChunkedOptions, 'chunkSize' | 'yieldNow'> = {},
): (request: WorkerRequest) => Promise<void> {
  let latest = 0;
  return async ({ id, query }) => {
    latest = id;
    try {
      const targets = await loadTargets();
      const result = await rankChunked({ ...query, targets }, { ...chunking, isCurrent: () => latest === id });
      post({ id, kind: 'result', result });
    } catch (e) {
      if (isSuperseded(e)) post({ id, kind: 'superseded' });
      else post({ id, kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
}
