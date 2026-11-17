import { computeProgress, sessionMinutes } from './progress';
import type { Totals } from './progress';
import type { Project } from './types';

/**
 * A project as a person reads it, with names instead of ids: the one set of numbers that the copy-tracker text, the Markdown, the CSV and the JSON of an
 * export all print. Minutes are rounded to two decimals and percents to one, here and nowhere else; the formats only lay them out.
 */
export interface SheetTotals {
  planned: number;
  done: number;
  remaining: number;
  over: number;
  /** One decimal; null when nothing is planned (shown as a dash). */
  percent: number | null;
}

export interface ProjectSheet {
  name: string;
  status: string;
  /** The gear line the caller words ("EdgeHD 11 + HyperStar + ASI2600MC Duo"); empty when it is not known. */
  gear: string;
  subSeconds: number;
  overall: SheetTotals & { plannedExposures: number; doneExposures: number };
  targets: { target: string; total: SheetTotals; lines: (SheetTotals & { filter: string; optional: boolean })[] }[];
  filters: (SheetTotals & { filter: string })[];
  optional: { planned: number; done: number; lines: { target: string; filter: string; planned: number; done: number }[] };
  notInPlan: { date: string; target: string; filter: string; minutes: number; why: string }[];
  notInPlanMinutes: number;
  /** The session log, oldest first. */
  sessions: { date: string; target: string; filter: string; minutes: number; exposures: number | null; subSeconds: number | null; note: string }[];
}

/** The names a sheet prints for the ids the project keeps. */
export interface SheetNames {
  gear: string;
  target: (id: string) => string;
  filter: (id: string) => string;
}

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const round1 = (n: number): number => Math.round(n * 10) / 10;

const sheetTotals = (t: Totals): SheetTotals => ({ planned: round2(t.planned), done: round2(t.done), remaining: round2(t.remaining), over: round2(t.over), percent: t.percent === null ? null : round1(t.percent) });

export const NOT_IN_PLAN_TARGET = 'the target is not in this project';
export const NOT_IN_PLAN_FILTER = 'the target has no hours planned for this filter';

export function projectSheet(project: Project, names: SheetNames): ProjectSheet {
  const p = computeProgress(project);
  return {
    name: project.name,
    status: project.status,
    gear: names.gear,
    subSeconds: p.subSeconds,
    overall: { ...sheetTotals(p.overall), plannedExposures: p.exposures.planned, doneExposures: p.exposures.done },
    targets: p.targets.map((t) => ({ target: names.target(t.targetId), total: sheetTotals(t.total), lines: t.lines.map((l) => ({ filter: names.filter(l.filterId), optional: l.optional, ...sheetTotals(l) })) })),
    filters: p.filters.map((f) => ({ filter: names.filter(f.filterId), ...sheetTotals(f) })),
    optional: { planned: round2(p.optional.planned), done: round2(p.optional.done), lines: p.optional.lines.map((l) => ({ target: names.target(l.targetId), filter: names.filter(l.filterId), planned: round2(l.planned), done: round2(l.done) })) },
    notInPlan: p.notInPlan.sessions.map((s) => ({ date: s.date, target: names.target(s.targetId), filter: names.filter(s.filterId), minutes: round2(s.minutes), why: s.why === 'target' ? NOT_IN_PLAN_TARGET : NOT_IN_PLAN_FILTER })),
    notInPlanMinutes: round2(p.notInPlan.minutes),
    sessions: [...project.sessions]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((s) => ({ date: s.date, target: names.target(s.targetId), filter: names.filter(s.filterId), minutes: round2(sessionMinutes(s)), exposures: s.exposures ?? null, subSeconds: s.subSeconds ?? null, note: s.note })),
  };
}
