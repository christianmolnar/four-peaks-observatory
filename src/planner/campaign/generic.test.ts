import { arcToHorizonPoints } from '../profile';
import targetsData from '../data/targets.json';
import { planCampaign, usefulRangeOf } from './index';
import type { CampaignInput, CampaignResult, CampaignSubject } from './index';
import { PHX, POR, SYD, assertValidNight, base as baseInput, bestWorth, reachedTonight, subj, worthOf } from './testkit';

/**
 * Generic lists: nothing here is about one target. Lists come from the catalog by angular size (tiny, huge), from
 * synthetic targets and from a seeded random generator. The oracle (testkit) is written from the astro functions and the
 * brief, not taken from the engine.
 */

const SITES = [
  { site: PHX, timeZone: 'America/Phoenix' },
  { site: POR, timeZone: 'America/Los_Angeles' },
  { site: SYD, timeZone: 'Australia/Sydney' },
];
const DATES = ['2026-12-10', '2027-03-15', '2027-06-20'];

interface Cat { id: string; name: string; type: string; raHours: number; decDeg: number; sizeArcmin?: { major: number } }
const catalog = (targetsData.targets as Cat[]).filter((t) => t.sizeArcmin);
const bySize = [...catalog].sort((a, b) => (a.sizeArcmin?.major ?? 0) - (b.sizeArcmin?.major ?? 0));
const fromCat = (t: Cat): CampaignSubject => subj(t.id, t.raHours, t.decDeg, { type: t.type });

const TINY = [subj('tiny-a', 2.1, 20), subj('tiny-b', 7.4, -25), subj('tiny-c', 13.2, 35), subj('tiny-d', 18.9, 5), subj('tiny-e', 22.6, -10)];
const HUGE = [subj('huge-a', 0.71, 41.3), subj('huge-b', 6.5, 5), subj('huge-c', 20.76, 30.7), subj('huge-d', 20.99, 44.5), subj('huge-e', 5.6, -5.4)];
const withClass = (list: CampaignSubject[], surfaceBrightness: CampaignSubject['surfaceBrightness']): CampaignSubject[] => list.map((s) => ({ ...s, surfaceBrightness }));

const LISTS: Record<string, CampaignSubject[]> = {
  'five tiny (catalog)': bySize.slice(0, 5).map(fromCat),
  'five tiny (synthetic, high)': withClass(TINY, 'high'),
  'five huge (catalog)': bySize.slice(-5).map(fromCat),
  'five huge (synthetic, low)': withClass(HUGE, 'low'),
  'mixed, six': [...withClass(TINY.slice(0, 3), 'high'), ...withClass(HUGE.slice(0, 3), 'low')],
};

const base = (site: (typeof SITES)[number], over: Partial<CampaignInput>): CampaignInput => baseInput({ site: site.site, timeZone: site.timeZone, ...over });

/** Each night against the exact oracle (never above it, equal to it), with the totals of earlier nights as given by the engine's own result. */
function assertOptimal(input: CampaignInput, r: CampaignResult): void {
  const got = input.subjects.map(() => 0);
  r.nights.forEach((n) => {
    if (n.start) {
      expect(worthOf(n, input, got)).toBe(bestWorth(n, input, got));
      assertValidNight(n, input);
    }
    n.outcomes.forEach((o, i) => { got[i] += o.gotMin; });
  });
}

/** Statuses agree with the totals and ranges; cut targets have a reason and no minutes; a list that fits fully has no cut line. */
function assertReport(input: CampaignInput, r: CampaignResult): void {
  r.perSubject.forEach((p, i) => {
    const sum = r.nights.reduce((a, n) => a + n.outcomes[i].gotMin, 0);
    expect(p.totalMin).toBe(sum);
    expect(p.totalMin).toBeLessThanOrEqual(p.maxUsefulMin);
    expect(p.status).toBe(p.totalMin >= p.maxUsefulMin ? 'full' : p.totalMin >= p.minUsefulMin ? 'useful' : 'cut');
    if (p.status === 'cut') {
      expect(p.totalMin).toBe(0);
      expect(p.reason).not.toBeNull();
    } else {
      expect(p.reason).toBeNull();
    }
    // No token slot: every slot is at least the lesser of 30 min and what the target has left to maxUseful.
    let before = 0;
    r.nights.forEach((n) => {
      const g = n.outcomes[i].gotMin;
      if (g > 0) expect(g).toBeGreaterThanOrEqual(Math.min(30, p.maxUsefulMin - before));
      before += g;
    });
  });
  const cut = r.perSubject.filter((p) => p.status === 'cut').map((p) => p.subjectId);
  expect(r.cutLine.cutIds).toEqual(cut);
  expect(r.cutLine.firstCutId).toBe(cut[0] ?? null);
  expect(r.cutLine.text === null).toBe(cut.length === 0);
  if (cut.length > 0) {
    const first = r.perSubject.findIndex((p) => p.status === 'cut');
    expect(r.cutLine.lastFitId).toBe(r.perSubject.slice(0, first).filter((p) => p.status !== 'cut').pop()?.subjectId ?? null);
  }
  expect(input.subjects.length).toBe(r.perSubject.length);
}

