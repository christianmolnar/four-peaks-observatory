/** A marathon project: a list of targets with planned minutes per filter, and the session log that every number of progress is computed from. */

export type ProjectStatus = 'active' | 'paused' | 'finished';
export const PROJECT_STATUSES: readonly ProjectStatus[] = ['active', 'paused', 'finished'];

/** The gear a project is shot with, by id (the gear can change or go; the ids are what the project keeps) and the sub length it is counted in. */
export interface ProjectSetup {
  scopeId: string | null;
  cameraId: string | null;
  /** The filters used: gear filter ids, or BROADBAND_ID for light with no filter. 1 to 12, once each. */
  filterIds: string[];
  subSeconds: number;
}

/** Minutes planned for one filter on one target. `optional`: excluded from every total and shown apart ("California NB3 optional 1h"). */
export interface PlannedLine {
  filterId: string;
  minutes: number;
  optional: boolean;
}

/** One target: the catalog id and the filters planned for it (each one of the project's filters, once). A filter not listed is not planned for this target. */
export interface ProjectTarget {
  id: string;
  lines: PlannedLine[];
}

/**
 * Light logged for one target and filter on a night, by hand. Either `minutes`, or `exposures` with the `subSeconds` they were taken at; never both.
 * A session for a target or filter that is not in the plan is kept and reported, never dropped.
 */
export interface Session {
  id: string;
  /** The evening of the night, YYYY-MM-DD, a real calendar date. */
  date: string;
  targetId: string;
  filterId: string;
  minutes?: number;
  exposures?: number;
  subSeconds?: number;
  note: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  setup: ProjectSetup;
  targets: ProjectTarget[];
  sessions: Session[];
  createdAt: string;
  updatedAt: string;
}
