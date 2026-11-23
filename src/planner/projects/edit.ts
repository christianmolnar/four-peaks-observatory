import { MAX_PROJECTS, MAX_PROJECT_NAME } from './limits';
import { PROJECTS_VERSION, checkProject, checkSession, validateProjects } from './validate';
import type { ProjectsState } from './validate';
import type { Project, ProjectSetup, ProjectStatus, ProjectTarget, Session } from './types';

/** Changes to the projects, each returning a new state and checking every limit, so a bad value is refused here as well as on reading. Each throws an Error in plain words (a ProjectsError's message is words, never a path). */

/** An id that is not taken, made from the clock (so two tabs adding at once do not pick the same one) and a counter. */
function freshId(prefix: string, taken: Iterable<string>, now: string): string {
  const used = new Set(taken);
  const stamp = Math.max(0, Date.parse(now) || 0).toString(36);
  for (let n = 1; ; n++) if (!used.has(`${prefix}-${stamp}-${n}`)) return `${prefix}-${stamp}-${n}`;
}

export interface NewProject {
  name: string;
  setup: ProjectSetup;
  targets: ProjectTarget[];
  status?: ProjectStatus;
}

export function addProject(s: ProjectsState, draft: NewProject, now: string): { state: ProjectsState; id: string } {
  if (s.projects.length >= MAX_PROJECTS) throw new Error(`Project limit: ${MAX_PROJECTS}`);
  const id = freshId('project', s.projects.map((p) => p.id), now);
  const project = checkProject({ id, name: draft.name, status: draft.status ?? 'active', setup: draft.setup, targets: draft.targets, sessions: [], createdAt: now, updatedAt: now }, '$');
  return { state: validateProjects({ ...s, projects: [...s.projects, project] }), id };
}

function change(s: ProjectsState, id: string, edit: (p: Project) => Project): ProjectsState {
  if (!s.projects.some((p) => p.id === id)) throw new Error('There is no such project.');
  return validateProjects({ ...s, projects: s.projects.map((p) => (p.id === id ? edit(p) : p)) });
}

/** Changes the name, status, setup or targets given and nothing else; stamps `updatedAt`. Sessions of a target or filter taken out stay, and are reported as not in the plan. */
export const updateProject = (s: ProjectsState, id: string, patch: Partial<Pick<Project, 'name' | 'status' | 'setup' | 'targets'>>, now: string): ProjectsState =>
  change(s, id, (p) => ({ ...p, ...patch, ...(patch.name === undefined ? {} : { name: patch.name.trim().slice(0, MAX_PROJECT_NAME + 1) }), updatedAt: now }));

export function removeProject(s: ProjectsState, id: string): ProjectsState {
  if (!s.projects.some((p) => p.id === id)) throw new Error('There is no such project.');
  return { version: PROJECTS_VERSION, projects: s.projects.filter((p) => p.id !== id) };
}

/** A session as the user enters it: the id is made here. */
export type NewSession = Omit<Session, 'id'>;

export function addSession(s: ProjectsState, projectId: string, draft: NewSession, now: string): { state: ProjectsState; id: string } {
  let made = '';
  const state = change(s, projectId, (p) => {
    made = freshId('s', p.sessions.map((x) => x.id), now);
    return { ...p, sessions: [...p.sessions, checkSession({ ...draft, id: made }, '$')], updatedAt: now };
  });
  return { state, id: made };
}

/** Replaces one session's fields (never its id); the project's other sessions stay. */
export function updateSession(s: ProjectsState, projectId: string, sessionId: string, draft: NewSession, now: string): ProjectsState {
  return change(s, projectId, (p) => {
    if (!p.sessions.some((x) => x.id === sessionId)) throw new Error('There is no such session.');
    return { ...p, sessions: p.sessions.map((x) => (x.id === sessionId ? checkSession({ ...draft, id: sessionId }, '$') : x)), updatedAt: now };
  });
}

