import { ITINERARY_KEY, parseItinerary } from '../itinerary';
import { CLOCK_RE } from '../itinerary/timeline';
import { MODE_ORDER } from '../exposure';
import type { ExposureMode, ExposureOverrides } from '../exposure';
import { MAX_MY_PLAN, MY_PLAN_KEY, loadMyPlan } from './index';

/** Where the saved plans live in this browser: all of them, and which one is open. */
export const PLANS_KEY = 'fpo-planner-plans-v1';
export const PLANS_VERSION = 1;
/** One copy of stored plans that could not be used as they were (damaged, repaired, or made by a newer version), kept so nothing is lost silently. */
export const PLANS_BACKUP_KEY = `${PLANS_KEY}.bak`;
/** The one-time exposure notice of the page before plans; nothing reads it now. */
export const EXPOSURE_NOTICE_KEY = 'fpo-planner-exposure-notice-v1';
/** A plan is a saved whole, read back from the browser, so the count of plans and of targets in one is bounded. */
export const MAX_PLANS = 50;
export const MAX_PLAN_TARGETS = MAX_MY_PLAN;
export const MAX_PLAN_NAME = 60;
export const MAX_PLAN_NOTES = 2000;
export const MAX_TARGET_NOTE = 200;
const DEFAULT_NAME = 'My plan';

/** The preset of a target in a plan: one of the exposure presets, or custom (any change from a preset). */
export type PlanPreset = ExposureMode | 'custom';
const PRESETS: readonly PlanPreset[] = [...MODE_ORDER, 'custom'];

/** One target of a plan. `id` is the catalog id (a planet is "planet-jupiter"); it appears once per plan. */
export interface PlanTargetRef {
  id: string;
  preset: PlanPreset;
  /** Values that differ from the preset; only with `custom`. */
  custom?: ExposureOverrides;
  /** Clock times (24 h, in the site's zone) the AI or the user set for this target. */
  start?: string;
  end?: string;
  note?: string;
}

/** A plan: one night's targets, in order, with the date, site and train they were made for. */
export interface Plan {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** The evening of the night, YYYY-MM-DD. */
  date: string;
  siteId: string;
  trainId: string;
  /** When imaging can start, 24 h clock time in the site's zone; null: when the night starts. */
  startTime: string | null;
  targets: PlanTargetRef[];
  notes: string;
}

export interface PlansState {
  version: typeof PLANS_VERSION;
  openId: string;
  plans: Plan[];
}

export class PlansError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'PlansError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function checkName(name: unknown, path: string): string {
  if (typeof name !== 'string' || name.trim() === '') throw new PlansError(path, 'must be a name that is not empty');
  if (name.trim().length > MAX_PLAN_NAME) throw new PlansError(path, `a name has at most ${MAX_PLAN_NAME} characters`);
  return name.trim();
}

function checkText(v: unknown, path: string, max: number): string {
  if (typeof v !== 'string') throw new PlansError(path, 'must be text');
  if (v.length > max) throw new PlansError(path, `at most ${max} characters`);
  return v;
}

function checkClock(v: unknown, path: string): string {
  if (typeof v !== 'string' || !CLOCK_RE.test(v)) throw new PlansError(path, 'must be a 24 h time such as "21:30"');
  return v;
}

