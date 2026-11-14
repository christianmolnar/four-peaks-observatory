'use client';

import { useEffect, useRef } from 'react';

export interface MyPlanRow {
  id: string;
  name: string;
  /** Type and size, or why it is not known. */
  detail: string;
  /** What it does on the chosen night. */
  status: string;
}

export interface MyPlanProps {
  rows: readonly MyPlanRow[];
  nightWord: string;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
}

const btn =
  'min-h-11 min-w-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';

/**
 * My plan: the targets picked, in the user's own priority order (first is most wanted). The order is the user's, never
 * re-sorted by score. The itinerary below takes its targets from this list.
 */
export default function MyPlan({ rows, nightWord, onMove, onRemove }: MyPlanProps) {
  // After a move the buttons re-render in new places: keep the keyboard on the one that was pressed.
  // The pressed button may now be disabled (it reached an end), so the opposite one is the fallback.
  const focusNext = useRef<string[]>([]);
  useEffect(() => {
    const target = focusNext.current.map((id) => document.getElementById(id) as HTMLButtonElement | null).find((el) => el !== null && !el.disabled);
    target?.focus();
    focusNext.current = [];
  }, [rows]);

  return (
    <section aria-labelledby="my-plan-heading" className="bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6">
      <h2 id="my-plan-heading" className="text-xl font-light text-white tracking-[0.15em] mb-2">MY PLAN</h2>
      <p className="text-white/70 font-normal text-sm mb-3">
        Your targets for {nightWord}, in your order of priority. Add them from the list or the search; the night itinerary takes its targets from here.
      </p>
      {rows.length === 0 ? (
        <p className="text-white/90 font-normal text-sm">Nothing in your plan yet. Use Add to my plan on a target.</p>
      ) : (
        <ol className="space-y-3" aria-label="My plan, in priority order">
          {rows.map((r, i) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/15 p-3 text-sm font-normal text-white/90">
              <div className="min-w-0 flex-1 basis-56 break-words">
                <p className="text-white"><span className="text-white/70">{i + 1}.</span> {r.name}</p>
                <p className="text-white/70">{r.detail}</p>
                <p className="mt-1">{r.status}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  id={`plan-up-${r.id}`}
                  className={btn}
                  disabled={i === 0}
                  aria-label={`Move ${r.name} up`}
                  onClick={() => {
                    focusNext.current = [`plan-up-${r.id}`, `plan-down-${r.id}`];
                    onMove(r.id, 'up');
                  }}
                >
                  Up
                </button>
                <button
                  type="button"
                  id={`plan-down-${r.id}`}
                  className={btn}
                  disabled={i === rows.length - 1}
                  aria-label={`Move ${r.name} down`}
                  onClick={() => {
                    focusNext.current = [`plan-down-${r.id}`, `plan-up-${r.id}`];
                    onMove(r.id, 'down');
                  }}
                >
                  Down
                </button>
                <button type="button" className={btn} aria-label={`Remove ${r.name} from my plan`} onClick={() => onRemove(r.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
