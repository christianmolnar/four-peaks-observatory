import { astronomicalNight, bodyAltAz, moonIllumination, targetAltAz } from '../astro';
import type { AltAz, AstronomicalNight, PlanetName, Site } from '../astro';
import type { CardBody } from '../astro/bodies';
import { limitAltitudeAt, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint, TimeWindow } from '../horizon';
import { opticalTrain, targetFitsFrame } from '../optics';
import type { OpticalTrain } from '../optics';
import { resolveTrain } from '../profile';
import type { Profile, TrainEntry } from '../profile';
import { brightnessScore } from './brightness';
import { createNightSky, skyPoint } from './sky';
import type { NightSky } from './sky';

export const PLANETS: readonly Exclude<PlanetName, 'Pluto'>[] = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

/** Where a target is: a fixed J2000 position or a planet from the ephemeris. */
export type TargetSource =
  | { kind: 'fixed'; raHours: number; decDeg: number }
  | { kind: 'planet'; body: CardBody };

/** What the plan needs to know about the imaging train. Smart scopes have no optics math. */
export interface PlanTrain {
  kind: 'optical' | 'smart';
  name: string;
  /** Null for smart scopes: fit is not computed. */
  optics: OpticalTrain | null;
}

/** Builds the plan's view of a train from the profile. Throws on an unresolved id. */
export function planTrainFor(profile: Profile, train: TrainEntry): PlanTrain {
  if (train.kind === 'smart') return { kind: 'smart', name: train.name, optics: null };
  const r = resolveTrain(profile, train);
  return { kind: 'optical', name: train.name, optics: opticalTrain(r.scope, r.camera, r.accessory) };
}

export type Fit = 'fits' | 'too-large' | 'unknown' | 'not-applicable';

export interface ScoreParts {
  /** 0 to 50: usable hours, full marks at 4 h. */
  usable: number;
  /** 0 to 30: peak altitude, nothing at 30 deg or below, full marks at 80 deg. */
  altitude: number;
  /** 0 or 10: the date's month is in the target's season. */
  season: number;
  /** 0 to -20: lit Moon fraction times closeness, only while the Moon is up. */
  moon: number;
  /** 0 or -25: the target does not fit the train's frame. */
  fit: number;
  /** -10 to +10 against the object's own class (galaxy, cluster, nebula, planetary nebula, other); 0 when it has no photometry. */
  brightness: number;
  /** -25 to +10 from the share of the frame it fills: best from 20 to 70 percent, worst at the 3 percent floor; 0 when unknown. */
  framing: number;
  /** Sum of the parts, clamped to 0..100; 0 when there is no usable window. */
  total: number;
}

export interface PlanEntry {
  id: string;
  name: string;
  /** Catalog type, or 'planet'. */
  type: string;
  isPlanet: boolean;
  source: TargetSource;
  windows: TimeWindow[];
  usableMinutes: number;
  /** Highest altitude while usable (if ever usable), else the highest in the night. */
  peakAltitude: number;
  peakAzimuth: number;
  peakTime: Date;
  /** Illuminated fraction 0..1 at the night's midpoint. */
  moonIllumination: number;
  /** Degrees from the Moon at the peak time. */
  moonSeparation: number;
  moonUp: boolean;
  /** Null for planets, which have no fixed season. */
  inSeason: boolean | null;
  seasonMonths: number[];
  fit: Fit;
  /** Target size and field of view, arcminutes, when both are known. */
  fitDetail: string;
  /** Major axis over the long side of the field, percent; null for planets, smart scopes and unknown sizes or fields. */
  percentOfFrame: number | null;
  /** V magnitude from the catalog, else null. */
  magnitude: number | null;
  /** Mag per square arcsecond from the catalog, else null. `sbComputed`: it was worked out from magnitude and size, not measured. */
  surfaceBrightness: number | null;
  sbComputed: boolean;
  score: ScoreParts;
  /** Plain sentence built from the numbers above. */
  why: string;
}

export interface TonightPlan {
  night: AstronomicalNight;
  /** False when no horizon was supplied: only the flat minimum altitude applies. */
  horizonSet: boolean;
  minAltitude: number;
  entries: PlanEntry[];
}

