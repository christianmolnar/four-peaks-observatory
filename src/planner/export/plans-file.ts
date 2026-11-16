import type { Profile } from '../profile';
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
export function plansFileText(parts: { exportedAt: string; plans: readonly Plan[]; sheets: readonly PlanSheet[]; profile: Profile | null }): string {
  return `${JSON.stringify(
    {
      format: FILE_FORMAT,
      kind: parts.profile === null ? 'plans' : 'everything',
      version: FILE_VERSION,
      exportedAt: parts.exportedAt,
      plans: parts.plans,
      sheets: parts.sheets,
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
    throw new PlansFileError('This file is a gear profile, not plans. Import it under Gear and site, Import profile.');
  }
  if (json.format === undefined && !Array.isArray(json.plans)) throw new PlansFileError(`${NOT_PLANS} It has no list of plans.`);
  if (json.version === undefined) throw new PlansFileError(`${NOT_PLANS} It has no version number.`);
  if (typeof json.version !== 'number') throw new PlansFileError(`${NOT_PLANS} The version is not a number.`);
  if (json.version > FILE_VERSION) throw new PlansFileError(`This file was made by a newer version of the planner (version ${json.version}); this one reads version ${FILE_VERSION}.`);
  if (json.version !== FILE_VERSION) throw new PlansFileError(`${NOT_PLANS} It is version ${json.version}; this planner reads version ${FILE_VERSION}.`);
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
      notices.push(`The plan "${plan.name.length > 40 ? `${plan.name.slice(0, 40)}…` : plan.name}" repeats the id of an earlier plan in the file and is left out.`);
      continue;
    }
    ids.add(plan.id);
    plans.push(plan);
  }
  extra += json.plans.length - looked;
  if (plans.length === 0) throw new PlansFileError(`None of the plans in the file could be read. ${notices.slice(0, MAX_PROBLEM_LINES).join(' ')}`.trim());
  if (notices.length > MAX_PROBLEM_LINES) notices.splice(MAX_PROBLEM_LINES, notices.length, `And ${notices.length - MAX_PROBLEM_LINES} more problems like these.`);
  if (extra > 0) notices.push(`A plans file reads at most ${MAX_PLANS} plans, so ${extra} more in this file ${extra === 1 ? 'is' : 'are'} left out.`);
  return { plans, notices, hasGear: isRecord(json.profile) };
}
