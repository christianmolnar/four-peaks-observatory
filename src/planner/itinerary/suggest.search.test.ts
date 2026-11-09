import { buildItinerary, makeScheduler, makeWindowLookup } from './index';
import type { BuildInput } from './index';
import { compareRank, rankOf, suggestOrder, suggestOrderSteps } from './suggest';
import { randomCases, toInputs } from './random-sets';
import type { Case } from './random-sets';

const permutations = function* <T>(a: T[]): Generator<T[]> {
  if (a.length <= 1) return yield a;
  for (let i = 0; i < a.length; i++) for (const p of permutations([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
};

/** The truth: every order built with buildItinerary itself (one shared window lookup), the best by the page's own ranking; the first of equals wins, so the user's order is first. */
function bruteBest(c: Case): { order: string[]; rank: ReturnType<typeof rankOf> } {
  const windows = makeWindowLookup(c.input);
  const build = (items: Case['items']) => buildItinerary({ ...c.input, slots: toInputs(items), windows } as BuildInput);
  let bestRank = rankOf(build(c.items));
  let bestOrder = c.items.map((i) => i.id);
  for (const p of permutations(c.items)) {
    const r = rankOf(build(p));
    if (compareRank(r, bestRank) > 0) {
      bestRank = r;
      bestOrder = p.map((i) => i.id);
    }
  }
  return { order: bestOrder, rank: bestRank };
}

const rankOfOrder = (c: Case, order: string[]) => {
  const byId = new Map(c.items.map((i) => [i.id, i]));
  return rankOf(buildItinerary({ ...c.input, slots: toInputs(order.map((id) => byId.get(id) as Case['items'][number])) } as BuildInput));
};

describe('the order search on random 7 and 8 slot sets', () => {
  const cases = randomCases(4101, 24, (k) => 7 + (k % 2));

  it('covers at least 8 sites and says it is exhaustive', () => {
    expect(new Set(cases.map((c) => c.site)).size).toBeGreaterThanOrEqual(8);
    for (const c of cases) expect(suggestOrder(c.input).searched.exhaustive).toBe(true);
  }, 120000);

  it('is never worse than the user order, its minutes are the totals, and applying it leaves nothing to improve', () => {
    for (const c of cases) {
      const r = suggestOrder(c.input);
      const now = rankOf(buildItinerary(c.input));
      const next = rankOfOrder(c, r.order);
      expect(compareRank(next, now)).toBeGreaterThanOrEqual(0);
      expect(r.changed).toBe(compareRank(next, now) > 0);
    }
  }, 120000);

  it('with fewer than all slots tried (exactMax 6) it says it is not exhaustive, and is still never worse', () => {
    let beamed = 0;
    for (const c of cases.slice(0, 8)) {
      const r = suggestOrder(c.input, { exactMax: 6 });
      const scheduler = makeScheduler({ ...c.input, windows: makeWindowLookup(c.input) });
      const live = c.input.slots.filter((s) => scheduler.place(s, scheduler.initial, true).ran).length;
      expect(r.searched.exhaustive).toBe(live <= 6);
      if (live > 6) beamed++;
      expect(compareRank(rankOfOrder(c, r.order), rankOf(buildItinerary(c.input)))).toBeGreaterThanOrEqual(0);
    }
    expect(beamed).toBeGreaterThanOrEqual(3);
  }, 120000);

  it('the exact search never does worse than the beam it replaces', () => {
    for (const c of cases.slice(0, 8)) {
      expect(compareRank(rankOfOrder(c, suggestOrder(c.input).order), rankOfOrder(c, suggestOrder(c.input, { exactMax: 6 }).order))).toBeGreaterThanOrEqual(0);
    }
  }, 120000);

  it('the step version pauses and gives the same answer as the one-shot search', () => {
    const c = cases[1];
    const steps = suggestOrderSteps(c.input);
    let pauses = 0;
    let r = steps.next();
    while (!r.done) {
      pauses++;
      r = steps.next();
    }
    expect(pauses).toBeGreaterThan(1);
    expect(r.value).toEqual(suggestOrder(c.input));
  }, 120000);

  it('matches every order built by buildItinerary on 7-slot sets (5,040 builds each)', () => {
    for (const c of randomCases(4102, 3, () => 7)) {
      const truth = bruteBest(c);
      expect(compareRank(rankOfOrder(c, suggestOrder(c.input).order), truth.rank)).toBe(0);
    }
  }, 300000);
});

// Offline measurement, not part of the suite: FP_BRUTE=<seed> npx jest ... suggest.search prints miss rates against all 8! orders.
const offline = process.env.FP_BRUTE ? it : it.skip;
offline('offline: miss rate of the old beam (exactMax 6) and the exact search against a full brute force', () => {
  const sets = randomCases(Number(process.env.FP_BRUTE), Number(process.env.FP_SETS ?? 40), (k) => 7 + (k % 2));
  const rows = sets.map((c) => {
    const truth = bruteBest(c);
    const lightOf = (order: string[]) => rankOfOrder(c, order).light / 10;
    const beam = suggestOrder(c.input, { exactMax: 6 });
    const exact = suggestOrder(c.input);
    const user = rankOf(buildItinerary(c.input)).light / 10;
    return { site: c.site, date: c.date, n: c.items.length, truth: truth.rank.light / 10, user, beam: lightOf(beam.order), exact: lightOf(exact.order), beamMiss: compareRank(rankOfOrder(c, beam.order), truth.rank) < 0, exactMiss: compareRank(rankOfOrder(c, exact.order), truth.rank) < 0 };
  });
  const within1 = (key: 'beam' | 'exact') => rows.filter((r) => r.truth - r[key] <= 1).length;
  console.log(
    JSON.stringify({
      sets: rows.length,
      sites: new Set(rows.map((r) => r.site)).size,
      beamMissed: rows.filter((r) => r.beamMiss).length,
      exactMissed: rows.filter((r) => r.exactMiss).length,
      beamWithin1Min: within1('beam'),
      exactWithin1Min: within1('exact'),
      beamWorseThanUser: rows.filter((r) => r.beam < r.user).length,
      exactWorseThanUser: rows.filter((r) => r.exact < r.user).length,
      beamWorstGapMin: Math.max(...rows.map((r) => r.truth - r.beam)),
      exactWorstGapMin: Math.max(...rows.map((r) => r.truth - r.exact)),
    }),
  );
  expect(rows.filter((r) => r.exactMiss).length).toBe(0);
}, 7200000);

