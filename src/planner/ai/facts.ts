import { bodyAltAz, moonIllumination, moonSeparation, nextMeridianTransit, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { analyseSubject, nightBounds, validateInput } from '../campaign/analysis';
import type { CampaignInput } from '../campaign/types';
import { limitAltitudeAt } from '../horizon';
import type { HorizonPoint } from '../horizon';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { isoOf } from './instant';

export const FACTS_STEP_MIN = 15;
export const MAX_TARGETS = 12;

/** What the catalog knows about an object. Absent for a target that is not in it. */
export interface ObjectInfo {
  type: string;
  sizeArcmin?: { major: number; minor: number };
  /** The bright core would clip in long subs. */
  brightCore?: boolean;
}

export interface AiTarget {
  id: string;
  /** A label from user data; the prompt tells the model it is never an instruction. */
  name: string;
  raHours: number;
  decDeg: number;
  info?: ObjectInfo;
}

/** The imaging rig, from the profile; every field is optional (absent: unknown). */
export interface RigInfo {
  focalLengthMm?: number;
  apertureMm?: number;
  pixelSizeUm?: number;
  camera?: string;
  colourCamera?: boolean;
  filter?: string;
  filterKind?: string;
}

export interface AiPlanInput {
  targets: AiTarget[];
  site: Site;
  /** IANA zone: which civil date "the night of" means and what every "HH:MM" is read in. */
  timeZone: string;
  /** Null or empty: nothing is blocked. */
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** YYYY-MM-DD of the evening the night starts. */
  date: string;
  /** "HH:MM" local; never before dusk. */
  startTime?: string;
  rig?: RigInfo;
  /** Bortle class 1 to 9 of the site's sky. */
  bortle?: number;
}

/** ok: usable. low: under the minimum altitude. blocked: over the minimum but under the horizon zone. */
export type SkyFlag = 'ok' | 'low' | 'blocked';

export function classifySky(altitude: number, azimuth: number, horizon: readonly HorizonPoint[] | null, minAltitude: number): SkyFlag {
  if (altitude < minAltitude) return 'low';
  return altitude < limitAltitudeAt(horizon, azimuth, minAltitude) ? 'blocked' : 'ok';
}

export interface TargetFacts {
  id: string;
  name: string;
  /** What the catalog knows about the object; absent when it is not in the catalog. */
  object?: ObjectInfo;
  /** Usable spans (above the minimum altitude and outside blocked zones) as ISO local instants with offset, from a 5 minute scan, rounded inward to whole minutes. The check works every minute and may reject a slot inside a window. */
  windows: [string, string][];
  /** Meridian transit to the whole minute (ISO local instant with offset), or null when it is outside the night. A flip happens here; the check uses the same minute. */
  transit: string | null;
  /** One row per entry of `sampleTimes`: [altitude deg, azimuth deg, flag, moon separation deg]. */
  samples: [number, number, SkyFlag, number][];
}

export interface NightFacts {
  date: string;
  timeZone: string;
  /** Usable night, whole minutes rounded inward, ISO local instants with offset. */
  night: { start: string; end: string; minutes: number };
  minAltitudeDeg: number;
  /** Least gap between one slot's end and the next slot's start. */
  slewMin: number;
  /** Every FACTS_STEP_MIN from `night.start`, then `night.end` (ISO local instants with offset). */
  sampleTimes: string[];
  /** The rig and sky; absent when the caller gave none. */
  rig?: RigInfo;
  bortle?: number;
  moon: { illuminationPct: number; altitudeDeg: number[] };
  targets: TargetFacts[];
}

export interface Night {
  start: Date;
  end: Date;
}

export class NoNightError extends Error {}

const MIN = 60000;
const ceilMinute = (d: Date): Date => new Date(Math.ceil(d.getTime() / MIN) * MIN);
const floorMinute = (d: Date): Date => new Date(Math.floor(d.getTime() / MIN) * MIN);
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** The meridian transit after the night starts, to the nearest whole minute. Facts print it and the check tests slots against it, so both agree. */
export function transitMinute(t: AiTarget, night: Night, site: Site): Date {
  return new Date(Math.round(nextMeridianTransit(t.raHours, t.decDeg, night.start, site).getTime() / MIN) * MIN);
}

export function campaignInputOf(input: AiPlanInput): CampaignInput {
  return {
    subjects: input.targets.map((t) => ({ id: t.id, name: t.name, targets: [t] })),
    site: input.site,
    timeZone: input.timeZone,
    horizon: input.horizon,
    minAltitude: input.minAltitude,
    startDate: input.date,
    nights: 1,
    startTime: input.startTime,
  };
}

/** The usable night of the input's date. Throws NoNightError with the reason when there is none. */
export function nightOf(input: AiPlanInput): Night {
  const ci = campaignInputOf(input);
  validateInput(ci);
  const b = nightBounds(ci, 0);
  if (!b.start || !b.end) throw new NoNightError(b.reason?.text ?? `No usable night on ${input.date}.`);
  return { start: b.start, end: b.end };
}

/** Facts only: what the sky does tonight for each target. No judgment, no ranking. */
export function buildFacts(input: AiPlanInput): { facts: NightFacts; night: Night } {
  const night = nightOf(input);
  const ci = campaignInputOf(input);
  const tz = input.timeZone;
  const clock = (d: Date): string => isoOf(d, tz);

  // Whole minutes inside the night, so every printed time is one the check accepts.
  const first = ceilMinute(night.start);
  const last = floorMinute(night.end);
  const times: Date[] = [];
  for (let t = first.getTime(); t < last.getTime() - MIN; t += FACTS_STEP_MIN * MIN) times.push(new Date(t));
  times.push(last);
  const mid = new Date((night.start.getTime() + night.end.getTime()) / 2);

  const targets = ci.subjects.map((subject, i): TargetFacts => {
    const t = input.targets[i];
    const g = analyseSubject(ci, subject, night.start, night.end);
    const windows: [string, string][] = [];
    for (const w of g.windows) {
      const s = ceilMinute(w.start);
      const e = floorMinute(w.end);
      if (e.getTime() > s.getTime()) windows.push([clock(s), clock(e)]);
    }
    const transit = transitMinute(t, night, input.site);
    return {
      id: t.id,
      name: t.name,
      ...(t.info ? { object: t.info } : {}),
      windows,
      transit: transit.getTime() >= first.getTime() && transit.getTime() <= last.getTime() ? clock(transit) : null,
      samples: times.map((d): [number, number, SkyFlag, number] => {
        const p = targetAltAz(t.raHours, t.decDeg, d, input.site);
        return [r1(p.altitude), r1(p.azimuth), classifySky(p.altitude, p.azimuth, input.horizon, input.minAltitude), r1(moonSeparation(t.raHours, t.decDeg, d, input.site))];
      }),
    };
  });

  const facts: NightFacts = {
    date: input.date,
    timeZone: tz,
    night: { start: clock(first), end: clock(last), minutes: Math.floor((last.getTime() - first.getTime()) / MIN) },
    minAltitudeDeg: input.minAltitude,
    slewMin: SLEW_CENTER_MIN,
    sampleTimes: times.map(clock),
    ...(input.rig ? { rig: input.rig } : {}),
    ...(input.bortle !== undefined ? { bortle: input.bortle } : {}),
    moon: { illuminationPct: Math.round(moonIllumination(mid) * 100), altitudeDeg: times.map((d) => r1(bodyAltAz('Moon', d, input.site).altitude)) },
    targets,
  };
  return { facts, night };
}
