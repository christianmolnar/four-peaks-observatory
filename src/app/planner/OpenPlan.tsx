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
}

export interface OpenPlanProps {
  name: string;
  rows: readonly PlanRow[];
  onRemove: (id: string) => void;
  /** One plain line when the plan mixes a deep-sky train and solar-system bodies (or the reverse), else null. */
  trainNote: string | null;
  /** Focuses the Train select. */
  onChangeTrain: () => void;
  /** The plan's closed-by-default parts ("Night and horizon", "Night timeline"). */
  children?: ReactNode;
}

const btn =
  'min-h-11 min-w-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';

/**
 * The open plan: its targets in the plan's order (the user's picks; the AI plan orders them), each with what it does on the night and
 * its exposure preset, and the plan's own collapsible parts below. Targets come from Find a target further down the page.
 */
export default function OpenPlan({ name, rows, onRemove, trainNote, onChangeTrain, children }: OpenPlanProps) {
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
    <section aria-labelledby="open-plan-heading" className="bg-black/70 rounded-lg border border-white/10 px-4 py-2 sm:px-6">
      <h2 ref={headingRef} tabIndex={-1} id="open-plan-heading" className="min-h-11 py-2 text-xl font-light text-white tracking-[0.15em] focus:outline-none">
        PLAN: {name} ({rows.length} {rows.length === 1 ? 'target' : 'targets'})
      </h2>
      {trainNote !== null && (
        <p className="mb-3 flex flex-wrap items-center gap-x-3 text-white/90 font-normal text-sm" data-testid="plan-train-note">
          <span>{trainNote}</span>
          <button type="button" className={btn} onClick={onChangeTrain}>Change train</button>
        </p>
      )}
      {rows.length === 0 ? (
        <p className="pb-3 text-white/90 font-normal text-sm">Nothing in this plan yet. Use Add on a target below.</p>
      ) : (
        <ol className="max-h-[28rem] space-y-2 overflow-y-auto pb-3" aria-label="Targets in this plan, in order">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/15 p-3 text-sm font-normal text-white/90">
              <div className="min-w-0 flex-1 basis-56 break-words">
                <p className="text-white"><span className="text-white/70">{i + 1}.</span> {r.name}</p>
                {r.detail !== '' && <p className="text-white/70">{r.detail}</p>}
                <p className="mt-1" data-testid={`plan-row-status-${r.id}`}>
                  {r.up}
                  {r.score !== null && <> · Score {r.score}</>}
                  {' · '}
                  <span data-testid={`plan-row-preset-${r.id}`}>{r.preset}</span>
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
            </li>
          ))}
        </ol>
      )}
      {children}
    </section>
  );
}
