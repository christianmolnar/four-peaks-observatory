'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SearchTarget } from '@/planner/catalog/search';
import type { NightScorer } from './nightScorer';
import { designationOf, nightStatus, sizeText, typeLabel } from './catalogText';
import type { CatalogState } from './useCatalog';

const MAX_RESULTS = 12;

export interface TargetSearchProps {
  catalog: CatalogState;
  onRetryCatalog: () => void;
  /** Scores one target for the chosen night; null when there is no astronomical night. */
  scorer: NightScorer | null;
  nightWord: string;
  formatTime: (d: Date) => string;
  /** Ids already in my plan. */
  planIds: ReadonlySet<string>;
  /** Place of a target in tonight's list (1 is the best), when it is in it. */
  rankOf: (id: string) => number | undefined;
  onAdd: (target: SearchTarget) => void;
  /**
   * THE SEAM for an online lookup (SIMBAD, later): called with the typed text when the bundled catalog has no such object,
   * and may return a control or a note to show under "not in the bundled catalog". Nothing is looked up today.
   */
  renderNotFound?: (text: string) => ReactNode;
}

/**
 * Finds any object of the bundled catalog as you type (the search is local and offline: no request is made), and says for
 * the chosen night whether it is up and what it scores, even when it is not among tonight's best. Enter or the Search button
 * does the same as typing; they exist so a keyboard or a phone's "Go" key has something to press.
 */
export default function TargetSearch({ catalog, onRetryCatalog, scorer, nightWord, formatTime, planIds, rankOf, onAdd, renderNotFound }: TargetSearchProps) {
  const [text, setText] = useState('');
  // What the Search button or Enter committed; typing updates `text` and the results follow it either way.
  const [, setSubmitted] = useState('');
  const uid = useId();
  const inputId = `${uid}-find`;
  const hintId = `${uid}-find-hint`;
  const typed = text.trim();
  const result = useMemo(() => (catalog.status === 'ready' && typed !== '' ? catalog.index.search({ text: typed, limit: MAX_RESULTS }) : null), [catalog, typed]);
  const rows = useMemo(() => (result === null ? [] : result.hits.map((h) => ({ target: h.target, entry: scorer === null ? null : scorer.target(h.target) }))), [result, scorer]);

  return (
    <section aria-labelledby="search-heading" className="bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6">
      <h2 id="search-heading" className="text-xl font-light text-white tracking-[0.15em] mb-4">FIND A TARGET</h2>
      <form
        role="search"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(text);
        }}
      >
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor={inputId} className="block text-white/90 font-normal text-sm mb-1">Search the catalog by name or number</label>
          <input
            id={inputId}
            type="search"
            autoComplete="off"
            maxLength={100}
            aria-describedby={hintId}
            placeholder="M31, NGC 7000, Orion, Veil"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-11 w-full bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
        </div>
        <button
          type="submit"
          className="min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          Search
        </button>
      </form>
      <p id={hintId} className="mt-1 text-white/60 font-normal text-xs">
        Searches the bundled catalog of about 14,000 deep-sky objects on this device, as you type. Nothing is sent anywhere.
      </p>

      {catalog.status === 'loading' && <p aria-live="polite" className="mt-3 text-white/80 font-normal text-sm">Loading the catalog…</p>}
      {catalog.status === 'error' && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm">
          <span className="min-w-0 break-words">The catalog could not be loaded, so search is off: {catalog.message}</span>
          <button type="button" onClick={onRetryCatalog} className="min-h-11 px-3 rounded border border-orange-200/60 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400">
            Retry
          </button>
        </div>
      )}

      {result !== null && (
        <div className="mt-3" data-testid="search-results">
          <p aria-live="polite" className="text-white/70 font-normal text-xs">
            {result.notFoundLocally
              ? ''
              : result.total === 0
                ? 'No matches. Type the whole number, for example NGC 7000.'
                : result.total > rows.length
                  ? `${result.total} matches, showing the first ${rows.length}.`
                  : `${result.total} ${result.total === 1 ? 'match' : 'matches'}.`}
          </p>
          {result.notFoundLocally && (
            <div className="rounded border border-white/15 p-3 text-white/90 font-normal text-sm">
              <p>“{typed}” is not in the bundled catalog.</p>
              {renderNotFound?.(typed)}
            </div>
          )}
          {rows.length > 0 && (
            <ul className="space-y-3" aria-label="Search results">
              {rows.map(({ target, entry }) => {
                const shown = target.displayName ?? target.name;
                const designation = designationOf(target.id);
                const size = sizeText(target.sizeArcmin);
                const place = rankOf(target.id);
                const inPlan = planIds.has(target.id);
                return (
                  <li key={target.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/15 p-3 text-sm font-normal text-white/90">
                    <div className="min-w-0 flex-1 basis-56 break-words">
                      <p className="text-white">
                        {shown}
                        {designation !== '' && designation !== shown && <span className="ml-2 text-white/70">{designation}</span>}
                      </p>
                      <p className="text-white/70">{[typeLabel(target.type), size, target.constellation].filter((x) => x !== undefined && x !== '').join(' · ')}</p>
                      <p className="mt-1">
                        {entry === null ? `No astronomical night ${nightWord === 'tonight' ? 'tonight' : 'on that date'}.` : nightStatus(entry, nightWord, formatTime)}
                        {place !== undefined && ` #${place} in the list below.`}
                      </p>
                    </div>
                    {inPlan ? (
                      <span className="inline-flex min-h-11 items-center px-3 text-white/70">In my plan</span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Add ${shown} to my plan`}
                        onClick={() => onAdd(target)}
                        className="min-h-11 px-3 py-1.5 rounded border border-white/30 text-white text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      >
                        Add to my plan
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
