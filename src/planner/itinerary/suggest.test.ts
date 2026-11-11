import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import type { Site } from '../astro';
import { buildItinerary, lightMinutes, makeWindowLookup } from './index';
import type { BuildInput, ItineraryItem } from './index';
import { planetIdOf, slotInputFor } from './resolve';
import { orderKey, rankOf, compareRank, suggestOrder } from './suggest';

const profile = validateProfile(sample);
const fmt = (d: Date) => d.toISOString().slice(11, 16);
const PHX: Site = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };

// ----------------------------------------------------------------- helpers

let seq = 0;
const item = (targetId: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: `q${++seq}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '', ...over,
});
const inputFor = (its: readonly ItineraryItem[], base: Omit<BuildInput, 'slots'>): BuildInput => ({ ...base, slots: its.map((i) => slotInputFor(i, profile, starterTargets)) });
const plan = (its: readonly ItineraryItem[], base: Omit<BuildInput, 'slots'>) => buildItinerary(inputFor(its, base));
const reorder = (its: readonly ItineraryItem[], ids: readonly string[]) => ids.map((id) => its.find((i) => i.id === id) as ItineraryItem);

/** Every order of a list (Heap-free, plain recursion), in the order given first. */
function* permutations<T>(xs: readonly T[]): Generator<T[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
}

// ------------------------------------------------------- the evaluator's repro

describe('the sample night that made the old advice cut the light (2026-11-08, M31, M42, Jupiter)', () => {
  const night = tonightsNight(PHX, '2026-11-08', 'America/Phoenix');
  const base: Omit<BuildInput, 'slots'> = { site: PHX, night, horizon: arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]), minAltitude: 20, bortle: 6, formatTime: fmt };
  const its = [item('m31'), item('m42'), item(planetIdOf('Jupiter'), { trainId: 'planet-c11-676' })];

  it('keeps the order or offers one with at least as much light, and the advice minutes are the totals line', () => {
    const now = plan(its, base);
    const r = suggestOrder(inputFor(its, base));
    const next = plan(reorder(its, r.order), base);
    expect(r.currentLightMin).toBe(lightMinutes(now));
    expect(r.suggestedLightMin).toBe(lightMinutes(next));
    expect(next.totals.integrationMin).toBeGreaterThanOrEqual(now.totals.integrationMin);
    if (!r.changed) expect(r.order).toEqual(its.map((i) => i.id));
    // After applying it, the page would show the light the advice promised, and a second look finds nothing better.
    expect(suggestOrder(inputFor(reorder(its, r.order), base)).changed).toBe(false);
  });
});

// ----------------------------------------------- random sets against a brute force

/** The windows of a night are found once for the thousands of plans the oracle builds; every plan is still built by buildItinerary. */
const withWindows = (b: Omit<BuildInput, 'slots'>): Omit<BuildInput, 'slots'> => ({ ...b, windows: makeWindowLookup(b) });

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SITES: { name: string; site: Site; date: string; zone: string }[] = [
  { name: 'Phoenix', site: PHX, date: '2026-11-08', zone: 'America/Phoenix' },
  { name: 'Sydney', site: { latitude: -33.87, longitude: 151.21, elevationM: 0 }, date: '2026-11-08', zone: 'Australia/Sydney' },
  { name: 'Reykjavik', site: { latitude: 64.15, longitude: -21.94, elevationM: 0 }, date: '2026-11-08', zone: 'Atlantic/Reykjavik' },
  { name: 'New York', site: { latitude: 40.71, longitude: -74.0, elevationM: 0 }, date: '2026-12-15', zone: 'America/New_York' },
  { name: 'Apia', site: { latitude: -13.83, longitude: -171.76, elevationM: 0 }, date: '2026-09-20', zone: 'Pacific/Apia' },
  { name: 'Kiritimati', site: { latitude: 1.87, longitude: -157.4, elevationM: 0 }, date: '2026-11-08', zone: 'Pacific/Kiritimati' },
];
const TARGET_IDS = starterTargets.map((t) => t.id);
const BODY_IDS = [...['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'].map(planetIdOf), planetIdOf('Moon')];
const TRAINS = ['deep-c11-reducer-533', 'deep-c11-2600', 'wide-c11-hyperstar-2600', 'planet-c11-676'];
const FILTERS = [null, null, 'zwo-duo-band', 'idas-lps-p2'];
const MODES = ['quick', 'balanced', 'deep'] as const;

interface RandomSet {
  label: string;
  base: Omit<BuildInput, 'slots'>;
  its: ItineraryItem[];
}

/** A random night and a random list of n slots: fixed targets, planets and the Moon, several trains, filters and modes. */
function randomSet(rand: () => number, n: number, index: number): RandomSet | null {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const s = pick(SITES);
  const night = tonightsNight(s.site, s.date, s.zone);
  if (night.kind !== 'normal') return null;
  const used = new Set<string>();
  const its: ItineraryItem[] = [];
  const wantBodies = Math.min(n - 1, 1 + Math.floor(rand() * 3));
  while (its.length < n) {
    const id = its.length < wantBodies ? pick(BODY_IDS) : pick(TARGET_IDS);
    if (used.has(id)) continue;
    used.add(id);
    its.push(item(id, { trainId: pick(TRAINS), filterId: pick(FILTERS), mode: pick(MODES) }));
  }
  // Shuffle: the user's order is arbitrary.
  for (let i = its.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [its[i], its[j]] = [its[j], its[i]];
  }
  const startAt = rand() < 0.3 ? new Date((night.start as Date).getTime() + Math.floor(rand() * 240) * 60000) : null;
  const horizon = rand() < 0.5 ? arcToHorizonPoints([{ startAz: 100 + Math.floor(rand() * 60), endAz: 200 + Math.floor(rand() * 120), heightDeg: 20 + Math.floor(rand() * 30) }]) : null;
  return {
    label: `#${index} ${s.name} ${s.date} n=${n}`,
    base: withWindows({ site: s.site, night, horizon, minAltitude: pick([15, 20, 30]), bortle: pick([3, 5, 7]), startAt, formatTime: fmt }),
    its,
  };
}

