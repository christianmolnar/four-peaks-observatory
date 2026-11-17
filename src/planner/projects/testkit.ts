import { BROADBAND_ID } from './limits';
import type { PlannedLine, Project, Session } from './types';

/** Shared by the projects tests. */
export const NOW = '2026-11-17T01:00:00.000Z';
export const L = BROADBAND_ID;

export const line = (filterId: string, minutes: number, optional = false): PlannedLine => ({ filterId, minutes, optional });
export const session = (id: string, targetId: string, filterId: string, minutes: number, date = '2026-11-16'): Session => ({ id, date, targetId, filterId, minutes, note: '' });

/** Two targets over three filters: M31 broadband 240 and NBZ 60; M42 broadband 120, NBZ 60 and NB3 60 (optional). */
export function project(over: Partial<Project> = {}): Project {
  return {
    id: 'p-1',
    name: 'Fall marathon',
    status: 'active',
    setup: { scopeId: 'my-scope-1', cameraId: 'my-camera-1', filterIds: [L, 'nbz', 'nb3'], subSeconds: 60 },
    targets: [
      { id: 'm31', lines: [line(L, 240), line('nbz', 60)] },
      { id: 'm42', lines: [line(L, 120), line('nbz', 60), line('nb3', 60, true)] },
    ],
    sessions: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

/** An in-memory Storage with what the planner uses; `failSet` makes writes of matching keys throw. */
export function memory(initial: Record<string, string> = {}, failSet: (key: string) => Error | null = () => null) {
  const m = new Map(Object.entries(initial));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const err = failSet(k);
      if (err) throw err;
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}
