import type { Site } from '../astro';
import { altAzOf, compass, zoneOffsetMs } from '../plan';
import type { TargetSource } from '../plan';
import { limitAltitudeAt } from '../horizon';
import type { HorizonPoint } from '../horizon';

// ------------------------------------------------------------------- start time

const HOUR_MS = 3600000;
export const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 24 h "HH:MM" of an instant in `timeZone` (IANA name; absent: the browser's zone). Used for the start-time input. */
export function clockOf(d: Date, timeZone?: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute}`;
}

/**
 * The instant a saved clock time ("21:30") means for the night that starts at `nightStart`: the first time that clock reads
 * so at or after six hours before the night starts. So an evening time is tonight, a small-hours time is after midnight
 * (inside the night), and a morning time is the following day (after the night ends). A saved clock time is therefore
 * the same every night, not a date.
 */
export function clockToInstant(clock: string, nightStart: Date, timeZone?: string): Date {
  if (!CLOCK_RE.test(clock)) throw new RangeError(`Start time must be HH:MM: ${clock}`);
  const zone = timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [h, m] = clock.split(':').map(Number);
  const from = nightStart.getTime() - 6 * HOUR_MS;
  const local = new Date(from + zoneOffsetMs(new Date(from), zone));
  let wall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, m);
  for (let day = 0; day < 3; day++, wall += 24 * HOUR_MS) {
    const first = wall - zoneOffsetMs(new Date(wall), zone);
    const at = wall - zoneOffsetMs(new Date(first), zone);
    if (at >= from) return new Date(at);
  }
  throw new Error('unreachable: one of three consecutive days is at or after the start');
}

// ------------------------------------------------------- altitude through a slot

export interface AltPoint {
  at: Date;
  /** Degrees above the horizon. */
  altitude: number;
  azimuth: number;
  /** Compass name of the azimuth, e.g. "SW". */
  direction: string;
  /** The altitude the target must exceed at this azimuth: the higher of the horizon and the minimum. */
  limit: number;
  /** True when the target is under that limit at this instant (more than a rounding error). */
  belowLimit: boolean;
}

/** Where in the slot the altitude goes: up all through, over a highest point inside it, or down all through (so already past its peak). */
export type Trend = 'rising' | 'peaks' | 'falling';

export const TREND_TEXT: Record<Trend, string> = { rising: 'rising', peaks: 'peaks in this slot', falling: 'past peak, falling' };

export interface SlotAltitudes {
  start: AltPoint;
  middle: AltPoint;
  end: AltPoint;
  trend: Trend;
}

const TREND_STEP_MIN = 5;
/** An altitude under the limit by less than this is a rounding error, not a warning. */
const BELOW_TOLERANCE_DEG = 0.05;

export function altPoint(source: TargetSource, site: Site, at: Date, horizon: readonly HorizonPoint[] | null, minAltitude: number): AltPoint {
  const { altitude, azimuth } = altAzOf(source, site, at);
  const limit = limitAltitudeAt(horizon, azimuth, minAltitude);
  return { at, altitude, azimuth, direction: compass(azimuth), limit, belowLimit: altitude < limit - BELOW_TOLERANCE_DEG };
}

/**
 * Altitude and compass direction at the start, middle and end of [start, end], and the trend between: sampled every
 * 5 minutes, a highest point clearly above both ends is "peaks", otherwise the sign of end minus start decides.
 */
export function slotAltitudes(source: TargetSource, site: Site, start: Date, end: Date, horizon: readonly HorizonPoint[] | null, minAltitude: number): SlotAltitudes {
  const t0 = start.getTime();
  const t1 = end.getTime();
  const at = (t: number) => altPoint(source, site, new Date(t), horizon, minAltitude);
  const first = at(t0);
  const last = at(t1);
  let top = Math.max(first.altitude, last.altitude);
  for (let t = t0 + TREND_STEP_MIN * 60000; t < t1; t += TREND_STEP_MIN * 60000) top = Math.max(top, altAzOf(source, site, new Date(t)).altitude);
  const trend: Trend = top > Math.max(first.altitude, last.altitude) + 0.25 ? 'peaks' : last.altitude >= first.altitude ? 'rising' : 'falling';
  return { start: first, middle: at(t0 + (t1 - t0) / 2), end: last, trend };
}

// -------------------------------------------------------------- graph geometry

export interface Frame {
  width: number;
  height: number;
  margin: { left: number; right: number; top: number; bottom: number };
}

/** Maps time to x and altitude (0 to 90 degrees, clamped) to y inside the frame's plot area. */
export function makeScale(t0: number, t1: number, frame: Frame): { x: (t: number) => number; y: (alt: number) => number } {
  const { width, height, margin: m } = frame;
  return {
    x: (t) => m.left + ((t - t0) / (t1 - t0)) * (width - m.left - m.right),
    y: (alt) => m.top + ((90 - Math.max(0, Math.min(90, alt))) / 90) * (height - m.top - m.bottom),
  };
}

export interface GeometrySlot {
  id: string;
  start: Date;
  end: Date;
  /** Altitude of the slot's target at an instant. */
  altitudeAt: (when: Date) => number;
}

export interface SegmentGeometry {
  id: string;
  /** 1-based number in the itinerary, as the slot is numbered on the page. */
  number: number;
  /** False for a slot with no time: nothing is drawn for it. */
  timed: boolean;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  points: { x: number; y: number }[];
}

export interface ConnectorGeometry {
  fromId: string;
  toId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Where each timed slot is drawn: a polyline of its target's altitude from the slot's start to its end (both ends exact),
 * and a connector from each timed slot's end to the next timed slot's start (over the changeover or the wait).
 */
export function timelineGeometry(nightStart: Date, nightEnd: Date, slots: readonly GeometrySlot[], frame: Frame, stepMinutes = 5): { segments: SegmentGeometry[]; connectors: ConnectorGeometry[] } {
  const { x, y } = makeScale(nightStart.getTime(), nightEnd.getTime(), frame);
  const segments = slots.map((s, i): SegmentGeometry => {
    const a = s.start.getTime();
    const b = s.end.getTime();
    const timed = b > a;
    const times = [a];
    if (timed) {
      for (let t = a + stepMinutes * 60000; t < b; t += stepMinutes * 60000) times.push(t);
      times.push(b);
    }
    const points = timed ? times.map((t) => ({ x: x(t), y: y(s.altitudeAt(new Date(t))) })) : [];
    return { id: s.id, number: i + 1, timed, x0: x(a), x1: x(b), y0: points[0]?.y ?? 0, y1: points[points.length - 1]?.y ?? 0, points };
  });
  const timed = segments.filter((s) => s.timed);
  const connectors = timed.slice(1).map((s, k): ConnectorGeometry => {
    const prev = timed[k];
    return { fromId: prev.id, toId: s.id, from: { x: prev.x1, y: prev.y1 }, to: { x: s.x0, y: s.y0 } };
  });
  return { segments, connectors };
}