describe('against a brute force that runs buildItinerary on every order', () => {
  // Sizes 2 to 8, six of each plus the remainder: 40 sets. The brute force (the oracle) needs n! real builds, so it covers n up to 5 here and n = 6 in the next test.
  const sizes = Array.from({ length: 40 }, (_, i) => 2 + (i % 7));
  const sets: RandomSet[] = [];
  const rand = mulberry32(20261109);
  sizes.forEach((n, i) => {
    for (let tries = 0; tries < 20; tries++) {
      const s = randomSet(rand, n, i);
      if (s) {
        sets.push(s);
        break;
      }
    }
  });

  it('has 40 sets with planets and the Moon in most of them, over all 6 sites', () => {
    expect(sets).toHaveLength(40);
    expect(sets.filter((s) => s.its.some((i) => BODY_IDS.includes(i.targetId))).length).toBeGreaterThanOrEqual(35);
    expect(sets.filter((s) => s.its.some((i) => i.targetId === planetIdOf('Moon'))).length).toBeGreaterThan(3);
    expect(new Set(sets.map((s) => s.label.split(' ')[1] + s.label.split(' ')[2])).size).toBeGreaterThanOrEqual(5);
    expect(new Set(sets.flatMap((s) => s.its.map((i) => i.trainId))).size).toBeGreaterThanOrEqual(3);
  });

  it('never offers an order worse than the user’s, and the advice minutes are the totals line, on all 40', () => {
    const problems: string[] = [];
    for (const s of sets) {
      const input = inputFor(s.its, s.base);
      const r = suggestOrder(input);
      const now = buildItinerary(input);
      const next = plan(reorder(s.its, r.order), s.base);
      if (r.order.length !== s.its.length || new Set(r.order).size !== s.its.length) problems.push(`${s.label}: order lost slots`);
      if (compareRank(rankOf(next), rankOf(now)) < 0) problems.push(`${s.label}: offered order is worse (${next.totals.integrationMin} vs ${now.totals.integrationMin})`);
      if (!r.changed && r.order.join() !== s.its.map((i) => i.id).join()) problems.push(`${s.label}: unchanged but reordered`);
      if (r.currentLightMin !== lightMinutes(now)) problems.push(`${s.label}: advice now ${r.currentLightMin} vs totals ${lightMinutes(now)}`);
      if (r.suggestedLightMin !== lightMinutes(r.changed ? next : now)) problems.push(`${s.label}: advice suggested ${r.suggestedLightMin} vs totals ${lightMinutes(next)}`);
      if (r.changed && compareRank(rankOf(next), rankOf(now)) <= 0) problems.push(`${s.label}: changed but not better`);
    }
    expect(problems).toEqual([]);
  });

  it('is the best order by light, then altitude, then finish, on every set of up to 5 slots', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const s of sets.filter((x) => x.its.length <= 5)) {
      const r = suggestOrder(inputFor(s.its, s.base));
      const offered = rankOf(plan(reorder(s.its, r.order), s.base));
      let best = rankOf(plan(s.its, s.base));
      for (const p of permutations(s.its)) {
        const rk = rankOf(plan(p, s.base));
        if (compareRank(rk, best) > 0) best = rk;
      }
      checked++;
      if (compareRank(offered, best) !== 0) problems.push(`${s.label}: offered ${JSON.stringify(offered)} best ${JSON.stringify(best)}`);
      expect(r.searched.exhaustive).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(20);
    expect(problems).toEqual([]);
  }, 300000);

  it('is the best order on sets of 6 slots too (720 real builds each, 8 sets)', () => {
    const rand6 = mulberry32(6);
    const problems: string[] = [];
    let checked = 0;
    for (let i = 0; checked < 8 && i < 60; i++) {
      const s = randomSet(rand6, 6, 100 + i);
      if (!s) continue;
      const r = suggestOrder(inputFor(s.its, s.base));
      const offered = rankOf(plan(reorder(s.its, r.order), s.base));
      let best = rankOf(plan(s.its, s.base));
      for (const p of permutations(s.its)) {
        const rk = rankOf(plan(p, s.base));
        if (compareRank(rk, best) > 0) best = rk;
      }
      checked++;
      expect(r.searched.exhaustive).toBe(true);
      if (compareRank(offered, best) !== 0) problems.push(`${s.label}: offered ${JSON.stringify(offered)} best ${JSON.stringify(best)}`);
    }
    expect(problems).toEqual([]);
  }, 600000);
});

