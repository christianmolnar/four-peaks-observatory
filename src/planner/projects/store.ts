import { keepCopy, listBackups } from '../state/plans';
import type { Backup } from '../state/plans';
import { MAX_PROJECTS } from './limits';
import { EMPTY_PROJECTS, PROJECTS_VERSION, ProjectsError, checkProject, nameForMessage, pathInWords, validateProjects } from './validate';
import type { ProjectsState } from './validate';
import type { Project } from './types';

/**
 * The projects store: its own versioned key beside the plans, under the plans store's safety rules. Text that cannot be used whole is copied to a dated
 * key before anything is written (`keepCopy`, never overwritten); text of a newer version, or text whose copy failed, is held and never written over; a
 * write that did not happen, or that cannot be read back, never says "Saved"; two tabs both keep their sessions.
 */
export const PROJECTS_KEY = 'fpo-planner-projects-v1';
export const PROJECTS_BACKUP_PREFIX = `${PROJECTS_KEY}.bak.`;

type Reader = Pick<Storage, 'getItem'>;
type Backer = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// ------------------------------------------------------------------ reading

export interface LoadedProjects {
  /** Null when nothing is stored, or none of it could be used. */
  state: ProjectsState | null;
  /** Plain sentences, one per problem; empty when everything was read whole. */
  notices: string[];
  /** `newer`: made by a newer version, never written over. `damaged`: not usable at all. `repaired`: some projects were left out. The text stays in storage; the page copies it first. */
  unusable: { kind: 'newer' | 'damaged' | 'repaired'; text: string } | null;
}

export const NEWER_NOTICE = 'Your saved projects were made by a newer version of the planner.';
export const DAMAGED_NOTICE = 'Your saved projects could not be read, so they start over with none.';

/**
 * Reads the stored projects. Nothing is removed or repaired in storage. A project with one bad field is left out alone, with a sentence saying
 * where, and the others load (the text is kept as a copy before the next save); a storage that cannot be read throws, in words.
 */
export function loadProjects(storage: Reader): LoadedProjects {
  let text: string | null;
  try {
    text = storage.getItem(PROJECTS_KEY);
  } catch {
    throw new Error(`Your projects could not be read (browser storage is blocked or unavailable).`);
  }
  if (text === null) return { state: null, notices: [], unusable: null };
  const damaged: LoadedProjects = { state: null, notices: [DAMAGED_NOTICE], unusable: { kind: 'damaged', text } };
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return damaged;
  }
  if (isRecord(input) && typeof input.version === 'number' && input.version > PROJECTS_VERSION) return { state: null, notices: [NEWER_NOTICE], unusable: { kind: 'newer', text } };
  if (!isRecord(input) || input.version !== PROJECTS_VERSION || !Array.isArray(input.projects)) return damaged;
  const notices: string[] = [];
  const ids = new Set<string>();
  const projects: Project[] = [];
  let extra = 0;
  input.projects.forEach((raw: unknown, i: number) => {
    if (projects.length >= MAX_PROJECTS) {
      extra++;
      return;
    }
    try {
      const p = checkProject(raw, `$.projects[${i}]`);
      if (ids.has(p.id)) notices.push(`The project ${nameForMessage(p.name, `number ${i + 1}`)} repeated the id of another project and is left out.`);
      else {
        ids.add(p.id);
        projects.push(p);
      }
    } catch (e) {
      if (!(e instanceof ProjectsError)) throw e;
      const where = pathInWords(e.path);
      notices.push(`The project ${nameForMessage(isRecord(raw) ? raw.name : undefined, `number ${i + 1}`)} could not be read and is left out${where === '' ? '' : ` (${where}: ${e.detail})`}.`);
    }
  });
  if (extra > 0) notices.push(`Projects hold at most ${MAX_PROJECTS} projects, so ${extra} more in the saved copy ${extra === 1 ? 'is' : 'are'} left out.`);
  if (projects.length === 0 && input.projects.length > 0) return { state: null, notices: [...notices, DAMAGED_NOTICE], unusable: { kind: 'damaged', text } };
  return { state: { version: PROJECTS_VERSION, projects }, notices, unusable: notices.length > 0 ? { kind: 'repaired', text } : null };
}

