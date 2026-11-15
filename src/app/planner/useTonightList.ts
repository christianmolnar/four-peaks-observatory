'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RankResult } from '@/planner/plan/rank';
import { isSuperseded } from '@/planner/tonight';
import type { TonightQuery } from '@/planner/tonight';

export type TonightState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: RankResult }
  | { status: 'error'; message: string };

/** What is held: a ready answer remembers the query it answers, so it is never shown for another one. */
type Held = Exclude<TonightState, { status: 'ready' }> | { status: 'ready'; result: RankResult; query: TonightQuery };

/**
 * Tonight's list for a query, computed off the main thread by `rank`. It is recomputed whenever the query object changes
 * (the caller memoises it on what it holds), shows `loading` meanwhile, and drops the answer of a request that a newer one
 * has superseded without a word (`SupersededError` is not a failure). Any other failure is `error`, and `retry` asks again.
 * A null query (nothing to rank yet) is `idle`. An answer is only ever `ready` for the query it was asked for: in the render in which
 * the query changes (before the effect that asks again has run) the state is already `loading`, so a list for the old
 * query (another type, night or train) is never on screen under the new one.
 */
export function useTonightList(
  rank: (query: TonightQuery) => Promise<RankResult>,
  query: TonightQuery | null,
): { state: TonightState; retry: () => void } {
  const [held, setState] = useState<Held>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (query === null) {
      setState({ status: 'idle' });
      return undefined;
    }
    let live = true;
    setState({ status: 'loading' });
    rank(query).then(
      (result) => {
        if (live) setState({ status: 'ready', result, query });
      },
      (e: unknown) => {
        if (!live || isSuperseded(e)) return;
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [rank, query, attempt]);

  const state = useMemo((): TonightState => {
    if (held.status !== 'ready') return held;
    if (held.query === query) return { status: 'ready', result: held.result };
    return query === null ? { status: 'idle' } : { status: 'loading' };
  }, [held, query]);
  return { state, retry };
}
