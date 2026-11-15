import { nextMeridianTransit, targetAltAz } from '../astro';
import { exposureFor } from '../exposure';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { usableWindows } from '../horizon';
import type { TimeWindow } from '../horizon';
import { clockToInstant } from '../itinerary/timeline';
import { parseLocalDate, tonightsNight } from '../plan';
import type { UsefulRange } from './constants';
import type { CampaignInput, CampaignSubject, ShortReason, SubjectNight } from './types';

export const GRID_MIN = 5;
export const GRID_MS = GRID_MIN * 60000;
export const MAX_NIGHTS = 14;
export { MERIDIAN_FLIP_MIN };

const roundUp5 = (m: number): number => Math.ceil(m / GRID_MIN - 1e-9) * GRID_MIN;

/** One whole dark night with no Moon and room for the whole plan: the range is about the object, not about one night's window. */
const OPEN_NIGHT = { moonIllumination: 0, moonSeparationDeg: 180, moonUp: false, usableMinutes: 24 * 60, acquisitionStart: null, transitTime: null } as const;

/** The exposure engine's answer per subject object, kept so the schedule's many lookups run it once. */
const engineRanges = new WeakMap<CampaignSubject, UsefulRange>();

/**
 * The target's useful range: its own override, else the exposure engine's. The least is the light Quick stops at, the most the
 * light Deep stops at (`exposureFor`, so the same numbers as the exposure panel), each rounded up to the 5 minute grid. A subject with
 * neither an override nor an `exposure` to work from is an error: there is no fixed table to fall back on.
 */
export function usefulRangeOf(s: CampaignSubject): UsefulRange {
  if (s.useful) return s.useful;
  const known = engineRanges.get(s);
  if (known) return known;
  if (!s.exposure) throw new RangeError(`Subject ${s.id}: no useful range and no exposure (rig and Bortle) to work one out from`);
  const target = {
    id: s.id,
    name: s.name,
    ...(s.type === undefined ? {} : { type: s.type }),
    ...(s.surfaceBrightnessMu === undefined ? {} : { surfaceBrightnessMu: s.surfaceBrightnessMu }),
    ...(s.surfaceBrightness === undefined ? {} : { surfaceBrightness: s.surfaceBrightness }),
  };
  const stop = (preset: 'quick' | 'deep'): number => {
    const r = exposureFor(target, s.exposure!.rig, { bortle: s.exposure!.bortle }, OPEN_NIGHT, { preset });
    if (!r.ok) throw new RangeError(`Subject ${s.id}: the exposure needs ${r.missing.join(', ')}`);
    return roundUp5(r.integrationMin);
  };
  const minMin = stop('quick');
  const range = { minMin, maxMin: Math.max(minMin, stop('deep')) };
  engineRanges.set(s, range);
  return range;
}

export const aimOf = (s: CampaignSubject): { raHours: number; decDeg: number } => s.aim ?? s.targets[0];

export function validateInput(input: CampaignInput): void {
  if (!Number.isInteger(input.nights) || input.nights < 1 || input.nights > MAX_NIGHTS) {
    throw new RangeError(`nights must be a whole number from 1 to ${MAX_NIGHTS}: ${input.nights}`);
  }
  if (!Number.isFinite(input.minAltitude) || input.minAltitude < 0 || input.minAltitude >= 90) {
    throw new RangeError(`minAltitude must be from 0 up to (not including) 90 degrees: ${input.minAltitude}`);
  }
  parseLocalDate(input.startDate);
  const seen = new Set<string>();
  for (const s of [...input.subjects, ...(input.candidates ?? [])]) {
    if (seen.has(s.id)) throw new RangeError(`Duplicate subject id: ${s.id}`);
    seen.add(s.id);
    if (s.targets.length === 0) throw new RangeError(`Subject ${s.id} has no target`);
    if (s.targets.length > 1 && !s.aim) throw new RangeError(`Subject ${s.id} frames ${s.targets.length} targets together and needs an aim point`);
    if (s.hoursPerNight !== undefined) {
      const m = s.hoursPerNight * 60;
      if (!Number.isFinite(m) || m <= 0 || m % GRID_MIN !== 0) {
        throw new RangeError(`Subject ${s.id}: hoursPerNight must be positive and a multiple of ${GRID_MIN} minutes: ${s.hoursPerNight}`);
      }
    }
    // A caller that only reads windows (the AI facts) gives neither a range nor an exposure; the schedule asks for one and throws if it is missing.
    const { minMin, maxMin } = s.useful || s.exposure ? usefulRangeOf(s) : { minMin: GRID_MIN, maxMin: GRID_MIN };
    if (!Number.isFinite(minMin) || !Number.isFinite(maxMin) || minMin <= 0 || minMin > maxMin || minMin % GRID_MIN !== 0 || maxMin % GRID_MIN !== 0) {
      throw new RangeError(`Subject ${s.id}: the useful range must be positive multiples of ${GRID_MIN} minutes with min <= max: ${minMin} to ${maxMin}`);
    }
    if (s.value !== undefined && !(Number.isFinite(s.value) && s.value > 0)) {
      throw new RangeError(`Subject ${s.id}: value must be a positive number: ${s.value}`);
    }
  }
}

