import type { AstronomicalNight } from '../astro';
import { PLANETS, compareEntries, evaluatePlanet, evaluateTarget, fitOf, nightContext, percentOfFrame } from './index';
import { skyPoint } from './sky';
import type { NightContext, PlanEntry, PlanTarget, TonightInput } from './index';

export const DEFAULT_LIMIT = 100;
/** Smaller than this share of the frame's long side is a speck, not a target. */
export const DEFAULT_MIN_FRAME_PERCENT = 3;
/** The screen samples the night this coarsely, in minutes. */
const SCREEN_STRIDE_MINUTES = 15;
/**
 * An altitude changes at most 15.04 deg an hour (one sidereal turn), so between two samples a
 * target is never more than 0.2507 deg per minute times half the gap above the higher sample.
 */
const MAX_RATE_DEG_PER_MIN = 0.2507;
/** The true declination of date differs from J2000 by under 0.4 deg through 2100; the zenith-distance test allows for it. */
const PRECESSION_MARGIN_DEG = 0.5;

export interface RankInput extends Omit<TonightInput, 'targets'> {
  /** Every candidate: the curated targets plus the catalog, one entry per object. */
  targets: readonly PlanTarget[];
  /** At most this many entries come back. Default 100. */
  limit?: number;
  /** Keep targets that do not fit the train's frame (the page's "show targets that do not fit"). Default false. */
  includeTooLarge?: boolean;
  /** Drop targets under this percent of the frame; 0 keeps all. Default 3. */
  minFramePercent?: number;
}

export interface RankResult {
  night: AstronomicalNight;
  horizonSet: boolean;
  minAltitude: number;
  /** Best first, only targets with usable time, at most `limit`. */
  entries: PlanEntry[];
  /** How many targets went in and how many were scored, so the screen is visible. */
  counts: { input: number; scored: number; usable: number };
}

/** The screen's verdict on one target, without any trigonometry: false when it cannot reach the minimum altitude at this latitude. */
export function canReachAltitude(latitude: number, decDeg: number, minAltitude: number): boolean {
  return 90 - Math.abs(latitude - decDeg) + PRECESSION_MARGIN_DEG >= minAltitude;
}

/** The train's size screen: false for a target too small for the frame, or too large unless `includeTooLarge`. */
export function inSizeBand(
  train: NightContext['train'],
  t: Pick<PlanTarget, 'sizeArcmin'>,
  options: { includeTooLarge: boolean; minFramePercent: number },
): boolean {
  // No size, no field, or a smart scope: nothing to compare, so nothing is hidden.
  if (!t.sizeArcmin || train.kind === 'smart' || train.optics === null) return true;
  const percent = percentOfFrame(train, t);
  if (percent === null) return true;
  if (percent < options.minFramePercent) return false;
  if (!options.includeTooLarge && fitOf(train, t as PlanTarget).fit === 'too-large') return false;
  return true;
}

/**
 * Targets that could still have usable time: reaches the altitude at this latitude, is in the size band, and (on a
 * 15 minute sampling, widened by the most an altitude can move in half a gap) gets above the minimum during the night.
 */
export function screenTargets(
  ctx: NightContext,
  targets: readonly PlanTarget[],
  options: { includeTooLarge: boolean; minFramePercent: number },
): PlanTarget[] {
  const { sky, minAltitude, site } = ctx;
  const stride = Math.max(1, Math.round(SCREEN_STRIDE_MINUTES / ctx.stepMinutes));
  const gapMinutes = stride * ctx.stepMinutes;
  const slack = (MAX_RATE_DEG_PER_MIN * gapMinutes) / 2;
  const last = sky.times.length - 1;
  const kept: PlanTarget[] = [];
  for (const t of targets) {
    if (!canReachAltitude(site.latitude, t.decDeg, minAltitude)) continue;
    if (!inSizeBand(ctx.train, t, options)) continue;
    const p = skyPoint(t.raHours, t.decDeg);
    let reaches = false;
    for (let k = 0; ; k += stride) {
      const kk = Math.min(k, last);
      // The last sample is always looked at, so the stride never skips the night's end.
      if (sky.altitudeAt(p, kk) + slack >= minAltitude) { reaches = true; break; }
      if (kk === last) break;
    }
    if (reaches) kept.push(t);
  }
  return kept;
}

/**
 * The two halves of a ranking, so a caller can score in chunks and yield between them: `candidates` is what
 * survived the screen, `evaluate` scores one, `finish` orders and cuts the scored list.
 */
export interface Ranker {
  candidates: readonly PlanTarget[];
  evaluate(t: PlanTarget): PlanEntry;
  planets(): PlanEntry[];
  finish(entries: PlanEntry[]): RankResult;
}

export function prepareRanking(input: RankInput): Ranker {
  const limit = input.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`limit must be a positive integer: ${limit}`);
  const minFramePercent = input.minFramePercent ?? DEFAULT_MIN_FRAME_PERCENT;
  if (!(minFramePercent >= 0)) throw new RangeError(`minFramePercent must be zero or more: ${minFramePercent}`);
  const ctx = nightContext(input);
  if (!('sky' in ctx)) {
    return {
      candidates: [],
      evaluate: () => { throw new Error('No astronomical night to evaluate against'); },
      planets: () => [],
      finish: () => ({ night: ctx.night, horizonSet: ctx.horizonSet, minAltitude: input.minAltitude, entries: [], counts: { input: input.targets.length, scored: 0, usable: 0 } }),
    };
  }
  const candidates = screenTargets(ctx, input.targets, { includeTooLarge: input.includeTooLarge ?? false, minFramePercent });
  return {
    candidates,
    evaluate: (t) => evaluateTarget(ctx, t),
    planets: () => (input.includePlanets === false ? [] : PLANETS.map((b) => evaluatePlanet(ctx, b))),
    finish(entries) {
      const usable = entries.filter((e) => e.usableMinutes > 0).sort(compareEntries);
      return {
        night: ctx.night,
        horizonSet: ctx.horizonSet,
        minAltitude: input.minAltitude,
        entries: usable.slice(0, limit),
        counts: { input: input.targets.length, scored: entries.length, usable: usable.length },
      };
    },
  };
}

/**
 * Tonight's best targets over any list, a whole catalog included: the same scoring as `planTonight`, after a
 * screen that drops what cannot score (see `screenTargets`). Entries come best first, each with its score parts
 * and reason; targets with no usable window are not returned. Deterministic.
 */
export function rankTargets(input: RankInput): RankResult {
  const r = prepareRanking(input);
  return r.finish([...r.candidates.map((t) => r.evaluate(t)), ...r.planets()]);
}