/** What another tab's stored text is to this one: whole projects, projects of a newer version, or text this version cannot use whole. */
export type StoredProjects = { kind: 'projects'; state: ProjectsState } | { kind: 'newer' } | { kind: 'unreadable' };

export function inspectProjects(text: string): StoredProjects {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    return { kind: 'unreadable' };
  }
  if (isRecord(input) && typeof input.version === 'number' && input.version > PROJECTS_VERSION) return { kind: 'newer' };
  try {
    return { kind: 'projects', state: validateProjects(input) };
  } catch (e) {
    if (e instanceof ProjectsError) return { kind: 'unreadable' };
    throw e;
  }
}

/** Copies stored text to a dated key of its own; returns the key; throws when it cannot be written. */
export const keepProjectsCopy = (storage: Backer, text: string, now: number = Date.now()): string => keepCopy(storage, text, now, PROJECTS_BACKUP_PREFIX);
export const listProjectsBackups = (storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Backup[] => listBackups(storage, PROJECTS_BACKUP_PREFIX);

/** The text a state is stored as. */
export const projectsText = (state: ProjectsState): string => JSON.stringify(state);

// ------------------------------------------------------------------ merging two tabs

/**
 * Two copies of the projects as one: projects by id, and inside a project the sessions by id, so no session of either is lost. Where both hold a
 * session or a project of one id, `mine` wins (it is the user's newest edit); the plan, name, status and setup come from the copy changed last.
 * Throws, in words, when the result would pass a limit.
 */
export function mergeProjects(base: ProjectsState, mine: ProjectsState): ProjectsState {
  const projects = base.projects.map((p) => {
    const m = mine.projects.find((x) => x.id === p.id);
    if (m === undefined) return p;
    const newer = Date.parse(m.updatedAt) >= Date.parse(p.updatedAt) ? m : p;
    const byId = new Map(p.sessions.map((s) => [s.id, s]));
    for (const s of m.sessions) byId.set(s.id, s);
    return { ...newer, sessions: [...byId.values()], updatedAt: newer.updatedAt };
  });
  const have = new Set(base.projects.map((p) => p.id));
  for (const m of mine.projects) if (!have.has(m.id)) projects.push(m);
  const next: ProjectsState = { version: PROJECTS_VERSION, projects };
  validateProjects(next);
  return next;
}

// ------------------------------------------------------------------ keeping it in step with storage

export type HeldWhy = 'newer' | 'nocopy' | 'othertab';

/** Said when saving is off because stored text is held: the stored text is not touched. */
export const HELD_TEXT: Record<HeldWhy, string> = {
  newer: 'Your saved projects were made by a newer version of the planner, so saving projects is off here.',
  nocopy: 'Your saved projects could not be read whole and no copy could be kept, so saving projects is off here. Free some browser storage and reload.',
  othertab: 'Another tab saved projects this page cannot use, so saving projects is off here. Reload this tab.',
};

/** What a tab knows: the projects it shows, the stored text they were read from or written as, whether the last write failed (the state is ahead of storage), and a hold. */
export interface ProjectsHandle {
  state: ProjectsState;
  text: string | null;
  unsaved: boolean;
  held: HeldWhy | null;
}

export interface OpenedProjects {
  handle: ProjectsHandle;
  /** What was found on reading (left out, copied, held), in plain words; empty when all was well. */
  notes: string[];
}

/** Reads the stored projects for a tab; text that cannot be used whole is copied to a dated key first, and held when the copy fails. Never throws: a blocked storage is a note. */
export function openProjects(storage: Backer, now: number = Date.now()): OpenedProjects {
  const empty: ProjectsHandle = { state: EMPTY_PROJECTS, text: null, unsaved: false, held: null };
  let r: LoadedProjects;
  try {
    r = loadProjects(storage);
  } catch (e) {
    return { handle: empty, notes: [(e as Error).message] };
  }
  const handle: ProjectsHandle = { ...empty, state: r.state ?? EMPTY_PROJECTS, text: r.unusable?.text ?? (r.state === null ? null : projectsText(r.state)) };
  if (r.unusable === null) return { handle, notes: r.notices };
  if (r.unusable.kind === 'newer') return { handle: { ...handle, held: 'newer' }, notes: r.notices };
  try {
    const key = keepProjectsCopy(storage, r.unusable.text, now);
    const n = listProjectsBackups(storage).length;
    return { handle, notes: [...r.notices, `A copy of your saved projects is kept under the backup name "${key}"; ${n} ${n === 1 ? 'copy is' : 'copies are'} kept in this browser.`] };
  } catch {
    return { handle: { ...handle, held: 'nocopy' }, notes: [...r.notices, 'The copy of your saved projects failed, so they are left as they are.'] };
  }
}

export type ChangeResult = { ok: true; handle: ProjectsHandle } | { ok: false; handle: ProjectsHandle; message: string };

const FULL = 'Not saved: browser storage is full. Your change is on this page only; remove old backups or export the project.';
const BLOCKED_READ = 'Not saved: browser storage is blocked or unavailable, so nothing was changed. Allow storage for this site, then try again.';
const BLOCKED = 'Not saved: browser storage is blocked or unavailable. Your change is on this page only; export the project so nothing is lost.';

function writeProblem(e: unknown): string {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  const code = typeof e === 'object' && e !== null && 'code' in e ? (e as { code: unknown }).code : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014 ? FULL : BLOCKED;
}

/** True when the stored text is exactly what this version would write for what it reads from it. */
function isCanonical(stored: string): boolean {
  const found = inspectProjects(stored);
  return found.kind === 'projects' && projectsText(found.state) === stored;
}

/**
 * Makes the next projects from the latest stored ones (another tab's save is taken up first; sessions of a write that failed earlier are merged back in
 * by id), checks and stores them, and reads the text back: only then is the change saved. A refusal or a failed write changes nothing in storage; after a
 * failed write the page's state still holds the change, marked `unsaved`, and the message says so.
 */
export function changeProjects(storage: Backer, handle: ProjectsHandle, edit: (s: ProjectsState) => ProjectsState, now: number = Date.now()): ChangeResult {
  const refuse = (message: string, h: ProjectsHandle = handle): ChangeResult => ({ ok: false, handle: h, message });
  if (handle.held !== null) return refuse(HELD_TEXT[handle.held]);
  let stored: string | null;
  try {
    stored = storage.getItem(PROJECTS_KEY);
  } catch {
    return refuse(BLOCKED_READ);
  }
  let base = handle.state;
  try {
    if (stored === null) {
      if (handle.text !== null) base = handle.unsaved ? mergeProjects(EMPTY_PROJECTS, handle.state) : EMPTY_PROJECTS; // cleared in another tab
    } else if (stored !== handle.text || handle.unsaved) {
      const found = inspectProjects(stored);
      if (found.kind !== 'projects') {
        const held: HeldWhy = found.kind === 'newer' ? 'newer' : 'othertab';
        return refuse(HELD_TEXT[held], { ...handle, held });
      }
      base = handle.unsaved ? mergeProjects(found.state, handle.state) : found.state;
    }
  } catch (e) {
    // The two copies together pass a limit: refuse, and keep this page's state (and its unsaved mark) so nothing is lost.
    if (!(e instanceof ProjectsError)) throw e;
    return refuse(`Not saved: this page and the saved projects together pass a limit (${e.message}). This change was not made. Your earlier changes are kept on this page. Export the project, or remove sessions or projects in your other tab, then try again.`);
  }
  let next: ProjectsState;
  try {
    next = validateProjects(edit(base));
  } catch (e) {
    return refuse(`Not saved: ${(e as Error).message}`); // a ProjectsError's message is words, never a path
  }
  const text = projectsText(next);
  try {
    // Stored text that is not what this version would write (older shape, fields it does not know) is copied first; if that fails, nothing is written over it.
    if (stored !== null && stored !== text && !isCanonical(stored)) keepProjectsCopy(storage, stored, now);
  } catch {
    return refuse(`Not saved: a copy of the stored projects could not be kept first, so they are left as they are.`);
  }
  try {
    storage.setItem(PROJECTS_KEY, text);
    if (storage.getItem(PROJECTS_KEY) !== text) throw new Error('the stored text did not read back');
  } catch (e) {
    return refuse(writeProblem(e), { ...handle, state: next, unsaved: true });
  }
  return { ok: true, handle: { state: next, text, unsaved: false, held: null } };
}
