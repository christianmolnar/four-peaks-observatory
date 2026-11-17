import { MAX_SUB_S, MIN_CUSTOM_SUB_S } from '../exposure';
import type { GearLimit } from '../profile';

/**
 * The real range of every number a project holds, defined once. The validator, the store, the logic, the import and every message read these;
 * nothing else keeps a copy. A range is a domain decision: a long marathon is hundreds of hours over dozens of targets and a few thousand sessions,
 * not a typing guard.
 */
export const PROJECT_LIMITS = {
  /** Minutes planned for one target and filter, minutes in one session, and the minutes a session of exposures adds up to. */
  minutes: { min: 0, max: 100_000, whole: true, unit: 'min', noun: 'number of minutes' },
  /** Exposures in one session; with its sub length they add up to at most `minutes.max` minutes. */
  exposures: { min: 0, max: 100_000, whole: true, unit: '', noun: 'number of exposures' },
  /** The sub length of a project and of a session of exposures: the same range every other path accepts for a sub. */
  subSeconds: { min: MIN_CUSTOM_SUB_S, max: MAX_SUB_S, unit: 's', noun: 'sub length' },
  targets: { min: 1, max: 100, whole: true, unit: '', noun: 'number of targets' },
  filters: { min: 1, max: 12, whole: true, unit: '', noun: 'number of filters' },
  sessions: { min: 0, max: 5000, whole: true, unit: '', noun: 'number of sessions' },
} as const satisfies Record<string, GearLimit>;

export const MAX_PROJECTS = 20;
export const MAX_PROJECT_NAME = 60;
export const MAX_SESSION_NOTE = 200;
/** An id (a catalog id, a gear id, a project or session id) is short plain text; this is the longest. */
export const MAX_ID_CHARS = 80;
/** Sessions dated outside these years are refused: the date is a typing slip, not a night. */
export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;
/** The "filter" of a session or plan line for light taken with no filter (or an L filter): the broadband slot. Never a gear id. */
export const BROADBAND_ID = 'no-filter';
