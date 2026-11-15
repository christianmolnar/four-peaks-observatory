import { nextMeridianTransit, targetAltAz } from '../astro';
import type { Site } from '../astro';
import type { ExposureRig } from '../exposure';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { limitAltitudeAt } from '../horizon';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { usefulRangeOf } from './analysis';
import { MIN_SLOT_MIN } from './constants';
import type { CampaignInput, CampaignNight, CampaignSubject } from './types';

/** Test helpers shared by the campaign suites. Not part of the module: nothing imports this but tests. */

export const MIN = 60000;
export const STEP = 5 * MIN;

export const PHX: Site = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
export const POR: Site = { latitude: 45.52, longitude: -122.68, elevationM: 0 };
export const SYD: Site = { latitude: -33.87, longitude: 151.21, elevationM: 0 };

/** The owner's C11 at f/10 with the ASI2600MC Duo, no filter, Bortle 6: what the subjects' useful ranges are worked out for. */
export const TEST_RIG: ExposureRig = { train: { focalRatio: 10, imageScale: 0.277 }, camera: { colour: true, pixelSizeUm: 3.76, readNoiseClass: 'low' }, filter: null };
export const TEST_EXPOSURE = { rig: TEST_RIG, bortle: 6 };

export const subj = (id: string, raHours: number, decDeg: number, over: Partial<CampaignSubject> = {}): CampaignSubject => ({
  id, name: id, targets: [{ id, name: id, raHours, decDeg }], exposure: TEST_EXPOSURE, ...over,
});

export const base = (over: Partial<CampaignInput>): CampaignInput => ({
  subjects: [], site: PHX, timeZone: 'America/Phoenix', horizon: null, minAltitude: 25, startDate: '2026-12-10', nights: 1, ...over,
});

export const usableAt = (s: CampaignSubject, input: CampaignInput, t: number): boolean => {
  const a = s.aim ?? s.targets[0];
  const p = targetAltAz(a.raHours, a.decDeg, new Date(t), input.site);
  return p.altitude >= limitAltitudeAt(input.horizon, p.azimuth, input.minAltitude) - 1e-6;
};

/** Every slot is usable at each 5-minute sample and at its end, flips exactly when the transit is inside, starts on the grid, stays in the night, and slots keep the slew gap. */
export function assertValidNight(night: CampaignNight, input: CampaignInput): void {
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
    expect(slot.integrationMin % 5).toBe(0);
    expect((slot.start.getTime() - (night.start as Date).getTime()) % STEP).toBe(0);
    expect(slot.start.getTime()).toBeGreaterThanOrEqual((night.start as Date).getTime());
    expect(slot.end.getTime()).toBeLessThanOrEqual((night.end as Date).getTime());
  }
  for (let i = 1; i < night.slots.length; i++) {
    expect(night.slots[i].start.getTime() - night.slots[i - 1].end.getTime()).toBeGreaterThanOrEqual(SLEW_CENTER_MIN * MIN);
  }
  expect(new Set(night.slots.map((s) => s.subjectId)).size).toBe(night.slots.length);
}

const SCALE = 1e5;
const PRIO = 1024;

/**
 * What a night's plan is worth, as one number that orders plans like the engine's rule: targets made useful, then those by
 * list order (earlier outweighs all later), then minutes placed. Written from the brief, not from the engine.
 */
export function worthOf(night: CampaignNight, input: CampaignInput, got: readonly number[]): number {
  const n = input.subjects.length;
  let v = 0;
  input.subjects.forEach((s, i) => {
    const o = night.outcomes[i];
    const reach = got[i] < usefulRangeOf(s).minMin && o.gotMin > 0 ? 1 : 0;
    v += (reach * PRIO + reach * 2 ** (n - 1 - i)) * SCALE + o.gotMin;
  });
  return v;
}

/** Exact oracle for one night: the best `worthOf` over all valid plans (each target at most one slot; first useful slot at least the rest of its minUseful). */
export function bestWorth(night: CampaignNight, input: CampaignInput, got: readonly number[]): number {
  const t0 = (night.start as Date).getTime();
  const t1 = (night.end as Date).getTime();
  const steps = Math.floor((t1 - t0) / STEP);
  const n = input.subjects.length;
  const opts: { subject: number; end: number; gain: number }[][] = Array.from({ length: steps + 2 }, () => []);
  input.subjects.forEach((s, i) => {
    const { minMin, maxMin } = usefulRangeOf(s);
    if (got[i] >= maxMin) return;
    const cap = s.hoursPerNight === undefined ? Infinity : s.hoursPerNight * 60;
    const needs = got[i] < minMin;
    const lo = needs ? minMin - got[i] : Math.min(MIN_SLOT_MIN, Math.min(maxMin - got[i], cap));
    const hi = needs ? Math.min(maxMin - got[i], Math.max(cap, lo)) : Math.min(maxMin - got[i], cap);
    const a = s.aim ?? s.targets[0];
    const transit = nextMeridianTransit(a.raHours, a.decDeg, night.start as Date, input.site).getTime();
    const ok: boolean[] = [];
    for (let k = 0; k <= steps; k++) ok.push(usableAt(s, input, t0 + k * STEP));
    for (let k = 0; k <= steps; k++) {
      if (!ok[k]) continue;
      for (let ell = lo; ell <= hi; ell += 5) {
        const st = t0 + k * STEP;
        const flip = transit > st && transit < st + ell * MIN;
        const len = ell + (flip ? MERIDIAN_FLIP_MIN : 0);
        const end = k + len / 5;
        if (st + len * MIN > t1 || end > steps) break;
        let all = true;
        for (let j = k; j <= end && all; j++) all = ok[j];
        if (all) opts[k].push({ subject: i, end, gain: ((needs ? PRIO + 2 ** (n - 1 - i) : 0)) * SCALE + ell });
      }
    }
  });
  const masks = 1 << n;
  const f: Float64Array[] = Array.from({ length: steps + 2 }, () => new Float64Array(masks).fill(-1));
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
        if (f[tt][m2] < v + o.gain) f[tt][m2] = v + o.gain;
      }
    }
  }
  return Math.max(...f[steps + 1]);
}

/** Number of targets that went from below to at or above their minUseful tonight. */
export const reachedTonight = (night: CampaignNight, input: CampaignInput, got: readonly number[]): number =>
  input.subjects.filter((s, i) => got[i] < usefulRangeOf(s).minMin && night.outcomes[i].gotMin > 0).length;
