import { normalizeName } from '../catalog';
import type { ProfileFilter, ReadNoiseClass } from '../profile';
import {
  AUTOFOCUS_EVERY_MIN,
  BRIGHT_CORE_SUB_CAP_S,
  EMISSION_TYPES,
  FILTER_PEAK_THROUGHPUT,
  KNEE_STEP_MIN,
  MIN_TOTAL_MIN,
  PRESETS,
  SB_CLASS_MU,
  SB_HIGH_BELOW,
  SB_LOW_FROM,
  SNR_ELEMENT_ARCSEC,
  STAR_SATURATION_REF_F,
  STAR_SATURATION_REF_S,
  TOTAL_RANGE_LOW_FRACTION,
  UNKNOWN_SB_CLASS,
  AUTOFOCUS_MIN,
  BORTLE_SQM,
  CORE_FRAME_COUNT,
  CORE_MIN_RATIO,
  CORE_SUB_DIVISOR,
  DEFAULT_READ_NOISE_CLASS,
  DITHER_EVERY_FRAMES,
  DITHER_MIN_INTERVAL_S,
  DITHER_SETTLE_S,
  HA_NM,
  KIND_BANDWIDTH_NM,
  MARGINAL_MINUTES,
  MAX_SUBS,
  MAX_SUB_S,
  MERIDIAN_FLIP_MIN,
  MIN_CUSTOM_SUB_S,
  MIN_SUB_S,
  MODE_ORDER,
  MOON_FALLOFF_DEG,
  MOON_GAIN,
  MOON_NOTE_ILLUMINATION,
  MOON_NOTE_SEPARATION_DEG,
  NO_FILTER_BANDWIDTH_NM,
  OVERHEAD_PER_SUB_S,
  SAME_NOISE_TOLERANCE,
  OVERHEAD_RANGE,
  READ_NOISE_E,
  REF_BANDWIDTH_NM,
  REF_F_RATIO,
  REF_PIXEL_UM,
  REF_SKY_E_PER_PX_S,
  REF_SQM,
  REJECT_FRACTION_MAX,
  SETUP_MIN,
  SHIFT_BAND_FRACTION,
  SHIFT_REFRACTIVE_INDEX,
  SKY_LIMIT_K,
  SNR_GAIN_LOSS_MAX,
  SUB_RANGE_FACTOR,
  SUB_RANGE_FACTOR_ASSUMED,
  SUB_STEPS_S,
  UNKNOWN_KIND_BANDWIDTH_NM,
  VISUAL_OR_IMAGING_NAME,
} from './constants';
import type { ExposureMode } from './constants';

export * from './constants';

/** Every number this module returns is an estimate; the field makes that part of the data. */
export const ESTIMATE = 'estimate' as const;

// ---------------------------------------------------------------- filter fit

/**
 * Blue shift of a passband at the edge of the beam, nm, for a filter at focal ratio N:
 * lambda * (1 - sqrt(1 - (sin(theta) / n)^2)), theta = atan(1 / (2 N)). See SHIFT_REFRACTIVE_INDEX.
 */
export function edgeShiftNm(fRatio: number, wavelengthNm: number): number {
  if (!(fRatio > 0) || !Number.isFinite(fRatio)) throw new RangeError(`fRatio must be positive: ${fRatio}`);
  const theta = Math.atan(1 / (2 * fRatio));
  const s = Math.sin(theta) / SHIFT_REFRACTIVE_INDEX;
  return wavelengthNm * (1 - Math.sqrt(1 - s * s));
}

/** Half-angle of the beam in degrees, atan(1 / (2 N)). */
export function beamHalfAngleDeg(fRatio: number): number {
  return (Math.atan(1 / (2 * fRatio)) * 180) / Math.PI;
}

export type WarningCode =
  | 'filter-rated-slower'
  | 'filter-uvir-missing'
  | 'filter-needs-uvir'
  | 'filter-visual-colour'
  | 'filter-kind-unknown'
  | 'moon-near'
  | 'no-usable-time'
  | 'limited-by-usable-time'
  | 'count-capped'
  | 'meridian-flip';

export interface ExposureWarning {
  code: WarningCode;
  /** 'warning' needs a look before shooting; 'note' is context. The UI shows the word, not only a colour. */
  severity: 'warning' | 'note';
  /** The short line the row shows. */
  text: string;
}

export interface FitCamera {
  colour?: boolean;
  hasUvIrCut?: boolean;
}

/** Focal ratio as printed: f/1.93, f/7, f/10. */
const fr = (x: number) => String(Number(x.toFixed(2)));

/** Filter-fit warnings for one train: beam speed, missing UV/IR cut, visual-first filter on a colour camera. */
export function filterWarnings(fRatio: number, filter: ProfileFilter | null, camera: FitCamera): ExposureWarning[] {
  const out: ExposureWarning[] = [];
  if (filter) {
    const name = filter.name;
    if (filter.ratedMinFRatio !== undefined && fRatio < filter.ratedMinFRatio) {
      out.push({ code: 'filter-rated-slower', severity: 'warning', text: `Filter not rated f/${fr(fRatio)}` });
    } else if (filter.maxIncidentAngleDeg !== undefined && beamHalfAngleDeg(fRatio) > filter.maxIncidentAngleDeg) {
      out.push({ code: 'filter-rated-slower', severity: 'warning', text: `Filter not rated f/${fr(fRatio)}` });
    } else if (
      filter.ratedMinFRatio === undefined &&
      filter.narrowestBandNm !== undefined &&
      edgeShiftNm(fRatio, HA_NM) > filter.narrowestBandNm * SHIFT_BAND_FRACTION
    ) {
      out.push({ code: 'filter-rated-slower', severity: 'warning', text: `Filter not rated f/${fr(fRatio)}` });
    }
    const needsCut = filter.needsUvIrCut === true && camera.hasUvIrCut !== true && filter.blocksUvIr !== true;
    if (needsCut) {
      out.push({ code: 'filter-needs-uvir', severity: 'warning', text: 'No UV/IR cut' });
    }
    if (camera.hasUvIrCut === false && filter.blocksUvIr !== true && !needsCut) {
      out.push({ code: 'filter-uvir-missing', severity: 'warning', text: 'No UV/IR cut' });
    }
    if (filter.kind === undefined && camera.colour === true && VISUAL_OR_IMAGING_NAME.test(name)) {
      out.push({ code: 'filter-kind-unknown', severity: 'note', text: 'Visual filter' });
    }
    if (filter.kind === 'visual-only' && camera.colour === true) {
      out.push({ code: 'filter-visual-colour', severity: 'warning', text: 'Visual filter' });
    }
  } else if (camera.hasUvIrCut === false) {
    out.push({ code: 'filter-uvir-missing', severity: 'warning', text: 'No UV/IR cut' });
  }
  return out;
}

