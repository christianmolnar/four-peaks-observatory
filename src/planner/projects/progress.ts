import type { Project, Session } from './types';

/**
 * Every number of progress, computed here and nowhere else, from the planned minutes and the session log alone. Sums are made in whole seconds
 * (planned minutes and logged exposures are whole numbers), so a total never drifts by float dust. Nothing is clamped to hide a fact: more done
 * than planned shows as `over` and a percent above 100; no plan shows no percent (`null`), never NaN or Infinity.
 */

/** Minutes. `remaining` is what is left to shoot (never negative); `over` is what was shot beyond the plan (never negative). `percent` is done over planned, as it is (120 is 120%); null when nothing is planned. */
export interface Totals {
  planned: number;
  done: number;
  remaining: number;
  over: number;
  percent: number | null;
}

export interface LineProgress extends Totals {
  filterId: string;
  optional: boolean;
}

export interface TargetProgress {
  targetId: string;
  lines: LineProgress[];
  /** The target's own total: its lines that are not optional. */
  total: Totals;
}

export interface FilterProgress extends Totals {
  filterId: string;
}

/** A session that does not fit the plan: its target is not in the project, or the target has no line for its filter. It is in no bar. */
export interface NotInPlan {
  sessionId: string;
  date: string;
  targetId: string;
  filterId: string;
  minutes: number;
  why: 'target' | 'filter';
}

export interface Progress {
  subSeconds: number;
  /** All lines that are not optional. */
  overall: Totals;
  targets: TargetProgress[];
  /** One per filter of the project, in its order, over the lines that are not optional. */
  filters: FilterProgress[];
  /** Optional lines, apart from every total above. */
  optional: { planned: number; done: number; lines: { targetId: string; filterId: string; planned: number; done: number }[] };
  /** Planned and done exposures of the project's sub length: the seconds of `overall`, over the sub length, rounded to whole exposures. */
  exposures: { planned: number; done: number };
  notInPlan: { sessions: NotInPlan[]; minutes: number };
}

/** The seconds one session adds: its minutes, or its exposures times their sub length. */
export function sessionSeconds(s: Pick<Session, 'minutes' | 'exposures' | 'subSeconds'>): number {
  if (s.minutes !== undefined) return s.minutes * 60;
  return (s.exposures ?? 0) * (s.subSeconds ?? 0);
}

/** The minutes one session adds. */
export const sessionMinutes = (s: Pick<Session, 'minutes' | 'exposures' | 'subSeconds'>): number => sessionSeconds(s) / 60;

/** Seconds, summed first and turned into minutes once. */
interface Raw {
  planned: number;
  done: number;
  remaining: number;
  over: number;
}
const rawOf = (planned: number, done: number): Raw => ({ planned, done, remaining: Math.max(0, planned - done), over: Math.max(0, done - planned) });
const sumRaw = (rows: readonly Raw[]): Raw => ({
  planned: rows.reduce((n, r) => n + r.planned, 0),
  done: rows.reduce((n, r) => n + r.done, 0),
  remaining: rows.reduce((n, r) => n + r.remaining, 0),
  over: rows.reduce((n, r) => n + r.over, 0),
});
const totals = (r: Raw): Totals => ({ planned: r.planned / 60, done: r.done / 60, remaining: r.remaining / 60, over: r.over / 60, percent: r.planned > 0 ? (r.done / r.planned) * 100 : null });

const keyOf = (targetId: string, filterId: string): string => `${targetId}\u0000${filterId}`;

export function computeProgress(project: Pick<Project, 'setup' | 'targets' | 'sessions'>): Progress {
  const doneBy = new Map<string, number>();
  for (const s of project.sessions) {
    const k = keyOf(s.targetId, s.filterId);
    doneBy.set(k, (doneBy.get(k) ?? 0) + sessionSeconds(s));
  }
  const planned = new Set<string>();
  const inTargets = new Set(project.targets.map((t) => t.id));

  // Every line, once, in plan order. The remaining and over of a sum are the sums of the lines' own, so a line shot past its plan never hides what another still needs.
  const lines = project.targets.flatMap((t) =>
    t.lines.map((l) => {
      const k = keyOf(t.id, l.filterId);
      planned.add(k);
      return { targetId: t.id, filterId: l.filterId, optional: l.optional, raw: rawOf(l.minutes * 60, doneBy.get(k) ?? 0) };
    }),
  );
  const counted = lines.filter((l) => !l.optional);
  const optional = lines.filter((l) => l.optional);

  const targets = project.targets.map((t): TargetProgress => {
    const own = lines.filter((l) => l.targetId === t.id);
    return {
      targetId: t.id,
      lines: own.map((l) => ({ filterId: l.filterId, optional: l.optional, ...totals(l.raw) })),
      total: totals(sumRaw(own.filter((l) => !l.optional).map((l) => l.raw))),
    };
  });
  const filters = project.setup.filterIds.map((filterId): FilterProgress => ({ filterId, ...totals(sumRaw(counted.filter((l) => l.filterId === filterId).map((l) => l.raw))) }));
  const overallRaw = sumRaw(counted.map((l) => l.raw));
  const optionalRaw = sumRaw(optional.map((l) => l.raw));

  const notInPlan: NotInPlan[] = [];
  let offSec = 0;
  for (const s of project.sessions) {
    if (planned.has(keyOf(s.targetId, s.filterId))) continue;
    notInPlan.push({ sessionId: s.id, date: s.date, targetId: s.targetId, filterId: s.filterId, minutes: sessionMinutes(s), why: inTargets.has(s.targetId) ? 'filter' : 'target' });
    offSec += sessionSeconds(s);
  }

  const perExposure = project.setup.subSeconds;
  return {
    subSeconds: perExposure,
    overall: totals(overallRaw),
    targets,
    filters,
    optional: { planned: optionalRaw.planned / 60, done: optionalRaw.done / 60, lines: optional.map((l) => ({ targetId: l.targetId, filterId: l.filterId, planned: l.raw.planned / 60, done: l.raw.done / 60 })) },
    exposures: { planned: Math.round(overallRaw.planned / perExposure), done: Math.round(overallRaw.done / perExposure) },
    notInPlan: { sessions: notInPlan, minutes: offSec / 60 },
  };
}