// ------------------------------------------------------------ small behaviours

describe('behaviour of the advice', () => {
  const night = tonightsNight(PHX, '2026-11-08', 'America/Phoenix');
  const base: Omit<BuildInput, 'slots'> = { site: PHX, night, horizon: arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]), minAltitude: 20, bortle: 6, formatTime: fmt };

  it('an empty or one-slot list has nothing to change', () => {
    expect(suggestOrder(inputFor([], base))).toMatchObject({ order: [], changed: false, steps: [] });
    const one = [item('m31')];
    expect(suggestOrder(inputFor(one, base))).toMatchObject({ order: [one[0].id], changed: false });
  });

  it('is deterministic, ties keep the order given, and a note changes nothing', () => {
    const its = [item('m31'), item('m42'), item('m33'), item(planetIdOf('Jupiter'))];
    const one = suggestOrder(inputFor(its, base));
    expect(suggestOrder(inputFor(its, base))).toEqual(one);
    const noted = its.map((i) => ({ ...i, note: 'check guiding' }));
    expect(suggestOrder(inputFor(noted, base))).toEqual(one);
    expect(orderKey(noted)).toBe(orderKey(its));
    expect(orderKey([...its].reverse())).not.toBe(orderKey(its));
    expect(orderKey(its.map((i, k) => (k === 0 ? { ...i, mode: 'deep' } : i)))).not.toBe(orderKey(its));
  });

  it('a slot with a problem or no window ever stays out of the search and comes last', () => {
    const its = [item('nope'), item('m31'), item('m42')];
    const r = suggestOrder(inputFor(its, base));
    expect([...r.order].sort()).toEqual(its.map((i) => i.id).sort());
    expect(r.steps.map((s) => s.id)).not.toContain(its[0].id);
    if (r.changed) expect(r.order[r.order.length - 1]).toBe(its[0].id);
    else expect(r.order).toEqual(its.map((i) => i.id));
  });

  it('eight slots are searched, verified with buildItinerary, and never come out worse', () => {
    const its = ['m31', 'm42', 'm33', 'ic405', 'm81', 'm101', planetIdOf('Jupiter'), planetIdOf('Moon')].map((id) => item(id));
    const t = Date.now();
    const r = suggestOrder(inputFor(its, base));
    const ms = Date.now() - t;
    const now = plan(its, base);
    const next = plan(reorder(its, r.order), base);
    expect(compareRank(rankOf(next), rankOf(now))).toBeGreaterThanOrEqual(0);
    expect(r.suggestedLightMin).toBe(lightMinutes(r.changed ? next : now));
    expect(ms).toBeLessThan(3000);
  });

  it('each step gives one short reason', () => {
    const its = [item('m42'), item('m31'), item('m33')];
    const r = suggestOrder(inputFor(its, base));
    for (const st of r.steps) expect(st.reason.length).toBeGreaterThan(5);
  });
});

