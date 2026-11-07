import { bodyAltAz } from '../astro';
import type { AltAz, AstronomicalNight, Site } from '../astro';
import { bodyDistanceKm, diskState, elongationDeg, moonPhaseLongitudeDeg, nearestEvent, nextBodyTransit } from '../astro/bodies';
import type { CardBody, NearestEvent } from '../astro/bodies';
import { limitAltitudeAt, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint, TimeWindow } from '../horizon';
import type { TrackPoint } from '../plan';
import {
  BLUE_NM,
  CARD_BODIES,
  CLIP_GAP_S,
  DAWES_ARCSEC_MM,
  DISPERSION_LIMIT_RESOLUTIONS,
  EDLEN,
  EQUATORIAL_RADIUS_KM,
  MAX_CLIP_S,
  MOON_CLIP_S,
  MOSAIC_OVERLAP,
  OVERSAMPLED_BELOW,
  RED_NM,
  ROTATION,
  SAMPLING_WAVELENGTH_NM,
  SEEING_ASSUMED_ARCSEC,
  SMEAR_FRACTION_OF_RESOLUTION,
  UNDERSAMPLED_ABOVE,
} from './constants';
import type { Basis } from './constants';

export * from './constants';
export type { CardBody } from '../astro/bodies';

/** Everything a card shows is `computed` (from the ephemeris or a formula), `sourced` (a cited figure) or `assumption`. */
export const COMPUTED = 'computed' as const;

const ARCSEC_PER_RAD = 206264.806;
const HOUR_MS = 3600000;

/** Apparent equatorial diameter in arcseconds, from the topocentric distance and the equatorial radius. */
export function apparentDiameterArcsec(body: CardBody, when: Date, site: Site): number {
  const r = EQUATORIAL_RADIUS_KM[body];
  return 2 * Math.asin(r / bodyDistanceKm(body, when, site)) * ARCSEC_PER_RAD;
}

// ------------------------------------------------------------------- sampling and rotation

/** Dawes limit of the aperture, arcsec: the telescope's resolution used for the smear and dispersion limits. */
export function dawesArcsec(apertureMm: number): number {
  if (!(apertureMm > 0)) throw new RangeError(`apertureMm must be positive: ${apertureMm}`);
  return DAWES_ARCSEC_MM / apertureMm;
}

export type SamplingVerdict = 'oversampled' | 'near-limit' | 'coarse';

export interface Sampling {
  scaleArcsecPx: number;
  /** Largest pixel scale that still samples the diffraction limit at SAMPLING_WAVELENGTH_NM, lambda / (2 D). Computed. */
  nyquistArcsecPx: number;
  /** scale / nyquist. */
  ratio: number;
  verdict: SamplingVerdict;
  dawesArcsec: number;
  /** ASSUMPTION: seeing, arcsec. */
  seeingArcsec: number;
  /** True when assumed seeing is wider than the Dawes limit: detail is seeing-limited and more magnification adds none. */
  seeingLimited: boolean;
}

export function samplingFor(scaleArcsecPx: number, apertureMm: number): Sampling {
  if (!(scaleArcsecPx > 0)) throw new RangeError(`scaleArcsecPx must be positive: ${scaleArcsecPx}`);
  const nyquist = ((SAMPLING_WAVELENGTH_NM * 1e-9) / (2 * apertureMm * 1e-3)) * ARCSEC_PER_RAD;
  const ratio = scaleArcsecPx / nyquist;
  const dawes = dawesArcsec(apertureMm);
  return {
    scaleArcsecPx,
    nyquistArcsecPx: nyquist,
    ratio,
    verdict: ratio < OVERSAMPLED_BELOW ? 'oversampled' : ratio > UNDERSAMPLED_ABOVE ? 'coarse' : 'near-limit',
    dawesArcsec: dawes,
    seeingArcsec: SEEING_ASSUMED_ARCSEC,
    seeingLimited: SEEING_ASSUMED_ARCSEC > dawes,
  };
}

export interface RotationClip {
  periodH: number;
  periodBasis: Basis;
  /** Apparent smear of a feature at the middle of the disc, arcsec per minute. Computed. */
  smearArcsecPerMin: number;
  /** The telescope's resolution used as the yardstick, arcsec (Dawes). */
  resolutionArcsec: number;
  /** Clip length at which the smear reaches SMEAR_FRACTION_OF_RESOLUTION of it, seconds. Computed. */
  limitS: number;
  /** The clip length suggested: the limit, but never above MAX_CLIP_S. */
  suggestedS: number;
  /** True when MAX_CLIP_S, not the rotation, set the suggestion. */
  cappedByMax: boolean;
}

/**
 * Longest clip before planet rotation smears the middle of the disc by more than half a resolution element.
 * The Moon does not rotate under the camera: it returns null and the guide uses MOON_CLIP_S instead.
 */
