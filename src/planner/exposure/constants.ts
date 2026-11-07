/**
 * Every constant of the exposure estimate. Each is either cited (source named)
 * or an ASSUMPTION: a round number chosen to be plausible, not measured. None
 * of them is a prediction for a particular night; the module labels all its
 * output "estimate" and gives a range for that reason.
 */
import type { FilterKind } from '../profile';

// ---- Filter angle shift ---------------------------------------------------

/**
 * Effective refractive index in the blue-shift formula
 *   shift = lambda * (1 - sqrt(1 - (sin(theta) / n)^2)),  theta = atan(1 / (2 N)).
 * n = 2.0 is FITTED to one vendor figure (Antlia: 2.2 nm at f/2.6; the formula gives 2.23 nm),
 * not measured. Source: ~/Token/research/astro-filters-owned.md section 4a.
 */
export const SHIFT_REFRACTIVE_INDEX = 2.0;
/** H-alpha and OIII rest wavelengths, nm. */
export const HA_NM = 656.3;
export const OIII_NM = 500.7;
/**
 * ASSUMPTION: a filter with no published rating is flagged when the edge-of-cone
 * shift at H-alpha exceeds this fraction of its narrowest passband (beyond it the
 * line sits at the band edge).
 */
export const SHIFT_BAND_FRACTION = 0.5;

// ---- Sky background, and the sub-length heuristic -------------------------

/**
 * ASSUMPTION: representative zenith sky brightness (mag/arcsec^2) per Bortle class,
 * a rounded midpoint of the commonly quoted SQM ranges.
 */
export const BORTLE_SQM: Readonly<Record<number, number>> = {
  1: 21.95, 2: 21.9, 3: 21.8, 4: 21.5, 5: 20.9, 6: 20.0, 7: 19.3, 8: 18.5, 9: 17.8,
};
/**
 * ASSUMPTION: the reference point of the rate model, chosen so that a low-noise colour camera
 * (1.2 e read noise) under Bortle 5, at f/5, 3.76 um pixels and a 300 nm passband lands near
 * 2 minutes (115 s), inside the 2 to 3 minutes amateurs commonly quote for that case.
 * Sky electrons per pixel per second at the reference point.
 */
export const REF_SKY_E_PER_PX_S = 0.25;
export const REF_SQM = 20.9;
export const REF_F_RATIO = 5;
export const REF_PIXEL_UM = 3.76;
export const REF_BANDWIDTH_NM = 300;
/**
 * The sky-limited rule of thumb: sky signal per sub of at least K times read noise squared
 * (K = 20 keeps read noise to about 5% of the noise variance). Common practice in
 * amateur imaging, used here as an ASSUMPTION; no single published value.
 */
export const SKY_LIMIT_K = 20;
/** ASSUMPTION: read noise (electrons) behind each class; the profile stores the class, not a number. */
export const READ_NOISE_E: Readonly<Record<'low' | 'medium' | 'high', number>> = { low: 1.2, medium: 3, high: 8 };
/** ASSUMPTION: used when the camera has no read-noise class. The result is flagged as assumed. */
export const DEFAULT_READ_NOISE_CLASS = 'medium' as const;
/** ASSUMPTION: passband (nm) when neither the filter nor its kind says; 400 to 700 nm, no filter. */
export const NO_FILTER_BANDWIDTH_NM = 300;
/** ASSUMPTION: typical total passband width per filter kind, used only when the filter has no width. */
export const KIND_BANDWIDTH_NM: Readonly<Record<FilterKind, number>> = {
  'broadband-LP': 150,
  'dual-band': 50,
  'tri-band': 60,
  narrowband: 7,
  'UV-IR cut': 260,
  'visual-only': 150,
};
export const UNKNOWN_KIND_BANDWIDTH_NM = 150;
/**
 * ASSUMPTION: moonlight adds to the sky as 1 + gain * illuminated fraction * closeness, where
 * closeness falls linearly from 1 at 0 degrees to 0 at MOON_FALLOFF_DEG. Only while the Moon is up.
 */
