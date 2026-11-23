import type { Profile } from '../profile';
import { MAX_PROJECTS } from '../projects/limits';
import type { Project } from '../projects/types';
import { ProjectsError, checkProject, nameForMessage, pathInWords } from '../projects/validate';
import type { ProjectSheet } from '../projects/sheet';
import { MAX_PLANS, PLANS_VERSION, readPlan } from '../state/plans';
import type { Plan } from '../state/plans';
import { planProblemText } from '../state/words';
import type { PlanSheet } from './share';

/** The marker every file this planner writes carries, so a file of another kind is told apart from a plans file. */
export const FILE_FORMAT = 'four-peaks-planner';
export const FILE_VERSION = PLANS_VERSION;
/** A plans file is a few kB per plan; this is the same size limit the profile import has. */
export const MAX_PLANS_FILE_CHARS = 2_000_000;
/** The most entries of a file that are looked at; a file with more is cut here and says so. */
export const MAX_ENTRIES_READ = 200;
/** The most problems said in words; the rest are counted. */
const MAX_PROBLEM_LINES = 8;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** What one export file holds. `plans` are stored as the store keeps them (the import reads these); `sheets` are what a person reads; `profile` is the gear. */
export function plansFileText(parts: { exportedAt: string; plans: readonly Plan[]; sheets: readonly PlanSheet[]; profile: Profile | null; projects?: readonly Project[]; projectSheets?: readonly ProjectSheet[] }): string {
  const projects = parts.projects ?? [];
  return `${JSON.stringify(
    {
      format: FILE_FORMAT,
      kind: parts.profile !== null ? 'everything' : parts.plans.length === 0 && projects.length > 0 ? 'projects' : 'plans',
      version: FILE_VERSION,
      exportedAt: parts.exportedAt,
      plans: parts.plans,
      sheets: parts.sheets,
      // Projects are stored as the store keeps them (the import reads these); their sheets are what a person reads. Absent when there are none, so a file without projects is as it always was.
      ...(projects.length === 0 ? {} : { projects, projectSheets: parts.projectSheets ?? [] }),
      ...(parts.profile === null ? {} : { profile: parts.profile }),
    },
    null,
    2,
  )}\n`;
}

/** The gear alone, in the profile's own format, so Import profile reads it. */
export const gearFileText = (profile: Profile): string => `${JSON.stringify(profile, null, 2)}\n`;

/** An "everything" file's gear as profile text, for Import profile; null when the text is not such a file. */
export function gearInEverything(text: string): string | null {
  try {
    const json: unknown = JSON.parse(text);
    if (isRecord(json) && json.format === FILE_FORMAT && json.kind === 'everything' && isRecord(json.profile)) return JSON.stringify(json.profile);
  } catch {
    // not JSON: the profile import says so
  }
  return null;
}

export interface ReadPlans {
  plans: Plan[];
  /** Plain sentences about what was left out or repaired. */
  notices: string[];
  /** The file also holds gear (an "everything" file). */
  hasGear: boolean;
}

/** A file that cannot be imported: the message is plain and ready to show. */
export class PlansFileError extends Error {}

const NOT_PLANS = 'This file is not a planner plans file.';

/**
 * Reads a plans file. Throws PlansFileError, in plain words, for anything that is not one (empty, too large, not JSON, the wrong kind, no or a
 * newer version, no plans). Plans are read one by one by the same rules as the saved plans (an unknown preset or a bad date is repaired, a plan
 * that cannot be read is left out), at most MAX_PLANS of them from the first MAX_ENTRIES_READ entries; nothing is written.
 */
export function readPlansFile(text: string, today: string, dateText: (iso: string) => string): ReadPlans {
  if (text.trim() === '') throw new PlansFileError(`${NOT_PLANS} The file is empty.`);
  if (text.length > MAX_PLANS_FILE_CHARS) throw new PlansFileError(`${NOT_PLANS} The file is too large.`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PlansFileError(`${NOT_PLANS} It is not valid JSON.`);
  }
  if (!isRecord(json)) throw new PlansFileError(`${NOT_PLANS} It should be an object with a list of plans.`);
  if (json.format !== undefined && json.format !== FILE_FORMAT) throw new PlansFileError(`${NOT_PLANS} It was not made by this planner.`);
  if (json.format === undefined && Array.isArray(json.sites) && isRecord(json.equipment)) {
    throw new PlansFileError('This file is a gear profile, not plans.');
  }
  if (json.format === undefined && !Array.isArray(json.plans)) throw new PlansFileError(`${NOT_PLANS} It has no list of plans.`);
  if (json.version === undefined) throw new PlansFileError(`${NOT_PLANS} It has no version number.`);
  if (typeof json.version !== 'number') throw new PlansFileError(`${NOT_PLANS} The version is not a number.`);
  if (json.version > FILE_VERSION) throw new PlansFileError(`Newer file version ${json.version}; this planner reads ${FILE_VERSION}.`);
  if (json.version !== FILE_VERSION) throw new PlansFileError(`${NOT_PLANS} Version ${json.version}; this planner reads ${FILE_VERSION}.`);
  if (!Array.isArray(json.plans)) throw new PlansFileError(`${NOT_PLANS} It has no list of plans.`);
  if (json.plans.length === 0) throw new PlansFileError('The file holds no plans.');

  const notices: string[] = [];
  const ids = new Set<string>();
  const plans: Plan[] = [];
  const looked = Math.min(json.plans.length, MAX_ENTRIES_READ);
  let extra = 0;
  for (let i = 0; i < looked; i++) {
    if (plans.length >= MAX_PLANS) {
      extra++;
      continue;
    }
    const plan = readPlan(json.plans[i], i, today, notices, dateText, planProblemText);
    if (plan === null) continue;
    if (ids.has(plan.id)) {
      notices.push(`The plan "${plan.name.length > 40 ? `${plan.name.slice(0, 40)}…` : plan.name}" repeats an id: left out.`);
      continue;
    }
    ids.add(plan.id);
    plans.push(plan);
  }
  extra += json.plans.length - looked;
  if (plans.length === 0) throw new PlansFileError(`None of the plans in the file could be read. ${notices.slice(0, MAX_PROBLEM_LINES).join(' ')}`.trim());
  if (notices.length > MAX_PROBLEM_LINES) notices.splice(MAX_PROBLEM_LINES, notices.length, `And ${notices.length - MAX_PROBLEM_LINES} more problems like these.`);
  if (extra > 0) notices.push(`Plan limit ${MAX_PLANS}: ${extra} left out.`);
  return { plans, notices, hasGear: isRecord(json.profile) };
}