// ----------------------------------------------------------------- the target

export type SurfaceBrightness = 'high' | 'medium' | 'low' | 'unknown';

export interface ExposureTarget {
  id?: string;
  name?: string;
  aliases?: readonly string[];
  /** Catalog type, e.g. 'galaxy'. */
  type?: string;
  /** The class, from the catalog's number (`surfaceBrightnessClassOf`) or curated. Unknown for a target with neither. */
  surfaceBrightness?: SurfaceBrightness;
  /** The catalog's mean surface brightness, mag per square arcsecond; the stop point uses it when there is one. */
  surfaceBrightnessMu?: number;
  /** Curated catalog flag: the core would clip in long subs. */
  brightCore?: boolean;
}

/** ASSUMPTION: types whose surface brightness is high without a catalog value (compact, bright objects). */
const BRIGHT_TYPES: readonly string[] = ['globular-cluster', 'open-cluster', 'planetary-nebula'];

/** The class of a surface brightness number (mag/arcsec2; smaller is brighter): SB_HIGH_BELOW and SB_LOW_FROM are the cuts. */
export function surfaceBrightnessClassOf(mu: number): Exclude<SurfaceBrightness, 'unknown'> {
  return mu < SB_HIGH_BELOW ? 'high' : mu >= SB_LOW_FROM ? 'low' : 'medium';
}

/** The class given, else the class of the catalog's number; compact bright types are 'high'; everything else 'unknown'. Never guessed otherwise. */
export function surfaceBrightnessOf(t: Pick<ExposureTarget, 'surfaceBrightness' | 'surfaceBrightnessMu' | 'type'>): SurfaceBrightness {
  if (t.surfaceBrightness !== undefined) return t.surfaceBrightness;
  if (t.surfaceBrightnessMu !== undefined) return surfaceBrightnessClassOf(t.surfaceBrightnessMu);
  return t.type !== undefined && BRIGHT_TYPES.includes(t.type) ? 'high' : 'unknown';
}

export type Priority = 'high' | 'medium' | 'low' | 'unknown';

/** Short-session rule (spec 07): bright compact targets outrank faint low-surface-brightness ones. */
export function shortSessionPriority(t: Pick<ExposureTarget, 'surfaceBrightness' | 'surfaceBrightnessMu' | 'type'>): Priority {
  return surfaceBrightnessOf(t);
}

/** True for Ou4 (the Squid Nebula) by id, name or alias. */
export function isOu4(t: Pick<ExposureTarget, 'id' | 'name' | 'aliases'>): boolean {
  return [t.id, t.name, ...(t.aliases ?? [])].some((s) => s !== undefined && normalizeName(s) === 'ou4');
}

/** What the exposure advice reads of a target: a curated target and a catalog search target both fit. */
export interface ExposureSource {
  id: string;
  name: string;
  aliases: readonly string[];
  type: string;
  /** The catalog's mean surface brightness, mag/arcsec2 (OpenNGC, or computed from magnitude and size); absent when it has none. */
  surfaceBrightness?: number;
  /** Curated only; absent means no. */
  brightCore?: boolean;
}

/** The catalog's surface brightness reaches the exposure advice here: the number for the stop point, its class for the short-session rule. */
export function exposureTargetFrom(t: ExposureSource): ExposureTarget {
  return {
    id: t.id,
    name: t.name,
    aliases: t.aliases,
    type: t.type,
    brightCore: t.brightCore,
    ...(t.surfaceBrightness === undefined ? {} : { surfaceBrightnessMu: t.surfaceBrightness }),
  };
}

// ------------------------------------------------------------ core exposure

export interface CoreAdvice {
  label: typeof ESTIMATE;
  /** Short sub length for the core, seconds. */
  subSeconds: number;
  /** Fixed default (CORE_FRAME_COUNT), not tuned per night. */
  frames: number;
}

/**
 * A second, short set for a flagged bright core: the long sub divided by CORE_SUB_DIVISOR, snapped to the
 * allowed sub lengths. Nothing for an unflagged target, or when the snapped short sub would be less than
 * CORE_MIN_RATIO times shorter than the long one (the long subs are already near the shortest the module allows). The train sets the long sub, so it is
 * already inside `longSubSeconds`.
 */
export function coreAdvice(target: Pick<ExposureTarget, 'brightCore'>, longSubSeconds: number): CoreAdvice | null {
  if (target.brightCore !== true) return null;
  if (!(longSubSeconds > 0)) throw new RangeError(`longSubSeconds must be above zero: ${longSubSeconds}`);
  const subSeconds = snapSub(longSubSeconds / CORE_SUB_DIVISOR);
  if (longSubSeconds / subSeconds < CORE_MIN_RATIO) return null;
  return { label: ESTIMATE, subSeconds, frames: CORE_FRAME_COUNT };
}

// ------------------------------------------------------------------ sub length

export interface SkyInput {
  /** Bortle class 1 to 9. */
  bortle: number;
  /** Illuminated fraction 0..1. */
  moonIllumination: number;
  moonSeparationDeg: number;
  moonUp: boolean;
}

export function moonFactor(sky: Pick<SkyInput, 'moonIllumination' | 'moonSeparationDeg' | 'moonUp'>): number {
  if (!sky.moonUp) return 1;
  const closeness = Math.max(0, 1 - sky.moonSeparationDeg / MOON_FALLOFF_DEG);
  return 1 + MOON_GAIN * sky.moonIllumination * closeness;
}

