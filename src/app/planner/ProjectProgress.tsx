import type { CSSProperties } from 'react';
import { durationText, percentText } from '@/planner/export';
import { computeProgress, projectSheet } from '@/planner/projects';
import type { Project, SheetNames } from '@/planner/projects';
import type { SheetTotals } from '@/planner/projects';

/**
 * The bar of a filter: a colour token and a pattern, so it is told apart without colour (the red theme has one colour). Index by the filter's place in the
 * project's list. Stripes are drawn in the page ground over the fill, so they read in both themes.
 */
const STRIPE = 'var(--p-bg)';
export const FILL_STYLES: readonly { name: string; css: CSSProperties }[] = [
  { name: 'solid', css: {} },
  { name: 'diagonal stripes', css: { backgroundImage: `repeating-linear-gradient(45deg, ${STRIPE} 0 2px, transparent 2px 6px)` } },
  { name: 'dots', css: { backgroundImage: `radial-gradient(${STRIPE} 1.5px, transparent 1.6px)`, backgroundSize: '6px 6px' } },
  { name: 'reverse stripes', css: { backgroundImage: `repeating-linear-gradient(-45deg, ${STRIPE} 0 2px, transparent 2px 6px)` } },
  { name: 'vertical lines', css: { backgroundImage: `repeating-linear-gradient(90deg, ${STRIPE} 0 2px, transparent 2px 6px)` } },
  { name: 'horizontal lines', css: { backgroundImage: `repeating-linear-gradient(0deg, ${STRIPE} 0 2px, transparent 2px 6px)` } },
];
const FILL_COLOURS = ['var(--p-c-s0)', 'var(--p-c-s1)', 'var(--p-c-s2)', 'var(--p-c-s3)', 'var(--p-c-s4)', 'var(--p-c-s5)', 'var(--p-c-s6)', 'var(--p-c-s7)'];
const fillOf = (i: number): CSSProperties => ({ backgroundColor: FILL_COLOURS[i % FILL_COLOURS.length], ...FILL_STYLES[i % FILL_STYLES.length].css });

const count = (n: number): string => n.toLocaleString('en-US');
const ratio = (t: SheetTotals): string => `${durationText(t.done)} / ${durationText(t.planned)}`;
const overText = (t: SheetTotals): string => (t.over > 0 ? `${durationText(t.over)} over` : '');