/** YYYY-MM-DD, `offset` days after `date` (calendar arithmetic, no time zone involved). */
export function addDays(date: string, offset: number): string {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

export interface NightBounds {
  date: string;
  /** Usable part of the night; null when there is none. */
  start: Date | null;
  end: Date | null;
  /** Why there is none. */
  reason: ShortReason | null;
}

export function nightBounds(input: CampaignInput, index: number): NightBounds {
  const date = addDays(input.startDate, index);
  const night = tonightsNight(input.site, date, input.timeZone);
  if (night.kind === 'polar-night') {
    return { date, start: null, end: null, reason: { code: 'polar-night', text: `Polar night on ${date}: the Sun stays below -18 degrees all day, so there is no dusk or dawn to plan around. The campaign planner does not plan 24 hour nights.` } };
  }
  if (night.kind !== 'normal' || !night.start || !night.end) {
    return { date, start: null, end: null, reason: { code: 'no-astronomical-night', text: `No astronomical night on ${date}.` } };
  }
  let start = night.start;
  if (input.startTime) {
    const at = clockToInstant(input.startTime, night.start, input.timeZone);
    if (at.getTime() > start.getTime()) start = at;
  }
  if (start.getTime() >= night.end.getTime()) {
    return { date, start: null, end: null, reason: { code: 'start-after-dawn', text: `The start time ${input.startTime} is after astronomical dawn on ${date}.` } };
  }
  return { date, start, end: night.end, reason: null };
}

/** True when a slot of `lengthMin` minutes starting at `start` has the transit strictly inside it (before it, or after it, is a clean side). */
export function slotCrossesMeridian(transit: Date | null, start: Date, lengthMin: number): boolean {
  if (!transit) return false;
  const t = transit.getTime();
  const s = start.getTime();
  return t > s && t < s + lengthMin * 60000;
}

const minutes = (w: TimeWindow): number => (w.end.getTime() - w.start.getTime()) / 60000;

/** What the engine knows about one subject on one night: windows, transit, grid altitudes. */
export interface SubjectGrid extends SubjectNight {
  subject: CampaignSubject;
  /** Altitude at gridStart + k * 5 min. */
  alt: number[];
  /** Why there are no windows, when there are none. */
  noWindowReason: ShortReason | null;
}

export function analyseSubject(input: CampaignInput, subject: CampaignSubject, start: Date, end: Date): SubjectGrid {
  const { raHours, decDeg } = aimOf(subject);
  const windows = usableWindows({ raHours, decDeg, site: input.site, horizon: input.horizon, minAltitude: input.minAltitude, start, end, stepMinutes: GRID_MIN }).windows;
  const t = nextMeridianTransit(raHours, decDeg, start, input.site);
  const transit = t.getTime() <= end.getTime() ? t : null;
  const n = Math.floor((end.getTime() - start.getTime()) / GRID_MS);
  const alt: number[] = [];
  for (let k = 0; k <= n; k++) alt.push(targetAltAz(raHours, decDeg, new Date(start.getTime() + k * GRID_MS), input.site).altitude);

  let noWindowReason: ShortReason | null = null;
  if (windows.length === 0) {
    const clear = usableWindows({ raHours, decDeg, site: input.site, horizon: null, minAltitude: input.minAltitude, start, end, stepMinutes: GRID_MIN }).windows;
    noWindowReason = clear.length === 0
      ? { code: 'below-min-altitude', text: `${subject.name} stays under ${input.minAltitude} degrees all night (highest ${Math.max(...alt).toFixed(1)}).` }
      : { code: 'blocked-by-horizon', text: `${subject.name} is above ${input.minAltitude} degrees only while it is behind a blocked zone.` };
  }

  // Same start grid and rules as the scheduler: a flip is unavoidable when no clean slot of the minUseful length fits but a straddling one (flip included) does.
  // Needs the useful range. A caller that only reads windows and transit (the AI facts) has no range and no exposure: it gets false, and
  // nothing there reads it. The scheduler never gets here without one: it asks `usefulRangeOf` first, which throws.
  const lengthMin = subject.useful || subject.exposure ? usefulRangeOf(subject).minMin : null;
  const spans = windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  const t0 = start.getTime();
  const fits = (flip: boolean): boolean => {
    if (lengthMin === null) return false;
    const dur = (lengthMin + (flip ? MERIDIAN_FLIP_MIN : 0)) * 60000;
    for (let s = t0; s + dur <= end.getTime(); s += GRID_MS) {
      if (spans.some((w) => s >= w.s && s + dur <= w.e) && slotCrossesMeridian(transit, new Date(s), lengthMin) === flip) return true;
    }
    return false;
  };
  const unavoidableFlip = lengthMin !== null && transit !== null && !fits(false) && fits(true);
  return { subjectId: subject.id, subject, windows, usableMin: windows.reduce((a, w) => a + minutes(w), 0), transit, unavoidableFlip, alt, noWindowReason };
}
