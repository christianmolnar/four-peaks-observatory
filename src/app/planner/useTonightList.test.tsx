/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import type { RankResult } from '@/planner/plan/rank';
import { SupersededError } from '@/planner/tonight';
import type { TonightQuery } from '@/planner/tonight';
import { useTonightList } from './useTonightList';

const result = (tag: string): RankResult => ({ tag }) as unknown as RankResult;
const query = (types: string[]): TonightQuery => ({ types }) as unknown as TonightQuery;

/** A ranker whose answers the test gives by hand, in any order. */
function manualRanker() {
  const calls: { query: TonightQuery; resolve: (r: RankResult) => void; reject: (e: unknown) => void }[] = [];
  const rank = (q: TonightQuery) => new Promise<RankResult>((resolve, reject) => { calls.push({ query: q, resolve, reject }); });
  return { rank, calls };
}

describe('useTonightList', () => {
  it('never shows the list of the old query under a new one, not even in the render that changes it', async () => {
    const { rank, calls } = manualRanker();
    const a = query(['galaxy']);
    const b = query(['globular-cluster']);
    const seen: string[] = [];
    const { result: hook, rerender } = renderHook(({ q }) => {
      const r = useTonightList(rank, q);
      seen.push(r.state.status === 'ready' ? `ready:${(r.state.result as unknown as { tag: string }).tag}` : r.state.status);
      return r;
    }, { initialProps: { q: a } });
    await act(async () => calls[0].resolve(result('galaxies')));
    expect(hook.current.state.status).toBe('ready');
    seen.length = 0;
    rerender({ q: b });
    expect(seen[0]).toBe('loading'); // the very first render under the new query
    expect(seen).not.toContain('ready:galaxies');
  });

  it('drops the answer of a request a newer one superseded, whichever order they arrive in', async () => {
    const { rank, calls } = manualRanker();
    const a = query(['galaxy']);
    const b = query(['globular-cluster']);
    const { result: hook, rerender } = renderHook(({ q }) => useTonightList(rank, q), { initialProps: { q: a } });
    rerender({ q: b });
    expect(calls).toHaveLength(2);
    await act(async () => calls[1].resolve(result('globulars')));
    await act(async () => calls[0].resolve(result('galaxies'))); // the old answer arrives late
    expect(hook.current.state).toEqual({ status: 'ready', result: result('globulars') });
  });

  it('treats a superseded rejection as no news, and any other rejection as an error', async () => {
    const { rank, calls } = manualRanker();
    const { result: hook, rerender } = renderHook(({ q }) => useTonightList(rank, q), { initialProps: { q: query(['galaxy']) } });
    rerender({ q: query(['open-cluster']) });
    await act(async () => calls[0].reject(new SupersededError()));
    expect(hook.current.state.status).toBe('loading');
    await act(async () => calls[1].reject(new Error('worker crashed')));
    expect(hook.current.state).toEqual({ status: 'error', message: 'worker crashed' });
  });
});