export const removeSession = (s: ProjectsState, projectId: string, sessionId: string, now: string): ProjectsState =>
  change(s, projectId, (p) => {
    if (!p.sessions.some((x) => x.id === sessionId)) throw new Error('There is no such session.');
    return { ...p, sessions: p.sessions.filter((x) => x.id !== sessionId), updatedAt: now };
  });

// ------------------------------------------------------------------ import

export interface ImportedProjects {
  state: ProjectsState;
  added: number;
  copies: number;
  /** Not added because the same content is already here (whatever the id and name). */
  skipped: number;
  /** Not added because the user chose to skip those whose id is a different project's here. */
  clashSkipped: number;
  leftOut: number;
}

const sorted = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sorted) : typeof v === 'object' && v !== null ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, sorted(x)])) : v;

/** A project's content for comparing: everything but its id and name, keys in a fixed order, so a project exported and imported again is the same project. */
const contentKey = (p: Project): string => {
  const rest: Partial<Project> = { ...p };
  delete rest.id;
  delete rest.name;
  return JSON.stringify(sorted(rest));
};

/** How the projects of a file stand against the projects here: `same` hold the content of one here (a repeat), `clash` have the id of a different one here, `fresh` are new. */
export function compareIncomingProjects(s: ProjectsState, incoming: readonly Project[]): { same: number; clash: number; fresh: number } {
  const here = new Set(s.projects.map(contentKey));
  const ids = new Set(s.projects.map((p) => p.id));
  const out = { same: 0, clash: 0, fresh: 0 };
  for (const p of incoming) {
    if (here.has(contentKey(p))) out.same++;
    else if (ids.has(p.id)) out.clash++;
    else out.fresh++;
  }
  return out;
}

/**
 * Adds projects read from a file after the projects here; nothing here is changed or reordered. A project whose content is already here (compared without
 * its id and name, so the same file twice adds nothing) is skipped. A project with the id of a different project here is never written over: it is skipped
 * (`skip`) or added as a copy under a new id and a name ending "(imported)" (`copy`). Projects past the limit are left out and counted. Sessions come over whole.
 */
export function importProjects(s: ProjectsState, incoming: readonly Project[], repeats: 'copy' | 'skip', now: string): ImportedProjects {
  const projects = [...s.projects];
  const have = new Set(projects.map((p) => p.id));
  const here = new Set(projects.map(contentKey));
  let added = 0;
  let copies = 0;
  let skipped = 0;
  let clashSkipped = 0;
  let leftOut = 0;
  for (const p of incoming) {
    if (here.has(contentKey(p))) {
      skipped++;
      continue;
    }
    const clash = have.has(p.id);
    if (clash && repeats === 'skip') {
      clashSkipped++;
      continue;
    }
    if (projects.length >= MAX_PROJECTS) {
      leftOut++;
      continue;
    }
    let next = p;
    if (clash) {
      const names = new Set(projects.map((x) => x.name));
      const base = `${p.name.slice(0, MAX_PROJECT_NAME - ' (imported)'.length)} (imported)`;
      let name = base;
      for (let n = 2; names.has(name); n++) name = `${base.slice(0, MAX_PROJECT_NAME - ` ${n}`.length)} ${n}`;
      next = { ...p, id: freshId('project', have, now), name };
      copies++;
    }
    projects.push(next);
    have.add(next.id);
    here.add(contentKey(next));
    added++;
  }
  const state = validateProjects({ ...s, projects });
  return { state, added, copies, skipped, clashSkipped, leftOut };
}

/** Adds sessions that already have ids (the seed's); one whose id the project holds is skipped, so offering the same sessions twice adds nothing. */
export function addSessionsWithIds(s: ProjectsState, projectId: string, sessions: readonly Session[], now: string): ProjectsState {
  return change(s, projectId, (p) => {
    const have = new Set(p.sessions.map((x) => x.id));
    const fresh = sessions.filter((x) => !have.has(x.id)).map((x, i) => checkSession(x, `$.sessions[${i}]`));
    return fresh.length === 0 ? p : { ...p, sessions: [...p.sessions, ...fresh], updatedAt: now };
  });
}
