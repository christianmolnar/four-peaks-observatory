'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RankResult } from '@/planner/plan/rank';
import { isSuperseded } from '@/planner/tonight';
import type { TonightQuery } from '@/planner/tonight';

export type TonightState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; result: RankResult }
  | { status: 'error'; message: string };

/**
 * Tonight's list for a query, computed off the main thread by `rank`. It is recomputed whenever the query object changes
 * (the caller memoises it on what it holds), shows `loading` meanwhile, and drops the answer of a request that a newer one
 * has superseded without a word (`SupersededError` is not a failure). Any other failure is `error`, and `retry` asks again.
 * A null query (nothing to rank yet) is `idle`.
 */
export function useTonightList(
  rank: (query: TonightQuery) => Promise<RankResult>,
  query: TonightQuery | null,
): { state: TonightState; retry: () => void } {
  const [state, setState] = useState<TonightState>({ status: 'idle' });
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
        if (live) setState({ status: 'ready', result });
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

  return { state, retry };
}
