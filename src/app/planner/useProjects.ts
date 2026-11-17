'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPTY_PROJECTS, HELD_TEXT, PROJECTS_KEY, changeProjects, inspectProjects, openProjects } from '@/planner/projects';
import type { ProjectsHandle, ProjectsState } from '@/planner/projects';

/**
 * The result of a change: saved, or why not, in plain words. `kept`: the change is on this page although it is not saved (the write failed), so
 * the form that made it is done and the page says "not saved"; false when the change was refused and nothing changed.
 */
export type ProjectsResult = { ok: true } | { ok: false; message: string; kept: boolean };

export interface ProjectsApi {
  state: ProjectsState;
  /** False until the saved projects were read in the browser (the server render and the first paint have none). */
  loaded: boolean;
  /** What was found on opening (left out, copied, held, storage blocked), in plain words. */
  notes: string[];
  clearNotes: () => void;
  /** Plain words for why saving projects is off (stored text held back), or null. */
  held: string | null;
  /** The page holds changes that are not in storage (the last write failed): said as "not saved" until a write succeeds. */
  unsaved: boolean;
  /** Makes the next projects from the latest stored ones, checks and stores them, reads them back. Nothing is called saved until it is. */
  change: (edit: (s: ProjectsState, now: string) => ProjectsState) => ProjectsResult;
}

/** The browser's storage, looked up on each use: a blocked storage throws on the property itself, and the engine turns a throw from these calls into words. */
const storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'> = {
  get length() {
    return window.localStorage.length;
  },
  key: (i) => window.localStorage.key(i),
  getItem: (k) => window.localStorage.getItem(k),
  setItem: (k, v) => window.localStorage.setItem(k, v),
  removeItem: (k) => window.localStorage.removeItem(k),
};

const EMPTY_HANDLE: ProjectsHandle = { state: EMPTY_PROJECTS, text: null, unsaved: false, held: null };

/**
 * The projects: read once the page is in the browser (text that cannot be used whole is copied to a dated key first, and held when the copy fails),
 * kept in step with other tabs, and written only through the engine's `changeProjects` (latest stored text first, checked, read back).
 */
export function useProjects(): ProjectsApi {
  const [handle, setHandle] = useState<ProjectsHandle>(EMPTY_HANDLE);
  const ref = useRef<ProjectsHandle>(EMPTY_HANDLE);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const adopt = useCallback((next: ProjectsHandle) => {
    ref.current = next;
    setHandle(next);
  }, []);

  useEffect(() => {
    let opened: ReturnType<typeof openProjects>;
    try {
      opened = openProjects(storage);
    } catch {
      opened = { handle: EMPTY_HANDLE, notes: ['Your projects could not be read (browser storage is blocked or unavailable).'] };
    }
    adopt(opened.handle);
    setNotes(opened.notes);
    setLoaded(true);
  }, [adopt]);

  // Another tab saved, cleared or reset the projects: this tab follows, unless it holds changes of its own that are not saved (the next change merges them by id).
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PROJECTS_KEY) return;
      let text: string | null;
      try {
        text = e.key === null ? window.localStorage.getItem(PROJECTS_KEY) : e.newValue;
      } catch {
        return;
      }
      const cur = ref.current;
      if (text === null) {
        if (!cur.unsaved) adopt({ ...EMPTY_HANDLE });
        return;
      }
      if (text === cur.text) return;
      const found = inspectProjects(text);
      if (found.kind === 'projects') {
        if (!cur.unsaved) adopt({ state: found.state, text, unsaved: false, held: null });
      } else adopt({ ...cur, held: found.kind === 'newer' ? 'newer' : 'othertab' });
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [adopt]);

  const change = useCallback(
    (edit: (s: ProjectsState, now: string) => ProjectsState): ProjectsResult => {
      const now = new Date().toISOString();
      const before = ref.current.state;
      const r = changeProjects(storage, ref.current, (s) => edit(s, now));
      adopt(r.handle);
      return r.ok ? { ok: true } : { ok: false, message: r.message, kept: r.handle.state !== before };
    },
    [adopt],
  );

  const clearNotes = useCallback(() => setNotes([]), []);
  return { state: handle.state, loaded, notes, clearNotes, held: handle.held === null ? null : HELD_TEXT[handle.held], unsaved: handle.unsaved, change };
}
