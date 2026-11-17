import type { ProjectSheet, SheetTotals } from '../projects/sheet';
import { csvField } from './csv';
import { md, oneLine } from './text';

/** How a project's numbers are laid out in each format. Every format prints the numbers of one `ProjectSheet`; nothing here computes a total. */

const DASH = '–';
const count = (n: number): string => n.toLocaleString('en-US');

/** Minutes as the tracker writes them: "4h 30m", "2h", "0h", "45m", "5m 15s". */
export function durationText(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', s > 0 ? `${s}s` : ''].filter((x) => x !== '');
  return parts.length === 0 ? '0h' : parts.join(' ');
}

/** "7.3%", "125%", or a dash when nothing is planned. */
export const percentText = (p: number | null): string => (p === null ? DASH : `${p}%`);

const ratio = (t: SheetTotals): string => `${durationText(t.done)} / ${durationText(t.planned)} (${percentText(t.percent)}${t.over > 0 ? `, ${durationText(t.over)} over` : ''})`;

// ------------------------------------------------------------------ text (the Copy tracker text)

/** The tracker, as plain text lines: progress header, each target with a row per filter, filter totals, optional time, and sessions not in the plan. */
export function trackerLines(s: ProjectSheet): string[] {
  const out = [`PROJECT: ${oneLine(s.name)}`];
  out.push(`${[s.gear === '' ? '' : oneLine(s.gear), `${s.subSeconds}-second exposures`, `${s.targets.length} ${s.targets.length === 1 ? 'target' : 'targets'}`].filter((x) => x !== '').join(', ')}`);
  if (s.status !== 'active') out.push(`Status: ${s.status}`);
  out.push(`Progress: ${ratio(s.overall)}`);
  out.push(`Planned ${durationText(s.overall.planned)}, completed ${durationText(s.overall.done)}, remaining ${durationText(s.overall.remaining)}`);
  out.push(`${count(s.overall.doneExposures)} of ${count(s.overall.plannedExposures)} planned ${s.subSeconds}-second exposures`, '');
  for (const t of s.targets) {
    out.push(`${oneLine(t.target)}: ${ratio(t.total)}`);
    for (const l of t.lines) out.push(`  ${oneLine(l.filter)}${l.optional ? ' (optional)' : ''}: ${ratio(l)}`);
  }
  out.push('', 'Filter totals');
  for (const f of s.filters) out.push(`  ${oneLine(f.filter)}: ${ratio(f)}`);
  if (s.optional.lines.length > 0) {
    out.push('', `Optional time excluded from the totals: ${s.optional.lines.map((l) => `${oneLine(l.target)} ${oneLine(l.filter)} ${durationText(l.done)} of ${durationText(l.planned)}`).join('; ')}`);
  }
  if (s.notInPlan.length > 0) {
    out.push('', `Not in the plan (kept, in no total above; ${durationText(s.notInPlanMinutes)} in all):`);
    for (const n of s.notInPlan) out.push(`  ${n.date} ${oneLine(n.target)} ${oneLine(n.filter)} ${durationText(n.minutes)}: ${n.why}`);
  }
  return out;
}

export const trackerText = (s: ProjectSheet): string => `${trackerLines(s).join('\n')}\n`;

// ------------------------------------------------------------------ Markdown

