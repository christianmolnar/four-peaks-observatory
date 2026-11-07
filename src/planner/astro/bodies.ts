import * as Astronomy from 'astronomy-engine';
import { toObserver } from './index';
import type { PlanetName, Site } from './types';

/** Mercury to Neptune and the Moon: the bodies the planet cards cover. */
export type CardBody = Exclude<PlanetName, 'Pluto'> | 'Moon';

const KM_PER_AU = 149597870.7;

function assertDate(when: Date): void {
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) throw new TypeError('Invalid date');
}

/** Distance in km from the observer to the body (topocentric, so the Moon's parallax is in it). */
export function bodyDistanceKm(body: CardBody, when: Date, site: Site): number {
  assertDate(when);
  const eq = Astronomy.Equator(Astronomy.Body[body], when, toObserver(site), true, true);
  return eq.dist * KM_PER_AU;
}

export interface DiskState {
  /** Illuminated fraction of the disc as seen from Earth, 0..1. */
  illuminatedFraction: number;
  /** Sun-body-Earth angle in degrees, 0 (full) to 180 (new). */
  phaseAngleDeg: number;
  /**
   * Saturn only: the size in degrees of the rings' tilt away from the line of sight, planetocentric. The library gives
   * the size, not which face is visible. Undefined for every other body.
   */
  ringTiltDeg: number | undefined;
}

/**
 * Phase of the body as seen from Earth's centre. With `site`, the Moon is seen from the observer instead: its parallax
 * shifts the phase angle by up to a degree, which moves the illuminated fraction by about half a percentage point.
 * Planets are far enough away that the difference is negligible.
 */
export function diskState(body: CardBody, when: Date, site?: Site): DiskState {
  assertDate(when);
  const i = Astronomy.Illumination(Astronomy.Body[body], when);
  if (body === 'Moon' && site) {
    const t = Astronomy.MakeTime(when);
    const obs = Astronomy.ObserverVector(t, toObserver(site), false);
    const moon = Astronomy.GeoVector(Astronomy.Body.Moon, t, false);
    const sun = Astronomy.GeoVector(Astronomy.Body.Sun, t, false);
    const toSun = [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z];
    const toObserver_ = [obs.x - moon.x, obs.y - moon.y, obs.z - moon.z];
    const dot = toSun[0] * toObserver_[0] + toSun[1] * toObserver_[1] + toSun[2] * toObserver_[2];
    const phase = Math.acos(dot / (Math.hypot(...toSun) * Math.hypot(...toObserver_)));
    return { illuminatedFraction: (1 + Math.cos(phase)) / 2, phaseAngleDeg: (phase * 180) / Math.PI, ringTiltDeg: undefined };
  }
  return { illuminatedFraction: i.phase_fraction, phaseAngleDeg: i.phase_angle, ringTiltDeg: i.ring_tilt };
}

/** Angle between the Sun and the body as seen from Earth, degrees 0..180. Moon from its phase longitude. */
export function elongationDeg(body: CardBody, when: Date): { degrees: number; side: 'evening' | 'morning' | null } {
  assertDate(when);
  if (body === 'Moon') {
    // Moon phase longitude: 0 new, 90 first quarter, 180 full, 270 last quarter.
    const lon = Astronomy.MoonPhase(when);
    return { degrees: lon <= 180 ? lon : 360 - lon, side: lon <= 180 ? 'evening' : 'morning' };
  }
  const e = Astronomy.Elongation(Astronomy.Body[body], when);
  return { degrees: e.elongation, side: e.visibility === 'evening' ? 'evening' : 'morning' };
}

/** Mean synodic periods in days; used only to start a search half a period back, so the nearest event is found. */
const SYNODIC_DAYS: Record<Exclude<CardBody, 'Moon'>, number> = {
  Mercury: 115.88,
  Venus: 583.92,
  Mars: 779.94,
  Jupiter: 398.88,
  Saturn: 378.09,
  Uranus: 369.66,
  Neptune: 367.49,
};
const DAY_MS = 86400000;

export interface NearestEvent {
  kind: 'opposition' | 'greatest-elongation' | 'full-moon';
  time: Date;
  /** Greatest elongation only: the angle at that time. */
  elongationDeg?: number;
  /** Greatest elongation only: seen in the evening or morning sky. */
  side?: 'evening' | 'morning';
}

/**
 * The event nearest `when`: opposition for Mars to Neptune, greatest elongation for Mercury and Venus
 * (east or west, whichever is nearer), full Moon for the Moon.
 */
export function nearestEvent(body: CardBody, when: Date): NearestEvent {
  assertDate(when);
  if (body === 'Moon') {
    const back = Astronomy.SearchMoonPhase(180, new Date(when.getTime() - 15 * DAY_MS), 30);
    if (!back) throw new Error('No full Moon found within 30 days');
    return { kind: 'full-moon', time: back.date };
  }
  if (body === 'Mercury' || body === 'Venus') {
    // East and west elongations alternate with uneven gaps (up to three quarters of a synodic period for Venus).
    // Collect every one from that far back to the first past `when` and take the nearest.
    const events: Astronomy.ElongationEvent[] = [];
    let from = new Date(when.getTime() - 0.75 * SYNODIC_DAYS[body] * DAY_MS);
    do {
      const e = Astronomy.SearchMaxElongation(Astronomy.Body[body], from);
      events.push(e);
      from = new Date(e.time.date.getTime() + DAY_MS);
    } while (events[events.length - 1].time.date.getTime() <= when.getTime() && events.length < 8);
    const near = events.reduce((a, b) => (Math.abs(a.time.date.getTime() - when.getTime()) <= Math.abs(b.time.date.getTime() - when.getTime()) ? a : b));
    return { kind: 'greatest-elongation', time: near.time.date, elongationDeg: near.elongation, side: near.visibility === 'evening' ? 'evening' : 'morning' };
  }
  const t = Astronomy.SearchRelativeLongitude(Astronomy.Body[body], 0, new Date(when.getTime() - (SYNODIC_DAYS[body] / 2) * DAY_MS));
  return { kind: 'opposition', time: t.date };
}

/** Time the body next crosses the local meridian (hour angle 0), from `from`, within about one day. */
export function nextBodyTransit(body: CardBody, from: Date, site: Site): Date {
  assertDate(from);
  return Astronomy.SearchHourAngle(Astronomy.Body[body], toObserver(site), 0, from).time.date;
}

/** Moon phase as an ecliptic longitude difference from the Sun in degrees: 0 new, 90 first quarter, 180 full, 270 last quarter. */
export function moonPhaseLongitudeDeg(when: Date): number {
  assertDate(when);
  return Astronomy.MoonPhase(when);
}
