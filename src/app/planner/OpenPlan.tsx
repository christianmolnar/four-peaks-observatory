'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export interface PlanRow {
  id: string;
  name: string;
  /** Type and size, or why it is not known. */
  detail: string;
  /** When it is up on the night, "Up 18:50–03:37" or why not. */
  up: string;
  /** Its score for the night, or null when it has none. */
  score: number | null;
  /** The exposure preset, as the plain label ("Balanced"). */
  preset: string;
  /** The row's exposure controls (deep-sky rows); a solar-system row has none. */
  extra?: ReactNode;
  /** The row's filter mix part (a folded section, a plain message for a body); under the exposure controls. */
  mix?: ReactNode;
}

/** The "Find a target" section at the top of the open plan. */
export interface FindSection {
  open: boolean;
  /** Results available (the ranked list and the Solar system group), or null while they are not known. */
  count: number | null;
  onToggle: () => void;
  children: ReactNode;
}

export interface OpenPlanProps {
  name: string;
  rows: readonly PlanRow[];
  onRemove: (id: string) => void;
  /** One plain line when the plan mixes a deep-sky train and solar-system bodies (or the reverse), else null. */
  trainNote: string | null;
  /** The plan's site or train is gone from the gear: what is shown instead, and how to keep it. */
  staleNotes: readonly { key: string; text: string; keepLabel: string; onKeep: () => void }[];
  /** Focuses the Train select. */
  onChangeTrain: () => void;
  /** The plan's date as text ("Tue 10 Nov") when it has passed, else null: one line says so, with "Move to tonight". */
  pastDate: string | null;
  onMoveToTonight: () => void;
  find: FindSection;
  /** Beside the plan's heading: the plan's main button ("Plan my night with AI"). */
  action?: ReactNode;
  /** Under the empty-state line of a plan with no targets: the "Add top 3" button. */
  emptyAction?: ReactNode;
  /** Beside the plan's heading (the More menu). */
  menu?: ReactNode;
  /** The plan's closed-by-default parts ("Night and horizon", "Night timeline"). */
  children?: ReactNode;
}

const btn =
  'min-h-11 min-w-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40';

/**
 * The open plan: its targets in the plan's order (the user's picks; the AI plan orders them), each with what it does on the night and its
 * exposure, then Find a target, then the plan's own collapsible parts. Find a target is open while the plan has no targets and one line
 * ("Find a target (105)") once it has some, so the plan is the first thing on the screen.
 */
export default function OpenPlan({ name, rows, onRemove, trainNote, staleNotes, onChangeTrain, pastDate, onMoveToTonight, find, action, menu, emptyAction, children }: OpenPlanProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // After a removal the pressed button is gone: the keyboard goes to the Remove of the row that took its place, else the one before, else the heading.
  const removedAt = useRef<number | null>(null);
  useEffect(() => {
    if (removedAt.current === null) return;
    const row = rows[Math.min(removedAt.current, rows.length - 1)];
    (row ? document.getElementById(`plan-remove-${row.id}`) : headingRef.current)?.focus();
    removedAt.current = null;
  }, [rows]);

  return (
    <section aria-labelledby="open-plan-heading" className="bg-p-bg/70 rounded-lg border border-p-line/10 px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 ref={headingRef} tabIndex={-1} id="open-plan-heading" className="min-h-11 min-w-0 max-w-full break-words py-2 text-xl font-light text-p-t1 tracking-[0.15em] focus:outline-none">
          PLAN: {name} ({rows.length} {rows.length === 1 ? 'target' : 'targets'})
        </h2>
        <div className="flex flex-wrap items-center gap-x-2">
          {action}
          {menu}
        </div>
      </div>
      {pastDate !== null && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 text-p-t1 font-normal text-sm" data-testid="plan-past">
          <span>This plan is for {pastDate}, which has passed.</span>
          <button
            type="button"
            className={btn}
            onClick={() => {
              onMoveToTonight();
              headingRef.current?.focus();
            }}
          >
            Move to tonight
          </button>
        </p>
      )}
      {staleNotes.map((n) => (
        <p key={n.key} role="status" className="mb-3 flex flex-wrap items-center gap-x-3 text-p-warn-text font-normal text-sm" data-testid={`plan-stale-${n.key}`}>
          <span className="min-w-0 break-words">{n.text}</span>
          <button type="button" className={`${btn} max-w-full min-w-0 break-words text-left`} onClick={n.onKeep}>{n.keepLabel}</button>
          {n.key === 'train' && <button type="button" className={btn} onClick={onChangeTrain}>Change setup</button>}
        </p>
      ))}
      {trainNote !== null && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 text-p-t1 font-normal text-sm" data-testid="plan-train-note">
          <span className="min-w-0 max-w-full break-words">{trainNote}</span>
          <button type="button" className={btn} onClick={onChangeTrain}>Change setup</button>
        </p>
      )}
      {rows.length === 0 ? (
        <div data-testid="plan-empty" className="flex flex-wrap items-center gap-x-4 pb-3 text-sm text-p-t1">
          <p className="min-w-0">No targets yet. Search below or tap Add on a suggestion.</p>
          {emptyAction}
        </div>
      ) : (
        <ol className="space-y-2 pb-3" aria-label="Targets in this plan, in order">
          {rows.map((r, i) => (
            <li key={r.id} id={`plan-row-${r.id}`} tabIndex={-1} className="scroll-mt-4 rounded border border-p-line/15 p-3 text-sm font-normal text-p-t1">
              <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-40 break-words">
                <p className="text-p-t1"><span className="text-p-t1/70">{i + 1}.</span> {r.name}</p>
                {r.detail !== '' && <p className="text-p-t1/70">{r.detail}</p>}
                <p className="mt-1" data-testid={`plan-row-status-${r.id}`}>
                  {r.up}
                  {r.score !== null && <> · Score {r.score}</>}
                  {r.extra !== undefined && (
                    <>
                      {' · '}
                      <span data-testid={`plan-row-preset-${r.id}`}>{r.preset}</span>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                id={`plan-remove-${r.id}`}
                className={btn}
                aria-label={`Remove ${r.name} from the plan`}
                onClick={() => {
                  removedAt.current = i;
                  onRemove(r.id);
                }}
              >
                Remove
              </button>
              </div>
              {r.extra}
              {r.mix}
            </li>
          ))}
        </ol>
      )}
      <div id="find-a-target" role="region" aria-label="Find a target" className="border-t border-p-line/10">
        <h3 className="text-base font-normal text-p-t1">
          <button
            type="button"
            aria-expanded={find.open}
            aria-controls="find-a-target-body"
            onClick={find.onToggle}
            className="flex min-h-11 w-full flex-wrap items-center gap-x-2 rounded text-left"
          >
            <span aria-hidden="true" className="w-4 shrink-0 text-p-t1/70">{find.open ? '▾' : '▸'}</span>
            <span>Find a target{find.count !== null && <span data-testid="find-count"> ({find.count})</span>}</span>
          </button>
        </h3>
        <div id="find-a-target-body" hidden={!find.open} className="pb-3">
          {find.children}
        </div>
      </div>
      {children}
    </section>
  );
}
