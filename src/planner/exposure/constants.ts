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
 * ASSUMPTION: the reference point of the rate model, sky electrons per pixel per second at SQM 20.9,
 * f/5, 3.76 um pixels and a 300 nm passband. Cross-check (research, section 1a): a V=0 flux of about
 * 1000 photons/s/cm2/A over 300 nm at SQM 20.9 gives 2.5 photons/px/s at f/5; a colour sensor, QE, optics and
 * obstruction pass about 10 to 12%, so 0.25 to 0.3 e. Agrees within about 1.5x. A measured background
 * (median ADU x gain / exposure) would replace it; the profile does not store one yet.
 * Source: ~/Token/research/fourpeaks-exposure-modes.md.
 */
export const REF_SKY_E_PER_PX_S = 0.25;
export const REF_SQM = 20.9;
export const REF_F_RATIO = 5;
export const REF_PIXEL_UM = 3.76;
export const REF_BANDWIDTH_NM = 300;
/**
 * The sky-limited rule: sky electrons per sub at least K times read noise squared (t = K * RN^2 / S).
 * The stack's noise then exceeds the ideal by sqrt(1 + 1/K): K = 5 gives +9.5%, K = 10 +4.9%, K = 20 +2.5%.
 * K = 10 is the standard (SharpCap's "10 x RN^2 / rate"; Starizona offers 5, 10 or 15% and calls 5% usual;
 * Clarkvision speaks of about a 5% loss). SharpCap's post calls K = 10 "10%"; the derivation says 4.9%, and
 * that is what is used. Source: ~/Token/research/fourpeaks-exposure-modes.md section 1a. The presets use 5, 10 and 20.
 */
export const SKY_LIMIT_K = 10;
/**
 * ASSUMPTION: read noise (electrons) behind each class; the profile stores the class, not a number.
 * low = 1.0 e: the ASI2600MC Duo at gain 100 (HCG), "as low as 1.0 e" (ZWO); the other ZWO document says 0.9 to 4.2 e,
 * and nothing replaces a measurement (SharpCap Sensor Analysis). medium and high are round numbers for older CMOS and CCD.
 */
