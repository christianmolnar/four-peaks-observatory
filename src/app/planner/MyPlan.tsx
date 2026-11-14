'use client';

import { useEffect, useRef, useState } from 'react';

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
 * re-sorted by score. It sits above the list so it is seen while adding; closed it is one line with the count, and it opens
 * by itself once it holds something (until the user opens or closes it). The itinerary takes its targets from this list.
 */
export default function MyPlan({ rows, nightWord, onMove, onRemove }: MyPlanProps) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? rows.length > 0;
  const headerRef = useRef<HTMLButtonElement>(null);
  // After a move the buttons re-render in new places: keep the keyboard on the one that was pressed.
  // The pressed button may now be disabled (it reached an end), so the opposite one is the fallback.
  const focusNext = useRef<string[]>([]);
  // After a removal the pressed button is gone: the keyboard goes to the Remove of the row that took its place, else the one before, else the header.
  const removedAt = useRef<number | null>(null);
  useEffect(() => {
    const target = focusNext.current.map((id) => document.getElementById(id) as HTMLButtonElement | null).find((el) => el !== null && !el.disabled);
    target?.focus();
    focusNext.current = [];
    if (removedAt.current !== null) {
      const row = rows[Math.min(removedAt.current, rows.length - 1)];
      (row ? document.getElementById(`plan-remove-${row.id}`) : headerRef.current)?.focus();
      removedAt.current = null;
    }
  }, [rows]);

  return (
    <section aria-labelledby="my-plan-heading" className="bg-black/70 rounded-lg border border-white/10 px-4 py-2 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="my-plan-heading" className="text-xl font-light text-white tracking-[0.15em]">
          <button
            ref={headerRef}
            type="button"
            aria-expanded={open}
            aria-controls="my-plan-body"
            onClick={() => setChosen(!open)}
            className="flex min-h-11 items-center gap-2 rounded text-left tracking-[0.15em] focus:outline-none focus:ring-2 focus:ring-sky-400"
          >
            <span aria-hidden="true" className="w-4 text-base text-white/70">{open ? '▾' : '▸'}</span>
            MY PLAN ({rows.length})
          </button>
        </h2>
        {rows.length > 0 && (
          <span className="flex flex-wrap gap-x-4">
            <a href="#ai-plan-heading" className="inline-flex min-h-11 items-center rounded px-1 text-sm font-normal text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
              Plan my night with AI
            </a>
            <a href="#itinerary-heading" className="inline-flex min-h-11 items-center rounded px-1 text-sm font-normal text-sky-300 underline underline-offset-2 focus:outline-none focus:ring-2 focus:ring-sky-400">
              Plan an itinerary
            </a>
          </span>
        )}
      </div>
      <div id="my-plan-body" hidden={!open} className="pb-3">
        {open && (
          <>
            <p className="text-white/70 font-normal text-sm mb-3">
              Your targets for {nightWord}, in your order of priority. Add them from the list or the search; the night itinerary takes its targets from here.
            </p>
            {rows.length === 0 ? (
              <p className="text-white/90 font-normal text-sm">Nothing in your plan yet. Use Add on a target.</p>
            ) : (
              <ol className="max-h-[28rem] space-y-2 overflow-y-auto" aria-label="My plan, in priority order">
                {rows.map((r, i) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/15 p-3 text-sm font-normal text-white/90">
                    <div className="min-w-0 flex-1 basis-56 break-words">
                      <p className="text-white"><span className="text-white/70">{i + 1}.</span> {r.name}</p>
                      {r.detail !== '' && <p className="text-white/70">{r.detail}</p>}
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
                      <button
                        type="button"
                        id={`plan-remove-${r.id}`}
                        className={btn}
                        aria-label={`Remove ${r.name} from my plan`}
                        onClick={() => {
                          removedAt.current = i;
                          onRemove(r.id);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}
