import { MAX_PROJECT_NAME, PROJECT_LIMITS } from '@/planner/projects';
import type { PlannedLine, Project, ProjectSetup, ProjectStatus, ProjectTarget } from '@/planner/projects';
import { readBox } from './projectInput';

/** What the project form holds: every number as the text typed in its box, so a half-typed or hostile value is never turned into a number until Save. */
export interface DraftLine {
  minutes: string;
  optional: boolean;
}
export interface DraftTarget {
  id: string;
  /** By filter id; one entry for each filter of the draft. A blank `minutes` is "this filter is not planned for this target". */
  lines: Record<string, DraftLine>;
}
export interface Draft {
  name: string;
  status: ProjectStatus;
  scopeId: string | null;
  cameraId: string | null;
  filterIds: string[];
  subText: string;
  targets: DraftTarget[];
}

export interface DraftContext {
  scopeId: string | null;
  cameraId: string | null;
  filterIds: string[];
  subSeconds: number;
}

const blankLines = (filterIds: readonly string[]): Record<string, DraftLine> => Object.fromEntries(filterIds.map((f) => [f, { minutes: '', optional: false }]));

export const newDraft = (c: DraftContext): Draft => ({ name: '', status: 'active', scopeId: c.scopeId, cameraId: c.cameraId, filterIds: [...c.filterIds], subText: String(c.subSeconds), targets: [] });

export function draftFromProject(p: Project): Draft {
  return {
    name: p.name,
    status: p.status,
    scopeId: p.setup.scopeId,
    cameraId: p.setup.cameraId,
    filterIds: [...p.setup.filterIds],
    subText: String(p.setup.subSeconds),
    targets: p.targets.map((t) => ({ id: t.id, lines: { ...blankLines(p.setup.filterIds), ...Object.fromEntries(t.lines.map((l) => [l.filterId, { minutes: String(l.minutes), optional: l.optional }])) } })),
  };
}

/** The target joins the draft once, with a blank box for each filter. */
export const addDraftTarget = (d: Draft, id: string): Draft => (d.targets.some((t) => t.id === id) ? d : { ...d, targets: [...d.targets, { id, lines: blankLines(d.filterIds) }] });
export const removeDraftTarget = (d: Draft, id: string): Draft => ({ ...d, targets: d.targets.filter((t) => t.id !== id) });

/** Minutes the open plan holds for a target, by filter (Broadband is BROADBAND_ID): the broadband time and each ticked narrowband filter. */
export interface PlanLine {
  filterId: string;
  minutes: number;
}

/** Puts the plan's minutes into the target's boxes, for the filters the draft holds; `filled` counts the boxes written, `left` the plan's lines the draft has no filter for. */
export function fillFromPlan(d: Draft, targetId: string, plan: readonly PlanLine[]): { draft: Draft; filled: number; left: number } {
  const target = d.targets.find((t) => t.id === targetId);
  if (target === undefined) return { draft: d, filled: 0, left: plan.length };
  const fit = plan.filter((l) => Object.hasOwn(target.lines, l.filterId));
  const lines = { ...target.lines };
  for (const l of fit) lines[l.filterId] = { ...lines[l.filterId], minutes: String(l.minutes) };
  return { draft: { ...d, targets: d.targets.map((t) => (t === target ? { ...t, lines } : t)) }, filled: fit.length, left: plan.length - fit.length };
}

/** Ticks or unticks a filter. `order` is the one order filters are listed in, so the project's list does not depend on the order of ticking. An unticked filter's boxes go with it. */
export function setDraftFilter(d: Draft, filterId: string, on: boolean, order: readonly string[]): Draft {
  const has = d.filterIds.includes(filterId);
  if (on === has) return d;
  const filterIds = on ? order.filter((f) => f === filterId || d.filterIds.includes(f)) : d.filterIds.filter((f) => f !== filterId);
  return {
    ...d,
    filterIds,
    targets: d.targets.map((t) => {
      const lines = { ...t.lines };
      if (on) lines[filterId] = { minutes: '', optional: false };
      else delete lines[filterId];
      return { ...t, lines };
    }),
  };
}

export interface DraftErrors {
  name?: string;
  filters?: string;
  sub?: string;
  targets?: string;
  /** By `${targetId}|${filterId}`. */
  lines: Record<string, string>;
}

export const lineKey = (targetId: string, filterId: string): string => `${targetId}|${filterId}`;

export type ParsedDraft =
  | { ok: true; value: { name: string; status: ProjectStatus; setup: ProjectSetup; targets: ProjectTarget[] } }
  | { ok: false; errors: DraftErrors; summary: string };

/** Reads every box at once; the first problem of each box is a sentence at that box. Nothing is stored here. */
export function parseDraft(d: Draft, names: { target: (id: string) => string; filter: (id: string) => string }): ParsedDraft {
  const errors: DraftErrors = { lines: {} };
  const name = d.name.trim();
  if (name === '' || name.length > MAX_PROJECT_NAME) errors.name = `Name: type a name of 1 to ${MAX_PROJECT_NAME} characters.`;
  if (d.filterIds.length < PROJECT_LIMITS.filters.min || d.filterIds.length > PROJECT_LIMITS.filters.max) errors.filters = `Filters: tick at least one filter (at most ${PROJECT_LIMITS.filters.max}).`;
  if (d.targets.length < PROJECT_LIMITS.targets.min || d.targets.length > PROJECT_LIMITS.targets.max) errors.targets = `Targets: pick at least one target (at most ${PROJECT_LIMITS.targets.max}).`;
  const sub = readBox(PROJECT_LIMITS.subSeconds, d.subText, 'Sub length');
  if (!sub.ok) errors.sub = sub.message;
  const targets: ProjectTarget[] = d.targets.map((t) => {
    const lines: PlannedLine[] = [];
    for (const filterId of d.filterIds) {
      const line = t.lines[filterId] ?? { minutes: '', optional: false };
      const label = `${names.target(t.id)}, ${names.filter(filterId)}`;
      const r = readBox(PROJECT_LIMITS.minutes, line.minutes, `${label}, planned minutes`, { blank: true });
      if (!r.ok) errors.lines[lineKey(t.id, filterId)] = r.message;
      else if (r.value === null) {
        if (line.optional) errors.lines[lineKey(t.id, filterId)] = `${label}: type the optional minutes, or untick Optional.`;
      } else lines.push({ filterId, minutes: r.value, optional: line.optional });
    }
    return { id: t.id, lines };
  });
  if (errors.name !== undefined || errors.filters !== undefined || errors.targets !== undefined || errors.sub !== undefined || Object.keys(errors.lines).length > 0 || !sub.ok || sub.value === null) {
    return { ok: false, errors, summary: 'Nothing was saved. Fix the boxes marked below.' };
  }
  return { ok: true, value: { name, status: d.status, setup: { scopeId: d.scopeId, cameraId: d.cameraId, filterIds: d.filterIds, subSeconds: sub.value }, targets } };
}