export const READ_NOISE_E: Readonly<Record<'low' | 'medium' | 'high', number>> = { low: 1.0, medium: 3, high: 8 };
/** ASSUMPTION: used when the camera has no read-noise class. The result is flagged as assumed. */
export const DEFAULT_READ_NOISE_CLASS = 'medium' as const;
/** ASSUMPTION: passband (nm) when neither the filter nor its kind says; 400 to 700 nm, no filter. */
export const NO_FILTER_BANDWIDTH_NM = 300;
/**
 * ASSUMPTION: typical total passband width per filter kind, used only when the filter has no width
 * (UNKNOWN_KIND_BANDWIDTH_NM is the same, for a filter whose kind is not set either).
 */
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
 * Names that are sold in a visual and an imaging version, so a filter with this name and no kind may be the
 * visual one. Source: ~/Token/research/astro-filters-owned.md section 3 (Orion Sky Glow: SKU 5561 imaging 2" and a
 * visual 2" Sky Glow Broadband). A note, not a warning: it depends on which one the owner has.
 */
export const VISUAL_OR_IMAGING_NAME = /sky ?glow/i;
/**
 * ASSUMPTION: moonlight adds to the sky as 1 + gain * illuminated fraction * closeness, where
 * closeness falls linearly from 1 at 0 degrees to 0 at MOON_FALLOFF_DEG. Only while the Moon is up.
 */
export const MOON_GAIN = 3;
export const MOON_FALLOFF_DEG = 90;
/**
 * Per-sub overhead in seconds (download, dither settle share): ASSUMPTION, 5 to 15 s in the research; 10 s.
 * Efficiency of a sub is t / (t + overhead): 30 s keeps 75%, 15 s keeps 60%.
 */
export const OVERHEAD_PER_SUB_S = 10;
/**
 * ASSUMPTION: the shortest sub (seconds). Below this the overhead takes over 40% of the clock (research: HyperStar broadband
 * wants 1 to 3 s by the swamp rule; "floor at 15 to 30 s"). The upper figure is left to the user as a custom value.
 */
export const MIN_SUB_S = 15;
/**
 * ASSUMPTION: the guiding ceiling (seconds): the longest sub the mount is trusted to hold round stars in. The research reports
 * 10 to 15 minute subs on a C11 with an EQ6 and a guide scope, and a t_max of 180 to 300 s; the planner already capped at 300.
 * A preset's risk cap can be lower, never higher.
 */
export const MAX_SUB_S = 300;
/**
 * ASSUMPTION: star saturation. One forum report says stars saturate "in less than 30 seconds" on an f/2-class system. Star flux per
 * pixel scales with 1/N^2, so the ceiling is this many seconds at STAR_SATURATION_REF_F and grows with the square of the focal ratio
 * (f/2 -> 30 s, f/6.3 -> about 300 s, f/10 -> 750 s: only a fast beam is limited). One report, no camera or full-well named.
 * Stars are continuum: a filter passes only its passband's share of their light, so the ceiling also grows by
 * REF_BANDWIDTH_NM / bandwidth (a 50 nm dual-band at f/1.93: about 170 s; a 14 nm pair: about 600 s). The report is probably
 * unfiltered (no filter is named), so the 30 s is for the full band and the filter scaling is this module's own arithmetic, not
 * a measurement. A filter of unknown width is scaled by its assumed width.
 */
export const STAR_SATURATION_REF_S = 30;
export const STAR_SATURATION_REF_F = 2;
/**
 * ASSUMPTION: a target flagged `brightCore` in the curated catalog (the core would clip in long subs) gets its long sub capped here;
 * `coreAdvice` then adds the short set for the core. 120 s is the top of "60 to 120 s for fast reflectors" (AstroBin), a broadband
 * fast-reflector sub, not a measured bright-core limit, carried over to bright cores on any train.
 */
export const BRIGHT_CORE_SUB_CAP_S = 120;
/** ASSUMPTION: the lengths a sub is rounded to (nearest on a log scale). */
export const SUB_STEPS_S: readonly number[] = [15, 20, 30, 45, 60, 90, 120, 180, 240, 300];
/** ASSUMPTION: the sub-length range is this wide (factor each way) when every input is known. */
export const SUB_RANGE_FACTOR = 1.5;
/** ASSUMPTION: the sub-length range is this wide (factor each way) when an input was assumed. */
export const SUB_RANGE_FACTOR_ASSUMED = 2;

// ---- Presets ----------------------------------------------------------------

/**
 * The preset ids. They are the saved names: an itinerary saved before the redesign holds 'quick', 'balanced' or 'deep',
 * and each still means the preset of that id (`presetForSavedMode`). The labels are what the user reads.
 */
export type ExposureMode = 'quick' | 'balanced' | 'deep';
export const MODE_ORDER: readonly ExposureMode[] = ['quick', 'balanced', 'deep'];

/**
 * A preset is a set of parameters, not a total. The code works sub length, count and total out of them for each object.
 * No field is a number of minutes to shoot.
 */
export interface PresetSpec {
  label: string;
  /** One sentence for the user: what the preset asks for. */
  summary: string;
  /** Swamp factor: sub length = K * read noise^2 / sky rate. Read noise adds sqrt(1 + 1/K) - 1 to the noise (5 -> 9.5%, 10 -> 4.9%, 20 -> 2.5%). */
  swampK: number;
  /** Signal-to-noise wanted per resolution element (SNR_ELEMENT_ARCSEC wide); the object's surface brightness sets the time it takes. */
  snrTarget: number;
  /** Stop when one more half hour would add less than this share of the signal-to-noise (the diminishing-returns knee). */
  maxNextHalfHourGain: number;
  /** The longest sub this preset accepts, seconds: the loss of one sub to a trail, a gust or a cloud grows with its length. Never above MAX_SUB_S. */
  riskCapS: number;
  /** Dither every this many subs, and not more often than every minIntervalS seconds (short subs dither less often). */
  dither: { everyFrames: number; minIntervalS: number };
}

/**
 * ASSUMPTION for the three SNR targets: 20 is the research's own figure (table in section 1c: SNR 20 per 2.5 arcsec element, which
 * takes a medium object, surface brightness 22, 26 minutes in Bortle 6 and under a minute for a bright one: a floor, a first look).
 * Standard and Deep are 2x and 3x that, so time is 4x and 9x: the same medium object then takes about 1.7 h and 3.9 h in Bortle 6 with no
 * filter. 1.7 h is inside the research's "about 0.5 to 2.5 h" at the knee; 3.9 h is outside it, and below the 4.9 h the research gives
 * the 5% knee of Deep. The old Balanced aimed at 1.5 h. They are not measured; the stop thresholds cap them (see maxNextHalfHourGain).
 * ASSUMPTION for the loss model behind the risk caps (events at 1 per hour spoil a sub of length t
 * with probability 1 - exp(-t / 1 h): 60 s costs 1.7%, 180 s 4.9%, 300 s 8%); the sources give the shape, not these numbers.
 * K = 5, 10, 20 and the 20%, 10% and 5% stop thresholds are the research's table (section 5). 20% stops near 1.1 h, 10% near 2.4 h,
 * 5% near 4.9 h of total light. Dither: every 3 subs and not more often than every 2 minutes, as before.
 */
export const PRESETS: Readonly<Record<ExposureMode, PresetSpec>> = {
  quick: {
    label: 'Quick & Beautiful',
    summary: 'Short subs, the base signal-to-noise target, stops early. For a short night or a first look. A bright object needs about 30 minutes in every preset; the presets then differ in sub length and count.',
    swampK: 5,
    snrTarget: 20,
    maxNextHalfHourGain: 0.2,
    riskCapS: 180,
    dither: { everyFrames: 3, minIntervalS: 120 },
  },
  balanced: {
    label: 'Balanced',
    summary: 'Sub length from the sky, twice the base signal-to-noise target, stops where more time adds under 10% per half hour.',
    swampK: SKY_LIMIT_K,
    snrTarget: 40,
    maxNextHalfHourGain: 0.1,
    riskCapS: 300,
    dither: { everyFrames: 3, minIntervalS: 120 },
  },
  deep: {
    label: 'Deep Project',
    summary: 'Longer subs, three times the base signal-to-noise target, stops where more time adds under 5% per half hour or the night ends.',
    swampK: 20,
    snrTarget: 60,
    maxNextHalfHourGain: 0.05,
    riskCapS: 300,
    dither: { everyFrames: 3, minIntervalS: 120 },
  },
};

/**
 * ASSUMPTION: the resolution element the signal-to-noise target is measured over, 2.5 arcsec on a side (about typical backyard
 * seeing), so 6.25 square arcsec. With SNR 20 it reproduces the research table (C11, Bortle 6, no filter, surface brightness 22: 26 min).
 */
export const SNR_ELEMENT_ARCSEC = 2.5;
/** ASSUMPTION: the least total light worth the setup (SETUP_MIN is 30): the lower end of the owner's old Quick range (planner spec section 07). */
export const MIN_TOTAL_MIN = 30;
/** ASSUMPTION: the range around the planned total starts at this share of it (half the light still gives 71% of the signal-to-noise, sqrt(0.5)). */
export const TOTAL_RANGE_LOW_FRACTION = 0.5;
/** ASSUMPTION: share of an emission object's light a filter passes (the research: about 85% peak for a dual-band filter). Used for any filter. */
export const FILTER_PEAK_THROUGHPUT = 0.85;
/**
 * ASSUMPTION: catalog types whose light is mostly emission lines (the filter passes their lines and cuts the sky, so their contrast
 * rises as the passband narrows). Every other type is treated as continuum: the filter cuts the object and the sky alike.
 * Reflection nebulae are in 'nebula' and are not emission; the catalog has no finer type.
 */
export const EMISSION_TYPES: readonly string[] = ['nebula', 'planetary-nebula', 'supernova-remnant'];
/**
 * ASSUMPTION: surface brightness classes from the catalog's mean surface brightness (mag/arcsec2, B band in OpenNGC, compared with the
 * sky as if it were the same band): brighter than SB_HIGH_BELOW is 'high', fainter than or equal to SB_LOW_FROM is 'low'. The research table's rows
 * are 20 (bright), 22 (medium) and 24 (faint); the class stands for that row when the number is missing.
 */
export const SB_HIGH_BELOW = 22;
export const SB_LOW_FROM = 24;
export const SB_CLASS_MU: Readonly<Record<'high' | 'medium' | 'low', number>> = { high: 20, medium: 22, low: 24 };
/** ASSUMPTION: used when the target has neither a number nor a class: the medium row. The result says it was assumed. */
export const UNKNOWN_SB_CLASS = 'medium' as const;
/** The stop rule by diminishing returns, from the next-half-hour gain g: sqrt((T + 30) / T) - 1 < g. See `marginalKneeMin`. */
export const KNEE_STEP_MIN = 30;

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

// ---- Bright-core second set -------------------------------------------------

/** ASSUMPTION: the core set uses subs this many times shorter than the recommended long sub (about 3 stops). */
export const CORE_SUB_DIVISOR = 8;
/** ASSUMPTION: a fixed, stated frame count for the core set; not tuned per night. */
export const CORE_FRAME_COUNT = 20;
/** ASSUMPTION: a core set is only worth a second stack when the long sub is at least this many times longer than the short one (about 2 stops). */
export const CORE_MIN_RATIO = 4;
