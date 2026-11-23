'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { compass } from '@/planner/plan';
import type { PlanEntry } from '@/planner/plan';
import { fitWords, peakText, rowWhy, upRange } from './catalogText';

/** "86° N": the peak without its time, for the one-line phone row. */
const peakShort = (e: PlanEntry): string => `${Math.round(e.peakAltitude) + 0}° ${compass(e.peakAzimuth)}`;

/** Rows shown at first, and how many each "Show more" adds. */
export const FIRST_ROWS = 10;
export const MORE_ROWS = 10;

/** One shared grid, so the column titles and every row line up: one column on a phone, five from md. */
const GRID = 'grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_6rem_minmax(0,1.7fr)_6.5rem]';

export interface RowDescription {
  /** A second name for the same object, shown after the name ("M31" for "Andromeda Galaxy"); "" for none. */
  aka: string;
  /** Type, size and constellation. */
  meta: string;
}

export interface TargetListProps {
  entries: readonly PlanEntry[];
  /** Names the list for assistive technology. */
  label: string;
  /** Keeps the ids of two lists on one page apart. */
  idPrefix: string;
  formatTime: (d: Date) => string;
  describe: (e: PlanEntry) => RowDescription;
  /** What the "Fits" cell says; defaults to the fit label. The group of targets that do not fit says how, in numbers. */
  fitText?: (e: PlanEntry) => string;
  planIds: ReadonlySet<string>;
  /** The target just added and what to say next to its button for a few seconds. */
  added: { id: string; text: string } | null;
  onAdd: (id: string) => void;
  /** Id of the row that is open, or ''. */
  openId: string;
  onToggle: (id: string) => void;
  renderDetail: (e: PlanEntry) => ReactNode;
  /** The most rows it will ever show (the list is the best 100, not a census). */
  max?: number;
  /** Rows that are not up on the chosen night ("tonight" or the date): no number, no score, "Not clear <night>" in place of the window. */
  notClear?: string;
}

/**
 * Compact rows for a ranked list: name, type, size, constellation, up window and peak, fit, score with a short reason and an
 * Add button in its own column. The best ten show first and "Show more" adds ten at a time. A row opens its detail in
 * place. One layout for every width (a grid that folds to a column), so the page holds each row once.
 */
