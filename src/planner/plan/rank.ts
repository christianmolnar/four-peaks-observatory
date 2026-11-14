import type { AstronomicalNight } from '../astro';
import { brightnessClass } from './brightness';
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
/** Precession moves a declination at most 20 arcsec a year, and catalog positions are J2000: the zenith-distance test allows for it. */
const PRECESSION_DEG_PER_YEAR = 20 / 3600;
/** Slack on top of the precession allowance (it is a bound at 20 arcsec a year, not an exact rate). */
const MARGIN_FLOOR_DEG = 0.1;
const MS_PER_YEAR = 365.25 * 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

/** How far a declination of date can sit from its J2000 value at `when`, plus a floor, degrees. */
export function precessionMargin(when: Date): number {
  return MARGIN_FLOOR_DEG + (Math.abs(when.getTime() - J2000_MS) / MS_PER_YEAR) * PRECESSION_DEG_PER_YEAR;
}

/**
 * The deep-sky classes (galaxy, cluster, nebula including supernova remnants and planetary nebulae) take part in the
 * mix: none takes more than this share of the list, at any length of it (the top 20 as well as the top 100). The list
 * is "what to image tonight" for a person, not a census: scoring each class by its own percentile cannot fix the mix,
 * because a class with many objects (3,800 galaxies, 650 clusters) puts many objects in its top tenth, so counts alone
 * would decide the list. The cap is on the list, not the score.
 *
 * The "other" bucket (double stars, dark nebulae, planets) is not part of the mix and has no reserved place: it
 * competes on score alone, and is never promoted past a higher-scoring entry.
 */
export const CLASS_SHARE_CAP = 0.4;
/** A class may hold at least this many places once the cap applies, so the first places are not handed out one per class. */
export const CLASS_CAP_MIN_PLACES = 2;
/** The cap applies from this place on (floor(0.4 * 5) = 2 = `CLASS_CAP_MIN_PLACES`); the places before it go purely by score. */
export const CLASS_CAP_FROM_PLACE = 5;
/**
 * The cap may hand a place to a lower-scoring entry of a class still under its cap only when that entry is within this
 * many points of the entry it displaces (the best remaining, of a class at its cap). Wider and the cap trades a
 * 95-point galaxy for a 45-point cluster just to show a different class; otherwise the better entry stays and the
 * list is allowed to be less mixed.
 */
export const CLASS_PROMOTION_MARGIN = 15;
/**
 * ... and only when that entry scores at least this fraction of the night's best score: on a poor night 15 points
 * below the best is still a weak target, and the mix is not worth showing it.
 */
export const CLASS_PROMOTION_MIN_FRACTION = 0.6;

const MIX_CLASSES: readonly string[] = ['galaxy', 'cluster', 'nebula'];

/**
 * The best `limit` of a best-first list, mixed by class. Each place goes to the best remaining entry, unless that
 * entry's class is a deep-sky class already at its cap of the list so far (`max(CLASS_CAP_MIN_PLACES, floor(share * m))`
 * from place `CLASS_CAP_FROM_PLACE`): then it goes to the best remaining entry of a deep-sky class under its cap, if that
 * one is within `CLASS_PROMOTION_MARGIN` points of the entry it displaces and scores at least
 * `CLASS_PROMOTION_MIN_FRACTION` of the night's best; otherwise the better entry stays. Within a class the order is the
 * score order. The result is in the order picked.
 */
export function capClassShare(sorted: readonly PlanEntry[], limit: number): PlanEntry[] {
  const queues = new Map<string, PlanEntry[]>();
  for (const e of sorted) {
    const c = brightnessClass({ type: e.type }).class;
    const q = queues.get(c);
    if (q) q.push(e);
    else queues.set(c, [e]);
  }
  const heads = [...queues.entries()].map(([name, queue]) => ({ name, queue, next: 0, taken: 0 }));
  const bestTotal = sorted.length > 0 ? sorted[0].score.total : 0;
  const out: PlanEntry[] = [];
  while (out.length < limit) {
    const live = heads.filter((h) => h.next < h.queue.length);
    if (live.length === 0) break;
    const best = (hs: typeof live) => hs.reduce((a, b) => (compareEntries(b.queue[b.next], a.queue[a.next]) < 0 ? b : a));
    const m = out.length + 1;
    const cap = m < CLASS_CAP_FROM_PLACE ? Infinity : Math.max(CLASS_CAP_MIN_PLACES, Math.floor(CLASS_SHARE_CAP * m + 1e-9));
    let pick = best(live);
    if (MIX_CLASSES.includes(pick.name) && pick.taken >= cap) {
      const under = live.filter((h) => MIX_CLASSES.includes(h.name) && h.taken < cap);
      if (under.length > 0) {
        const alt = best(under);
        const displaced = pick.queue[pick.next].score.total;
        const total = alt.queue[alt.next].score.total;
        if (displaced - total <= CLASS_PROMOTION_MARGIN && total >= CLASS_PROMOTION_MIN_FRACTION * bestTotal) pick = alt;
      }
    }
    out.push(pick.queue[pick.next++]);
    pick.taken++;
  }
  return out;
}