/**
 * Sky electrons per pixel per second. Scales with pixel area, with 1 / N^2 (the pixel's collecting solid
 * angle times the aperture), with passband width, and with the sky's surface brightness (magnitudes).
 */
export function skyRate(p: { pixelUm: number; fRatio: number; bandwidthNm: number; sky: SkyInput }): number {
  const sqm = BORTLE_SQM[p.sky.bortle];
  return (
    REF_SKY_E_PER_PX_S *
    (p.pixelUm / REF_PIXEL_UM) ** 2 *
    (REF_F_RATIO / p.fRatio) ** 2 *
    (p.bandwidthNm / REF_BANDWIDTH_NM) *
    10 ** (0.4 * (REF_SQM - sqm)) *
    moonFactor(p.sky)
  );
}

/** Sky-limited minimum sub, seconds: K * readNoise^2 / skyRate (K defaults to SKY_LIMIT_K, 10). */
export function skyLimitedSeconds(readNoiseE: number, rate: number, k: number = SKY_LIMIT_K): number {
  return (k * readNoiseE * readNoiseE) / rate;
}

/** How much a sub of `subSeconds` adds to the stack's noise over the ideal: sqrt(1 + RN^2 / (S t)) - 1, as a fraction. */
export function readNoisePenalty(readNoiseE: number, rate: number, subSeconds: number): number {
  return Math.sqrt(1 + (readNoiseE * readNoiseE) / (rate * subSeconds)) - 1;
}

/** The largest allowed sub length not above `seconds` (MIN_SUB_S when none is). */
export function snapSubDown(seconds: number): number {
  return SUB_STEPS_S.reduce((best, step) => (step <= seconds && step > best ? step : best), MIN_SUB_S);
}

/** Nearest allowed sub length on a log scale, after clamping to [MIN_SUB_S, MAX_SUB_S]. */
export function snapSub(seconds: number): number {
  const s = Math.min(MAX_SUB_S, Math.max(MIN_SUB_S, seconds));
  return SUB_STEPS_S.reduce((best, step) => (Math.abs(Math.log(step / s)) < Math.abs(Math.log(best / s)) ? step : best));
}

/**
 * Noise variance of the stack per unit of clock time for subs of `t` seconds: (1 + RN^2 / (S t)) / (t / (t + overhead)). Lower is better.
 * Read noise falls with longer subs, overhead falls with them too; nothing here rewards a sub beyond what the sky needs.
 */
export function noiseCost(readNoiseE: number, rate: number, t: number): number {
  return (1 + (readNoiseE * readNoiseE) / (rate * t)) / (t / (t + OVERHEAD_PER_SUB_S));
}

/**
 * The sub length to recommend, from the sky-limited length `wanted` (already clamped to [MIN_SUB_S, ceiling]): the step nearest to it
 * (never above the ceiling), then, when a SHORTER step gives the same stacked noise (noise per clock time within SAME_NOISE_TOLERANCE, read noise
 * and overhead both counted), that shorter step. A longer sub is never chosen for noise it does not buy.
 */
export function pickSub(readNoiseE: number, rate: number, wanted: number, ceiling: number): number {
  const snapped = snapSub(wanted);
  const nearest = snapped > ceiling ? snapSubDown(ceiling) : snapped;
  const reference = noiseCost(readNoiseE, rate, nearest);
  const same = SUB_STEPS_S.find((t) => t >= MIN_SUB_S && t < nearest && noiseCost(readNoiseE, rate, t) <= reference * (1 + SAME_NOISE_TOLERANCE));
  return same ?? nearest;
}

export interface Bandwidth {
  nm: number;
  /** True when the filter had no width and a default was used. */
  assumed: boolean;
}

export function bandwidthOf(filter: ProfileFilter | null): Bandwidth {
  if (!filter) return { nm: NO_FILTER_BANDWIDTH_NM, assumed: false };
  if (filter.passbandWidthNm !== undefined) return { nm: filter.passbandWidthNm, assumed: false };
  return { nm: filter.kind ? KIND_BANDWIDTH_NM[filter.kind] : UNKNOWN_KIND_BANDWIDTH_NM, assumed: true };
}

// -------------------------------------------------------------------- overhead