/** What the plan reads of a target: a curated target and a catalog search target both fit. */
export interface PlanTarget {
  id: string;
  name: string;
  /** The label to show when it differs from the catalog name; `name` otherwise. */
  displayName?: string;
  type: string;
  raHours: number;
  decDeg: number;
  sizeArcmin?: { major: number; minor: number };
  /** Curated only; absent means the season is not known, which is neither in nor out of season. */
  seasonMonths?: readonly number[];
  mag?: number;
  surfaceBrightness?: number;
  sbComputed?: true;
}

export interface TonightInput {
  site: Site;
  /** Horizon points, or null/empty when the horizon is not set. */
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** Local calendar date of the evening, YYYY-MM-DD. */
  date: string;
  /** The site's IANA time zone; absent: the date is read at the site's mean solar time. */
  timeZone?: string;
  train: PlanTrain;
  targets: readonly PlanTarget[];
  includePlanets?: boolean;
  stepMinutes?: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD; throws on anything that is not a real calendar date. */
export function parseLocalDate(date: string): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new RangeError(`Date must be YYYY-MM-DD: ${date}`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new RangeError(`Not a calendar date: ${date}`);
  }
  return { year, month, day };
}

/**
 * Instant of local mean solar noon on `date` at the site's longitude: a
 * daytime reference for `astronomicalNight` that needs no time zone.
 */
export function solarNoon(date: string, longitude: number): Date {
  const { year, month, day } = parseLocalDate(date);
  return new Date(Date.UTC(year, month - 1, day, 12) - (longitude / 15) * 3600000);
}

/** Milliseconds the IANA zone `timeZone` is ahead of UTC at instant `at`. */
export function zoneOffsetMs(at: Date, timeZone: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(at).map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Instant of 12:00 civil time on `date` in the IANA zone `timeZone`. */
export function civilNoon(date: string, timeZone: string): Date {
  const { year, month, day } = parseLocalDate(date);
  const wall = Date.UTC(year, month - 1, day, 12);
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

/**
 * The astronomical night that starts on the evening of `date`. With the
 * site's IANA `timeZone`, "evening of date" is that civil date there (so a
 * site across the date line from its longitude gets the right night);
 * without one it is the date at the site's mean solar time.
 */
export function tonightsNight(site: Site, date: string, timeZone?: string): AstronomicalNight {
  return astronomicalNight(site, timeZone ? civilNoon(date, timeZone) : solarNoon(date, site.longitude));
}

/** Alt/az of a target source (a fixed target or a body) at an instant. */
export function altAzOf(source: TargetSource, site: Site, when: Date): AltAz {
  return source.kind === 'fixed'
    ? targetAltAz(source.raHours, source.decDeg, when, site)
    : bodyAltAz(source.body, when, site);
}

/** One point of a target's altitude through a span, with the limit that applies at its azimuth. */
export interface TrackPoint {
  time: Date;
  altitude: number;
  azimuth: number;
  limit: number;
}

/** Samples a target's altitude, azimuth and limit from `start` to `end` inclusive. */
export function altitudeTrack(
  source: TargetSource,
  site: Site,
  horizon: readonly HorizonPoint[] | null,
  minAltitude: number,
  start: Date,
  end: Date,
  stepMinutes = 10,
): TrackPoint[] {
  if (!(stepMinutes > 0)) throw new RangeError('stepMinutes must be positive');
  const t0 = start.getTime();
  const t1 = end.getTime();
  if (!(t1 > t0)) throw new RangeError('end must be after start');
  const out: TrackPoint[] = [];
  const step = stepMinutes * 60000;
  for (let t = t0; ; t += step) {
    const tt = Math.min(t, t1);
    const time = new Date(tt);
    const p = altAzOf(source, site, time);
    out.push({
      time,
      altitude: p.altitude,
      azimuth: p.azimuth,
      limit: limitAltitudeAt(horizon, p.azimuth, minAltitude),
    });
    if (tt >= t1) break;
  }
  return out;
}

/** Angle in degrees between two alt/az directions. */
export function angularSeparation(a: AltAz, b: AltAz): number {
  const rad = Math.PI / 180;
  const c =
    Math.sin(a.altitude * rad) * Math.sin(b.altitude * rad) +
    Math.cos(a.altitude * rad) * Math.cos(b.altitude * rad) * Math.cos((a.azimuth - b.azimuth) * rad);
  return Math.acos(Math.min(1, Math.max(-1, c))) / rad;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct to Feb" for a set of months, treating the year as a circle; "" when empty. */
export function seasonLabel(months: readonly number[]): string {
  if (months.length === 0) return '';
  if (months.length >= 12) return 'All year';
  const set = new Set(months);
  // The run starts at a month whose predecessor is absent.
  const first = [...set].find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? [...set][0];
  let last = first;
  while (set.has(last === 12 ? 1 : last + 1) && (last === 12 ? 1 : last + 1) !== first) {
    last = last === 12 ? 1 : last + 1;
  }
  const runLength = ((last - first + 12) % 12) + 1;
  if (runLength !== set.size) return [...set].sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]).join(', ');
  return first === last ? MONTH_NAMES[first - 1] : `${MONTH_NAMES[first - 1]} to ${MONTH_NAMES[last - 1]}`;
}

const fmt = (n: number, digits = 0): string => n.toFixed(digits);

/** Compass name for an azimuth in degrees. */
export function compass(az: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round((((az % 360) + 360) % 360) / 45) % 8];
}

