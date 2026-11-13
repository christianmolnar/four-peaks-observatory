import { nextMeridianTransit, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { limitAltitudeAt } from '../horizon';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { arcToHorizonPoints } from '../profile';
import targetsData from '../data/targets.json';
import { planCampaign, MAX_LOSS_MIN, MIN_USEFUL_MIN } from './index';
import type { CampaignInput, CampaignNight, CampaignResult, CampaignSubject } from './index';

/**
 * Generic lists: nothing here is about one target. Lists come from the catalog by angular size (tiny, huge), from
 * synthetic subjects, and from a seeded random generator. The oracle is written here from the astro functions, not
 * taken from the engine.
 */

const MIN = 60000;
const STEP = 5 * MIN;
const SITES: { site: Site; timeZone: string }[] = [
  { site: { latitude: 33.6115, longitude: -111.719, elevationM: 0 }, timeZone: 'America/Phoenix' },
  { site: { latitude: 45.52, longitude: -122.68, elevationM: 0 }, timeZone: 'America/Los_Angeles' },
  { site: { latitude: -33.87, longitude: 151.21, elevationM: 0 }, timeZone: 'Australia/Sydney' },
];
const DATES = ['2026-12-10', '2027-03-15', '2027-06-20'];

interface Cat { id: string; name: string; raHours: number; decDeg: number; sizeArcmin?: { major: number } }
const catalog = (targetsData.targets as Cat[]).filter((t) => t.sizeArcmin);
const bySize = [...catalog].sort((a, b) => (a.sizeArcmin?.major ?? 0) - (b.sizeArcmin?.major ?? 0));

const subj = (id: string, raHours: number, decDeg: number, hoursPerNight: number): CampaignSubject => ({
  id, name: id, targets: [{ id, name: id, raHours, decDeg }], hoursPerNight,
});
const fromCat = (t: Cat, hours: number): CampaignSubject => subj(t.id, t.raHours, t.decDeg, hours);

// Small planetary nebulae and compact galaxies (a few arcmin or less): synthetic positions around the sky.
const SYNTH_TINY = [subj('tiny-a', 2.1, 20, 3), subj('tiny-b', 7.4, -25, 2), subj('tiny-c', 13.2, 35, 3), subj('tiny-d', 18.9, 5, 2.5), subj('tiny-e', 22.6, -10, 2)];
// Frames of several degrees: Andromeda, Rosette, Veil, North America sized.
const SYNTH_HUGE = [subj('huge-a', 0.71, 41.3, 4), subj('huge-b', 6.5, 5, 3), subj('huge-c', 20.76, 30.7, 4), subj('huge-d', 20.99, 44.5, 3), subj('huge-e', 5.6, -5.4, 4)];

const LISTS: Record<string, CampaignSubject[]> = {
  'five tiny (catalog)': bySize.slice(0, 5).map((t, i) => fromCat(t, [2, 3, 2.5, 3, 2][i])),
  'five tiny (synthetic)': SYNTH_TINY,
  'five huge (catalog)': bySize.slice(-5).map((t, i) => fromCat(t, [4, 3, 4, 3, 4][i])),
  'five huge (synthetic)': SYNTH_HUGE,
  'mixed, eight': [...SYNTH_TINY.slice(0, 4), ...bySize.slice(-4).map((t) => fromCat(t, 3))],
};

const base = (site: (typeof SITES)[number], over: Partial<CampaignInput>): CampaignInput => ({
  subjects: [], site: site.site, timeZone: site.timeZone, horizon: null, minAltitude: 25, startDate: DATES[0], nights: 1, ...over,
});

const usableAt = (s: CampaignSubject, input: CampaignInput, t: number): boolean => {
  const a = s.aim ?? s.targets[0];
  const p = targetAltAz(a.raHours, a.decDeg, new Date(t), input.site);
  return p.altitude >= limitAltitudeAt(input.horizon, p.azimuth, input.minAltitude) - 1e-6;
};

/** Every slot is above the altitude and horizon limits at every 5-minute sample, flips exactly when the transit is inside, and slots keep their distance. */
function assertValid(night: CampaignNight, input: CampaignInput): void {
  for (const slot of night.slots) {
    const s = input.subjects.find((x) => x.id === slot.subjectId) as CampaignSubject;
    const a = s.aim ?? s.targets[0];
    for (let t = slot.start.getTime(); t <= slot.end.getTime(); t += STEP) expect(usableAt(s, input, t)).toBe(true);
    expect(usableAt(s, input, slot.end.getTime())).toBe(true);
    const transit = nextMeridianTransit(a.raHours, a.decDeg, night.start as Date, input.site).getTime();
    const crosses = transit > slot.start.getTime() && transit < slot.start.getTime() + slot.integrationMin * MIN;
    expect(slot.flip).toBe(crosses);
    expect(slot.flipMin).toBe(crosses ? MERIDIAN_FLIP_MIN : 0);
    expect((slot.end.getTime() - slot.start.getTime()) / MIN).toBe(slot.integrationMin + slot.flipMin);
    expect(slot.start.getTime()).toBeGreaterThanOrEqual((night.start as Date).getTime());
    expect(slot.end.getTime()).toBeLessThanOrEqual((night.end as Date).getTime());
  }
  for (let i = 1; i < night.slots.length; i++) {
    expect(night.slots[i].start.getTime() - night.slots[i - 1].end.getTime()).toBeGreaterThanOrEqual(SLEW_CENTER_MIN * MIN);
  }
  expect(new Set(night.slots.map((s) => s.subjectId)).size).toBe(night.slots.length);
}

/**
 * Exact oracle for one night: the most minutes over all valid plans (each subject at most one slot, 5 to requested
 * minutes, flip included when the transit is inside), and the most such a plan reaches while serving each subject.
 */
function oracle(night: CampaignNight, input: CampaignInput): { best: number; withSubject: number[] } {
  const t0 = (night.start as Date).getTime();
  const t1 = (night.end as Date).getTime();
  const steps = Math.floor((t1 - t0) / STEP);
  const n = input.subjects.length;
  const opts: { subject: number; end: number; ell: number }[][] = Array.from({ length: steps + 2 }, () => []);
  input.subjects.forEach((s, i) => {
    const a = s.aim ?? s.targets[0];
    const transit = nextMeridianTransit(a.raHours, a.decDeg, night.start as Date, input.site).getTime();
    const ok: boolean[] = [];
    for (let k = 0; k <= steps; k++) ok.push(usableAt(s, input, t0 + k * STEP));
    const want = s.hoursPerNight * 60;
    for (let k = 0; k <= steps; k++) {
      if (!ok[k]) continue;
      for (let ell = Math.min(MIN_USEFUL_MIN, want); ell <= want; ell += 5) {
        const st = t0 + k * STEP;
        const flip = transit > st && transit < st + ell * MIN;
        const len = ell + (flip ? MERIDIAN_FLIP_MIN : 0);
        const end = k + len / 5;
        if (st + len * MIN > t1 || end > steps) break;
        let all = true;
        for (let j = k; j <= end && all; j++) all = ok[j];
        if (all) opts[k].push({ subject: i, end, ell });
      }
    }
  });
  const masks = 1 << n;
  const f: Int32Array[] = Array.from({ length: steps + 2 }, () => new Int32Array(masks).fill(-1));
  f[0][0] = 0;
  for (let t = 0; t <= steps; t++) {
    for (let m = 0; m < masks; m++) {
      const v = f[t][m];
      if (v < 0) continue;
      if (f[t + 1][m] < v) f[t + 1][m] = v;
      for (const o of opts[t]) {
        if (m & (1 << o.subject)) continue;
        const tt = Math.min(o.end + 1, steps + 1);
        const m2 = m | (1 << o.subject);
        if (f[tt][m2] < v + o.ell) f[tt][m2] = v + o.ell;
      }
    }
  }
  const withSubject = new Array<number>(n).fill(-1);
  let best = 0;
  for (let m = 0; m < masks; m++) {
    const v = f[steps + 1][m];
    if (v < 0) continue;
    best = Math.max(best, v);
    for (let i = 0; i < n; i++) if (m & (1 << i)) withSubject[i] = Math.max(withSubject[i], v);
  }
  return { best, withSubject };
}

const total = (n: CampaignNight): number => n.outcomes.reduce((a, o) => a + o.gotMin, 0);

/**
 * Checks one result against the oracle: each night's total is within MAX_LOSS_MIN of the best (never above it), and
 * no subject at 0 after two nights is left at 0 when a plan within MAX_LOSS_MIN of the best total serves it.
 */
function assertFair(input: CampaignInput, r: CampaignResult): void {
  const got = input.subjects.map(() => 0);
  r.nights.forEach((night, k) => {
    if (night.start) {
      const o = oracle(night, input);
      expect(total(night)).toBeLessThanOrEqual(o.best);
      expect(total(night)).toBeGreaterThanOrEqual(o.best - MAX_LOSS_MIN);
      if (k >= 2) {
        night.outcomes.forEach((out, i) => {
          if (got[i] === 0 && out.gotMin === 0 && o.withSubject[i] > 0) expect(o.withSubject[i]).toBeLessThan(o.best - MAX_LOSS_MIN);
        });
      }
    }
    night.outcomes.forEach((out, i) => {
      const useful = Math.min(MIN_USEFUL_MIN, out.requestedMin);
      if (out.gotMin > 0) expect(out.gotMin).toBeGreaterThanOrEqual(useful);
      got[i] += out.gotMin;
    });
  });
}

describe('generic lists: tiny, huge and mixed, at 3 sites and 3 dates (shifted by list)', () => {
  // Each list runs once at every site, with the date shifted by list, so every site and date is met by every other list.
  const cases = Object.entries(LISTS).flatMap(([name, subjects], li) =>
    SITES.map((site, si) => ({ name, subjects, site, date: DATES[(si + li) % 3], nights: li === 0 && si === 0 ? 14 : [3, 4, 5][(si + li) % 3] })));

  it.each(cases.map((c) => [`${c.name} | ${c.site.timeZone} | ${c.date} | ${c.nights} nights`, c] as const))('%s', (_label, c) => {
    // The 14-night runs only get the validity and determinism checks (the oracle is a full search per night).
    const input = base(c.site, { subjects: c.subjects, startDate: c.date, nights: c.nights, minAltitude: 25 });
    const r = planCampaign(input);
    expect(r.nights).toHaveLength(c.nights);
    r.nights.forEach((n) => assertValid(n, input));
    expect(planCampaign(input)).toEqual(r);
    if (c.subjects.length <= 6 && c.nights <= 5) assertFair(input, r);
  });

  it('eight mixed subjects: nobody who has a usable window ends below a useful share', () => {
    const starved: string[] = [];
    for (const site of SITES) {
      const input = base(site, { subjects: LISTS['mixed, eight'], startDate: DATES[0], nights: 4, minAltitude: 25 });
      const r = planCampaign(input);
      input.subjects.forEach((s, i) => {
        const feasible = r.nights.some((n) => (n.subjects[i]?.usableMin ?? 0) >= 5);
        if (feasible && r.perSubject[i].gotMin < Math.min(MIN_USEFUL_MIN, s.hoursPerNight * 60)) starved.push(`${site.timeZone}:${s.id}`);
      });
    }
    expect(starved).toEqual([]);
  });
});

describe('beam (seven subjects) against the exact oracle', () => {
  it.each(SITES.map((c) => [c.timeZone, c] as const))('%s: each night within 5 min of the best, nobody servable left at 0 after two nights', (_tz, site) => {
    const subjects = [...LISTS['five tiny (synthetic)'].slice(0, 3), ...LISTS['five huge (synthetic)'].slice(0, 4)].map((s) => ({ ...s, hoursPerNight: Math.min(s.hoursPerNight, 2) }));
    const input = base(site, { subjects, startDate: DATES[0], nights: 4, minAltitude: 30 });
    const r = planCampaign(input);
    r.nights.forEach((n) => assertValid(n, input));
    assertFair(input, r);
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
    const count = 3 + Math.floor(r() * 4);
    const subjects: CampaignSubject[] = [];
    for (let i = 0; i < count; i++) {
      const hours = pick([0.5, 1, 1.5, 2, 2.5, 3, 4]);
      if (r() < 0.4) subjects.push({ ...fromCat(pick(catalog), hours), id: `c${i}` });
      else subjects.push(subj(`s${i}`, r() * 24, -55 + r() * 125, hours));
    }
    const zones = r() < 0.5 ? arcToHorizonPoints([{ startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 }]) : null;
    return base(pick(SITES), {
      subjects, horizon: zones, startDate: pick(DATES), nights: 3 + Math.floor(r() * 2), minAltitude: pick([20, 25, 30, 35]),
    });
  };

  it('20 lists: deterministic, valid, within the tolerance of the best total, nobody starved while servable', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const input = make(seed);
      const r = planCampaign(input);
      expect(planCampaign(input)).toEqual(r);
      r.nights.forEach((n) => assertValid(n, input));
      assertFair(input, r);
    }
  }, 240000);
});