export interface ReadProjects {
  projects: Project[];
  /** Plain sentences about what was left out. */
  notices: string[];
}

const NOT_PROJECTS = 'This file is not a planner file with projects.';

/**
 * Reads the projects of a planner file (a plans file, an "everything" file or a projects file). Throws PlansFileError, in plain words, for anything else
 * (empty, too large, not JSON, not made by this planner, no or a newer version, no projects). Projects are read one by one by the store's own rules and a
 * project that cannot be read is left out with a sentence saying where, never printed raw; nothing is written. Sessions come over whole.
 */
export function readProjectsFile(text: string): ReadProjects {
  if (text.trim() === '') throw new PlansFileError(`${NOT_PROJECTS} The file is empty.`);
  if (text.length > MAX_PLANS_FILE_CHARS) throw new PlansFileError(`${NOT_PROJECTS} The file is too large.`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PlansFileError(`${NOT_PROJECTS} It is not valid JSON.`);
  }
  if (!isRecord(json)) throw new PlansFileError(`${NOT_PROJECTS} It should be an object.`);
  if (json.format !== FILE_FORMAT) throw new PlansFileError(`${NOT_PROJECTS} It was not made by this planner.`);
  if (typeof json.version !== 'number') throw new PlansFileError(`${NOT_PROJECTS} It has no version number.`);
  if (json.version > FILE_VERSION) throw new PlansFileError(`Newer file version${Number.isSafeInteger(json.version) ? ` ${json.version}` : ''}; this planner reads ${FILE_VERSION}.`);
  if (json.version !== FILE_VERSION) throw new PlansFileError(`${NOT_PROJECTS} ${Number.isSafeInteger(json.version) ? `Version ${json.version}` : 'Version is not a whole number'}; this planner reads ${FILE_VERSION}.`);
  if (json.projects === undefined) throw new PlansFileError('The file holds no projects.');
  if (!Array.isArray(json.projects)) throw new PlansFileError(`${NOT_PROJECTS} Its projects are not a list.`);
  if (json.projects.length === 0) throw new PlansFileError('The file holds no projects.');

  const notices: string[] = [];
  const ids = new Set<string>();
  const projects: Project[] = [];
  const looked = Math.min(json.projects.length, MAX_ENTRIES_READ);
  let extra = 0;
  for (let i = 0; i < looked; i++) {
    if (projects.length >= MAX_PROJECTS) {
      extra++;
      continue;
    }
    const raw: unknown = json.projects[i];
    try {
      const p = checkProject(raw, `$.projects[${i}]`);
      if (ids.has(p.id)) notices.push(`The project ${nameForMessage(p.name, `number ${i + 1}`)} repeats an id: left out.`);
      else {
        ids.add(p.id);
        projects.push(p);
      }
    } catch (e) {
      if (!(e instanceof ProjectsError)) throw e;
      const where = pathInWords(e.path);
      notices.push(`The project ${nameForMessage(isRecord(raw) ? raw.name : undefined, `number ${i + 1}`)} could not be read and is left out${where === '' ? '' : ` (${where}: ${e.detail})`}.`);
    }
  }
  extra += json.projects.length - looked;
  if (projects.length === 0) throw new PlansFileError(`None of the projects in the file could be read. ${notices.slice(0, MAX_PROBLEM_LINES).join(' ')}`.trim());
  if (notices.length > MAX_PROBLEM_LINES) notices.splice(MAX_PROBLEM_LINES, notices.length, `And ${notices.length - MAX_PROBLEM_LINES} more problems like these.`);
  if (extra > 0) notices.push(`Project limit ${MAX_PROJECTS}: ${extra} left out.`);
  return { projects, notices };
}