/** Plain words for an entry's fit, for the page and the CSV. */
export function fitLabel(e: Pick<PlanEntry, 'fit' | 'isPlanet'>): string {
  switch (e.fit) {
    case 'fits':
      return 'Fits';
    case 'too-large':
      return 'Too large';
    case 'unknown':
      return 'Fit unknown';
    default:
      return e.isPlanet ? 'Planet' : 'Smart scope';
  }
}

const SCORE_PARTS = ['usable', 'altitude', 'season', 'moon', 'fit', 'brightness', 'framing'] as const;

function scoreOf(parts: Omit<ScoreParts, 'total'>, usable: boolean): ScoreParts {
  const sum = SCORE_PARTS.reduce((s, k) => s + parts[k], 0);
  return { ...parts, total: usable ? Math.max(0, Math.min(100, Math.round(sum))) : 0 };
}

/** The train's field of view along its long side, arcminutes; null for a smart scope or an unknown field. */
export function longFovArcmin(train: PlanTrain): number | null {
  const o = train.optics;
  if (train.kind === 'smart' || o === null || o.fovWidthArcmin === undefined || o.fovHeightArcmin === undefined) return null;
  return Math.max(o.fovWidthArcmin, o.fovHeightArcmin);
}

/** Major axis over the long side of the field, percent; null when either is unknown. */
export function percentOfFrame(train: PlanTrain, target: Pick<PlanTarget, 'sizeArcmin'>): number | null {
  const fov = longFovArcmin(train);
  return fov === null || !target.sizeArcmin ? null : (target.sizeArcmin.major / fov) * 100;
}

/** Whether and how a target fits the train's frame, with the sentence for it. */
export function fitOf(train: PlanTrain, target: PlanTarget): { fit: Fit; detail: string } {
  if (train.kind === 'smart') return { fit: 'not-applicable', detail: 'Smart scope: field of view not computed' };
  const o = train.optics as OpticalTrain;
  if (o.fovWidthArcmin === undefined || o.fovHeightArcmin === undefined) {
    return { fit: 'unknown', detail: `Field of view unknown (missing ${o.missing.join(', ')})` };
  }
  const fov = `${fmt(o.fovWidthArcmin, 1)} x ${fmt(o.fovHeightArcmin, 1)} arcmin`;
  if (!target.sizeArcmin) return { fit: 'unknown', detail: `Target size unknown; field ${fov}` };
  const size = `${fmt(target.sizeArcmin.major, 1)} x ${fmt(target.sizeArcmin.minor, 1)} arcmin`;
  const ok = targetFitsFrame(o, { widthArcmin: target.sizeArcmin.major, heightArcmin: target.sizeArcmin.minor });
  return ok
    ? { fit: 'fits', detail: `Target ${size} fits the ${fov} field` }
    : { fit: 'too-large', detail: `Target ${size} does not fit the ${fov} field` };
}

