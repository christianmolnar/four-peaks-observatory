import { inRange, rangeText } from '../profile';
import type { GearLimit } from '../profile';
import { badNumber } from '../profile/limits';
import { MAX_ID_CHARS, MAX_PROJECTS, MAX_PROJECT_NAME, MAX_SESSION_NOTE, MAX_YEAR, MIN_YEAR, PROJECT_LIMITS } from './limits';
import { PROJECT_STATUSES } from './types';
import type { PlannedLine, Project, ProjectSetup, ProjectStatus, ProjectTarget, Session } from './types';

export const PROJECTS_VERSION = 1;

/**
 * A project problem: where it is (a path such as `$.projects[0].sessions[3].date`, kept for code) and what is wrong, in plain words. The detail never holds
 * a stored value. The `message` is the plain sentence ("session 4, date: must be a real date ..."), never the path: whatever catches this error and shows
 * its message shows words, so no caller can print a validator path.
 */
export class ProjectsError extends Error {
  constructor(
    public readonly path: string,
    public readonly detail: string,
  ) {
    super(problemSentence(path, detail));
    this.name = 'ProjectsError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ID_RE = /^[A-Za-z0-9._:-]+$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written YYYY-MM-DD, in the years the project accepts (not 2026-02-30, not month 13). */
export function isRealDate(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = DATE_RE.exec(v);
  if (m === null) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function checkId(v: unknown, path: string): string {
  if (typeof v !== 'string' || v === '') throw new ProjectsError(path, 'must be an id that is not empty');
  if (v.length > MAX_ID_CHARS || !ID_RE.test(v)) throw new ProjectsError(path, `an id is plain letters, digits and . _ : - , at most ${MAX_ID_CHARS} characters`);
  return v;
}

function checkText(v: unknown, path: string, max: number, what: string): string {
  if (typeof v !== 'string') throw new ProjectsError(path, `${what} must be text`);
  if (v.length > max) throw new ProjectsError(path, `${what} has at most ${max} characters`);
  if (CONTROL_RE.test(v)) throw new ProjectsError(path, `${what} has a line break or control character`);
  return v;
}

function checkNumber(limit: GearLimit, v: unknown, path: string): number {
  if (!inRange(limit, v)) throw new ProjectsError(path, `${badNumber(limit, v)}; use ${limit.whole === true ? 'a whole number, ' : ''}${rangeText(limit)}`);
  return v;
}

function checkStamp(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length > 40 || Number.isNaN(Date.parse(v))) throw new ProjectsError(path, 'must be a date and time');
  return v;
}

function checkList(v: unknown, path: string, limit: GearLimit): unknown[] {
  if (!Array.isArray(v)) throw new ProjectsError(path, 'must be a list');
  if (v.length < limit.min || v.length > limit.max) throw new ProjectsError(path, `holds ${limit.min} to ${limit.max.toLocaleString('en-US')}, found ${v.length.toLocaleString('en-US')}`);
  return v;
}

function checkSetup(raw: unknown, path: string): ProjectSetup {
  if (!isRecord(raw)) throw new ProjectsError(path, 'must be an object');
  const ref = (k: 'scopeId' | 'cameraId') => (raw[k] === null ? null : checkId(raw[k], `${path}.${k}`));
  const ids = new Set<string>();
  const filterIds = checkList(raw.filterIds, `${path}.filterIds`, PROJECT_LIMITS.filters).map((f, i) => {
    const id = checkId(f, `${path}.filterIds[${i}]`);
    if (ids.has(id)) throw new ProjectsError(`${path}.filterIds[${i}]`, 'a filter appears once');
    ids.add(id);
    return id;
  });
  return { scopeId: ref('scopeId'), cameraId: ref('cameraId'), filterIds, subSeconds: checkNumber(PROJECT_LIMITS.subSeconds, raw.subSeconds, `${path}.subSeconds`) };
}

function checkTarget(raw: unknown, path: string, filters: ReadonlySet<string>): ProjectTarget {
  if (!isRecord(raw)) throw new ProjectsError(path, 'must be an object');
  const id = checkId(raw.id, `${path}.id`);
  if (!Array.isArray(raw.lines)) throw new ProjectsError(`${path}.lines`, 'must be a list');
  if (raw.lines.length > PROJECT_LIMITS.filters.max) throw new ProjectsError(`${path}.lines`, `holds at most ${PROJECT_LIMITS.filters.max} filters`);
  const seen = new Set<string>();
  const lines = raw.lines.map((l: unknown, i): PlannedLine => {
    const lp = `${path}.lines[${i}]`;
    if (!isRecord(l)) throw new ProjectsError(lp, 'must be an object');
    const filterId = checkId(l.filterId, `${lp}.filterId`);
    if (!filters.has(filterId)) throw new ProjectsError(`${lp}.filterId`, 'is not one of the filters of the project');
    if (seen.has(filterId)) throw new ProjectsError(`${lp}.filterId`, 'a filter appears once on a target');
    seen.add(filterId);
    if (typeof l.optional !== 'boolean') throw new ProjectsError(`${lp}.optional`, 'must be yes or no');
    return { filterId, minutes: checkNumber(PROJECT_LIMITS.minutes, l.minutes, `${lp}.minutes`), optional: l.optional };
  });
  return { id, lines };
}

export function checkSession(raw: unknown, path: string): Session {
  if (!isRecord(raw)) throw new ProjectsError(path, 'must be an object');
  const id = checkId(raw.id, `${path}.id`);
  if (!isRealDate(raw.date)) throw new ProjectsError(`${path}.date`, `must be a real date, YYYY-MM-DD, in ${MIN_YEAR} to ${MAX_YEAR}`);
  const base = { id, date: raw.date, targetId: checkId(raw.targetId, `${path}.targetId`), filterId: checkId(raw.filterId, `${path}.filterId`) };
  const note = checkText(raw.note, `${path}.note`, MAX_SESSION_NOTE, 'a note');
  if (raw.minutes !== undefined) {
    if (raw.exposures !== undefined || raw.subSeconds !== undefined) throw new ProjectsError(path, 'a session holds minutes, or exposures with a sub length, not both');
    return { ...base, minutes: checkNumber(PROJECT_LIMITS.minutes, raw.minutes, `${path}.minutes`), note };
  }
  if (raw.exposures === undefined || raw.subSeconds === undefined) throw new ProjectsError(path, 'a session holds minutes, or exposures with a sub length');
  const exposures = checkNumber(PROJECT_LIMITS.exposures, raw.exposures, `${path}.exposures`);
  const subSeconds = checkNumber(PROJECT_LIMITS.subSeconds, raw.subSeconds, `${path}.subSeconds`);
  if ((exposures * subSeconds) / 60 > PROJECT_LIMITS.minutes.max) throw new ProjectsError(path, `exposures and sub length add up to more than ${PROJECT_LIMITS.minutes.max.toLocaleString('en-US')} minutes`);
  return { ...base, exposures, subSeconds, note };
}

/** One project, checked field by field. Throws ProjectsError with the path of the first problem; never repairs. */
export function checkProject(raw: unknown, path: string): Project {
  if (!isRecord(raw)) throw new ProjectsError(path, 'must be an object');
  const id = checkId(raw.id, `${path}.id`);
  const name = checkText(raw.name, `${path}.name`, MAX_PROJECT_NAME, 'a name').trim();
  if (name === '') throw new ProjectsError(`${path}.name`, 'must be a name that is not empty');
  if (!PROJECT_STATUSES.includes(raw.status as ProjectStatus)) throw new ProjectsError(`${path}.status`, `must be one of ${PROJECT_STATUSES.join(', ')}`);
  const setup = checkSetup(raw.setup, `${path}.setup`);
  const filters = new Set(setup.filterIds);
  const targetIds = new Set<string>();
  const targets = checkList(raw.targets, `${path}.targets`, PROJECT_LIMITS.targets).map((t, i) => {
    const target = checkTarget(t, `${path}.targets[${i}]`, filters);
    if (targetIds.has(target.id)) throw new ProjectsError(`${path}.targets[${i}].id`, 'a target appears once');
    targetIds.add(target.id);
    return target;
  });
  const sessionIds = new Set<string>();
  const sessions = checkList(raw.sessions, `${path}.sessions`, PROJECT_LIMITS.sessions).map((s, i) => {
    const session = checkSession(s, `${path}.sessions[${i}]`);
    if (sessionIds.has(session.id)) throw new ProjectsError(`${path}.sessions[${i}].id`, 'two sessions have the same id');
    sessionIds.add(session.id);
    return session;
  });
  return { id, name, status: raw.status as ProjectStatus, setup, targets, sessions, createdAt: checkStamp(raw.createdAt, `${path}.createdAt`), updatedAt: checkStamp(raw.updatedAt, `${path}.updatedAt`) };
}

export interface ProjectsState {
  version: typeof PROJECTS_VERSION;
  projects: Project[];
}

export const EMPTY_PROJECTS: ProjectsState = { version: PROJECTS_VERSION, projects: [] };

/** Checks a parsed value field by field. Throws ProjectsError with the path of the first problem; never repairs. */
export function validateProjects(input: unknown): ProjectsState {
  if (!isRecord(input)) throw new ProjectsError('$', 'must be an object');
  if (input.version !== PROJECTS_VERSION) throw new ProjectsError('$.version', `must be version ${PROJECTS_VERSION}`);
  if (!Array.isArray(input.projects)) throw new ProjectsError('$.projects', 'must be a list');
  if (input.projects.length > MAX_PROJECTS) throw new ProjectsError('$.projects', `at most ${MAX_PROJECTS} projects, found ${input.projects.length}`);
  const ids = new Set<string>();
  const projects = input.projects.map((raw: unknown, i: number) => {
    const p = checkProject(raw, `$.projects[${i}]`);
    if (ids.has(p.id)) throw new ProjectsError(`$.projects[${i}].id`, 'two projects have the same id');
    ids.add(p.id);
    return p;
  });
  return { version: PROJECTS_VERSION, projects };
}

/** A name for a message: one short line, whatever was stored. */
export function nameForMessage(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const t = raw.replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();
  if (t === '') return fallback;
  return `"${t.length > 40 ? `${t.slice(0, 40)}…` : t}"`;
}

/** A path and its detail as one sentence: "session 4, date: must be a real date ...", or the detail alone when the path names nothing. */
export function problemSentence(path: string, detail: string): string {
  const where = pathInWords(path);
  return where === '' ? detail : `${where}: ${detail}`;
}

/** "$.projects[0].sessions[3].date" as "session 4, date". */
export function pathInWords(path: string): string {
  const parts: string[] = [];
  for (const m of path.matchAll(/\.([A-Za-z]+)(?:\[(\d+)\])?/g)) {
    if (m[1] === 'projects') continue;
    const kind: Record<string, string> = { sessions: 'session', targets: 'target', lines: 'filter line', filterIds: 'filter' };
    if (m[2] !== undefined && kind[m[1]] !== undefined) parts.push(`${kind[m[1]]} ${Number(m[2]) + 1}`);
    else if (m[2] === undefined) parts.push(m[1].replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  }
  return parts.join(', ');
}
