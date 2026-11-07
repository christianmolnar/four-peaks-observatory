/**
 * Constants of the planet cards. Each is SOURCED (the source is named), or an ASSUMPTION: a round number chosen
 * to be plausible, not measured. The cards label which is which.
 */
import type { CardBody } from '../astro/bodies';

/** Spec section 08 order: the planets people image most come first. */
export const CARD_BODIES: readonly CardBody[] = ['Jupiter', 'Saturn', 'Mars', 'Venus', 'Mercury', 'Uranus', 'Neptune', 'Moon'];

/**
 * SOURCED: equatorial radius in km, NASA Planetary Fact Sheets (nssdc.gsfc.nasa.gov/planetary/factsheet/<body>fact.html,
 * read 2026-11-06). Gas giants: the 1 bar level. Saturn's value is the globe; the rings are wider.
 */
export const EQUATORIAL_RADIUS_KM: Readonly<Record<CardBody, number>> = {
  Mercury: 2440.5,
  Venus: 6051.8,
  Mars: 3396.2,
  Jupiter: 71492,
  Saturn: 60268,
  Uranus: 25559,
  Neptune: 24764,
  Moon: 1738.1,
};

export type Basis = 'sourced' | 'assumption';

export interface RotationSpec {
  /** Rotation period in hours, positive. Retrograde rotation changes the direction, not the speed. */
  periodH: number;
  basis: Basis;
  note: string;
}

/**
 * Sidereal rotation periods. SOURCED: NASA Planetary Fact Sheets (same pages, read 2026-11-06): Mercury 1407.6 h,
 * Mars 24.6229 h, Jupiter 9.9250 h, Saturn 10.656 h, Uranus 17.24 h (retrograde), Neptune 16.11 h. The gas giants'
 * figures are the interior (magnetic) period; the visible equatorial winds turn slightly faster (a few per cent),
 * which makes the true limit a few per cent shorter.
 * Venus: the fact sheet gives the solid body (5832.6 h, retrograde) but the markings you can image are in the clouds,
 * which circle in about 4 days. That 96 h is an ASSUMPTION (general knowledge, not read from a source for this build).
 * The Moon keeps one face to Earth: it does not rotate under the camera, so it has no rotation limit.
 */
export const ROTATION: Readonly<Record<Exclude<CardBody, 'Moon'>, RotationSpec>> = {
  Mercury: { periodH: 1407.6, basis: 'sourced', note: 'NASA Planetary Fact Sheet (surface)' },
  Venus: { periodH: 96, basis: 'assumption', note: 'cloud-top circulation of about 4 days; the fact sheet period (5832.6 h) is the solid body' },
  Mars: { periodH: 24.6229, basis: 'sourced', note: 'NASA Planetary Fact Sheet' },
  Jupiter: { periodH: 9.925, basis: 'sourced', note: 'NASA Planetary Fact Sheet (interior period; the equator turns a few per cent faster)' },
  Saturn: { periodH: 10.656, basis: 'sourced', note: 'NASA Planetary Fact Sheet (interior period; the equator turns a few per cent faster)' },
  Uranus: { periodH: 17.24, basis: 'sourced', note: 'NASA Planetary Fact Sheet (retrograde)' },
  Neptune: { periodH: 16.11, basis: 'sourced', note: 'NASA Planetary Fact Sheet' },
};

/**
 * Smear limit for a clip. A feature at the middle of the disc moves across the image at (2 pi / period) times the
 * apparent radius. The clip is long enough to smear it by this fraction of the telescope's resolution. ASSUMPTION:
 * half a resolution element; the stack stays sharp to that, and WinJUPOS derotation can take clips beyond it.
 */
export const SMEAR_FRACTION_OF_RESOLUTION = 0.5;
/** Dawes limit in arcsec: 116 / aperture in mm (the classical double-star criterion, used here as the telescope's resolution). */
export const DAWES_ARCSEC_MM = 116;
/** ASSUMPTION: no clip is suggested longer than this, whatever the rotation allows (seeing drifts and files grow). */
export const MAX_CLIP_S = 180;
/** ASSUMPTION: time between clips for saving, checking focus and starting the next one. */
export const CLIP_GAP_S = 30;
/** ASSUMPTION: how long one planetary session at the telescope is planned to run, excluding cool-down. */
export const SESSION_MIN = 30;
/** ASSUMPTION: time for the telescope to settle toward the night air before serious focusing (a large catadioptric is slow). The cool-down time is not measured here. */
export const COOLDOWN_MIN = 45;