/**
 * THE RULE for non-imaging objects: a double star (M40 is one) is not an imaging target, so tonight's list leaves the
 * types in this list out unless `includeNonImaging` is set. They stay in the catalog and in search; a person can still
 * add one to their plan. Every other type, asterisms and dark nebulae included, can be imaged and is ranked.
 */
export const NON_IMAGING_TYPES: readonly string[] = ['double-star'];

export interface RankInput extends Omit<TonightInput, 'targets'> {
  /** Every candidate: the curated targets plus the catalog, one entry per object. */
  targets: readonly PlanTarget[];
  /** At most this many entries come back. Default 100. */
  limit?: number;
  /** Keep targets that do not fit the train's frame (the page's "show targets that do not fit"). Default false. */
  includeTooLarge?: boolean;
  /** Rank the types in `NON_IMAGING_TYPES` too. Default false. */
  includeNonImaging?: boolean;
  /**
   * Also score the targets the size band hid (too large, too small) and return the best `NO_FIT_LIMIT` of them in
   * `RankResult.noFit`, beside the list and never inside it. Default false: they are only counted.
   */
  includeNoFit?: boolean;
  /** Drop targets under this percent of the frame; 0 keeps all. Default 3. */
  minFramePercent?: number;
}

export interface RankResult {
  night: AstronomicalNight;
  horizonSet: boolean;
  minAltitude: number;
  /** Only deep-sky targets with usable time, at most `limit`: best first within each class and mixed across them (see `capClassShare`). Planets are in `planets`, not here. */
  entries: PlanEntry[];
  /**
   * Every planet that has usable time (the Moon is not ranked), best first. They are kept beside `entries`, not inside the cut:
   * a planet has no brightness or framing terms, so it scores below a hundred catalog objects and would never reach the list.
   */
  planets: PlanEntry[];
  /** With `includeNoFit`: the best `NO_FIT_LIMIT` targets with usable time that the size band hid, best first; else empty. */
  noFit: PlanEntry[];
  /**
   * How many targets went in and how many were scored, so the screen is visible; and how many that could be up tonight
   * the size band hid: `tooLarge` (does not fit the frame, only while `includeTooLarge` is off) and `tooSmall`
   * (under the minimum share of the frame).
   */
  counts: { input: number; scored: number; usable: number; tooLarge: number; tooSmall: number };
  /** The brightest of the hidden ones, up to `HIDDEN_LEADING` of each, so the page can say "M31 is larger than this frame". */
  hidden: { tooLarge: HiddenTarget[]; tooSmall: HiddenTarget[] };
}

export interface HiddenTarget {
  id: string;
  name: string;
}

/** How many names `RankResult.hidden` lists per kind. */
export const HIDDEN_LEADING = 5;
/** How many of the targets that do not fit `RankResult.noFit` holds. */
export const NO_FIT_LIMIT = 300;

/** The screen's verdict on one target, without any trigonometry: false when it cannot reach the minimum altitude at this latitude. */
export function canReachAltitude(latitude: number, decDeg: number, minAltitude: number, marginDeg: number): boolean {
  return 90 - Math.abs(latitude - decDeg) + marginDeg >= minAltitude;
}

/**
 * The train's size screen: 'too-small' for a target under the minimum share of the frame, 'too-large' for one that
 * does not fit it (unless `includeTooLarge`), else 'in'. A train without a field of its own is judged against the
 * nominal one for size, and never 'too-large' (its fit is not computed). No size: 'in'.
 */
export function sizeBand(
  train: NightContext['train'],
  t: Pick<PlanTarget, 'sizeArcmin'>,
  options: { includeTooLarge: boolean; minFramePercent: number },
): 'in' | 'too-small' | 'too-large' {
  const percent = percentOfFrame(train, t);
  if (percent === null) return 'in';
  if (percent < options.minFramePercent) return 'too-small';
  if (!options.includeTooLarge && train.optics !== null && fitOf(train, t as PlanTarget).fit === 'too-large') return 'too-large';
  return 'in';
}

/** False for a target the size screen hides. */
export function inSizeBand(train: NightContext['train'], t: Pick<PlanTarget, 'sizeArcmin'>, options: { includeTooLarge: boolean; minFramePercent: number }): boolean {
  return sizeBand(train, t, options) === 'in';
}

/** What the screen found: the targets that could still have usable time, and the ones only the size band hid. */
export interface Screened {
  kept: PlanTarget[];
  /** Hidden for size alone: they would have reached the minimum altitude tonight. */
  tooLarge: PlanTarget[];
  tooSmall: PlanTarget[];
}

/**
 * Targets that could still have usable time: reaches the altitude at this latitude, is in the size band, and (on a
 * 15 minute sampling, widened by the most an altitude can move in half a gap) gets above the minimum during the night.
 * The ones the size band alone hid are reported too, so the page can say what it left out.
 */