/** One bar with its text values beside it: done and planned, the percent (a dash when nothing is planned), and any time over the plan. */
function Bar({ label, t, index, extra }: { label: string; t: SheetTotals; index: number; extra?: string }) {
  const width = t.percent === null ? 0 : Math.min(100, t.percent);
  const text = `${ratio(t)}, ${percentText(t.percent)}${t.over > 0 ? `, ${overText(t)}` : ''}`;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 break-words text-sm font-normal text-p-t1">
          {label}
          {extra !== undefined && <span className="text-p-t1/70"> ({extra})</span>}
        </span>{' '}
        <span className="text-sm font-normal text-p-t1">
          {ratio(t)} <span className="text-p-t1/70">{percentText(t.percent)}</span>
          {t.over > 0 && <span className="text-p-warn-text"> · {overText(t)}</span>}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}${extra === undefined ? '' : ` (${extra})`}`}
        aria-valuemin={0}
        aria-valuemax={100}
        {...(t.percent === null ? {} : { 'aria-valuenow': Math.round(width) })}
        aria-valuetext={t.percent === null ? `${text}, nothing planned` : text}
        className="mt-1 h-3 w-full overflow-hidden rounded border border-p-line/30 bg-p-line/10"
      >
        <div className="h-full" style={{ width: `${width}%`, ...fillOf(index) }} />
      </div>
    </div>
  );
}

/**
 * The progress of one project: setup line, the Planned / Completed / Remaining tiles, the overall bar, the legend, a card per target with a bar per
 * filter, the filter totals, the optional-time footnote and the sessions that are not in the plan. Every number is the engine's (`computeProgress`
 * through `projectSheet`, the same sheet the tracker text and the exports print); nothing is computed here.
 */
export default function ProjectProgress({ project, names }: { project: Project; names: SheetNames }) {
  const progress = computeProgress(project);
  const sheet = projectSheet(project, names);
  const filterIds = project.setup.filterIds;
  const fi = (id: string): number => Math.max(0, filterIds.indexOf(id));
  const setup = [sheet.gear, `${sheet.subSeconds}-second exposures`, `${sheet.targets.length} ${sheet.targets.length === 1 ? 'target' : 'targets'}`].filter((x) => x !== '').join(', ');
  const o = sheet.overall;
  return (
    <div className="space-y-4" data-testid="project-progress">
      <p className="break-words text-sm font-normal text-p-t1" data-testid="project-setup">{setup}</p>

      <dl className="grid grid-cols-3 gap-2" data-testid="project-tiles">
        {[
          ['Planned', durationText(o.planned)],
          ['Completed', durationText(o.done)],
          ['Remaining', durationText(o.remaining)],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-lg border border-p-line/20 p-2">
            <dt className="text-sm font-normal text-p-t1/70">{k}</dt>
            <dd className="break-words text-lg font-normal text-p-t1" data-testid={`tile-${k.toLowerCase()}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <div className="rounded-lg border border-p-line/20 p-3" data-testid="project-overall">
        <h4 className="text-base font-medium text-p-t1">Overall progress</h4>
        <Bar label="All planned time" t={o} index={0} />
        <p className="mt-2 text-sm font-normal text-p-t1" data-testid="project-exposures">
          {count(o.doneExposures)} of {count(o.plannedExposures)} planned {sheet.subSeconds}-second exposures
        </p>
        <p className="mt-1 text-sm font-normal text-p-t1/70">Time logged at another sub length is converted to the project&rsquo;s.</p>
        {o.over > 0 && <p className="mt-1 text-sm font-normal text-p-warn-text" data-testid="project-over-note">{durationText(o.over)} was shot beyond the plan on some lines. It does not reduce the other lines.</p>}
      </div>

      <ul aria-label="Filter key" className="flex flex-wrap gap-x-4 gap-y-1" data-testid="project-legend">
        {filterIds.map((id, i) => (
          <li key={id} className="flex min-h-6 items-center gap-2 text-sm font-normal text-p-t1">
            <span aria-hidden="true" className="inline-block h-4 w-8 shrink-0 rounded border border-p-line/30" style={fillOf(i)} />
            <span className="break-words">{names.filter(id)}</span>{' '}
            <span className="text-p-t1/70">({FILL_STYLES[i % FILL_STYLES.length].name})</span>
          </li>
        ))}
      </ul>

      <div className="space-y-3" data-testid="project-targets">
        {sheet.targets.map((t, ti) => (
          <section key={progress.targets[ti].targetId} aria-labelledby={`pt-${project.id}-${ti}`} className="rounded-lg border border-p-line/20 p-3" data-testid="target-card">
            <h4 id={`pt-${project.id}-${ti}`} className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-base font-medium text-p-t1">
              <span className="min-w-0 break-words">{t.target}</span>{' '}
              <span className="text-sm font-normal" data-testid="target-total">
                {ratio(t.total)} <span className="text-p-t1/70">{percentText(t.total.percent)}</span>
                {t.total.over > 0 && <span className="text-p-warn-text"> · {overText(t.total)}</span>}
              </span>
            </h4>
            {t.lines.length === 0 ? (
              <p className="text-sm font-normal text-p-t1/70">No filter is planned for this target.</p>
            ) : (
              <ul className="space-y-2">
                {t.lines.map((l, li) => (
                  <li key={progress.targets[ti].lines[li].filterId} data-testid="target-line">
                    <Bar label={l.filter} t={l} index={fi(progress.targets[ti].lines[li].filterId)} extra={l.optional ? 'optional, excluded from totals' : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section aria-labelledby={`pf-${project.id}`} className="rounded-lg border border-p-line/20 p-3" data-testid="filter-totals">
        <h4 id={`pf-${project.id}`} className="mb-1 text-base font-medium text-p-t1">Filter totals</h4>
        <ul className="space-y-2">
          {sheet.filters.map((f, i) => (
            <li key={progress.filters[i].filterId} data-testid="filter-total">
              <Bar label={f.filter} t={f} index={i} />
            </li>
          ))}
        </ul>
      </section>

      {sheet.optional.lines.length > 0 && (
        <p className="break-words text-sm font-normal text-p-t1" data-testid="optional-note">
          Optional time is excluded from every total above:{' '}
          {sheet.optional.lines.map((l) => `${l.target} ${l.filter} ${durationText(l.done)} of ${durationText(l.planned)}`).join('; ')}.
        </p>
      )}

      {sheet.notInPlan.length > 0 && (
        <div role="group" aria-label="Sessions not in the plan" className="rounded-lg border border-p-warn/50 p-3" data-testid="not-in-plan">
          <p className="break-words text-sm font-normal text-p-warn-text">
            {sheet.notInPlan.length} logged {sheet.notInPlan.length === 1 ? 'session is' : 'sessions are'} not in the plan ({durationText(sheet.notInPlanMinutes)} in all). Kept, but in no bar or total. Plan the target and filter to count {sheet.notInPlan.length === 1 ? 'it' : 'them'}.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {sheet.notInPlan.map((n, i) => (
              <li key={progress.notInPlan.sessions[i].sessionId} className="break-words text-sm font-normal text-p-t1">
                {n.date}, {n.target}, {n.filter}, {durationText(n.minutes)}: {n.why}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
