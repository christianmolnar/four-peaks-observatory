/** Minutes of integration (not elapsed time; flips and slews are extra). */
export interface UsefulRange {
  /** Least integration that gives a processable image. A target below it is cut. */
  minMin: number;
  /** Longest useful integration; past it more time gains little, so the target is done. */
  maxMin: number;
}

/** Shortest slot placed to lengthen a target that is already useful; shorter is not worth a slew. */
export const MIN_SLOT_MIN = 30;