export function rotationClip(body: CardBody, diameterArcsec: number, apertureMm: number): RotationClip | null {
  if (body === 'Moon') return null;
  const spec = ROTATION[body];
  const radius = diameterArcsec / 2;
  const perSecond = ((2 * Math.PI) / (spec.periodH * 3600)) * radius;
  const resolution = dawesArcsec(apertureMm);
  const limitS = (SMEAR_FRACTION_OF_RESOLUTION * resolution) / perSecond;
  return {
    periodH: spec.periodH,
    periodBasis: spec.basis,
    smearArcsecPerMin: perSecond * 60,
    resolutionArcsec: resolution,
    limitS,
    suggestedS: Math.min(limitS, MAX_CLIP_S),
    cappedByMax: limitS > MAX_CLIP_S,
  };
}

/** Clips that fit in a session of `sessionMin` minutes, each of `clipS` seconds with CLIP_GAP_S between. */
export function clipsInSession(sessionMin: number, clipS: number): number {
  return Math.max(0, Math.floor((sessionMin * 60) / (clipS + CLIP_GAP_S)));
}

// ------------------------------------------------------------------------- dispersion

const refractivity = (nm: number): number => {
  const s2 = (1000 / nm) ** 2;
  return (EDLEN.a + EDLEN.b / (EDLEN.c - s2) + EDLEN.d / (EDLEN.e - s2)) * 1e-8;
};
/** n(blue) - n(red) for standard air, from the Edlen formula. */
export const BLUE_RED_INDEX_DIFFERENCE = refractivity(BLUE_NM) - refractivity(RED_NM);

/** Atmospheric dispersion: red-to-blue image separation in arcsec at an altitude, standard air. Computed. */
export function dispersionArcsec(altitudeDeg: number): number {
  if (!(altitudeDeg > 0 && altitudeDeg <= 90)) throw new RangeError(`altitudeDeg must be in (0, 90]: ${altitudeDeg}`);
  const zenithDistance = ((90 - altitudeDeg) * Math.PI) / 180;
  return BLUE_RED_INDEX_DIFFERENCE * Math.tan(zenithDistance) * ARCSEC_PER_RAD;
}

/** The altitude above which the red-to-blue spread is within DISPERSION_LIMIT_RESOLUTIONS Dawes limits. Computed. */
export function dispersionAltitudeDeg(apertureMm: number): number {
  const limit = DISPERSION_LIMIT_RESOLUTIONS * dawesArcsec(apertureMm);
  const zenithDistance = Math.atan(limit / (BLUE_RED_INDEX_DIFFERENCE * ARCSEC_PER_RAD));
  return 90 - (zenithDistance * 180) / Math.PI;
}

// ----------------------------------------------------------------------------- the card

