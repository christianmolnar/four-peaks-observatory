/**
 * Brightness scoring, per class of object.
 *
 * The catalog's surface brightness is not one quantity: a galaxy's is OpenNGC's measured mean over its D25 outline
 * (median 23.2), a cluster's or nebula's is worked out from magnitude and size (median about 21). On one scale a
 * typical cluster scores as a showpiece and a typical galaxy as a dud. So each class is scored against its own
 * reference range, and "good for its class" scores alike across classes.
 */

/** The classes, by what the catalog's number means for them. */
export type BrightnessClass = 'galaxy' | 'cluster' | 'nebula' | 'planetary-nebula' | 'unknown';

/** Where a class's score sits on its scale: the first quartile scores +10, the median 0, the third quartile -10. */
export interface Reference {
  q1: number;
  median: number;
  q3: number;
  /** The most the class can add or take, as a share of the full 10 points; 1 when absent. */
  reach?: number;
}

/**
 * Reference ranges, derived from the bundled OpenNGC extract (`public/catalog/openngc-v20260501-r3.json`): for
 * every object of a class that has the value, sort it and read the 25th, 50th and 75th percentile (index
 * floor(p * (n - 1))). A test recomputes them from the file; re-derive when the extract changes.
 *
 *  - galaxy: measured surface brightness (mag/arcsec2) of galaxies and galaxy groups, 3778 objects; and, for the
 *    other half of a galaxy's score, their V magnitude (`GALAXY_MAGNITUDE_REFERENCE`, same objects).
 *  - cluster: computed surface brightness of open and globular clusters and asterisms, 666 objects.
 *  - nebula: computed surface brightness of nebulae, dark nebulae and supernova remnants, 111 objects.
 *  - planetary-nebula: computed surface brightness, 42 objects.
 *  - unknown: V magnitude of every object with one (4617). Used for an object whose class has no comparable
 *    surface brightness: no value at all, a galaxy whose value is computed (18), or a magnitude only (2).
 */
export const BRIGHTNESS_REFERENCE: Readonly<Record<BrightnessClass, Reference>> = {
  galaxy: { q1: 22.82, median: 23.18, q3: 23.5 },
  cluster: { q1: 20.13, median: 21.18, q3: 22.03, reach: 0.5 },
  nebula: { q1: 20.06, median: 21.21, q3: 22.25 },
  'planetary-nebula': { q1: 17.36, median: 19.58, q3: 21.3 },
  unknown: { q1: 11.45, median: 12.53, q3: 13.36 },
};

/**
 * A galaxy's measured value is a mean over its whole D25 outline, which is faint for a big or edge-on galaxy that is
 * still an excellent target (NGC 891: 24.2, third quartile 23.5; its magnitude 10.0 is among the brightest 1 percent).
 * So a galaxy scores by the better of its surface brightness score and its magnitude score, each against its own class:
 * bright by surface or by total light.
 */
export const GALAXY_MAGNITUDE_REFERENCE: Reference = { q1: 11.9, median: 12.8, q3: 13.5 };

export interface Photometry {
  type?: string;
  mag?: number;
  surfaceBrightness?: number;
  sbComputed?: boolean;
}

const GALAXY_TYPES = ['galaxy', 'galaxy-group'];
const CLUSTER_TYPES = ['open-cluster', 'globular-cluster', 'asterism'];
const NEBULA_TYPES = ['nebula', 'dark-nebula', 'supernova-remnant'];

/** The class an object is scored in, and which of its numbers is read. Surface brightness is read only where it means the class's own quantity. */
export function brightnessClass(t: Photometry): { class: BrightnessClass; value: number | null } {
  const sb = t.surfaceBrightness;
  if (sb !== undefined) {
    const type = t.type ?? '';
    if (GALAXY_TYPES.includes(type)) {
      if (t.sbComputed !== true) return { class: 'galaxy', value: sb };
    } else if (CLUSTER_TYPES.includes(type)) return { class: 'cluster', value: sb };
    else if (NEBULA_TYPES.includes(type)) return { class: 'nebula', value: sb };
    else if (type === 'planetary-nebula') return { class: 'planetary-nebula', value: sb };
  }
  return { class: 'unknown', value: t.mag ?? null };
}

function against(value: number, { q1, median, q3, reach = 1 }: Reference): number {
  const full = value <= q1 ? 10 : value >= q3 ? -10 : value <= median ? ((median - value) / (median - q1)) * 10 : -((value - median) / (q3 - median)) * 10;
  return full * reach;
}

/**
 * -10 to +10 against the object's class: +10 at the class's first quartile or brighter, 0 at its median, -10 at its
 * third quartile or fainter, straight lines between. A galaxy takes the better of its surface brightness and its
 * magnitude score (see `GALAXY_MAGNITUDE_REFERENCE`). An object with no number is neutral (0): never penalised, never hidden.
 */
export function brightnessScore(t: Photometry): number {
  const { class: c, value } = brightnessClass(t);
  if (value === null) return 0;
  const score = against(value, BRIGHTNESS_REFERENCE[c]);
  return c === 'galaxy' && t.mag !== undefined ? Math.max(score, against(t.mag, GALAXY_MAGNITUDE_REFERENCE)) : score;
}