describe('advice that names the same target twice', () => {
  const night = tonightsNight(PHX, '2026-11-08', 'America/Phoenix');
  const base = withWindows({ site: PHX, night, horizon: arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]), minAltitude: 20, bortle: 6, formatTime: fmt });

  const changedWith = (its: ItineraryItem[]) => {
    for (const k of its.keys()) {
      const rotated = [...its.slice(k), ...its.slice(0, k)];
      const r = suggestOrder(inputFor(rotated, base));
      if (r.changed) return r;
    }
    return null;
  };

  it('tells two Mars slots apart by train, then by filter, then by "first" and "second"', () => {
    const mars = planetIdOf('Mars');
    const trains = profile.trains.filter((t) => t.kind === 'optical');
    const a = trains[0].id;
    const b = trains[1].id;
    const sets: ItineraryItem[][] = [
      [item(mars, { trainId: a }), item('m31'), item('m42'), item(mars, { trainId: b })],
      [item(mars, { trainId: a, filterId: null }), item('m31'), item('m42'), item(mars, { trainId: a, filterId: profile.equipment.filters[0].id })],
      [item(mars, { trainId: a }), item('m31'), item('m42'), item(mars, { trainId: a })],
    ];
    const names = sets.map((its) => changedWith(its)?.steps.map((st) => st.name)).filter((n): n is string[] => !!n);
    expect(names.length).toBeGreaterThan(0);
    for (const list of names) {
      const marsNames = list.filter((n) => n.startsWith('Mars'));
      expect(marsNames).toHaveLength(2);
      expect(new Set(marsNames).size).toBe(2);
      for (const n of marsNames) expect(n).toMatch(/^Mars \(.+\)$/);
      for (const n of list.filter((x) => !x.startsWith('Mars'))) expect(n).not.toContain('(');
    }
  });

  it('never says "fits before the rest" for a slot that runs after another', () => {
    for (const ids of [['m31', 'm42', 'm33', 'ic405', 'm81'], ['ngc2237', 'm1', 'm45', 'm13', 'm27', 'ngc1499']]) {
      const its = ids.map((id) => item(id));
      const r = changedWith(its);
      if (!r) continue;
      r.steps.forEach((st, k) => {
        if (k > 0) expect(st.reason).not.toMatch(/before the rest/);
        expect(st.reason.length).toBeLessThan(70);
      });
    }
  });
});