export { brightnessScore } from './brightness';

/**
 * -25 to +10 from the share of the frame's long side the target fills: +10 from 20 to 70 percent, falling in a
 * straight line to -25 at the 3 percent floor, and to 0 at 100 percent (one that is over the frame also takes the
 * too-large penalty). 0 when the share is unknown (a smart scope, no size, no field).
 */
export function framingScore(percent: number | null): number {
  if (percent === null) return 0;
  if (percent < FRAME_BEST_FROM) return -25 + ((percent - 3) / (FRAME_BEST_FROM - 3)) * 35;
  if (percent <= FRAME_BEST_TO) return 10;
  return Math.max(0, ((100 - percent) / (100 - FRAME_BEST_TO)) * 10);
}
const FRAME_BEST_FROM = 20;
const FRAME_BEST_TO = 70;

function describe(e: Omit<PlanEntry, 'why'>, horizonSet: boolean, minAltitude: number): string {
  const text = describeSky(e, horizonSet, minAltitude);
  return e.fit === 'too-large' ? `Does not fit this setup. ${text}` : text;
}

/** One or two short sentences: the decision facts only (horizon, season, fit, brightness, Moon). Peak, window and Moon numbers are shown beside it. */
function describeSky(e: Omit<PlanEntry, 'why'>, horizonSet: boolean, minAltitude: number): string {
  const limit = horizonSet ? 'the horizon and minimum altitude' : `the flat ${minAltitude} deg minimum (horizon not set)`;
  if (e.usableMinutes <= 0) {
    return `Never clears ${limit}; it peaks at ${fmt(e.peakAltitude)} deg in the ${compass(e.peakAzimuth)}.`;
  }
  const first = `Clear of ${limit} for ${fmt(e.usableMinutes / 60, 1)} h.`;
  const notes: string[] = [];
  if (e.isPlanet) notes.push('planet');
  if (e.inSeason === true) notes.push('in season');
  if (e.inSeason === false) notes.push('out of season');
  if (e.fit === 'fits') notes.push(e.percentOfFrame === null ? 'fits the frame' : `fits the frame (${fmt(e.percentOfFrame)}%)`);
  if (e.fit === 'unknown') notes.push('fit unknown');
  if (e.surfaceBrightness !== null) notes.push(`SB ${fmt(e.surfaceBrightness, 1)}${e.sbComputed ? ' (computed)' : ''}`);
  else if (e.magnitude !== null) notes.push(`mag ${fmt(e.magnitude, 1)}`);
  notes.push(e.moonUp ? 'Moon up at the peak' : 'Moon down at the peak');
  const second = notes.join(', ');
  return `${first} ${second.charAt(0).toUpperCase()}${second.slice(1)}.`;
}

/** Everything one night's scoring shares across targets: built once, then each target is evaluated against it. */
export interface NightContext {
  night: AstronomicalNight & { kind: 'normal' };
  site: Site;
  horizon: readonly HorizonPoint[] | null;
  horizonSet: boolean;
  minAltitude: number;
  month: number;
  start: Date;
  end: Date;
  stepMinutes: number;
  /** Illuminated fraction 0..1 at the night's midpoint. */
  illumination: number;
  train: PlanTrain;
  sky: NightSky;
}