export default function TargetList({ entries, label, idPrefix, formatTime, describe, fitText, planIds, added, onAdd, openId, onToggle, renderDetail, max = 100, notClear }: TargetListProps) {
  const [shown, setShown] = useState(FIRST_ROWS);
  const total = Math.min(entries.length, max);
  const visible = entries.slice(0, Math.min(shown, total));
  // A new list (another night, train or filter) starts again from the best ten.
  useEffect(() => setShown(FIRST_ROWS), [entries]);
  // "Show more" can remove its own button when the last rows arrive: the keyboard moves to the first new row.
  const focusRow = useRef<number | null>(null);
  useEffect(() => {
    if (focusRow.current === null) return;
    const e = entries[focusRow.current];
    focusRow.current = null;
    if (e) document.getElementById(`${idPrefix}-name-${e.id}`)?.focus();
  }, [shown, entries, idPrefix]);

  return (
    <div>
      <div className={`${GRID} sticky top-[var(--planner-top,0px)] z-20 hidden gap-x-3 border-b border-p-line/20 bg-p-bg px-1 pb-1 pt-1 text-sm text-p-t1/70 md:grid`} aria-hidden="true">
        <span>Target</span>
        <span>Up and peak</span>
        <span>Score</span>
        <span>Clear</span>
        <span />
      </div>
      <ul aria-label={label} className="text-sm leading-5 font-normal text-p-t1" data-testid={`${idPrefix}-list`}>
        {visible.map((e, i) => {
          const d = describe(e);
          const isOpen = openId === e.id;
          const inPlan = planIds.has(e.id);
          const nameId = `${idPrefix}-name-${e.id}`;
          const detailId = `${idPrefix}-detail-${e.id}`;
          return (
            <li key={e.id} className={`${GRID} items-start gap-x-3 border-b border-p-line/10 px-1 py-0 md:py-1.5 ${isOpen ? 'bg-p-info-fill/10' : ''}`}>
              <div className="col-start-1 min-w-0 md:col-auto">
                <button
                  type="button"
                  id={nameId}
                  aria-expanded={isOpen}
                  aria-controls={detailId}
                  onClick={() => onToggle(e.id)}
                  className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded py-0.5 text-left text-[15px] font-medium leading-[18px] text-p-t1"
                >
                  <span aria-hidden="true" className="w-4 shrink-0 text-sm text-p-t1/70">{isOpen ? '▾' : '▸'}</span>
                  <span className="break-words">{notClear === undefined && <span className="text-p-t1/70">{i + 1}. </span>}{e.name}</span>
                </button>
                {d.aka !== '' && <span className="ml-1.5 text-p-t1/70">{d.aka}</span>}
                <p className="pl-[1.375rem] text-p-t1/70">{d.meta}</p>
              </div>
              {/* On a phone the up window, peak, fit and score are one line; from md they are two columns. */}
              <div className="col-start-1 pl-[1.375rem] md:contents">
                <span className="md:col-auto md:block">
                  {notClear === undefined ? `Up ${upRange(e, formatTime)}` : `Not clear ${notClear}`}
                  <span className="md:hidden"> · peak {peakShort(e)}</span>
                  <span className="hidden md:block">peak {peakText(e, formatTime)}</span>
                </span>
                <span data-testid="row-fit-score" className="md:col-auto md:block">
                  {(fitText ? fitText(e) : fitWords(e)) !== '' && <span className="md:hidden"> · </span>}
                  <span>{fitText ? fitText(e) : fitWords(e)}</span>
                  {notClear === undefined && <span className="hidden md:block">Score <span className="font-medium text-p-t1">{Math.round(e.score.total)}</span></span>}
                </span>
              </div>
              <p className="col-start-1 line-clamp-1 pl-[1.375rem] text-p-t1/70 md:col-auto md:line-clamp-2 md:pl-0">{notClear === undefined ? rowWhy(e) : 'Never up'}</p>
              <div className="col-start-2 row-span-3 row-start-1 flex flex-col items-end self-center md:col-auto md:row-span-1 md:row-start-auto">
                {/* On a phone the score sits above the button, so the stats line keeps to one line. */}
                {notClear === undefined && <span aria-hidden="true" className="md:hidden">Score <span className="font-medium text-p-t1">{Math.round(e.score.total)}</span></span>}
                <button
                  type="button"
                  aria-label={inPlan ? `${e.name} is in the plan` : `Add ${e.name} to the plan`}
                  aria-disabled={inPlan}
                  onClick={() => {
                    if (!inPlan) onAdd(e.id);
                  }}
                  className={`min-h-11 min-w-11 whitespace-nowrap rounded border px-2.5 text-sm ${inPlan ? 'border-p-line/15 text-p-t1/70' : 'border-p-line/30 text-p-t1 hover:bg-p-raised/10'}`}
                >
                  {inPlan ? 'In plan' : 'Add'}
                </button>
                {added?.id === e.id && <span aria-hidden="true" className="mt-0.5 max-w-[6.5rem] text-right text-sm text-p-ok">{added.text}</span>}
              </div>
              {isOpen && (
                <div id={detailId} className="col-span-full mt-2 rounded border border-p-line/15 bg-p-bg/40 p-3 text-sm">
                  {renderDetail(e)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {total > FIRST_ROWS && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-normal text-p-t1/70">
          <span aria-live="polite">Showing {visible.length} of {total}</span>
          {visible.length < total && (
            <button
              type="button"
              onClick={() => {
                focusRow.current = visible.length;
                setShown(visible.length + MORE_ROWS);
              }}
              className="min-h-11 rounded border border-p-line/30 px-3 text-p-t1 hover:bg-p-raised/10"
            >
              Show {Math.min(MORE_ROWS, total - visible.length)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** A heading-and-button that opens or closes a group of rows (the planets, the targets that do not fit). */
export function Group({ id, title, open, onToggle, children }: { id: string; title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mt-4 border-t border-p-line/15 pt-1">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center gap-2 rounded text-left text-base font-medium text-p-t1"
        >
          <span aria-hidden="true" className="w-4 text-p-t1/70">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </h3>
      <div id={id} hidden={!open}>
        {open && children}
      </div>
    </div>
  );
}