export const MOON_GAIN = 3;
export const MOON_FALLOFF_DEG = 90;
/** ASSUMPTION: shortest and longest sub the heuristic returns (seconds); the long cap stands for guiding, wind and satellite-trail risk. */
export const MIN_SUB_S = 10;
export const MAX_SUB_S = 300;
/** ASSUMPTION: the lengths a sub is rounded to (nearest on a log scale). */
export const SUB_STEPS_S: readonly number[] = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300];
/** ASSUMPTION: the sub-length range is this wide (factor each way) when every input is known. */
export const SUB_RANGE_FACTOR = 1.5;
/** ASSUMPTION: the sub-length range is this wide (factor each way) when an input was assumed. */
export const SUB_RANGE_FACTOR_ASSUMED = 2;

// ---- Modes ----------------------------------------------------------------

export type ExposureMode = 'quick' | 'balanced' | 'deep';
export const MODE_ORDER: readonly ExposureMode[] = ['quick', 'balanced', 'deep'];

export interface ModeSpec {
  label: string;
  /** Total integration range, minutes. */
  rangeMin: readonly [number, number];
  /** Where in the range the plan aims, minutes. */
  targetMin: number;
  /** Sub length as a multiple of the sky-limited minimum. */
  subMargin: number;
}
/**
 * Quick 30 to 60 min, Balanced 60 to 120 min: the owner's ranges (planner spec section 07).
 * Deep Project 120 to 300 min is an ASSUMPTION (the spec gives no number; it asks to avoid marathons).
 * The target inside each range is the midpoint or an ASSUMPTION. subMargin is an ASSUMPTION:
 * a longer plan earns more margin over the sky-limited minimum (read noise a smaller share, fewer frames to dither and download);
 * the quick mode uses the minimum.
 */
export const MODES: Readonly<Record<ExposureMode, ModeSpec>> = {
  quick: { label: 'Quick & Beautiful', rangeMin: [30, 60], targetMin: 45, subMargin: 1 },
  balanced: { label: 'Balanced', rangeMin: [60, 120], targetMin: 90, subMargin: 1.5 },
  deep: { label: 'Deep Project', rangeMin: [120, 300], targetMin: 180, subMargin: 2 },
};

// ---- Overhead (all ASSUMPTIONS) -------------------------------------------

/** Setting up, polar alignment, focusing and framing, before imaging starts. */
export const SETUP_MIN = 30;
/** A dither at least every this many frames, and at least every DITHER_MIN_INTERVAL_S seconds. */
export const DITHER_EVERY_FRAMES = 3;
export const DITHER_MIN_INTERVAL_S = 120;
/** Seconds to move and settle after one dither. */
export const DITHER_SETTLE_S = 10;
/** Refocus once per this much integration, taking AUTOFOCUS_MIN each (the first focus is in setup). */
export const AUTOFOCUS_EVERY_MIN = 60;
export const AUTOFOCUS_MIN = 3;
export const MERIDIAN_FLIP_MIN = 10;
/** The overhead total is uncertain by this factor below and above. */
export const OVERHEAD_RANGE: readonly [number, number] = [0.7, 1.5];
/** Share of planned integration that may be lost to clouds, trails and rejected frames: 0 to this. */
export const REJECT_FRACTION_MAX = 0.2;

// ---- Marginal benefit -----------------------------------------------------

/** 30, 60, 90 and 120 minutes: the steps the planner brief asks for (spec section 07, Quality per Hour). */
export const MARGINAL_MINUTES: readonly number[] = [30, 60, 90, 120];
/** ASSUMPTION: unmodelled noise (dark current, pattern, drift) takes up to this share of the ideal gain. */
export const SNR_GAIN_LOSS_MAX = 0.3;

// ---- Sampling (assumptions) -----------------------------------------------

/** Below this many arcsec per pixel the sensor oversamples typical backyard seeing (ASSUMPTION: seeing 2 to 3 arcsec). */
export const OVERSAMPLED_BELOW_ARCSEC = 0.5;
/** Above this the stars are undersampled (ASSUMPTION). */
export const UNDERSAMPLED_ABOVE_ARCSEC = 2.0;

// ---- Moon note --------------------------------------------------------------

/** ASSUMPTION: the Moon note appears when the Moon is up, at least this lit and closer than this to the target. */
export const MOON_NOTE_ILLUMINATION = 0.5;
export const MOON_NOTE_SEPARATION_DEG = 60;

// ---- Sky --------------------------------------------------------------------

/** ASSUMPTION: Bortle class used until the user sets one; the planner does not know the owner's sky. */
export const DEFAULT_BORTLE = 6;
