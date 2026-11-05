import { targetAltAz } from '../astro';
import type { AltAz, Site } from '../astro';

export interface HorizonPoint {
  /** Degrees clockwise from north, 0 <= az < 360. */
  az: number;
  /** Obstruction altitude in degrees. */
  alt: number;
}

export interface TimeWindow {
  start: Date;
  end: Date;
}

export interface UsableWindows {
  /** False when no horizon was supplied; `minAltitude` alone was applied. */
  horizonSet: boolean;
  windows: TimeWindow[];
}

/**
 * Validate and sort horizon points by azimuth. Throws on bad values or
 * duplicate azimuths; never repairs data silently.
 */
export function normalizeHorizon(points: readonly HorizonPoint[]): HorizonPoint[] {
  for (const p of points) {
    if (!Number.isFinite(p.az) || p.az < 0 || p.az >= 360) {
      throw new RangeError(`Horizon azimuth must be in [0, 360): ${p.az}`);
    }
    if (!Number.isFinite(p.alt) || p.alt < -90 || p.alt > 90) {
      throw new RangeError(`Horizon altitude must be in [-90, 90]: ${p.alt}`);
    }
  }
  const sorted = [...points].sort((a, b) => a.az - b.az);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].az === sorted[i - 1].az) {
      throw new RangeError(`Duplicate horizon azimuth: ${sorted[i].az}`);
    }
  }
  return sorted;
}

/**
 * Horizon altitude at `az`, linearly interpolated between neighbouring points
 * and wrapping across 0/360. One point gives a constant horizon. Returns null
 * when there are no points: the horizon is not set and nothing is invented.
 */
export function horizonAltitudeAt(
  points: readonly HorizonPoint[] | null | undefined,
  az: number,
): number | null {
  if (!points || points.length === 0) return null;
  if (!Number.isFinite(az)) throw new RangeError(`Invalid azimuth: ${az}`);
  const sorted = normalizeHorizon(points);
  if (sorted.length === 1) return sorted[0].alt;

  const a = ((az % 360) + 360) % 360;
  const next = sorted.findIndex((p) => p.az > a);
  // Before the first or past the last point, the neighbours wrap around 0/360.
  const nextPt = next === -1 ? sorted[0] : sorted[next];
  const prevPt = next <= 0 ? sorted[sorted.length - 1] : sorted[next - 1];
  const span = (nextPt.az - prevPt.az + 360) % 360;
  const offset = (a - prevPt.az + 360) % 360;
  return prevPt.alt + ((nextPt.alt - prevPt.alt) * offset) / span;
}

/** Altitude a target must exceed at `az`: the higher of the horizon and the minimum. */
export function limitAltitudeAt(
  points: readonly HorizonPoint[] | null | undefined,
  az: number,
  minAltitude: number,
): number {
  const h = horizonAltitudeAt(points, az);
  return h === null ? minAltitude : Math.max(h, minAltitude);
}

interface WindowsCommon {
  /** Omit or leave empty when the horizon has not been measured. */
  horizon?: readonly HorizonPoint[] | null;
  /** Flat minimum altitude in degrees, applied on top of any horizon. */
  minAltitude: number;
  start: Date;
  end: Date;
  /** Sampling step; edges are then refined by bisection. Default 5. */
  stepMinutes?: number;
}

export interface UsableWindowsInput extends WindowsCommon {
  raHours: number;
  decDeg: number;
  site: Site;
}

/** Same as `UsableWindowsInput` for any moving body: `altAzAt` gives its position at an instant. */
export interface TrackWindowsInput extends WindowsCommon {
  altAzAt: (when: Date) => AltAz;
}

/**
 * Intervals within [start, end] in which a fixed J2000 target is above both
 * the horizon (if set) and the minimum altitude. A target blocked mid-interval
 * yields two windows; a target above the limit throughout yields one.
 */
export function usableWindows(input: UsableWindowsInput): UsableWindows {
  const { raHours, decDeg, site, ...rest } = input;
  return usableWindowsOnTrack({ ...rest, altAzAt: (d) => targetAltAz(raHours, decDeg, d, site) });
}

/** `usableWindows` for a body given by its alt/az track (a planet, for example). */
export function usableWindowsOnTrack(input: TrackWindowsInput): UsableWindows {
  const { altAzAt, minAltitude, start, end } = input;
  const step = (input.stepMinutes ?? 5) * 60000;
  if (!(step > 0)) throw new RangeError('stepMinutes must be positive');
  if (!Number.isFinite(minAltitude)) throw new RangeError('minAltitude must be a number');
  const t0 = start.getTime();
  const t1 = end.getTime();
  if (!(t1 > t0)) throw new RangeError('end must be after start');

  const points = input.horizon && input.horizon.length > 0 ? input.horizon : null;
  const horizonSet = points !== null;

  const margin = (t: number): number => {
    const r = altAzAt(new Date(t));
    return r.altitude - limitAltitudeAt(points, r.azimuth, minAltitude);
  };
  const refine = (inside: number, outside: number): number => {
    let lo = inside;
    let hi = outside;
    for (let i = 0; i < 20 && Math.abs(hi - lo) > 500; i++) {
      const mid = (lo + hi) / 2;
      if (margin(mid) >= 0) lo = mid;
      else hi = mid;
    }
    return lo;
  };

  const windows: TimeWindow[] = [];
  let openAt: number | null = null;
  let prevT = t0;
  let prevUp = margin(t0) >= 0;
  if (prevUp) openAt = t0;

  for (let t = t0 + step; ; t += step) {
    const tt = Math.min(t, t1);
    const up = margin(tt) >= 0;
    if (up && !prevUp) {
      openAt = refine(tt, prevT);
    } else if (!up && prevUp) {
      windows.push({
        start: new Date(openAt as number),
        end: new Date(refine(prevT, tt)),
      });
      openAt = null;
    }
    prevT = tt;
    prevUp = up;
    if (tt >= t1) break;
  }
  if (prevUp && openAt !== null) {
    windows.push({ start: new Date(openAt), end: new Date(t1) });
  }
  return { horizonSet, windows };
}
