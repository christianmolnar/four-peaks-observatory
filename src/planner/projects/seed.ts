import { BROADBAND_ID } from './limits';
import type { Project, Session } from './types';
import type { ProjectsState } from './validate';

/**
 * The hours already captured (night of 2026-11-16, all broadband): IC 1805 Heart 120 min, M42 50 min, NGC 2237 Rosette 60 min. A helper for the Projects
 * tab to offer once; nothing applies it by itself. The ids are fixed, so applying it twice adds nothing.
 */
export const SEED_DATE = '2026-11-16';
const SEED: readonly { targetId: string; minutes: number; note: string }[] = [
  { targetId: 'ic1805', minutes: 120, note: 'Heart Nebula' },
  { targetId: 'm42', minutes: 50, note: '' },
  { targetId: 'ngc2237', minutes: 60, note: 'Rosette Nebula' },
];

export const seedSessions = (): Session[] =>
  SEED.map((s) => ({ id: `seed-${SEED_DATE}-${s.targetId}`, date: SEED_DATE, targetId: s.targetId, filterId: BROADBAND_ID, minutes: s.minutes, note: s.note }));

/** The seed sessions this project does not hold yet (by id), so a second offer adds nothing; the project is not changed. */
export const missingSeedSessions = (p: Pick<Project, 'sessions'>): Session[] => {
  const have = new Set(p.sessions.map((s) => s.id));
  return seedSessions().filter((s) => !have.has(s.id));
};

/** The name of the project that already holds any of the seed sessions (by id), or null. Another tab may have saved the offer first, so the page asks this of the latest stored projects. */
export const seedHeldBy = (s: Pick<ProjectsState, 'projects'>): string | null => s.projects.find((p) => missingSeedSessions(p).length < seedSessions().length)?.name ?? null;
