import { normalizeName } from '../catalog';
import type { CatalogTarget } from '../catalog';
import type { ProfileFilter, ReadNoiseClass } from '../profile';
import {
  AUTOFOCUS_EVERY_MIN,
  AUTOFOCUS_MIN,
  BORTLE_SQM,
  CORE_FRAME_COUNT,
  CORE_SUB_DIVISOR,
  DEFAULT_READ_NOISE_CLASS,
  DITHER_EVERY_FRAMES,
  DITHER_MIN_INTERVAL_S,
  DITHER_SETTLE_S,
  HA_NM,
  KIND_BANDWIDTH_NM,
  MARGINAL_MINUTES,
  MAX_SUB_S,
  MERIDIAN_FLIP_MIN,
  MIN_SUB_S,
  MODES,
  MODE_ORDER,
  MOON_FALLOFF_DEG,
  MOON_GAIN,
  MOON_NOTE_ILLUMINATION,
  MOON_NOTE_SEPARATION_DEG,
  NO_FILTER_BANDWIDTH_NM,
  OIII_NM,
  OVERHEAD_RANGE,
  OVERSAMPLED_BELOW_ARCSEC,
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
  UNDERSAMPLED_ABOVE_ARCSEC,
  UNKNOWN_KIND_BANDWIDTH_NM,
  VISUAL_OR_IMAGING_NAME,
} from './constants';
import type { ExposureMode } from './constants';

export * from './constants';

/** Every number this module returns is an estimate; the field makes that part of the data. */
export const ESTIMATE = 'estimate' as const;

/** The assumption behind the marginal-benefit table, stated for the UI. */
export const SNR_ASSUMPTION =
  'Estimate. Assumes the sky background dominates the noise, so signal-to-noise grows with the square root of integration time: 4 times the time gives 2 times the signal-to-noise. Real stacks gain somewhat less. More time lowers noise and brings out faint signal; it does not sharpen a seeing-limited image.';
export const NO_STOP_TIME_NOTE =
  'There is no universal best stop time: each step adds less than the one before, and what is worth it depends on the target and on you.';

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
  | 'filter-visual-colour'
  | 'filter-kind-unknown'
  | 'inputs-assumed'
  | 'sampling'
  | 'moon-near'
  | 'target-ou4'
  | 'no-usable-time'
  | 'limited-by-usable-time'
  | 'below-mode-range'
  | 'short-session-faint'
  | 'short-session-unknown'
  | 'sub-capped'
  | 'meridian-flip';

export interface ExposureWarning {
  code: WarningCode;
  /** 'warning' needs a look before shooting; 'note' is context. The UI shows the word, not only a colour. */
  severity: 'warning' | 'note';
  text: string;
}

export interface FitCamera {
  colour?: boolean;
  hasUvIrCut?: boolean;
}

const nm = (x: number) => x.toFixed(1);
/** Focal ratio as printed: f/1.93, f/7, f/10. */
const fr = (x: number) => String(Number(x.toFixed(2)));