// ---- Exposure -----------------------------------------------------------------------------------

export interface StartExposure {
  /** Milliseconds; null: no number is given for this body. */
  ms: number | null;
  basis: 'assumption' | 'sourced';
  /** The gain that went with a sourced exposure. */
  gain?: number;
  /** Sourced: the source's own table has this body fainter than Jupiter, so it needs the longer exposure. */
  fainterThanJupiter?: boolean;
  /** How the source shot it, when that matters. */
  setup?: string;
}

/**
 * Starting exposure per body for the guide.
 * Jupiter: ASSUMPTION, 10 ms, a round number for a Jupiter-bright planet at f/10 (the source below used 2 ms on its own setup).
 * Saturn, Mars, Uranus, Neptune: SOURCED, Table 1 of the Technical University of Munich astronomy club's planet seminar
 * (https://www.asg.ed.tum.de/fesg/astronomy-club/astronomy-seminar/planets/, read 2026-11-07): exposure and gain of one club's
 * own telescope and camera (Mars and Neptune with a 2x Barlow), so the value is an order of magnitude, not a setting for this train. The
 * same page says Saturn takes longer exposures than Jupiter and Neptune the longest.
 * Mercury, Venus, Moon: no source found, so no number.
 */
export const START_EXPOSURE: Readonly<Record<CardBody, StartExposure>> = {
  Mercury: { ms: null, basis: 'assumption' },
  Venus: { ms: null, basis: 'assumption' },
  Mars: { ms: 15, basis: 'sourced', gain: 246, setup: ' with a 2x Barlow lens' },
  Jupiter: { ms: 10, basis: 'assumption' },
  Saturn: { ms: 64, basis: 'sourced', gain: 104, fainterThanJupiter: true },
  Uranus: { ms: 120, basis: 'sourced', gain: 528, fainterThanJupiter: true },
  Neptune: { ms: 130, basis: 'sourced', gain: 478, fainterThanJupiter: true, setup: ' with a 2x Barlow lens' },
  Moon: { ms: null, basis: 'assumption' },
};

// ---- Sampling ----------------------------------------------------------------------------------

/** ASSUMPTION: typical seeing, arcsec (FWHM), for a backyard site; the planner has no seeing data. */
export const SEEING_ASSUMED_ARCSEC = 2;
/** ASSUMPTION: wavelength in nm for the sampling check (green, the middle of the colour camera's response). */
export const SAMPLING_WAVELENGTH_NM = 500;
/** ASSUMPTION: a scale finer than this fraction of the Nyquist scale is oversampled. */
export const OVERSAMPLED_BELOW = 0.5;
/** ASSUMPTION: a scale coarser than this multiple of the Nyquist scale undersamples the telescope's detail. */
export const UNDERSAMPLED_ABOVE = 1.25;

// ---- Atmospheric dispersion --------------------------------------------------------------------

/** Wavelengths in nm for the red-to-blue spread. ASSUMPTION: typical edges of the blue and red channels of a colour camera. */
export const BLUE_NM = 450;
export const RED_NM = 650;
/**
 * SOURCED: Edlen (1966, Metrologia 2, 71) dispersion formula for standard air (15 C, 101.325 kPa, dry):
 * (n - 1) * 1e8 = 8342.13 + 2406030 / (130 - s^2) + 15997 / (38.9 - s^2), s = 1 / wavelength in micrometres.
 * The spread is (n_blue - n_red) * tan(zenith distance), flat-atmosphere approximation. At the site's height the air is thinner
 * (about 5 per cent less pressure at 480 m, estimate), so the spread is a little smaller than computed.
 */
export const EDLEN = { a: 8342.13, b: 2406030, c: 130, d: 15997, e: 38.9 } as const;
/** ASSUMPTION: red-to-blue spread up to one resolution element (the Dawes limit) is accepted without a corrector. */
export const DISPERSION_LIMIT_RESOLUTIONS = 1;

// ---- Moon ----------------------------------------------------------------------------------------

/** ASSUMPTION: neighbouring panels of a Moon mosaic overlap by this fraction. */
export const MOSAIC_OVERLAP = 0.2;
/** ASSUMPTION: the Moon is imaged in clips of this length, seconds (no rotation limit; the limit is the terminator light and drift). */
export const MOON_CLIP_S = 60;
