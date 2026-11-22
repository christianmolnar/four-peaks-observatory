'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/** The width from which the plan rail is shown (Tailwind `lg`). */
export const RAIL_MIN_WIDTH = 1024;

/**
 * True when the window is at least `px` wide. False until measured, so a server render and a test without matchMedia show no rail:
 * the rail is not in the page at all under 1024 px (no second copy of its buttons for a phone's screen reader or Tab key).
 */
export function useMinWidth(px: number): boolean {
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(min-width: ${px}px)`);
    const read = () => setOn(query.matches);
    read();
    query.addEventListener('change', read);
    return () => query.removeEventListener('change', read);
  }, [px]);
  return on;
}

export interface RailRow {
  id: string;
  name: string;
  /** The exposure mode as the row shows it ("Balanced"). */
  mode: string;
  /** The slot's time window in the timeline ("21:10 to 23:40"), or null until the timeline has one. */
  window: string | null;
}

export interface PlanRailProps {
  name: string;
  rows: readonly RailRow[];
  /** "Light" of the timeline, whole minutes (`lightMinutes`); null while the timeline has no plan. */
  lightMin: number | null;
  /** The astronomical night in hours as the page's night line prints it ("10.7"); null when there is none. */
  nightHours: string | null;
  /** How many slots of the timeline carry a warning. */
  warnings: number;
  onGoToRow: (id: string) => void;
  onGoToWarnings: () => void;
  onPlanWithAi: () => void;
  onShare: () => void;
}

const btn =
  'min-h-11 w-full rounded border border-p-line/30 px-3 py-1.5 text-center text-sm font-normal text-p-t1 hover:bg-p-raised/10';

/** "5 h 46 min", "46 min", "6 h". */
export const hoursMinutes = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/**
 * The plan at a glance beside the page, from 1024 px: read-only. It shows what the page already has (the plan's rows, the timeline's own
 * Light and the page's own night length) and offers no editing; the rows, with their Remove and exposure controls, stay the one place to change a plan.
 */
export default function PlanRail({ name, rows, lightMin, nightHours, warnings, onGoToRow, onGoToWarnings, onPlanWithAi, onShare }: PlanRailProps) {
  // A sticky box cannot leave its panel, so at the page bottom (the credits and padding sit below the panel) a rail as tall as the window would be
  // pushed up under the bars. Its height is capped to the room the panel's bottom edge leaves, so it stays below --planner-top at every scroll position.
  const ref = useRef<HTMLElement>(null);
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const panel = el?.parentElement;
    const main = el?.closest('main');
    if (!panel || !main) return undefined;
    const measure = () => setBelow(Math.max(0, Math.round(main.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom)));
    measure();
    window.addEventListener('resize', measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(main);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, []);
  return (
    <aside
      ref={ref}
      style={{ '--rail-below': `${below + 8}px` } as CSSProperties}
      aria-label="Plan summary"
      data-testid="plan-rail"
      className="sticky top-[calc(var(--planner-top,0px)+0.5rem)] max-h-[calc(100vh-var(--planner-top,0px)-0.5rem-var(--rail-below,0.5rem))] w-[280px] self-start overflow-y-auto rounded-lg border border-p-line/10 bg-p-bg/70 p-4 text-sm font-normal text-p-t1"
    >
      <h2 className="break-words text-base font-normal tracking-[0.1em] text-p-t1" data-testid="rail-title">
        {name}
        <span className="block text-sm tracking-normal text-p-t1/70">
          {rows.length} {rows.length === 1 ? 'target' : 'targets'}
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-p-t1" data-testid="rail-empty">No targets yet.</p>
      ) : (
        <ol className="mt-3 space-y-1" aria-label="Targets, in order">
          {rows.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onGoToRow(r.id)}
                className="flex min-h-11 w-full items-start gap-2 rounded px-2 py-1 text-left hover:bg-p-raised/10"
                aria-label={`Go to ${r.name} in the plan`}
              >
                <span aria-hidden="true" className="w-5 shrink-0 text-p-t1/70">{i + 1}.</span>
                <span className="min-w-0 break-words">
                  <span className="block text-p-t1">{r.name}</span>
                  <span className="block text-p-t1/70">
                    {r.mode}
                    {r.window !== null && <> · {r.window}</>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-p-t1" data-testid="rail-light">
        {lightMin === null ? 'Light: not worked out yet' : `Light ${hoursMinutes(lightMin)}`}
        {nightHours !== null && <>, night {nightHours} h</>}
      </p>
      <p className="mt-1" data-testid="rail-warnings">
        {warnings === 0 ? (
          <span className="text-p-t1/70">No warnings</span>
        ) : (
          <button type="button" onClick={onGoToWarnings} className="min-h-11 rounded text-left text-p-warn-text underline underline-offset-2">
            {warnings} {warnings === 1 ? 'warning' : 'warnings'}
          </button>
        )}
      </p>
      <div className="mt-3 space-y-2">
        <button type="button" className={btn} onClick={onPlanWithAi}>Plan my night with AI</button>
        <button type="button" className={btn} onClick={onShare}>Share and export</button>
      </div>
    </aside>
  );
}