function checkTarget(raw: unknown, path: string): PlanTargetRef {
  if (!isRecord(raw)) throw new PlansError(path, 'must be an object');
  if (typeof raw.id !== 'string' || raw.id === '') throw new PlansError(`${path}.id`, 'must be a non-empty string');
  if (!PRESETS.includes(raw.preset as PlanPreset)) throw new PlansError(`${path}.preset`, `must be one of ${PRESETS.join(', ')}`);
  const t: PlanTargetRef = { id: raw.id, preset: raw.preset as PlanPreset };
  if (raw.custom !== undefined) {
    if (!isRecord(raw.custom)) throw new PlansError(`${path}.custom`, 'must be an object');
    const custom: ExposureOverrides = {};
    for (const k of ['subSeconds', 'subCount', 'totalMin'] as const) {
      const v = raw.custom[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new PlansError(`${path}.custom.${k}`, 'must be a number above 0');
      custom[k] = v;
    }
    t.custom = custom;
  }
  if (raw.start !== undefined) t.start = checkClock(raw.start, `${path}.start`);
  if (raw.end !== undefined) t.end = checkClock(raw.end, `${path}.end`);
  if (raw.note !== undefined) t.note = checkText(raw.note, `${path}.note`, MAX_TARGET_NOTE);
  return t;
}

function checkTargets(raw: unknown, path: string): PlanTargetRef[] {
  if (!Array.isArray(raw)) throw new PlansError(path, 'must be a list');
  if (raw.length > MAX_PLAN_TARGETS) throw new PlansError(path, `at most ${MAX_PLAN_TARGETS} targets, found ${raw.length}`);
  const ids = new Set<string>();
  return raw.map((r, i) => {
    const t = checkTarget(r, `${path}[${i}]`);
    if (ids.has(t.id)) throw new PlansError(`${path}[${i}].id`, `duplicate target "${t.id}"`);
    ids.add(t.id);
    return t;
  });
}

function checkPlan(raw: unknown, path: string): Plan {
  if (!isRecord(raw)) throw new PlansError(path, 'must be an object');
  for (const k of ['id', 'siteId', 'trainId'] as const) {
    if (typeof raw[k] !== 'string' || raw[k] === '') throw new PlansError(`${path}.${k}`, 'must be a non-empty string');
  }
  for (const k of ['createdAt', 'updatedAt'] as const) {
    if (typeof raw[k] !== 'string' || Number.isNaN(Date.parse(raw[k] as string))) throw new PlansError(`${path}.${k}`, 'must be a date and time');
  }
  if (typeof raw.date !== 'string' || !DATE_RE.test(raw.date) || Number.isNaN(Date.parse(raw.date))) throw new PlansError(`${path}.date`, 'must be a date, YYYY-MM-DD');
  const startTime = raw.startTime === null ? null : checkClock(raw.startTime, `${path}.startTime`);
  return {
    id: raw.id as string,
    name: checkName(raw.name, `${path}.name`),
    createdAt: raw.createdAt as string,
    updatedAt: raw.updatedAt as string,
    date: raw.date,
    siteId: raw.siteId as string,
    trainId: raw.trainId as string,
    startTime,
    targets: checkTargets(raw.targets, `${path}.targets`),
    notes: checkText(raw.notes, `${path}.notes`, MAX_PLAN_NOTES),
  };
}

/** Checks a parsed value field by field. Throws PlansError with the path of the first problem; never repairs, except that an open id that is gone is the first plan. */
export function validatePlans(input: unknown): PlansState {
  if (!isRecord(input)) throw new PlansError('$', 'must be an object');
  if (input.version !== PLANS_VERSION) throw new PlansError('$.version', `must be ${PLANS_VERSION}, found ${JSON.stringify(input.version)}`);
  if (!Array.isArray(input.plans) || input.plans.length === 0) throw new PlansError('$.plans', 'must be a list with at least one plan');
  if (input.plans.length > MAX_PLANS) throw new PlansError('$.plans', `at most ${MAX_PLANS} plans, found ${input.plans.length}`);
  const ids = new Set<string>();
  const plans = input.plans.map((raw: unknown, i: number) => {
    const p = checkPlan(raw, `$.plans[${i}]`);
    if (ids.has(p.id)) throw new PlansError(`$.plans[${i}].id`, `duplicate id "${p.id}"`);
    ids.add(p.id);
    return p;
  });
  const openId = typeof input.openId === 'string' && ids.has(input.openId) ? input.openId : plans[0].id;
  return { version: PLANS_VERSION, openId, plans };
}

/** What `loadPlans` found: the plans (null when none could be used), what to tell the user, and the stored text the page must keep a copy of. */
export interface LoadedPlans {
  state: PlansState | null;
  /** Plain sentences, one per problem; empty when everything was read whole. */
  notices: string[];
  /**
   * The stored text that could not be used as it was, else null. `newer`: made by a newer version of the planner, never overwritten until the
   * user chooses. `damaged`: not usable at all. `repaired`: some plans were repaired or left out. The text stays in storage until the next save;
   * the page copies it to PLANS_BACKUP_KEY first (`keepCopy`).
   */
  unusable: { kind: 'newer' | 'damaged' | 'repaired'; text: string } | null;
}

const NEWER_NOTICE =
  'Your saved plans were made by a newer version of the planner. This version leaves them untouched and does not save over them. Use "Start over" to replace them with a fresh plan; a copy is kept first.';
const DAMAGED_NOTICE = 'Your saved plans could not be read, so they start over with one empty plan. A copy of what was stored is kept in this browser.';

/** A plan checked on its own: as it is, else with the two fields a newer or older version can leave unknown repaired (preset to Balanced, date to `today`). Null when it cannot be read. */
function readPlan(raw: unknown, i: number, today: string, notices: string[]): Plan | null {
  const path = `$.plans[${i}]`;
  try {
    return checkPlan(raw, path);
  } catch (first) {
    if (!(first instanceof PlansError)) throw first;
    const label = isRecord(raw) && typeof raw.name === 'string' && raw.name.trim() !== '' ? `"${raw.name.trim()}"` : `number ${i + 1}`;
    if (isRecord(raw)) {
      const fixes: string[] = [];
      const copy: Record<string, unknown> = { ...raw };
      if (typeof copy.date !== 'string' || !DATE_RE.test(copy.date) || Number.isNaN(Date.parse(copy.date))) {
        copy.date = today;
        fixes.push(`The plan ${label} had no usable date, so it is set to ${today}.`);
      }
      if (Array.isArray(copy.targets)) {
        let changed = 0;
        copy.targets = copy.targets.map((t) => {
          if (!isRecord(t) || PRESETS.includes(t.preset as PlanPreset)) return t;
          changed++;
          const fixed: Record<string, unknown> = { ...t, preset: 'balanced' };
          delete fixed.custom;
          return fixed;
        });
        if (changed > 0) fixes.push(`In the plan ${label}, ${changed} ${changed === 1 ? 'target had a preset' : 'targets had presets'} this version does not know, so ${changed === 1 ? 'it is' : 'they are'} set to Balanced.`);
      }
      try {
        const plan = checkPlan(copy, path);
        notices.push(...fixes);
        return plan;
      } catch (second) {
        if (!(second instanceof PlansError)) throw second;
      }
    }
    notices.push(`The plan ${label} could not be read and is left out (${first.message}).`);
    return null;
  }
}

/**
 * The saved plans. Nothing is ever removed from storage here: text that cannot be used whole comes back in `unusable` for the page to copy to
 * the backup key before the next save. A version above 1 is "made by a newer version" and is never read as damaged. A plan with one bad field
 * is repaired (unknown preset, bad date) or left out alone, with a sentence saying so; the other plans load. A storage that cannot be read throws.
 */
export function loadPlans(storage: Pick<Storage, 'getItem'>, today: string): LoadedPlans {
  let text: string | null;
  try {
    text = storage.getItem(PLANS_KEY);
  } catch (e) {
    throw new Error(`Your plans could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  if (text === null) return { state: null, notices: [], unusable: null };
  const damaged = { state: null, notices: [DAMAGED_NOTICE], unusable: { kind: 'damaged' as const, text } };
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return damaged;
  }
  if (!isRecord(input) || !Array.isArray(input.plans) || input.plans.length === 0) return damaged;
  if (typeof input.version === 'number' && input.version > PLANS_VERSION) return { state: null, notices: [NEWER_NOTICE], unusable: { kind: 'newer', text } };
  if (input.version !== PLANS_VERSION) return damaged;
  const notices: string[] = [];
  const ids = new Set<string>();
  const plans: Plan[] = [];
  let extra = 0;
  input.plans.forEach((raw: unknown, i: number) => {
    if (plans.length >= MAX_PLANS) {
      extra++;
      return;
    }
    const plan = readPlan(raw, i, today, notices);
    if (plan === null) return;
    if (ids.has(plan.id)) {
      notices.push(`The plan "${plan.name}" repeated the id of another plan and is left out.`);
      return;
    }
    ids.add(plan.id);
    plans.push(plan);
  });
  if (extra > 0) notices.push(`Plans hold at most ${MAX_PLANS} plans, so ${extra} more in the saved copy ${extra === 1 ? 'is' : 'are'} left out.`);
  if (plans.length === 0) return { state: null, notices: [...notices, DAMAGED_NOTICE], unusable: { kind: 'damaged', text } };
  const openId = typeof input.openId === 'string' && ids.has(input.openId) ? input.openId : plans[0].id;
  return { state: { version: PLANS_VERSION, openId, plans }, notices, unusable: notices.length > 0 ? { kind: 'repaired', text } : null };
}

/** Copies stored text to the one backup key (the latest copy replaces an earlier one). Throws when it cannot be written. */
export function keepCopy(storage: Pick<Storage, 'setItem'>, text: string): void {
  storage.setItem(PLANS_BACKUP_KEY, text);
}

/**
 * The plans another tab saved, as a state to continue from: this tab's open plan stays open when it is still there. Null when the text is
 * not a whole, readable set (then this tab keeps what it has).
 */
export function adoptStored(current: PlansState, text: string): PlansState | null {
  let stored: PlansState;
  try {
    stored = validatePlans(JSON.parse(text));
  } catch (e) {
    if (e instanceof PlansError || e instanceof SyntaxError) return null;
    throw e;
  }
  return stored.plans.some((p) => p.id === current.openId) ? { ...stored, openId: current.openId } : stored;
}

/** Validates, then stores. Throws PlansError on an invalid state and writes nothing. */
export function savePlans(storage: Pick<Storage, 'setItem'>, state: PlansState): void {
  validatePlans(state);
  storage.setItem(PLANS_KEY, JSON.stringify(state));
}

// ------------------------------------------------------------------ changes (each returns a new state)

/** What a new plan starts with: the date, site and train the page is on, and the clock for its stamps. */
export interface PlanDefaults {
  date: string;
  siteId: string;
  trainId: string;
  now: string;
}

function nextId(plans: readonly Plan[]): string {
  const used = new Set(plans.map((p) => p.id));
  for (let n = 1; ; n++) if (!used.has(`plan-${n}`)) return `plan-${n}`;
}

function nextName(plans: readonly Plan[]): string {
  const used = new Set(plans.map((p) => p.name));
  for (let n = plans.length + 1; ; n++) if (!used.has(`Plan ${n}`)) return `Plan ${n}`;
}

const blank = (d: PlanDefaults, id: string, name: string): Plan => ({
  id,
  name,
  createdAt: d.now,
  updatedAt: d.now,
  date: d.date,
  siteId: d.siteId,
  trainId: d.trainId,
  startTime: null,
  targets: [],
  notes: '',
});

const room = (s: PlansState): void => {
  if (s.plans.length >= MAX_PLANS) throw new Error(`Plans hold at most ${MAX_PLANS} plans. Delete one to make another.`);
};

/** The first state: one empty plan named "My plan", or the migrated one. */
export function startPlans(d: PlanDefaults, migrated: Plan | null = null): PlansState {
  const plan = migrated ?? blank(d, 'plan-1', DEFAULT_NAME);
  return { version: PLANS_VERSION, openId: plan.id, plans: [plan] };
}

/** An empty plan on the given date, site and train, opened. */
export function newPlan(s: PlansState, d: PlanDefaults): PlansState {
  room(s);
  const plan = blank(d, nextId(s.plans), nextName(s.plans));
  return { ...s, openId: plan.id, plans: [...s.plans, plan] };
}

export function openPlan(s: PlansState, id: string): PlansState {
  if (!s.plans.some((p) => p.id === id)) throw new Error(`There is no plan "${id}".`);
  return { ...s, openId: id };
}

function change(s: PlansState, id: string, edit: (p: Plan) => Plan): PlansState {
  if (!s.plans.some((p) => p.id === id)) throw new Error(`There is no plan "${id}".`);
  const next = { ...s, plans: s.plans.map((p) => (p.id === id ? edit(p) : p)) };
  validatePlans(next); // the limits and the field checks hold for every change, not only for what is read back
  return next;
}

export function renamePlan(s: PlansState, id: string, name: string): PlansState {
  const clean = checkName(name, 'name');
  return change(s, id, (p) => ({ ...p, name: clean }));
}

/** Changes the fields given and nothing else; stamps `updatedAt`. */
export function updatePlan(s: PlansState, id: string, patch: Partial<Pick<Plan, 'date' | 'siteId' | 'trainId' | 'startTime' | 'targets' | 'notes'>>, now: string): PlansState {
  return change(s, id, (p) => ({ ...p, ...patch, updatedAt: now }));
}

/** A copy of the plan, with its own target list, named "<name> (copy)", opened. */
export function duplicatePlan(s: PlansState, id: string, now: string): PlansState {
  room(s);
  const from = s.plans.find((p) => p.id === id);
  if (!from) throw new Error(`There is no plan "${id}".`);
  const name = `${from.name} (copy)`.slice(0, MAX_PLAN_NAME);
  const copy: Plan = { ...from, id: nextId(s.plans), name, createdAt: now, updatedAt: now, targets: from.targets.map((t) => ({ ...t, ...(t.custom ? { custom: { ...t.custom } } : {}) })) };
  return { ...s, openId: copy.id, plans: [...s.plans, copy] };
}

/** Removes a plan. When it was open, the plan that took its place (else the one before) opens. The last plan is replaced by a fresh empty one. */
export function deletePlan(s: PlansState, id: string, fresh: PlanDefaults): PlansState {
  const at = s.plans.findIndex((p) => p.id === id);
  if (at < 0) throw new Error(`There is no plan "${id}".`);
  const plans = s.plans.filter((p) => p.id !== id);
  if (plans.length === 0) return startPlans(fresh);
  const openId = s.openId === id ? plans[Math.min(at, plans.length - 1)].id : s.openId;
  return { ...s, openId, plans };
}

// ------------------------------------------------------------------ migration

/** What was found under one old key: nothing, read, damaged (not usable, removed by its own loader) or unreadable (the browser refused to read it). */
type OldKey = 'absent' | 'read' | 'damaged' | 'unreadable';

/** The note of two slots for one target: joined, and cut at the note limit. */
function joinNotes(a: string, b: string): string {
  return [a, b].filter((n) => n !== '').join(' / ').slice(0, MAX_TARGET_NOTE);
}

/**
 * The My plan list and the night itinerary this page saved before there were plans, as one plan named "My plan". Read only: the old keys are
 * left as they are; `clear` names the ones to remove once the plans are saved (read, or damaged; never one the browser could not read).
 * The plan's targets are the itinerary's slots first, in slot order, then the rest of My plan in its order, so the first 8 are the old night.
 * Each takes its slot's mode as its preset and its note. Two slots for one target merge: the first slot's mode, the notes joined within the
 * note limit. What was merged or left out by the 50-target limit is named in `problems`. The itinerary's start time is the plan's.
 */
export function migrateOldPlan(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  d: PlanDefaults,
): { plan: Plan | null; problems: string[]; clear: string[] } {
  const problems: string[] = [];
  let ids: string[] = [];
  let myPlan: OldKey = 'absent';
  try {
    if (storage.getItem(MY_PLAN_KEY) !== null) myPlan = 'read';
  } catch (e) {
    myPlan = 'unreadable';
    problems.push(`Your plan could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  if (myPlan === 'read') {
    try {
      ids = loadMyPlan(storage);
    } catch (e) {
      myPlan = 'damaged';
      problems.push((e as Error).message);
    }
  }
  let items: ReturnType<typeof parseItinerary>['items'] = [];
  let startTime: string | null = null;
  let itinerary: OldKey = 'absent';
  try {
    const text = storage.getItem(ITINERARY_KEY);
    if (text !== null) {
      try {
        const saved = parseItinerary(text);
        items = saved.items;
        startTime = saved.startTime;
        itinerary = 'read';
      } catch {
        itinerary = 'damaged';
        problems.push('Your saved night timeline could not be read, so it was not carried over.');
      }
    }
  } catch (e) {
    itinerary = 'unreadable';
    problems.push(`Your saved night timeline could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  const clear: string[] = [];
  if (myPlan === 'read' || myPlan === 'damaged') clear.push(MY_PLAN_KEY);
  if (itinerary === 'read' || itinerary === 'damaged') clear.push(ITINERARY_KEY);

  // The itinerary's slots first, in slot order, one entry per target.
  const slots = new Map<string, { mode: ExposureMode; note: string }>();
  const merged: string[] = [];
  for (const it of items) {
    const have = slots.get(it.targetId);
    if (have === undefined) slots.set(it.targetId, { mode: it.mode, note: it.note });
    else {
      have.note = joinNotes(have.note, it.note);
      if (!merged.includes(it.targetId)) merged.push(it.targetId);
    }
  }
  if (merged.length > 0) {
    problems.push(`A repeated slot in your night timeline was merged into one (${merged.join(', ')}): the first slot's preset is kept and the notes are joined.`);
  }
  const all = [...slots.keys(), ...ids.filter((id) => !slots.has(id))];
  const order = all.slice(0, MAX_PLAN_TARGETS);
  if (all.length > order.length) {
    problems.push(`A plan holds at most ${MAX_PLAN_TARGETS} targets, so ${all.length - order.length} ${all.length - order.length === 1 ? 'was' : 'were'} left out: ${all.slice(MAX_PLAN_TARGETS).join(', ')}.`);
  }
  if (order.length === 0) return { plan: null, problems, clear };
  const targets = order.map((id): PlanTargetRef => {
    const slot = slots.get(id);
    if (!slot) return { id, preset: 'balanced' };
    return slot.note === '' ? { id, preset: slot.mode } : { id, preset: slot.mode, note: slot.note };
  });
  return { plan: { ...blank(d, 'plan-1', DEFAULT_NAME), startTime, targets }, problems, clear };
}

/** Removes the old keys named (the ones that were carried over or damaged) and the orphan exposure notice, once the plans made from them are saved. Throws, in words, when a key cannot be removed. */
export function clearOldPlanKeys(storage: Pick<Storage, 'removeItem'>, keys: readonly string[]): void {
  for (const key of [...keys, EXPOSURE_NOTICE_KEY]) {
    try {
      storage.removeItem(key);
    } catch (e) {
      throw new Error(`its old copy could not be removed: ${(e as Error).message}`);
    }
  }
}