export function projectMarkdown(s: ProjectSheet): string[] {
  const out = [`## ${md(s.name)}`, ''];
  out.push(`- **Setup:** ${md([s.gear, `${s.subSeconds}-second exposures`, `${s.targets.length} ${s.targets.length === 1 ? 'target' : 'targets'}`].filter((x) => x !== '').join(', '))}`);
  if (s.status !== 'active') out.push(`- **Status:** ${md(s.status)}`);
  out.push(`- **Progress:** ${md(ratio(s.overall))}`);
  out.push(`- **Planned** ${durationText(s.overall.planned)}, **completed** ${durationText(s.overall.done)}, **remaining** ${durationText(s.overall.remaining)}`);
  out.push(`- **Exposures:** ${count(s.overall.doneExposures)} of ${count(s.overall.plannedExposures)} planned ${s.subSeconds}-second exposures`, '');
  out.push('| Target | Filter | Done | Planned | Percent |', '|---|---|---|---|---|');
  for (const t of s.targets) {
    out.push(`| **${md(t.target)}** | all | ${durationText(t.total.done)} | ${durationText(t.total.planned)} | ${percentText(t.total.percent)} |`);
    for (const l of t.lines) out.push(`| | ${md(l.filter)}${l.optional ? ' (optional)' : ''} | ${durationText(l.done)} | ${durationText(l.planned)} | ${percentText(l.percent)}${l.over > 0 ? `, ${durationText(l.over)} over` : ''} |`);
  }
  out.push('', '### Filter totals', '', '| Filter | Done | Planned | Percent |', '|---|---|---|---|');
  for (const f of s.filters) out.push(`| ${md(f.filter)} | ${durationText(f.done)} | ${durationText(f.planned)} | ${percentText(f.percent)} |`);
  if (s.optional.lines.length > 0) {
    out.push('', `Optional time excluded from the totals: ${md(s.optional.lines.map((l) => `${l.target} ${l.filter} ${durationText(l.done)} of ${durationText(l.planned)}`).join('; '))}`);
  }
  if (s.notInPlan.length > 0) {
    out.push('', `Not in the plan (kept, in no total above; ${durationText(s.notInPlanMinutes)} in all):`, '');
    for (const n of s.notInPlan) out.push(`- ${md(`${n.date} ${n.target} ${n.filter} ${durationText(n.minutes)}: ${n.why}`)}`);
  }
  return out;
}

// ------------------------------------------------------------------ CSV

export const PROJECT_CSV_HEADER = ['Project', 'Row', 'Date', 'Target', 'Filter', 'Optional', 'Planned (min)', 'Done (min)', 'Remaining (min)', 'Over (min)', 'Percent', 'Planned exposures', 'Done exposures', 'Exposures', 'Sub length (s)', 'Note'] as const;

const cell = (c: string | number | null): string => (c === null ? '' : csvField(c));
const row = (cells: readonly (string | number | null)[]): string => cells.map(cell).join(',');

/** The CSV lines of one project (no header): the overall row, each target, each target and filter, each filter total, optional time, sessions not in the plan, and the session log. */
export function projectCsvRows(s: ProjectSheet): string[] {
  const t = (x: SheetTotals) => [x.planned, x.done, x.remaining, x.over, x.percent];
  const rows: (string | number | null)[][] = [];
  rows.push([s.name, 'Overall', '', '', '', '', ...t(s.overall), s.overall.plannedExposures, s.overall.doneExposures, '', s.subSeconds, `${s.status}${s.gear === '' ? '' : `; ${s.gear}`}`]);
  for (const g of s.targets) {
    rows.push([s.name, 'Target', '', g.target, '', '', ...t(g.total), '', '', '', '', '']);
    for (const l of g.lines) rows.push([s.name, 'Target and filter', '', g.target, l.filter, l.optional ? 'yes' : 'no', ...t(l), '', '', '', '', '']);
  }
  for (const f of s.filters) rows.push([s.name, 'Filter total', '', '', f.filter, '', ...t(f), '', '', '', '', '']);
  for (const o of s.optional.lines) rows.push([s.name, 'Optional (excluded)', '', o.target, o.filter, 'yes', o.planned, o.done, '', '', '', '', '', '', '', '']);
  for (const n of s.notInPlan) rows.push([s.name, 'Not in the plan', n.date, n.target, n.filter, '', '', n.minutes, '', '', '', '', '', '', '', n.why]);
  for (const g of s.sessions) rows.push([s.name, 'Session', g.date, g.target, g.filter, '', '', g.minutes, '', '', '', '', '', g.exposures, g.subSeconds, g.note]);
  return rows.map(row);
}
