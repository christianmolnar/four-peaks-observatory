/** Every constant of the itinerary. All are ASSUMPTIONS (round numbers for planning, not measured); the page labels the results estimate. */

/** Slew to the next target, plate-solve and centre. Charged between every two slots. */
export const SLEW_CENTER_MIN = 3;
/** Swapping a filter in the drawer or wheel. */
export const FILTER_CHANGE_MIN = 2;
/** Swapping the optical train (camera, reducer or extender): unscrew, refit, rebalance. */
export const TRAIN_CHANGE_MIN = 15;
/** A planet slot: a few short clips plus focus checks. The exposure module does not plan planets. */
export const PLANET_SLOT_MIN = 20;
/** A planet window that leaves less than this (half a slot) cannot beat one that leaves a full slot; it is taken only when nothing better exists. */
export const PLANET_MIN_USEFUL_MIN = PLANET_SLOT_MIN / 2;
/** One minute of drift in a window edge is not worth a warning. */
export const EDGE_TOLERANCE_MIN = 1;
/** Slots in one night's itinerary. */
export const MAX_SLOTS = 8;
/** Longest note on a slot, characters. */
export const MAX_NOTE_CHARS = 200;