const MOON_PHASE_NAMES = ['New', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full', 'Waning gibbous', 'Last quarter', 'Waning crescent'] as const;

/** Name of the Moon's phase from its phase longitude (eight 45-degree bins centred on 0, 45, ... 315). */
export function moonPhaseName(phaseLongitudeDeg: number): (typeof MOON_PHASE_NAMES)[number] {
  const l = ((phaseLongitudeDeg % 360) + 360) % 360;
  return MOON_PHASE_NAMES[Math.floor(((l + 22.5) % 360) / 45)];
}

export interface PlanetCardInput {
  body: CardBody;
  site: Site;
  /** A normal astronomical night. */
  night: AstronomicalNight;
  /** Saved horizon points, or null when none is set. */
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** The telescope's aperture; without it no clip, dispersion or sampling number is given. */
  apertureMm?: number;
  /** Arcsec per pixel of the train in use; without it no size in pixels is given. */
  imageScaleArcsecPx?: number;
  /** Narrow side of the camera's field, arcminutes; used for the Moon mosaic. */
  fieldArcmin?: number;
}

export interface PlanetCard {
  body: CardBody;
  /** At the middle of the night. */
  at: Date;
  apparentDiameterArcsec: number;
  illuminatedFraction: number;
  phaseAngleDeg: number;
  /** Moon only. */
  moonPhase: { name: string; longitudeDeg: number } | null;
  elongationDeg: number;
  /** Mercury and Venus: the sky the elongation is in. The Moon too (waxing = evening). */
  elongationSide: 'evening' | 'morning' | null;
  /** Opposition (Mars to Neptune), greatest elongation (Mercury, Venus) or full Moon, nearest to `at`. */
  event: NearestEvent;
  /** Days from `at` to the event, negative when it is past. */
  eventDays: number;
  /** Saturn only; null for every other body (the library gives it for Saturn alone). */
  ringTiltDeg: number | null;
  windows: TimeWindow[];
  usableMinutes: number;
  /** Usable minutes above both the limit and the dispersion altitude; null when the aperture is unknown. */
  goodMinutes: number | null;
  /** The altitude above which dispersion stays within one resolution element; null without the aperture. */
  dispersionAltitudeDeg: number | null;
  peak: { altitude: number; azimuth: number; time: Date; usable: boolean };
  /** The meridian crossing nearest the middle of the night. */
  culmination: { time: Date; altitude: number; azimuth: number; insideNight: boolean };
  dispersionAtPeakArcsec: number | null;
  /** Samples every 10 minutes from two hours before the night to exactly two hours after it, with the limit at each azimuth. */
  track: TrackPoint[];
  rotation: RotationClip | null;
  /** Apparent diameter on the sensor in pixels; null without a scale. */
  diameterPx: number | null;
  /** Moon only, with a field: panels per side of a mosaic that covers the disc with overlap. */
  mosaicPanelsPerSide: number | null;
}

export function planetCard(input: PlanetCardInput): PlanetCard {
  const { body, site, night, minAltitude } = input;
  if (night.kind !== 'normal' || !night.start || !night.end) throw new RangeError('planetCard needs a normal astronomical night');
  const horizon = input.horizon && input.horizon.length > 0 ? input.horizon : null;
  const start = night.start;
  const end = night.end;
  const at = new Date((start.getTime() + end.getTime()) / 2);
  const altAzAt = (d: Date): AltAz => bodyAltAz(body, d, site);

  const { windows } = usableWindowsOnTrack({ altAzAt, horizon, minAltitude, start, end, stepMinutes: 5 });
  const minutesOf = (ws: TimeWindow[]): number => ws.reduce((s, w) => s + w.end.getTime() - w.start.getTime(), 0) / 60000;

  const track: TrackPoint[] = [];
  const trackEnd = end.getTime() + 2 * HOUR_MS;
  for (let t = start.getTime() - 2 * HOUR_MS; ; t += 600000) {
    const time = new Date(Math.min(t, trackEnd));
    const p = altAzAt(time);
    track.push({ time, altitude: p.altitude, azimuth: p.azimuth, limit: limitAltitudeAt(horizon, p.azimuth, minAltitude) });
    if (t >= trackEnd) break;
  }
  const inNight = track.filter((p) => p.time >= start && p.time <= end);
  const usableSamples = inNight.filter((p) => p.altitude >= p.limit);
  const pool = usableSamples.length > 0 ? usableSamples : inNight;
  const top = pool.reduce((b, p) => (p.altitude > b.altitude ? p : b), pool[0]);

  const crossing = nextBodyTransit(body, new Date(at.getTime() - 12 * HOUR_MS), site);
  const crossingPos = altAzAt(crossing);

  const diameter = apparentDiameterArcsec(body, at, site);
  const disk = diskState(body, at, site);
  const elong = elongationDeg(body, at);
  const event = nearestEvent(body, at);

  let dispersionAltitude: number | null = null;
  let goodMinutes: number | null = null;
  let rotation: RotationClip | null = null;
  if (input.apertureMm !== undefined) {
    dispersionAltitude = dispersionAltitudeDeg(input.apertureMm);
    goodMinutes = minutesOf(
      usableWindowsOnTrack({ altAzAt, horizon, minAltitude: Math.max(minAltitude, dispersionAltitude), start, end, stepMinutes: 5 }).windows,
    );
    rotation = rotationClip(body, diameter, input.apertureMm);
  }
  const scale = input.imageScaleArcsecPx;
  const mosaic =
    body === 'Moon' && input.fieldArcmin !== undefined
      ? Math.max(1, Math.ceil((diameter / 60 - input.fieldArcmin * MOSAIC_OVERLAP) / (input.fieldArcmin * (1 - MOSAIC_OVERLAP))))
      : null;

  return {
    body,
    at,
    apparentDiameterArcsec: diameter,
    illuminatedFraction: disk.illuminatedFraction,
    phaseAngleDeg: disk.phaseAngleDeg,
    moonPhase: body === 'Moon' ? { name: moonPhaseName(moonPhaseLongitudeDeg(at)), longitudeDeg: moonPhaseLongitudeDeg(at) } : null,
    elongationDeg: elong.degrees,
    elongationSide: elong.side,
    event,
    eventDays: (event.time.getTime() - at.getTime()) / 86400000,
    ringTiltDeg: body === 'Saturn' && disk.ringTiltDeg !== undefined ? disk.ringTiltDeg : null,
    windows,
    usableMinutes: minutesOf(windows),
    goodMinutes,
    dispersionAltitudeDeg: dispersionAltitude,
    peak: { altitude: top.altitude, azimuth: top.azimuth, time: top.time, usable: usableSamples.length > 0 },
    culmination: {
      time: crossing,
      altitude: crossingPos.altitude,
      azimuth: crossingPos.azimuth,
      insideNight: crossing >= start && crossing <= end,
    },
    dispersionAtPeakArcsec: top.altitude > 0 ? dispersionArcsec(top.altitude) : null,
    track,
    rotation,
    diameterPx: scale !== undefined ? diameter / scale : null,
    mosaicPanelsPerSide: mosaic,
  };
}

/** All eight cards for one night, in spec order. */
export function planetCards(input: Omit<PlanetCardInput, 'body'>): PlanetCard[] {
  return CARD_BODIES.map((body) => planetCard({ ...input, body }));
}

export { MOON_CLIP_S };
