/**
 * Brightness scoring by percentile rank within the object's class, so the classes are scored alike by construction.
 *
 * A galaxy's surface brightness and a nebula's magnitude are not comparable numbers, and no hand-set range makes them
 * so. Instead each class has ONE measure, and an object is scored by where it stands among the catalog's objects of its
 * class: the brightest tenth of any class scores +10, the faintest tenth -10, the median 0, in a straight line between
 * (by percentile, not by value). Every class therefore puts the same share of its objects at the top and at the bottom.
 *
 * The measure per class:
 *  - galaxy: surface brightness (OpenNGC's measured mean over the D25 outline; worked out from magnitude and size
 *    where the catalog has none), mag/arcsec2.
 *  - cluster (open, globular, asterism): integrated V magnitude.
 *  - nebula (emission and other nebulae, supernova remnants, planetary nebulae): integrated V magnitude. Not computed
 *    surface brightness: that spreads the light over the area, so it scores the big bright nebulae as the faintest.
 *  - other: V magnitude, against every object that has one.
 * An object with no value for its class's measure scores 0: never penalised, never hidden.
 *
 * The percentile tables are derived from the bundled catalog (`brightness-percentiles.ts`, built by
 * `scripts/build-brightness-percentiles.mjs`, and re-derived in a test), not worked out per request.
 */
import { BRIGHTNESS_PERCENTILES } from './brightness-percentiles';
import type { PercentileTable } from './brightness-percentiles';

/** The classes, by what the catalog's number means for them. */
export type BrightnessClass = keyof typeof BRIGHTNESS_PERCENTILES;

export interface Photometry {
  type?: string;
  mag?: number;
  surfaceBrightness?: number;
  sbComputed?: boolean;
}

/** The score at the brightest and faintest end. */
export const BRIGHTNESS_RANGE = 10;
/** The brightest this share of a class scores the top, the faintest this share the bottom. */
export const BRIGHTNESS_TAIL = 0.1;

const GALAXY_TYPES = ['galaxy', 'galaxy-group'];
const CLUSTER_TYPES = ['open-cluster', 'globular-cluster', 'asterism'];
const NEBULA_TYPES = ['nebula', 'supernova-remnant', 'planetary-nebula'];

/** The class an object is scored in, and the one number of it that is ranked: null when it has none. */
export function brightnessClass(t: Photometry): { class: BrightnessClass; value: number | null } {
  const type = t.type ?? '';
  if (GALAXY_TYPES.includes(type)) return { class: 'galaxy', value: t.surfaceBrightness ?? null };
  if (CLUSTER_TYPES.includes(type)) return { class: 'cluster', value: t.mag ?? null };
  if (NEBULA_TYPES.includes(type)) return { class: 'nebula', value: t.mag ?? null };
  return { class: 'other', value: t.mag ?? null };
}

/**
 * The share of the class that is brighter than `value` (0 = the brightest there is, 1 = the faintest), read from the
 * table's 101 cut points. A value that sits on a run of equal cut points takes the middle of the run, so ties in the
 * catalog's rounded numbers do not push a class's top share above its tail.
 */
export function fractionBrighter(value: number, { cuts }: PercentileTable): number {
  const last = cuts.length - 1;
  let lo = 0;
  while (lo <= last && cuts[lo] < value) lo++;
  if (lo === 0) return 0;
  if (lo > last) return 1;
  if (cuts[lo] === value) {
    let hi = lo;
    while (hi < last && cuts[hi + 1] === value) hi++;
    return (lo + hi) / (2 * last);
  }
  return (lo - 1 + (value - cuts[lo - 1]) / (cuts[lo] - cuts[lo - 1])) / last;
}

/** The score for a share-brighter: +10 at or inside the brightest tenth, -10 at or beyond the faintest tenth, a straight line between. */
export function scoreOfFraction(fraction: number): number {
  const percentile = 1 - fraction;
  const s = ((percentile - 0.5) / (0.5 - BRIGHTNESS_TAIL)) * BRIGHTNESS_RANGE;
  return Math.max(-BRIGHTNESS_RANGE, Math.min(BRIGHTNESS_RANGE, s));
}

/**
 * -10 to +10 by the object's percentile rank within its class (see the file comment). An object with no value for its
 * class's measure is neutral (0).
 */
export function brightnessScore(t: Photometry): number {
  const { class: c, value } = brightnessClass(t);
  if (value === null) return 0;
  return scoreOfFraction(fractionBrighter(value, BRIGHTNESS_PERCENTILES[c]));
}