/** Filter-fit warnings for one train: beam speed, missing UV/IR cut, visual-first filter on a colour camera. */
export function filterWarnings(fRatio: number, filter: ProfileFilter | null, camera: FitCamera): ExposureWarning[] {
  const out: ExposureWarning[] = [];
  const shiftText = `At f/${fr(fRatio)} the beam edge shifts a passband about ${nm(edgeShiftNm(fRatio, HA_NM))} nm at Ha and ${nm(edgeShiftNm(fRatio, OIII_NM))} nm at OIII (estimate).`;
  if (filter) {
    const name = filter.name;
    // A published angle limit can be conservative: say so when the calculated shift is smaller than half the
    // narrowest band (the line moves from the band's centre toward its edge, so half the band is the room it has).
    const haShift = edgeShiftNm(fRatio, HA_NM);
    const bandsNote =
      filter.narrowestBandNm !== undefined && haShift < filter.narrowestBandNm * SHIFT_BAND_FRACTION
        ? ` Its narrowest band is ${filter.narrowestBandNm} nm, so half of it (${nm(filter.narrowestBandNm * SHIFT_BAND_FRACTION)} nm) is wider than the ${nm(haShift)} nm shift at Ha (calculated): the bands still cover the line. The limit is the maker's, worth testing before ruling it out.`
        : '';
    if (filter.ratedMinFRatio !== undefined && fRatio < filter.ratedMinFRatio) {
      out.push({
        code: 'filter-rated-slower',
        severity: 'warning',
        text: `${name} is rated for f/${filter.ratedMinFRatio} and slower (published); this train is f/${fr(fRatio)}. ${shiftText}`,
      });
    } else if (filter.maxIncidentAngleDeg !== undefined && beamHalfAngleDeg(fRatio) > filter.maxIncidentAngleDeg) {
      out.push({
        code: 'filter-rated-slower',
        severity: 'warning',
        text: `${name} is rated for beam angles up to ${filter.maxIncidentAngleDeg} degrees (published); this train reaches ${beamHalfAngleDeg(fRatio).toFixed(1)}. ${shiftText}${bandsNote}`,
      });
    } else if (
      filter.ratedMinFRatio === undefined &&
      filter.narrowestBandNm !== undefined &&
      edgeShiftNm(fRatio, HA_NM) > filter.narrowestBandNm * SHIFT_BAND_FRACTION
    ) {
      out.push({
        code: 'filter-rated-slower',
        severity: 'warning',
        text: `${name} has no published f-ratio rating; its narrowest band is ${filter.narrowestBandNm} nm. ${shiftText} That is over half the band, so part of the beam falls outside it (calculated); the maker's rating is not in the profile, so check it before relying on this filter.`,
      });
    }
    if (camera.hasUvIrCut === false && filter.blocksUvIr !== true) {
      out.push({
        code: 'filter-uvir-missing',
        severity: 'warning',
        text:
          filter.blocksUvIr === false
            ? `This camera has no UV/IR cut and ${name} does not block UV/IR: expect bloated stars and colour casts. Stack a UV/IR cut filter.`
            : `This camera has no UV/IR cut and it is not known that ${name} blocks UV/IR: expect bloated stars and colour casts unless it does. Add a UV/IR cut filter.`,
      });
    }
    if (filter.kind === undefined && camera.colour === true && VISUAL_OR_IMAGING_NAME.test(name)) {
      out.push({
        code: 'filter-kind-unknown',
        severity: 'note',
        text: `${name}: its kind is not set. Orion sells a visual and an imaging version under this name. If yours is the visual one, expect a colour cast on a colour camera and do not use it for imaging; check the box (research note, not verified for your unit).`,
      });
    }
    if (filter.kind === 'visual-only' && camera.colour === true) {
      out.push({
        code: 'filter-visual-colour',
        severity: 'warning',
        text: `${name} is made for visual use. On a colour camera expect a colour cast; it is untested for imaging here.`,
      });
    }
  } else if (camera.hasUvIrCut === false) {
    out.push({
      code: 'filter-uvir-missing',
      severity: 'warning',
      text: 'No filter is selected and this camera has no UV/IR cut: expect bloated stars and colour casts. Use a UV/IR cut filter.',
    });
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
  /** Catalog data. The starter catalog has none, so it is usually unknown. */
  surfaceBrightness?: SurfaceBrightness;
  /** Curated catalog flag: the core would clip in long subs. */
  brightCore?: boolean;
}

/** ASSUMPTION: types whose surface brightness is high without a catalog value (compact, bright objects). */
const BRIGHT_TYPES: readonly string[] = ['globular-cluster', 'open-cluster', 'planetary-nebula'];

/** The catalog's own class when given; compact bright types are 'high'; everything else 'unknown'. Never guessed otherwise. */
export function surfaceBrightnessOf(t: Pick<ExposureTarget, 'surfaceBrightness' | 'type'>): SurfaceBrightness {
  if (t.surfaceBrightness !== undefined) return t.surfaceBrightness;
  return t.type !== undefined && BRIGHT_TYPES.includes(t.type) ? 'high' : 'unknown';
}

export type Priority = 'high' | 'medium' | 'low' | 'unknown';

/** Short-session rule (spec 07): bright compact targets outrank faint low-surface-brightness ones. */
export function shortSessionPriority(t: Pick<ExposureTarget, 'surfaceBrightness' | 'type'>): Priority {
  return surfaceBrightnessOf(t);
}

/** True for Ou4 (the Squid Nebula) by id, name or alias. */
export function isOu4(t: Pick<ExposureTarget, 'id' | 'name' | 'aliases'>): boolean {
  return [t.id, t.name, ...(t.aliases ?? [])].some((s) => s !== undefined && normalizeName(s) === 'ou4');
}

export function exposureTargetFrom(t: CatalogTarget): ExposureTarget {
  return { id: t.id, name: t.name, aliases: t.aliases, type: t.type, brightCore: t.brightCore };
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
 * allowed sub lengths. Nothing for an unflagged target, or when the snapped short sub is not shorter than the
 * long one (the long subs are already as short as the module goes). The train sets the long sub, so it is
 * already inside `longSubSeconds`.
 */
export function coreAdvice(target: Pick<ExposureTarget, 'brightCore'>, longSubSeconds: number): CoreAdvice | null {
  if (target.brightCore !== true) return null;
  if (!(longSubSeconds > 0)) throw new RangeError(`longSubSeconds must be above zero: ${longSubSeconds}`);
  const subSeconds = snapSub(longSubSeconds / CORE_SUB_DIVISOR);
  if (subSeconds >= longSubSeconds) return null;
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

/** Sky-limited minimum sub, seconds: SKY_LIMIT_K * readNoise^2 / skyRate. */
export function skyLimitedSeconds(readNoiseE: number, rate: number): number {
  return (SKY_LIMIT_K * readNoiseE * readNoiseE) / rate;
}

/** Nearest allowed sub length on a log scale, after clamping to [MIN_SUB_S, MAX_SUB_S]. */
export function snapSub(seconds: number): number {
  const s = Math.min(MAX_SUB_S, Math.max(MIN_SUB_S, seconds));
  return SUB_STEPS_S.reduce((best, step) => (Math.abs(Math.log(step / s)) < Math.abs(Math.log(best / s)) ? step : best));
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

export function overheadFor(subSeconds: number, subCount: number, flip: boolean): Overhead {
  const every = Math.max(DITHER_EVERY_FRAMES, Math.ceil(DITHER_MIN_INTERVAL_S / subSeconds));
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

export type Range = readonly [number, number];

export interface ModeEstimate {
  mode: ExposureMode;
  label: typeof ESTIMATE;
  modeLabel: string;
  /** The mode's integration range, minutes. */
  modeRangeMin: Range;
  subSeconds: number;
  subSecondsRange: Range;
  subCount: number;
  /** Frames needed for the same light if the sub were at the long or the short end of subSecondsRange. */
  subCountRange: Range;
  integrationMin: number;
  /** After clouds, trails and rejected frames. */
  usableIntegrationRangeMin: Range;
  overhead: Overhead;
  overheadRangeMin: Range;
  /** Setup + acquisition + dithers + autofocus + meridian flip. */
  elapsedMin: number;
  elapsedRangeMin: Range;
  /** Finish of imaging (after setup, which is done before the first usable minute); null without a start time. */
  finish: Date | null;
  /** Spans the full elapsedRangeMin (setup starts SETUP_MIN before the first usable minute); never earlier than start plus the light. */
  finishRange: readonly [Date, Date] | null;
  warnings: ExposureWarning[];
}

export type ExposureReport =
  | { ok: false; label: typeof ESTIMATE; missing: string[] }
  | {
      ok: true;
      label: typeof ESTIMATE;
      modes: Record<ExposureMode, ModeEstimate>;
      /** Warnings that do not depend on the mode. */
      warnings: ExposureWarning[];
      marginal: MarginalRow[];
      skyElectronsPerPxS: number;
      readNoiseE: number;
      bandwidthNm: number;
      skyLimitedSeconds: number;
    };

function checkInput(i: ExposureInput): void {
  if (!Number.isInteger(i.sky.bortle) || i.sky.bortle < 1 || i.sky.bortle > 9) {
    throw new RangeError(`bortle must be a whole number from 1 to 9: ${i.sky.bortle}`);
  }
  if (!Number.isFinite(i.usableMinutes) || i.usableMinutes < 0) {
    throw new RangeError(`usableMinutes must be zero or more: ${i.usableMinutes}`);
  }
  if (!(i.sky.moonIllumination >= 0 && i.sky.moonIllumination <= 1)) {
    throw new RangeError(`moonIllumination must be 0 to 1: ${i.sky.moonIllumination}`);
  }
}

/** Frames for the same light with longer subs (fewer) or shorter subs (more). */
function subCountRangeFor(count: number, subSeconds: number, subRange: Range): Range {
  const light = count * subSeconds;
  return [Math.floor(light / subRange[1]), Math.ceil(light / subRange[0])];
}

const minutesLater = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

/** Plans the three modes for one target, train, camera, filter and sky. Missing optics return `ok: false` with the names. */
export function planExposure(input: ExposureInput): ExposureReport {
  checkInput(input);
  const fRatio = input.train.focalRatio;
  const pixelUm = input.camera.pixelSizeUm;
  const missing: string[] = [];
  if (fRatio === undefined) missing.push('train.focalRatio');
  if (pixelUm === undefined) missing.push('camera.pixelSizeUm');
  if (fRatio === undefined || pixelUm === undefined) return { ok: false, label: ESTIMATE, missing };

  const bw = bandwidthOf(input.filter);
  const rnClass = input.camera.readNoiseClass ?? DEFAULT_READ_NOISE_CLASS;
  const rnAssumed = input.camera.readNoiseClass === undefined;
  const readNoiseE = READ_NOISE_E[rnClass];
  const rate = skyRate({ pixelUm, fRatio, bandwidthNm: bw.nm, sky: input.sky });
  const floorS = skyLimitedSeconds(readNoiseE, rate);
  const assumed = bw.assumed || rnAssumed;
  const rangeFactor = assumed ? SUB_RANGE_FACTOR_ASSUMED : SUB_RANGE_FACTOR;

  const shared: ExposureWarning[] = [...filterWarnings(fRatio, input.filter, input.camera)];
  if (assumed) {
    const parts = [
      rnAssumed ? `the camera's read noise (assumed ${rnClass})` : null,
      bw.assumed ? `the filter's passband width (assumed ${bw.nm} nm)` : null,
    ].filter(Boolean);
    shared.push({
      code: 'inputs-assumed',
      severity: 'note',
      text: `Not in the profile, so assumed: ${parts.join(' and ')}. The sub-length range is wider (estimate).`,
    });
  }
  const scale = input.train.imageScale;
  if (scale !== undefined && scale < OVERSAMPLED_BELOW_ARCSEC) {
    shared.push({
      code: 'sampling',
      severity: 'note',
      text: `Image scale ${scale.toFixed(2)} arcsec per pixel is finer than typical seeing needs (assumed 2 to 3 arcsec): detail will not improve. Binning may help.`,
    });
  } else if (scale !== undefined && scale > UNDERSAMPLED_ABOVE_ARCSEC) {
    shared.push({
      code: 'sampling',
      severity: 'note',
      text: `Image scale ${scale.toFixed(2)} arcsec per pixel is coarse: small stars will be blocky.`,
    });
  }
  if (input.sky.moonUp && input.sky.moonIllumination >= MOON_NOTE_ILLUMINATION && input.sky.moonSeparationDeg < MOON_NOTE_SEPARATION_DEG) {
    shared.push({
      code: 'moon-near',
      severity: 'note',
      text: `The Moon is ${(input.sky.moonIllumination * 100).toFixed(0)}% lit, ${input.sky.moonSeparationDeg.toFixed(0)} degrees away: the sky is brighter than the Bortle class says. The sub length allows for it.`,
    });
  }
  if (isOu4(input.target)) {
    shared.push({
      code: 'target-ou4',
      severity: 'warning',
      text: 'Ou4 is an extremely faint oxygen (OIII) nebula. A short session will show little; it needs narrowband data and far more time than Quick or Balanced plan.',
    });
  }
  if (input.usableMinutes <= 0) {
    shared.push({ code: 'no-usable-time', severity: 'warning', text: 'This target has no usable time tonight, so no exposure can be planned.' });
  }

  const sb = surfaceBrightnessOf(input.target);

  const buildMode = (mode: ExposureMode): ModeEstimate => {
    const spec = MODES[mode];
    const modeWarnings: ExposureWarning[] = [];
    const wanted = snapSub(floorS * spec.subMargin);
    const subSeconds = wanted;
    if (floorS * spec.subMargin > MAX_SUB_S) {
      modeWarnings.push({
        code: 'sub-capped',
        severity: 'note',
        text: `Sky-limited length is about ${Math.round(floorS * spec.subMargin)} s; capped at ${MAX_SUB_S} s (guiding, wind, satellite trails).`,
      });
    }
    const desiredCount = Math.floor((spec.targetMin * 60) / subSeconds);

    const fit = (flip: boolean): { count: number; overhead: Overhead } => {
      let count = desiredCount;
      for (;;) {
        const oh = overheadFor(subSeconds, count, flip);
        const sessionMin = (count * subSeconds) / 60 + oh.ditherMin + oh.autofocusMin + oh.meridianFlipMin;
        if (count === 0 || sessionMin <= input.usableMinutes) return { count, overhead: oh };
        count -= 1;
      }
    };
    let { count, overhead } = fit(false);
    const sessionMinOf = (c: number, oh: Overhead) => (c * subSeconds) / 60 + oh.ditherMin + oh.autofocusMin + oh.meridianFlipMin;
    if (input.acquisitionStart && input.transitTime && count > 0) {
      const t = input.transitTime.getTime();
      const s = input.acquisitionStart.getTime();
      if (t >= s && t <= s + sessionMinOf(count, overhead) * 60000) {
        ({ count, overhead } = fit(true));
        modeWarnings.push({
          code: 'meridian-flip',
          severity: 'note',
          text: `A meridian flip falls inside this session and adds ${MERIDIAN_FLIP_MIN} minutes (the target crosses the meridian during the session).`,
        });
      }
    }
    // The range stays inside the module's own limits: no sub shorter than MIN_SUB_S or longer than MAX_SUB_S.
    const subRange: Range = [Math.max(MIN_SUB_S, Math.round(subSeconds / rangeFactor)), Math.min(MAX_SUB_S, Math.round(subSeconds * rangeFactor))];
    const integrationMin = round1((count * subSeconds) / 60);
    const inSessionOverhead = overhead.ditherMin + overhead.autofocusMin + overhead.meridianFlipMin;
    const elapsedMin = round1(integrationMin + overhead.totalMin);
    const overheadRangeMin: Range = [round1(overhead.totalMin * OVERHEAD_RANGE[0]), round1(overhead.totalMin * OVERHEAD_RANGE[1])];
    const finish = input.acquisitionStart && count > 0 ? minutesLater(input.acquisitionStart, integrationMin + inSessionOverhead) : null;
    const setupBegin = input.acquisitionStart ? minutesLater(input.acquisitionStart, -SETUP_MIN) : null;
    const finishRange: readonly [Date, Date] | null =
      input.acquisitionStart && setupBegin && count > 0
        ? [
            new Date(Math.max(minutesLater(input.acquisitionStart, integrationMin).getTime(), minutesLater(setupBegin, round1(integrationMin + overheadRangeMin[0])).getTime())),
            minutesLater(setupBegin, round1(integrationMin + overheadRangeMin[1])),
          ]
        : null;

    if (count < desiredCount && input.usableMinutes > 0) {
      modeWarnings.push({
        code: 'limited-by-usable-time',
        severity: 'note',
        text: `Only ${Math.round(input.usableMinutes)} usable minutes tonight: this plan stops at ${integrationMin} minutes of light, not ${spec.targetMin}.`,
      });
    }
    if (input.usableMinutes > 0 && integrationMin < spec.rangeMin[0]) {
      modeWarnings.push({
        code: 'below-mode-range',
        severity: 'note',
        text: `${integrationMin} minutes is below this mode's ${spec.rangeMin[0]} to ${spec.rangeMin[1]} minute range.`,
      });
    }
    if (mode === 'quick') {
      if (sb === 'low') {
        modeWarnings.push({
          code: 'short-session-faint',
          severity: 'warning',
          text: 'Faint, low surface brightness: in a short session a bright compact target will look better. Consider those first.',
        });
      } else if (sb === 'unknown') {
        modeWarnings.push({
          code: 'short-session-unknown',
          severity: 'note',
          text: 'Surface brightness is not in the catalog, so the short-session rule (bright compact targets first) cannot rank this one.',
        });
      }
    }

    return {
      mode,
      label: ESTIMATE,
      modeLabel: spec.label,
      modeRangeMin: spec.rangeMin,
      subSeconds,
      subSecondsRange: subRange,
      subCount: count,
      subCountRange: subCountRangeFor(count, subSeconds, subRange),
      integrationMin,
      usableIntegrationRangeMin: [round1(integrationMin * (1 - REJECT_FRACTION_MAX)), integrationMin],
      overhead,
      overheadRangeMin,
      elapsedMin,
      elapsedRangeMin: [round1(integrationMin + overheadRangeMin[0]), round1(integrationMin + overheadRangeMin[1])],
      finish,
      finishRange,
      warnings: modeWarnings,
    };
  };

  const modes = Object.fromEntries(MODE_ORDER.map((m) => [m, buildMode(m)])) as Record<ExposureMode, ModeEstimate>;
  return {
    ok: true,
    label: ESTIMATE,
    modes,
    warnings: shared,
    marginal: marginalBenefit(input.usableMinutes),
    skyElectronsPerPxS: rate,
    readNoiseE,
    bandwidthNm: bw.nm,
    skyLimitedSeconds: floorS,
  };
}