/** The night's context, or the non-normal night itself (polar day or night) when there is nothing to plan. */
export function nightContext(input: Omit<TonightInput, 'targets' | 'includePlanets'>): NightContext | { night: AstronomicalNight; horizonSet: boolean } {
  const { site, minAltitude, train } = input;
  const horizon = input.horizon && input.horizon.length > 0 ? input.horizon : null;
  const horizonSet = horizon !== null;
  const month = parseLocalDate(input.date).month;
  const night = tonightsNight(site, input.date, input.timeZone);
  if (night.kind !== 'normal') return { night, horizonSet };
  const start = night.start as Date;
  const end = night.end as Date;
  const stepMinutes = input.stepMinutes ?? 5;
  return {
    night: night as NightContext['night'],
    site,
    horizon,
    horizonSet,
    minAltitude,
    month,
    start,
    end,
    stepMinutes,
    illumination: moonIllumination(new Date((start.getTime() + end.getTime()) / 2)),
    train,
    sky: createNightSky(site, start, end, stepMinutes),
  };
}

/** What the sampling of one target found: the usable windows and the sample where it peaks. */
interface Sampled {
  windows: TimeWindow[];
  peakAltitude: number;
  peakAzimuth: number;
  /** Index of the peak sample in `ctx.sky.times`. */
  peakIndex: number;
  /** Degrees from the Moon at the peak. */
  moonSeparation: number;
}

function sampleFixed(ctx: NightContext, raHours: number, decDeg: number): Sampled {
  const { sky, horizon, minAltitude } = ctx;
  const p = skyPoint(raHours, decDeg);
  const n = sky.times.length;
  const alts = new Float64Array(n);
  const azs = new Float64Array(n);
  sky.fill(p, alts, azs);
  // Peak: highest sample while usable, else highest of the night; the first of equals.
  let usable = -1;
  let usableAlt = -Infinity;
  let any = -1;
  let anyAlt = -Infinity;
  for (let k = 0; k < n; k++) {
    const alt = alts[k];
    if (alt > anyAlt) { any = k; anyAlt = alt; }
    if (alt > usableAlt && alt >= minAltitude && alt >= limitAltitudeAt(horizon, azs[k], minAltitude)) {
      usable = k;
      usableAlt = alt;
    }
  }
  const t0 = sky.times[0];
  const stepMs = ctx.stepMinutes * 60000;
  const { windows } = usableWindowsOnTrack({
    horizon,
    minAltitude,
    start: ctx.start,
    end: ctx.end,
    stepMinutes: ctx.stepMinutes,
    // The window scan reads the samples just taken; only its edge refinement needs a time between them.
    altAzAt: (d) => {
      const ms = d.getTime();
      const k = Math.min(Math.round((ms - t0) / stepMs), n - 1);
      return k >= 0 && sky.times[k] === ms ? { altitude: alts[k], azimuth: azs[k] } : sky.altAzAtMs(p, ms);
    },
  });
  const peak = usable >= 0 ? usable : any;
  return { windows, peakAltitude: alts[peak], peakAzimuth: azs[peak], peakIndex: peak, moonSeparation: sky.moonSeparationAt(p, peak) };
}

function sampleBody(ctx: NightContext, source: TargetSource): Sampled {
  const { site, horizon, minAltitude } = ctx;
  const altAzAt = (d: Date): AltAz => altAzOf(source, site, d);
  const { windows } = usableWindowsOnTrack({ horizon, minAltitude, start: ctx.start, end: ctx.end, stepMinutes: ctx.stepMinutes, altAzAt });
  const track = altitudeTrack(source, site, horizon, minAltitude, ctx.start, ctx.end, ctx.stepMinutes);
  const usableSamples = track.filter((p) => p.altitude >= p.limit);
  const pool = usableSamples.length > 0 ? usableSamples : track;
  const peak = pool.reduce((b, p) => (p.altitude > b.altitude ? p : b), pool[0]);
  const moon = bodyAltAz('Moon', peak.time, site);
  return {
    windows,
    peakAltitude: peak.altitude,
    peakAzimuth: peak.azimuth,
    peakIndex: ctx.sky.times.indexOf(peak.time.getTime()),
    moonSeparation: angularSeparation(moon, altAzAt(peak.time)),
  };
}

/**
 * The one scoring: turns what the sampling found into a `PlanEntry`, for a catalog target or a planet alike.
 * `target` is absent for a planet.
 */