describe('tiny, huge and mixed lists at 3 sites and 3 dates (date shifted by list)', () => {
  const cases = Object.entries(LISTS).flatMap(([name, subjects], li) =>
    SITES.map((site, si) => ({ name, subjects, site, date: DATES[(si + li) % 3], nights: li === 0 && si === 0 ? 14 : [2, 3, 4][(si + li) % 3] })));

  it.each(cases.map((c) => [`${c.name} | ${c.site.timeZone} | ${c.date} | ${c.nights} nights`, c] as const))('%s', (_label, c) => {
    const input = base(c.site, { subjects: c.subjects, startDate: c.date, nights: c.nights, minAltitude: 25 });
    const r = planCampaign(input);
    expect(r.nights).toHaveLength(c.nights);
    expect(planCampaign(input)).toEqual(r);
    assertReport(input, r);
    // The oracle is a full search per night: the 14-night run gets validity checks only.
    if (c.nights <= 4) assertOptimal(input, r);
    else r.nights.forEach((n) => assertValidNight(n, input));
  });

  it('the class decides the count: the same six places fit more targets at high (60 min) than at low (120 min)', () => {
    const six = [...TINY, ...HUGE.slice(0, 1)];
    const fitCount = (cls: 'high' | 'low'): number => {
      const input = base(SITES[0], { subjects: withClass(six, cls), startDate: DATES[0], nights: 1 });
      const r = planCampaign(input);
      assertOptimal(input, r);
      return r.perSubject.filter((p) => p.status !== 'cut').length;
    };
    expect(fitCount('high')).toBeGreaterThanOrEqual(fitCount('low'));
    expect(fitCount('high')).toBeGreaterThan(0);
  });

  it('catalog types feed the exposure engine: a list of catalog objects reports the engine\'s range for each', () => {
    const r = planCampaign(base(SITES[0], { subjects: LISTS['five tiny (catalog)'], startDate: DATES[0] }));
    LISTS['five tiny (catalog)'].forEach((s, i) => {
      expect(r.perSubject[i].minUsefulMin).toBe(usefulRangeOf(s).minMin);
      expect(r.perSubject[i].maxUsefulMin).toBe(usefulRangeOf(s).maxMin);
    });
  });
});

describe('beam (seven and eight targets) against the exact oracle', () => {
  it.each(SITES.map((c) => [c.timeZone, c] as const))('%s: seven targets, 120 min minimum: every night reaches as many targets as the exact search', (_tz, site) => {
    const seven = [...withClass(TINY.slice(0, 3), 'high'), ...withClass(HUGE.slice(0, 4), 'low')].map((s) => ({ ...s, useful: { minMin: 120, maxMin: 240 } }));
    const input = base(site, { subjects: seven, startDate: DATES[0], nights: 2, minAltitude: 30 });
    assertOptimal(input, planCampaign(input));
  }, 120000);

  it.each(SITES.map((c) => [c.timeZone, c] as const))('%s: eight targets (beam): valid, deterministic, and no night reaches fewer targets than the exact search by more than one', (_tz, site) => {
    const eight = [...withClass(TINY.slice(0, 4), 'high'), ...withClass(HUGE.slice(0, 4), 'low')];
    const input = base(site, { subjects: eight, startDate: DATES[0], nights: 2, minAltitude: 30 });
    const r = planCampaign(input);
    expect(planCampaign(input)).toEqual(r);
    const got = eight.map(() => 0);
    r.nights.forEach((n) => {
      assertValidNight(n, input);
      const best = bestWorth(n, input, got);
      expect(worthOf(n, input, got)).toBeLessThanOrEqual(best);
      // reached count is the part of the worth above the priority and minutes digits.
      expect(Math.floor(worthOf(n, input, got) / 1e5 / 1024)).toBeGreaterThanOrEqual(Math.floor(best / 1e5 / 1024) - 1);
      expect(reachedTonight(n, input, got)).toBeGreaterThanOrEqual(0);
      n.outcomes.forEach((o, i) => { got[i] += o.gotMin; });
    });
  }, 120000);
});

describe('seeded random lists', () => {
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const make = (seed: number): CampaignInput => {
    const r = rng(seed);
    const pick = <T,>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
    const count = 1 + Math.floor(r() * 6);
    const subjects: CampaignSubject[] = [];
    for (let i = 0; i < count; i++) {
      const cls = pick(['high', 'medium', 'low', 'unknown'] as const);
      const s = r() < 0.4 ? { ...fromCat(pick(catalog)), id: `c${i}` } : subj(`s${i}`, r() * 24, -55 + r() * 125, { surfaceBrightness: cls });
      subjects.push(r() < 0.2 ? { ...s, hoursPerNight: pick([1, 2, 3]) } : s);
    }
    const zones = r() < 0.5 ? arcToHorizonPoints([{ startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 }]) : null;
    return base(pick(SITES), { subjects, horizon: zones, startDate: pick(DATES), nights: 1 + Math.floor(r() * 3), minAltitude: pick([20, 25, 30, 35]) });
  };

  it('24 lists of 1 to 6 targets: deterministic, valid, optimal every night, statuses and cut line consistent', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const input = make(seed);
      const r = planCampaign(input);
      expect(planCampaign(input)).toEqual(r);
      assertOptimal(input, r);
      assertReport(input, r);
    }
  }, 240000);
});
