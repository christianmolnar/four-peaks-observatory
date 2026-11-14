import { prepareRanking } from '../plan/rank';
import type { RankInput, RankResult } from '../plan/rank';
import type { PlanEntry } from '../plan';

/** Thrown (or rejected with) when a newer request took over before this one finished. Not a failure: callers drop it. */
export class SupersededError extends Error {
  constructor() {
    super('Superseded by a newer request');
    this.name = 'SupersededError';
  }
}

export const isSuperseded = (e: unknown): e is SupersededError => e instanceof SupersededError;

/** Targets scored between two yields to the event loop: about 10 ms of work. */
export const CHUNK_SIZE = 250;

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export interface ChunkedOptions {
  /** Checked before every chunk; false stops the work with a `SupersededError`. */
  isCurrent: () => boolean;
  chunkSize?: number;
  /** Defaults to a zero-delay timeout. */
  yieldNow?: () => Promise<void>;
}

/**
 * The same ranking as `rankTargets` (it is built from the same pieces), scored in chunks with an `await` between
 * them, so the thread that runs it can take a newer request or paint in between.
 */
export async function rankChunked(input: RankInput, options: ChunkedOptions): Promise<RankResult> {
  const chunk = options.chunkSize ?? CHUNK_SIZE;
  const yieldNow = options.yieldNow ?? yieldToEventLoop;
  const ranker = prepareRanking(input);
  await yieldNow(); // the night's sky and the screen are one block of work; the scoring starts after a yield
  const entries: PlanEntry[] = [];
  for (let i = 0; i < ranker.candidates.length; i += chunk) {
    if (!options.isCurrent()) throw new SupersededError();
    for (const t of ranker.candidates.slice(i, i + chunk)) entries.push(ranker.evaluate(t));
    await yieldNow();
  }
  if (!options.isCurrent()) throw new SupersededError();
  for (const planet of ranker.planets) {
    if (!options.isCurrent()) throw new SupersededError();
    entries.push(planet());
    await yieldNow();
  }
  if (!options.isCurrent()) throw new SupersededError();
  return ranker.finish(entries);
}