function entryOf(ctx: NightContext, id: string, name: string, type: string, source: TargetSource, target: PlanTarget | undefined, s: Sampled): PlanEntry {
  const usableMinutes = s.windows.reduce((sum, w) => sum + (w.end.getTime() - w.start.getTime()), 0) / 60000;
  const moonUp = ctx.sky.moonUp[s.peakIndex];
  const closeness = Math.max(0, Math.min(1, (60 - s.moonSeparation) / 60));
  const seasons = target?.seasonMonths ?? [];
  const inSeason = seasons.length > 0 ? seasons.includes(ctx.month) : null;
  const { fit, detail } = target ? fitOf(ctx.train, target) : { fit: 'not-applicable' as Fit, detail: '' };
  const percent = target ? percentOfFrame(ctx.train, target) : null;
  const score = scoreOf(
    {
      usable: Math.min(usableMinutes / 60 / 4, 1) * 50,
      altitude: Math.max(0, Math.min((s.peakAltitude - 30) / 50, 1)) * 30,
      season: inSeason ? 10 : 0,
      moon: moonUp ? -20 * ctx.illumination * closeness : 0,
      fit: fit === 'too-large' ? -25 : 0,
      brightness: target ? brightnessScore(target) : 0,
      framing: framingScore(percent),
    },
    usableMinutes > 0,
  );
  const partial = {
    id,
    name,
    type,
    isPlanet: source.kind === 'planet',
    source,
    windows: s.windows,
    usableMinutes,
    peakAltitude: s.peakAltitude,
    peakAzimuth: s.peakAzimuth,
    peakTime: new Date(ctx.sky.times[s.peakIndex]),
    moonIllumination: ctx.illumination,
    moonSeparation: s.moonSeparation,
    moonUp,
    inSeason,
    seasonMonths: [...seasons],
    fit,
    fitDetail: detail,
    percentOfFrame: percent,
    magnitude: target?.mag ?? null,
    surfaceBrightness: target?.surfaceBrightness ?? null,
    sbComputed: target?.surfaceBrightness !== undefined && target.sbComputed === true,
    score,
  };
  return { ...partial, why: describe(partial, ctx.horizonSet, ctx.minAltitude) };
}

/** Scores one catalog target against the night. */
export function evaluateTarget(ctx: NightContext, t: PlanTarget): PlanEntry {
  const source: TargetSource = { kind: 'fixed', raHours: t.raHours, decDeg: t.decDeg };
  return entryOf(ctx, t.id, t.displayName ?? t.name, t.type, source, t, sampleFixed(ctx, t.raHours, t.decDeg));
}

/** Scores one planet against the night. */
export function evaluatePlanet(ctx: NightContext, body: CardBody): PlanEntry {
  const source: TargetSource = { kind: 'planet', body };
  return entryOf(ctx, `planet-${body.toLowerCase()}`, body, 'planet', source, undefined, sampleBody(ctx, source));
}

/**
 * The ranking order: a target that does not fit the train is never above one that does, then score, usable time,
 * name, id (so equal names still order the same way every time).
 */
export function compareEntries(a: PlanEntry, b: PlanEntry): number {
  const misses = (e: PlanEntry): number => (e.fit === 'too-large' ? 1 : 0);
  return misses(a) - misses(b) || b.score.total - a.score.total || b.usableMinutes - a.usableMinutes || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Tonight's ranked target list for a site, date and train. Pure: the same
 * inputs give the same list. Score parts are in each entry so the ranking can
 * be read, not trusted. Targets that never clear the limit stay in the list
 * with a score of 0. For a whole catalog use `rankTargets`, which screens first and is the same scoring.
 */
export function planTonight(input: TonightInput): TonightPlan {
  const ctx = nightContext(input);
  if (!('sky' in ctx)) return { night: ctx.night, horizonSet: ctx.horizonSet, minAltitude: input.minAltitude, entries: [] };
  const entries = input.targets.map((t) => evaluateTarget(ctx, t));
  if (input.includePlanets !== false) for (const body of PLANETS) entries.push(evaluatePlanet(ctx, body));
  entries.sort(compareEntries);
  return { night: ctx.night, horizonSet: ctx.horizonSet, minAltitude: input.minAltitude, entries };
}
