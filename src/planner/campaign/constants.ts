import type { SurfaceBrightness } from '../exposure';

/** Minutes of integration (not elapsed time; flips and slews are extra). */
export interface UsefulRange {
  /** Least integration that gives a processable image. A target below it is cut. */
  minMin: number;
  /** Longest useful integration; past it more time gains little, so the target is done. */
  maxMin: number;
}

/**
 * ESTIMATES for Christian to tune; none is measured. The class is the target's surface brightness
 * (`surfaceBrightnessOf` in `../exposure`). The exposure module gives no per-target maximum: its marginal-gain table stops
 * at 120 min and its SNR stop time needs a camera and filter this planner does not have per target, so the maxima here are
 * class constants (300 min matches the top of the exposure module's Deep Project mode). Every value is a multiple of 5.
 */
export const USEFUL_RANGE_MIN: Readonly<Record<SurfaceBrightness, UsefulRange>> = {
  high: { minMin: 60, maxMin: 180 },
  medium: { minMin: 90, maxMin: 300 },
  low: { minMin: 120, maxMin: 480 },
  unknown: { minMin: 90, maxMin: 300 },
};

/** Shortest slot placed to lengthen a target that is already useful; shorter is not worth a slew. */
export const MIN_SLOT_MIN = 30;
