import { astronomicalNight, bodyAltAz, moonIllumination, moonSeparation, targetAltAz } from '../astro';
import type { AltAz, AstronomicalNight, PlanetName, Site } from '../astro';
import type { CardBody } from '../astro/bodies';
import { limitAltitudeAt, usableWindows, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint, TimeWindow } from '../horizon';
import { opticalTrain, targetFitsFrame } from '../optics';
import type { OpticalTrain } from '../optics';
import { resolveTrain } from '../profile';
import type { Profile, TrainEntry } from '../profile';
import type { CatalogTarget } from '../catalog';

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
  targets: readonly CatalogTarget[];
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

function altAzOf(source: TargetSource, site: Site, when: Date): AltAz {
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

function scoreOf(parts: Omit<ScoreParts, 'total'>, usable: boolean): ScoreParts {
  const sum = parts.usable + parts.altitude + parts.season + parts.moon + parts.fit;
  return { ...parts, total: usable ? Math.max(0, Math.min(100, Math.round(sum))) : 0 };
}

function fitOf(train: PlanTrain, target: CatalogTarget): { fit: Fit; detail: string } {
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

function describe(e: Omit<PlanEntry, 'why'>, horizonSet: boolean, minAltitude: number): string {
  const text = describeSky(e, horizonSet, minAltitude);
  return e.fit === 'too-large' ? `Does not fit this setup. ${text}` : text;
}

/** One or two short sentences: the decision facts only (horizon, season, fit, Moon). Peak, window and Moon numbers are shown beside it. */
function describeSky(e: Omit<PlanEntry, 'why'>, horizonSet: boolean, minAltitude: number): string {
  const limit = horizonSet ? 'the horizon limit' : `the flat ${minAltitude} deg minimum (horizon not set)`;
  if (e.usableMinutes <= 0) {
    return `Never clears ${limit} tonight; it peaks at ${fmt(e.peakAltitude)} deg in the ${compass(e.peakAzimuth)}.`;
  }
  const first = `Clear of ${limit} for ${fmt(e.usableMinutes / 60, 1)} h.`;
  const notes: string[] = [];
  if (e.isPlanet) notes.push('planet');
  if (e.inSeason === true) notes.push('in season');
  if (e.inSeason === false) notes.push('out of season');
  if (e.fit === 'fits') notes.push('fits the frame');
  if (e.fit === 'unknown') notes.push('fit unknown');
  notes.push(e.moonUp ? 'Moon up at the peak' : 'Moon down at the peak');
  const second = notes.join(', ');
  return `${first} ${second.charAt(0).toUpperCase()}${second.slice(1)}.`;
}

/**
 * Tonight's ranked target list for a site, date and train. Pure: the same
 * inputs give the same list. Score parts are in each entry so the ranking can
 * be read, not trusted. Targets that never clear the limit stay in the list
 * with a score of 0.
 */
export function planTonight(input: TonightInput): TonightPlan {
  const { site, minAltitude, train, targets } = input;
  const horizon = input.horizon && input.horizon.length > 0 ? input.horizon : null;
  const horizonSet = horizon !== null;
  const month = parseLocalDate(input.date).month;
  const night = tonightsNight(site, input.date, input.timeZone);
  if (night.kind !== 'normal') return { night, horizonSet, minAltitude, entries: [] };

  const start = night.start as Date;
  const end = night.end as Date;
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  const illumination = moonIllumination(mid);
  const step = input.stepMinutes ?? 5;

  const sources: { id: string; name: string; type: string; source: TargetSource; target?: CatalogTarget }[] = targets.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type,
    source: { kind: 'fixed', raHours: t.raHours, decDeg: t.decDeg },
    target: t,
  }));
  if (input.includePlanets !== false) {
    for (const body of PLANETS) {
      sources.push({ id: `planet-${body.toLowerCase()}`, name: body, type: 'planet', source: { kind: 'planet', body } });
    }
  }

  const entries = sources.map(({ id, name, type, source, target }): PlanEntry => {
    const altAzAt = (d: Date): AltAz => altAzOf(source, site, d);
    const common = { horizon, minAltitude, start, end, stepMinutes: step };
    const { windows } =
      source.kind === 'fixed'
        ? usableWindows({ ...common, raHours: source.raHours, decDeg: source.decDeg, site })
        : usableWindowsOnTrack({ ...common, altAzAt });
    const usableMs = windows.reduce((s, w) => s + (w.end.getTime() - w.start.getTime()), 0);
    const usableMinutes = usableMs / 60000;

    // Peak: highest sample while usable, else highest of the night.
    const track = altitudeTrack(source, site, horizon, minAltitude, start, end, step);
    const usableSamples = track.filter((p) => p.altitude >= p.limit);
    const pool = usableSamples.length > 0 ? usableSamples : track;
    const peak = pool.reduce((b, p) => (p.altitude > b.altitude ? p : b), pool[0]);

    const moon = bodyAltAz('Moon', peak.time, site);
    const moonUp = moon.altitude > 0;
    const sep =
      source.kind === 'fixed'
        ? moonSeparation(source.raHours, source.decDeg, peak.time, site)
        : angularSeparation(moon, altAzAt(peak.time));
    const closeness = Math.max(0, Math.min(1, (60 - sep) / 60));

    const inSeason = target ? target.seasonMonths.includes(month) : null;
    const { fit, detail } = target ? fitOf(train, target) : { fit: 'not-applicable' as Fit, detail: '' };

    const usableOk = usableMinutes > 0;
    const score = scoreOf(
      {
        usable: Math.min(usableMinutes / 60 / 4, 1) * 50,
        altitude: Math.max(0, Math.min((peak.altitude - 30) / 50, 1)) * 30,
        season: inSeason ? 10 : 0,
        moon: moonUp ? -20 * illumination * closeness : 0,
        fit: fit === 'too-large' ? -25 : 0,
      },
      usableOk,
    );
    const partial = {
      id,
      name,
      type,
      isPlanet: source.kind === 'planet',
      source,
      windows,
      usableMinutes,
      peakAltitude: peak.altitude,
      peakAzimuth: peak.azimuth,
      peakTime: peak.time,
      moonIllumination: illumination,
      moonSeparation: sep,
      moonUp,
      inSeason,
      seasonMonths: target ? target.seasonMonths : [],
      fit,
      fitDetail: detail,
      score,
    };
    return { ...partial, why: describe(partial, horizonSet, minAltitude) };
  });

  // A target that does not fit the train is never ranked above one that does.
  const misses = (e: PlanEntry): number => (e.fit === 'too-large' ? 1 : 0);
  entries.sort((a, b) => misses(a) - misses(b) || b.score.total - a.score.total || b.usableMinutes - a.usableMinutes || a.name.localeCompare(b.name));
  return { night, horizonSet, minAltitude, entries };
}