export function screenTargetsDetailed(
  ctx: NightContext,
  targets: readonly PlanTarget[],
  options: { includeTooLarge: boolean; minFramePercent: number },
): Screened {
  const { sky, minAltitude, site } = ctx;
  const stride = Math.max(1, Math.round(SCREEN_STRIDE_MINUTES / ctx.stepMinutes));
  const gapMinutes = stride * ctx.stepMinutes;
  const slack = (MAX_RATE_DEG_PER_MIN * gapMinutes) / 2;
  const last = sky.times.length - 1;
  const margin = precessionMargin(ctx.end);
  const out: Screened = { kept: [], tooLarge: [], tooSmall: [] };
  for (const t of targets) {
    // The same checks, and the same error, as `planTonight` makes when it places the target.
    const p = skyPoint(t.raHours, t.decDeg);
    if (!canReachAltitude(site.latitude, t.decDeg, minAltitude, margin)) continue;
    const band = sizeBand(ctx.train, t, options);
    let reaches = false;
    for (let k = 0; ; k += stride) {
      const kk = Math.min(k, last);
      // The last sample is always looked at, so the stride never skips the night's end.
      if (sky.altitudeAt(p, kk) + slack >= minAltitude) { reaches = true; break; }
      if (kk === last) break;
    }
    if (!reaches) continue;
    if (band === 'in') out.kept.push(t);
    else if (band === 'too-large') out.tooLarge.push(t);
    else out.tooSmall.push(t);
  }
  return out;
}

/** The targets that survive the screen; see `screenTargetsDetailed`. */
export function screenTargets(
  ctx: NightContext,
  targets: readonly PlanTarget[],
  options: { includeTooLarge: boolean; minFramePercent: number },
): PlanTarget[] {
  return screenTargetsDetailed(ctx, targets, options).kept;
}

/** The brightest few of a hidden list (by magnitude, then the larger, then name), as `HiddenTarget`s; two objects with one display name ("Eastern Veil") count once. */
function leading(hidden: readonly PlanTarget[]): HiddenTarget[] {
  const mag = (t: PlanTarget): number => t.mag ?? Infinity;
  const out: HiddenTarget[] = [];
  const seen = new Set<string>();
  const sorted = [...hidden].sort((a, b) => mag(a) - mag(b) || (b.sizeArcmin?.major ?? 0) - (a.sizeArcmin?.major ?? 0) || (a.id < b.id ? -1 : 1));
  for (const t of sorted) {
    const name = t.displayName ?? t.name;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ id: t.id, name });
    if (out.length === HIDDEN_LEADING) break;
  }
  return out;
}

/**
 * The two halves of a ranking, so a caller can score in chunks and yield between them: `candidates` is what
 * survived the screen, `evaluate` scores one, `finish` orders and cuts the scored list.
 */
export interface Ranker {
  candidates: readonly PlanTarget[];
  evaluate(t: PlanTarget): PlanEntry;
  /** One scorer per planet to include (none when planets are off), so a caller can yield between them. */
  planets: readonly (() => PlanEntry)[];
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
      planets: [],
      finish: () => ({
        night: ctx.night,
        horizonSet: ctx.horizonSet,
        minAltitude: input.minAltitude,
        entries: [],
        planets: [],
        noFit: [],
        counts: { input: input.targets.length, scored: 0, usable: 0, tooLarge: 0, tooSmall: 0 },
        hidden: { tooLarge: [], tooSmall: [] },
      }),
    };
  }
  const imageable = input.includeNonImaging === true ? input.targets : input.targets.filter((t) => !NON_IMAGING_TYPES.includes(t.type));
  const screened = screenTargetsDetailed(ctx, imageable, { includeTooLarge: input.includeTooLarge ?? false, minFramePercent });
  const noFitIds = new Set<string>();
  const candidates = [...screened.kept];
  if (input.includeNoFit === true) {
    for (const t of [...screened.tooLarge, ...screened.tooSmall]) {
      candidates.push(t);
      noFitIds.add(t.id);
    }
  }
  return {
    candidates,
    evaluate: (t) => evaluateTarget(ctx, t),
    planets: input.includePlanets === false ? [] : PLANETS.map((b) => () => evaluatePlanet(ctx, b)),
    finish(entries) {
      const usable = entries.filter((e) => e.usableMinutes > 0).sort(compareEntries);
      const noFit = usable.filter((e) => noFitIds.has(e.id));
      const listed = usable.filter((e) => !noFitIds.has(e.id) && !e.isPlanet);
      return {
        night: ctx.night,
        horizonSet: ctx.horizonSet,
        minAltitude: input.minAltitude,
        entries: capClassShare(listed, limit),
        planets: usable.filter((e) => e.isPlanet),
        noFit: [...noFit].sort((a, b) => b.score.total - a.score.total || b.usableMinutes - a.usableMinutes || compareEntries(a, b)).slice(0, NO_FIT_LIMIT),
        counts: { input: input.targets.length, scored: entries.length, usable: usable.length, tooLarge: screened.tooLarge.length, tooSmall: screened.tooSmall.length },
        hidden: { tooLarge: leading(screened.tooLarge), tooSmall: leading(screened.tooSmall) },
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
  return r.finish([...r.candidates.map((t) => r.evaluate(t)), ...r.planets.map((p) => p())]);
}