export interface Overhead {
  setupMin: number;
  ditherMin: number;
  autofocusMin: number;
  meridianFlipMin: number;
  totalMin: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Frames between two dithers: every `everyFrames`, and not more often than every `minIntervalS` seconds. */
export function ditherEvery(subSeconds: number, dither: { everyFrames: number; minIntervalS: number }): number {
  return Math.max(dither.everyFrames, Math.ceil(dither.minIntervalS / subSeconds));
}

export function overheadFor(
  subSeconds: number,
  subCount: number,
  flip: boolean,
  dither: { everyFrames: number; minIntervalS: number } = { everyFrames: DITHER_EVERY_FRAMES, minIntervalS: DITHER_MIN_INTERVAL_S },
): Overhead {
  const every = ditherEvery(subSeconds, dither);
  const dithers = Math.floor(subCount / every);
  const integrationMin = (subCount * subSeconds) / 60;
  const ditherMin = round1((dithers * DITHER_SETTLE_S) / 60);
  const autofocusMin = Math.floor(integrationMin / AUTOFOCUS_EVERY_MIN) * AUTOFOCUS_MIN;
  const meridianFlipMin = flip ? MERIDIAN_FLIP_MIN : 0;
  return {
    setupMin: SETUP_MIN,
    ditherMin,
    autofocusMin,
    meridianFlipMin,
    totalMin: round1(SETUP_MIN + ditherMin + autofocusMin + meridianFlipMin),
  };
}

// ---------------------------------------------------------------- marginal gain

export interface MarginalRow {
  minutes: number;
  /** Signal-to-noise relative to the 30-minute row, sqrt(minutes / 30). */
  relativeSnr: number;
  /** Range for relativeSnr: the ideal value, and the value with SNR_GAIN_LOSS_MAX of the gain lost. */
  relativeSnrRange: readonly [number, number];
  /** Gain over the previous row in percent; null for the first row. */
  gainPercent: number | null;
  /** Range for gainPercent: the gain between the two rows' lossy values, and the ideal gain; null for the first row. */
  gainPercentRange: readonly [number, number] | null;
  /** The usable time tonight covers this row. */
  availableTonight: boolean;
  label: typeof ESTIMATE;
}

/** Sky-limited SNR proportional to sqrt(time); 30, 60, 90 and 120 minutes. */
export function marginalBenefit(usableMinutes: number): MarginalRow[] {
  const base = MARGINAL_MINUTES[0];
  return MARGINAL_MINUTES.map((minutes, i) => {
    const rel = Math.sqrt(minutes / base);
    const prev = i === 0 ? null : Math.sqrt(MARGINAL_MINUTES[i - 1] / base);
    const lossy = (r: number) => 1 + (r - 1) * (1 - SNR_GAIN_LOSS_MAX);
    return {
      minutes,
      relativeSnr: rel,
      relativeSnrRange: [1 + (rel - 1) * (1 - SNR_GAIN_LOSS_MAX), rel],
      gainPercent: prev === null ? null : (rel / prev - 1) * 100,
      gainPercentRange: prev === null ? null : [(lossy(rel) / lossy(prev) - 1) * 100, (rel / prev - 1) * 100],
      availableTonight: minutes <= usableMinutes,
      label: ESTIMATE,
    };
  });
}

// ------------------------------------------------------------------ the knee

/**
 * The total light (minutes) at which one more KNEE_STEP_MIN adds less than `gain` of the signal-to-noise. Sky-limited,
 * SNR grows with sqrt(time), so the next step gains sqrt((T + 30) / T) - 1; solving for T gives 30 / ((1 + g)^2 - 1).
 * 20% -> 68 min, 10% -> 143 min, 5% -> 293 min (the research: "about 1 h, 2.4 h, 5 h").
 */
export function marginalKneeMin(gain: number): number {
  if (!(gain > 0) || !Number.isFinite(gain)) throw new RangeError(`gain must be above zero: ${gain}`);
  return KNEE_STEP_MIN / ((1 + gain) ** 2 - 1);
}

/**
 * Seconds to reach `snr` per resolution element, sky-limited: SNR^2 * (S_obj + S_sky) / S_obj^2, with both rates in electrons
 * per second per element. Halving the object's contrast quadruples the time. Read noise is not in it (it is held small by the sub length).
 */
export function secondsToSnr(snr: number, objectRate: number, skyRatePerElement: number): number {
  if (!(snr > 0)) throw new RangeError(`snr must be above zero: ${snr}`);
  if (!(objectRate > 0) || !(skyRatePerElement >= 0)) throw new RangeError(`rates must be positive: ${objectRate}, ${skyRatePerElement}`);
  return (snr * snr * (objectRate + skyRatePerElement)) / (objectRate * objectRate);
}

// ------------------------------------------------------------------ the entry point

export type Range = readonly [number, number];

/** Where the engine works from: the target, the optical train and camera and filter, the site's sky, the night, and the user's choice. */
export interface ExposureRig {
  train: { focalRatio?: number; imageScale?: number };
  camera: FitCamera & { pixelSizeUm?: number; readNoiseClass?: ReadNoiseClass };
  filter: ProfileFilter | null;
}
export interface ExposureSite {
  /** Bortle class 1 to 9. */
  bortle: number;
}
export interface ExposureNight {
  /** Illuminated fraction 0..1. */
  moonIllumination: number;
  moonSeparationDeg: number;
  moonUp: boolean;
  /** Minutes the target is usable (from the plan). */
  usableMinutes: number;
  /** When imaging can begin (first usable time); null: no clock times are computed. */
  acquisitionStart: Date | null;
  /** The next meridian crossing (hour angle zero) at or after acquisitionStart; null when it is not known. A flip is added when it falls inside the session. */
  transitTime: Date | null;
}

/** What the user can change from a preset. Any of these that differs from the preset's own value makes the result `custom`. */
export interface ExposureOverrides {
  /** Seconds per sub, used as given (not snapped, not capped). */
  subSeconds?: number;
  /** Number of subs; wins over totalMin. */
  subCount?: number;
  /** Total light in minutes. */
  totalMin?: number;
}
export interface ExposureChoice {
  preset: ExposureMode;
  overrides?: ExposureOverrides;
}
/** One change from the preset, with the preset's own value beside it. */
export interface ExposureDifference {
  field: keyof ExposureOverrides;
  preset: number;
  chosen: number;
}

/** What held the sub length where it is. */
export type SubLimit = 'read-noise' | 'risk-cap' | 'saturation' | 'floor' | 'count-cap' | 'user';
/** What held the total where it is. */
export type TotalLimit = 'snr-target' | 'diminishing-returns' | 'minimum-total' | 'usable-window' | 'count-cap' | 'user';

export interface Knee {
  /** The stop point in minutes: where the preset's SNR target is reached or one more half hour stops paying, whichever comes first (not below MIN_TOTAL_MIN in the plan). */
  minutes: number;
  /** Minutes to the preset's SNR target for this object, sky and train. */
  snrTimeMin: number;
  /** Minutes to the diminishing-returns point of the preset. */
  marginalMin: number;
  setBy: 'snr-target' | 'diminishing-returns';
  /** The surface brightness used (mag/arcsec2) and whether it was the catalog's number, a class's stand-in, or the assumed medium. */
  surfaceBrightnessMu: number;
  surfaceBrightnessFrom: 'catalog' | 'class' | 'assumed';
}

export interface ExposureResult {
  ok: true;
  /** Every number here is computed by the planner from the formulas; a model or a person did not set it. */
  source: 'calculated';
  label: typeof ESTIMATE;
  /** The preset (and its saved name). */
  mode: ExposureMode;
  modeLabel: string;
  /** True when an override differs from the preset's own value; `differs` lists them. */
  custom: boolean;
  differs: ExposureDifference[];
  /** The total the plan aims for, minutes: from half to all of the planned total. Not a fixed range of the preset. */
  modeRangeMin: Range;
  subSeconds: number;
  subSecondsRange: Range;
  subCount: number;
  /** Frames needed for the same light if the sub were at the long or the short end of subSecondsRange. */
  subCountRange: Range;
  /** Total light of the plan, minutes. */
  integrationMin: number;
  /** After clouds, trails and rejected frames. */
  usableIntegrationRangeMin: Range;
  /** Frames between dithers. */
  ditherEveryFrames: number;
  /** The camera's gain: the profile does not store a gain or HCG point, so there is no suggestion. */
  gain: { suggested: number | null };
  /** The unclamped sky-limited sub of this preset's K, seconds. */
  swampSeconds: number;
  /** Extra noise from read noise at the chosen sub, as a fraction (0.049 is 4.9%). */
  readNoisePenalty: number;
  knee: Knee;
  /** The plan's light reaches the preset's SNR target. */
  reachesSnrTarget: boolean;
  limitedBy: { sub: SubLimit; total: TotalLimit };
  overhead: Overhead;
  overheadRangeMin: Range;
  /** Setup + acquisition + dithers + autofocus + meridian flip. */
  elapsedMin: number;
  elapsedRangeMin: Range;
  /** Finish of imaging (after setup, which is done before the first usable minute); null without a start time. */
  finish: Date | null;
  /** Spans the full elapsedRangeMin (setup starts SETUP_MIN before the first usable minute); never earlier than start plus the light. */
  finishRange: readonly [Date, Date] | null;
  /** Every warning for this choice: the ones that hold for any preset first, then this preset's. */
  warnings: ExposureWarning[];
}

export type ExposureOutcome = { ok: false; label: typeof ESTIMATE; missing: string[] } | ExposureResult;

function checkInput(site: ExposureSite, night: ExposureNight): void {
  if (!Number.isInteger(site.bortle) || site.bortle < 1 || site.bortle > 9) {
    throw new RangeError(`bortle must be a whole number from 1 to 9: ${site.bortle}`);
  }
  if (!Number.isFinite(night.usableMinutes) || night.usableMinutes < 0) {
    throw new RangeError(`usableMinutes must be zero or more: ${night.usableMinutes}`);
  }
  if (!(night.moonIllumination >= 0 && night.moonIllumination <= 1)) {
    throw new RangeError(`moonIllumination must be 0 to 1: ${night.moonIllumination}`);
  }
}

function checkChoice(choice: ExposureChoice): void {
  if (!MODE_ORDER.includes(choice.preset)) throw new RangeError(`preset must be one of ${MODE_ORDER.join(', ')}: ${choice.preset}`);
  const o = choice.overrides;
  if (!o) return;
  if (o.subSeconds !== undefined && !(Number.isFinite(o.subSeconds) && o.subSeconds >= MIN_CUSTOM_SUB_S && o.subSeconds <= MAX_SUB_S)) {
    throw new RangeError(`subSeconds must be ${MIN_CUSTOM_SUB_S} to ${MAX_SUB_S}: ${o.subSeconds}`);
  }
  if (o.subCount !== undefined && !(Number.isInteger(o.subCount) && o.subCount >= 1 && o.subCount <= MAX_SUBS)) {
    throw new RangeError(`subCount must be a whole number, 1 to ${MAX_SUBS}: ${o.subCount}`);
  }
  if (o.totalMin !== undefined && !(Number.isFinite(o.totalMin) && o.totalMin > 0)) throw new RangeError(`totalMin must be above zero: ${o.totalMin}`);
}

/** Frames for the same light with longer subs (fewer) or shorter subs (more). */
function subCountRangeFor(count: number, subSeconds: number, subRange: Range): Range {
  const light = count * subSeconds;
  return [Math.floor(light / subRange[1]), Math.ceil(light / subRange[0])];
}

const minutesLater = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

interface Context {
  fRatio: number;
  pixelUm: number;
  imageScale: number;
  bw: Bandwidth;
  readNoiseE: number;
  rnClass: ReadNoiseClass;
  rnAssumed: boolean;
  rate: number;
  /** Warnings that do not depend on the preset. */
  shared: ExposureWarning[];
}

function contextFor(object: ExposureTarget, rig: ExposureRig, site: ExposureSite, night: ExposureNight): Context | { missing: string[] } {
  const fRatio = rig.train.focalRatio;
  const pixelUm = rig.camera.pixelSizeUm;
  const imageScale = rig.train.imageScale;
  const missing: string[] = [];
  if (fRatio === undefined) missing.push('train.focalRatio');
  // The stop point is worked out per square arcsecond, which needs the aperture: f-ratio, pixel size and image scale together give it.
  if (imageScale === undefined) missing.push('train.imageScale');
  if (pixelUm === undefined) missing.push('camera.pixelSizeUm');
  if (fRatio === undefined || pixelUm === undefined || imageScale === undefined) return { missing };
  // A number that is not a finite positive one (a stored value no range allows) gives no rate: the rig is missing it, the render never throws.
  const usable = (v: number) => Number.isFinite(v) && v > 0;
  if (!usable(fRatio)) missing.push('train.focalRatio');
  if (!usable(imageScale)) missing.push('train.imageScale');
  if (!usable(pixelUm)) missing.push('camera.pixelSizeUm');
  if (missing.length > 0) return { missing };

  const bw = bandwidthOf(rig.filter);
  const rnClass = rig.camera.readNoiseClass ?? DEFAULT_READ_NOISE_CLASS;
  const rnAssumed = rig.camera.readNoiseClass === undefined;
  const readNoiseE = READ_NOISE_E[rnClass];
  const sky: SkyInput = { bortle: site.bortle, moonIllumination: night.moonIllumination, moonSeparationDeg: night.moonSeparationDeg, moonUp: night.moonUp };
  const rate = skyRate({ pixelUm, fRatio, bandwidthNm: bw.nm, sky });
  if (!usable(rate)) return { missing: ['train.focalRatio', 'camera.pixelSizeUm'] };

  const shared: ExposureWarning[] = [...filterWarnings(fRatio, rig.filter, rig.camera)];
  if (night.moonUp && night.moonIllumination >= MOON_NOTE_ILLUMINATION && night.moonSeparationDeg < MOON_NOTE_SEPARATION_DEG) {
    shared.push({
      code: 'moon-near',
      severity: 'note',
      text: `Moon ${night.moonSeparationDeg.toFixed(0)}° away`,
    });
  }
  if (night.usableMinutes <= 0) {
    shared.push({ code: 'no-usable-time', severity: 'warning', text: 'Not up tonight' });
  }
  return { fRatio, pixelUm, imageScale, bw, readNoiseE, rnClass, rnAssumed, rate, shared };
}

/**
 * Star saturation ceiling for the sub (seconds): see STAR_SATURATION_REF_S. Stars are continuum, so the ceiling grows by the
 * full band over the filter's passband; no passband given means the full band.
 */
export function starSaturationCapS(fRatio: number, bandwidthNm: number = REF_BANDWIDTH_NM): number {
  if (!(bandwidthNm > 0) || !Number.isFinite(bandwidthNm)) throw new RangeError(`bandwidthNm must be positive: ${bandwidthNm}`);
  return STAR_SATURATION_REF_S * (fRatio / STAR_SATURATION_REF_F) ** 2 * (REF_BANDWIDTH_NM / bandwidthNm);
}

/** Minutes of light as the short-of-target note prints them: minutes, then hours, then "more than 10 hours" (beyond one night); never a count in the thousands. */
export function needText(min: number): string {
  if (min < 120) return `about ${Math.round(min)} minutes`;
  if (min < 600) return `about ${(Math.round(min / 6) / 10).toString()} hours`;
  return 'more than 10 hours, beyond one night';
}

function kneeFor(object: ExposureTarget, c: Context, filter: ProfileFilter | null, sky: SkyInput, preset: ExposureMode): Knee {
  const spec = PRESETS[preset];
  const cls = surfaceBrightnessOf(object);
  const from: Knee['surfaceBrightnessFrom'] = object.surfaceBrightnessMu !== undefined ? 'catalog' : cls === 'unknown' ? 'assumed' : 'class';
  const mu = object.surfaceBrightnessMu ?? SB_CLASS_MU[cls === 'unknown' ? UNKNOWN_SB_CLASS : cls];
  // Electrons per second in one resolution element: the pixels it covers times the per-pixel rate.
  const pixelsPerElement = (SNR_ELEMENT_ARCSEC / c.imageScale) ** 2;
  const skyEl = skyRate({ pixelUm: c.pixelUm, fRatio: c.fRatio, bandwidthNm: c.bw.nm, sky }) * pixelsPerElement;
  // The object's contrast is its surface brightness against the dark sky in the full band; the Moon brightens the sky only.
  const skyBroadband = skyRate({ pixelUm: c.pixelUm, fRatio: c.fRatio, bandwidthNm: REF_BANDWIDTH_NM, sky: { ...sky, moonUp: false } }) * pixelsPerElement;
  const contrast = 10 ** (0.4 * (BORTLE_SQM[sky.bortle] - mu));
  const emission = object.type !== undefined && EMISSION_TYPES.includes(object.type);
  const objectEl = skyBroadband * contrast * (filter ? FILTER_PEAK_THROUGHPUT : 1) * (emission ? 1 : c.bw.nm / REF_BANDWIDTH_NM);
  const snrTimeMin = secondsToSnr(spec.snrTarget, objectEl, skyEl) / 60;
  const marginalMin = marginalKneeMin(spec.maxNextHalfHourGain);
  return {
    minutes: Math.min(snrTimeMin, marginalMin),
    snrTimeMin,
    marginalMin,
    setBy: snrTimeMin <= marginalMin ? 'snr-target' : 'diminishing-returns',
    surfaceBrightnessMu: mu,
    surfaceBrightnessFrom: from,
  };
}

/** How many subs of `subSeconds` (at most `wanted`) the usable window holds with the dithers, autofocus and flip counted, and the overhead that goes with them. */
function fitSubs(usableMinutes: number, subSeconds: number, wanted: number, flip: boolean, dither: { everyFrames: number; minIntervalS: number }): { count: number; overhead: Overhead } {
  // Start at the most the window could hold (plus one), not at a huge override: the loop below then runs a few times, not a million.
  let count = Math.min(wanted, Math.floor((usableMinutes * 60) / subSeconds) + 1);
  for (;;) {
    const oh = overheadFor(subSeconds, count, flip, dither);
    const sessionMin = (count * subSeconds) / 60 + oh.ditherMin + oh.autofocusMin + oh.meridianFlipMin;
    if (count === 0 || sessionMin <= usableMinutes) return { count, overhead: oh };
    count -= 1;
  }
}

function compute(object: ExposureTarget, rig: ExposureRig, site: ExposureSite, night: ExposureNight, c: Context, choice: ExposureChoice): ExposureResult {
  const spec = PRESETS[choice.preset];
  const o = choice.overrides ?? {};
  const sky: SkyInput = { bortle: site.bortle, moonIllumination: night.moonIllumination, moonSeparationDeg: night.moonSeparationDeg, moonUp: night.moonUp };
  const warnings: ExposureWarning[] = [...c.shared];

  // ---- Sub length: the sky-limited optimum, then the clamps.
  const swampSeconds = skyLimitedSeconds(c.readNoiseE, c.rate, spec.swampK);
  const riskCap = Math.min(spec.riskCapS, MAX_SUB_S);
  const satCaps: number[] = [starSaturationCapS(c.fRatio, c.bw.nm)];
  if (object.brightCore === true) satCaps.push(BRIGHT_CORE_SUB_CAP_S);
  const satCap = Math.min(...satCaps);
  const ceiling = Math.max(MIN_SUB_S, Math.min(riskCap, satCap));
  let subLimit: SubLimit = 'read-noise';
  let subSeconds: number;
  if (o.subSeconds !== undefined) {
    subSeconds = o.subSeconds;
    subLimit = 'user';
  } else {
    if (swampSeconds > ceiling) subLimit = satCap < riskCap ? 'saturation' : 'risk-cap';
    else if (swampSeconds < MIN_SUB_S) subLimit = 'floor';
    const wanted = Math.min(Math.max(swampSeconds, MIN_SUB_S), ceiling);
    subSeconds = pickSub(c.readNoiseE, c.rate, wanted, ceiling);
  }
  // ---- Total light: the stop point of the object, then the window.
  const knee = kneeFor(object, c, rig.filter, sky, choice.preset);
  const stopMin = Math.max(MIN_TOTAL_MIN, knee.minutes);
  const wantedMin = o.totalMin ?? stopMin;
  // Rounded up: the plan reaches the stop point (and the 30 minute minimum) instead of falling up to one sub short; the window still cuts it.
  // More than MAX_SUBS frames is never recommended: when the light this night can hold at the sky-limited sub (the smaller of the stop point and the usable window)
  // would need more than MAX_SUBS, the engine's own sub is lengthened (never past the ceiling) until it fits. A night that never reaches MAX_SUBS keeps its sub.
  const dither = spec.dither;
  const holds = (t: number, wantedSubs: number): number => fitSubs(night.usableMinutes, t, wantedSubs, false, dither).count;
  const needsLonger = (t: number): boolean => holds(t, Math.min(Math.ceil((wantedMin * 60) / t - 1e-9), MAX_SUBS + 1)) > MAX_SUBS;
  if (o.subSeconds === undefined && o.subCount === undefined && needsLonger(subSeconds)) {
    const longer = SUB_STEPS_S.find((t) => t >= subSeconds && t <= ceiling && !needsLonger(t));
    if (longer !== undefined) {
      subSeconds = longer;
      subLimit = 'count-cap';
    } else {
      // No allowed step is long enough: the sub stays at the top of what stars and risk allow, and says so.
      subSeconds = snapSubDown(ceiling);
      if (subLimit === 'read-noise' || subLimit === 'floor') subLimit = satCap < riskCap ? 'saturation' : 'risk-cap';
    }
  }
  const penalty = readNoisePenalty(c.readNoiseE, c.rate, subSeconds);
  const uncappedCount = o.subCount ?? Math.ceil((wantedMin * 60) / subSeconds - 1e-9);
  const desiredCount = Math.min(uncappedCount, MAX_SUBS);

  const fit = (flip: boolean) => fitSubs(night.usableMinutes, subSeconds, desiredCount, flip, dither);
  let { count, overhead } = fit(false);
  const sessionMinOf = (n: number, oh: Overhead) => (n * subSeconds) / 60 + oh.ditherMin + oh.autofocusMin + oh.meridianFlipMin;
  if (night.acquisitionStart && night.transitTime && count > 0) {
    const t = night.transitTime.getTime();
    const s = night.acquisitionStart.getTime();
    if (t >= s && t <= s + sessionMinOf(count, overhead) * 60000) {
      ({ count, overhead } = fit(true));
      warnings.push({
        code: 'meridian-flip',
        severity: 'note',
        text: `Flip +${MERIDIAN_FLIP_MIN} min`,
      });
    }
  }
  // The cap binds only when the night would have held more than MAX_SUBS (a shorter window already cuts the count below it, with its own note).
  const countCapped = uncappedCount > MAX_SUBS && count >= MAX_SUBS;
  if (countCapped) {
    // "Use longer subs" only when one is allowed: a user's sub below the ceiling that stars and risk set (not the 300 s limit), whole seconds.
    warnings.push({ code: 'count-capped', severity: 'note', text: `Max ${MAX_SUBS} subs` });
  }
  // The range stays inside the module's own limits: no sub shorter than MIN_SUB_S, none longer than the ceiling (a user's own sub may sit outside; the range then collapses onto it).
  const rangeFactor = c.bw.assumed || c.rnAssumed ? SUB_RANGE_FACTOR_ASSUMED : SUB_RANGE_FACTOR;
  const subRange: Range =
    o.subSeconds !== undefined
      ? [Math.max(1, Math.round(subSeconds / rangeFactor)), Math.max(1, Math.round(subSeconds * rangeFactor))]
      : [Math.max(MIN_SUB_S, Math.round(subSeconds / rangeFactor)), Math.min(Math.floor(ceiling), Math.round(subSeconds * rangeFactor))];
  const integrationMin = round1((count * subSeconds) / 60);
  const inSessionOverhead = overhead.ditherMin + overhead.autofocusMin + overhead.meridianFlipMin;
  const elapsedMin = round1(integrationMin + overhead.totalMin);
  const overheadRangeMin: Range = [round1(overhead.totalMin * OVERHEAD_RANGE[0]), round1(overhead.totalMin * OVERHEAD_RANGE[1])];
  const finish = night.acquisitionStart && count > 0 ? minutesLater(night.acquisitionStart, integrationMin + inSessionOverhead) : null;
  const setupBegin = night.acquisitionStart ? minutesLater(night.acquisitionStart, -SETUP_MIN) : null;
  const finishRange: readonly [Date, Date] | null =
    night.acquisitionStart && setupBegin && count > 0
      ? [
          new Date(Math.max(minutesLater(night.acquisitionStart, integrationMin).getTime(), minutesLater(setupBegin, round1(integrationMin + overheadRangeMin[0])).getTime())),
          minutesLater(setupBegin, round1(integrationMin + overheadRangeMin[1])),
        ]
      : null;

  const windowCut = count < desiredCount && night.usableMinutes > 0;
  // What the stop point asks for: when the window cuts the plan, the light it asked for, not the MAX_SUBS share of it.
  const aimMin = round1(((windowCut ? uncappedCount : desiredCount) * subSeconds) / 60);
  const modeRangeMin: Range = [Math.round(aimMin * TOTAL_RANGE_LOW_FRACTION), Math.round(aimMin)];
  let totalLimit: TotalLimit;
  if (windowCut) totalLimit = 'usable-window';
  else if (countCapped) totalLimit = 'count-cap';
  else if (o.totalMin !== undefined || o.subCount !== undefined) totalLimit = 'user';
  else if (knee.minutes < MIN_TOTAL_MIN) totalLimit = 'minimum-total';
  else totalLimit = knee.setBy;
  const reachesSnrTarget = integrationMin >= knee.snrTimeMin;

  if (windowCut) {
    warnings.push({
      code: 'limited-by-usable-time',
      severity: 'note',
      text: 'Cut short',
    });
  }
  return {
    ok: true,
    source: 'calculated',
    label: ESTIMATE,
    mode: choice.preset,
    modeLabel: spec.label,
    custom: false,
    differs: [],
    modeRangeMin,
    subSeconds,
    subSecondsRange: subRange,
    subCount: count,
    subCountRange: subCountRangeFor(count, subSeconds, subRange),
    integrationMin,
    usableIntegrationRangeMin: [round1(integrationMin * (1 - REJECT_FRACTION_MAX)), integrationMin],
    ditherEveryFrames: ditherEvery(subSeconds, dither),
    gain: { suggested: null },
    swampSeconds,
    readNoisePenalty: penalty,
    knee,
    reachesSnrTarget,
    limitedBy: { sub: subLimit, total: totalLimit },
    overhead,
    overheadRangeMin,
    elapsedMin,
    elapsedRangeMin: [round1(integrationMin + overheadRangeMin[0]), round1(integrationMin + overheadRangeMin[1])],
    finish,
    finishRange,
    warnings,
  };
}

/**
 * The one place exposure is worked out. For one object on one rig, at one site, on one night, under a preset and the user's
 * overrides of it: sub length, count, total, dither, the stop point (knee), what limited each, the gain note, the filter note
 * and the warnings. Missing optics return `ok: false` with their names. A preset alone gives the preset's own numbers; any
 * override that differs from them makes the result `custom` and lists the differences.
 */
export function exposureFor(object: ExposureTarget, rig: ExposureRig, site: ExposureSite, night: ExposureNight, choice: ExposureChoice): ExposureOutcome {
  checkInput(site, night);
  checkChoice(choice);
  const c = contextFor(object, rig, site, night);
  if ('missing' in c) return { ok: false, label: ESTIMATE, missing: c.missing };
  const result = compute(object, rig, site, night, c, choice);
  if (!choice.overrides) return result;
  const base = compute(object, rig, site, night, c, { preset: choice.preset });
  const o = choice.overrides;
  const differs: ExposureDifference[] = [];
  if (o.subSeconds !== undefined && o.subSeconds !== base.subSeconds) differs.push({ field: 'subSeconds', preset: base.subSeconds, chosen: o.subSeconds });
  if (o.subCount !== undefined && o.subCount !== base.subCount) differs.push({ field: 'subCount', preset: base.subCount, chosen: o.subCount });
  if (o.totalMin !== undefined && o.subCount === undefined && o.totalMin !== base.integrationMin) differs.push({ field: 'totalMin', preset: base.integrationMin, chosen: o.totalMin });
  return { ...result, custom: differs.length > 0, differs };
}

/** An itinerary or AI plan saved before the presets keeps its mode names; each is the preset of that id. Anything else is not a mode. */
export function presetForSavedMode(value: unknown): ExposureMode | null {
  return MODE_ORDER.includes(value as ExposureMode) ? (value as ExposureMode) : null;
}

/** The total light a preset aims for before any object is known, minutes: its diminishing-returns point. Used to match a number of minutes to a preset. */
export function presetNominalMin(mode: ExposureMode): number {
  return marginalKneeMin(PRESETS[mode].maxNextHalfHourGain);
}

// ------------------------------------------------------------------ the report

export interface ExposureInput {
  target: ExposureTarget;
  train: { focalRatio?: number; imageScale?: number };
  camera: FitCamera & { pixelSizeUm?: number; readNoiseClass?: ReadNoiseClass };
  filter: ProfileFilter | null;
  sky: SkyInput;
  /** Minutes the target is usable tonight (from the plan). */
  usableMinutes: number;
  /** When imaging can begin (first usable time); null: no clock times are computed. */
  acquisitionStart: Date | null;
  /** The next meridian crossing (hour angle zero) at or after acquisitionStart; null when it is not known. A flip is added when it falls inside the session. */
  transitTime: Date | null;
}

/** A preset's result: the same as `ExposureResult`. */
export type ModeEstimate = ExposureResult;

export type ExposureReport =
  | { ok: false; label: typeof ESTIMATE; missing: string[] }
  | {
      ok: true;
      label: typeof ESTIMATE;
      modes: Record<ExposureMode, ModeEstimate>;
      /** Warnings that do not depend on the mode (they are also the first ones in each mode's own list). */
      warnings: ExposureWarning[];
      marginal: MarginalRow[];
      skyElectronsPerPxS: number;
      readNoiseE: number;
      bandwidthNm: number;
      /** The sky-limited sub of the standard preset (K = SKY_LIMIT_K), before any clamp. */
      skyLimitedSeconds: number;
    };

/** The three presets for one target, train, camera, filter and sky, each through `exposureFor`. Missing optics return `ok: false` with the names. */
export function planExposure(input: ExposureInput): ExposureReport {
  const rig: ExposureRig = { train: input.train, camera: input.camera, filter: input.filter };
  const site: ExposureSite = { bortle: input.sky.bortle };
  const night: ExposureNight = {
    moonIllumination: input.sky.moonIllumination,
    moonSeparationDeg: input.sky.moonSeparationDeg,
    moonUp: input.sky.moonUp,
    usableMinutes: input.usableMinutes,
    acquisitionStart: input.acquisitionStart,
    transitTime: input.transitTime,
  };
  checkInput(site, night);
  const c = contextFor(input.target, rig, site, night);
  if ('missing' in c) return { ok: false, label: ESTIMATE, missing: c.missing };
  const modes = Object.fromEntries(MODE_ORDER.map((m) => [m, compute(input.target, rig, site, night, c, { preset: m })])) as Record<ExposureMode, ModeEstimate>;
  return {
    ok: true,
    label: ESTIMATE,
    modes,
    warnings: c.shared,
    marginal: marginalBenefit(input.usableMinutes),
    skyElectronsPerPxS: c.rate,
    readNoiseE: c.readNoiseE,
    bandwidthNm: c.bw.nm,
    skyLimitedSeconds: skyLimitedSeconds(c.readNoiseE, c.rate),
  };
}
