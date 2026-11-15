'use client';

import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { planetIdOf, SLOT_BODIES } from '@/planner/itinerary/resolve';
import type { CardBody } from '@/planner/astro/bodies';
import type { PlanEntry } from '@/planner/plan';
import { DEFAULT_MIN_FRAME_PERCENT, NON_IMAGING_TYPES } from '@/planner/plan/rank';
import type { NightScorer } from './nightScorer';
import { designationOf, nightStatus, sizeText, typeLabel } from './catalogText';
import type { CatalogState } from './useCatalog';

const MAX_RESULTS = 12;
/** A planet or the Moon answers to the start of its name once this many letters are typed ("sat", "jup", "moon"). */
const BODY_MIN_LETTERS = 3;

/** One result: a catalog target or a planet, with what the night says of it. */
interface Row {
  id: string;
  name: string;
  aka: string;
  meta: string;
  entry: PlanEntry | null;
  /** Targets only: the target, for the reason it may be outside the list. */
  type: string | null;
}

/** Why a target that is up tonight is not in the list, in a sentence; '' when there is nothing to add. */
function outsideTheList(type: string, entry: PlanEntry): string {
  if (NON_IMAGING_TYPES.includes(type)) return 'Double stars are not ranked, so it is not in the list.';
  if (entry.fit === 'too-large') return 'Tick “Show targets that do not fit” to list it.';
  if (entry.percentOfFrame !== null && entry.percentOfFrame < DEFAULT_MIN_FRAME_PERCENT) return `Under ${DEFAULT_MIN_FRAME_PERCENT}% of this frame, so it is not in the list unless you tick “Show targets that do not fit”.`;
  return 'Below the best 100, so it is not in the list.';
}

export interface TargetSearchProps {
  catalog: CatalogState;
  onRetryCatalog: () => void;
  /** Scores one target for the chosen night; null when there is no astronomical night. */
  scorer: NightScorer | null;
  nightWord: string;
  formatTime: (d: Date) => string;
  /** Ids already in the open plan. */
  planIds: ReadonlySet<string>;
  /** Where the page lists a target ("#3 in the list below."), or undefined when it does not. */
  listedAs: (id: string) => string | undefined;
  /** The target just added and what to say next to its button for a few seconds. */
  added: { id: string; text: string } | null;
  onAdd: (id: string) => void;
  /**
   * THE SEAM for an online lookup (SIMBAD, later): called with the typed text when the bundled catalog has no such object,
   * and may return a control or a note to show under "not in the bundled catalog". Nothing is looked up today.
   */
  renderNotFound?: (text: string) => ReactNode;
  /** The detail of a Moon or planet result (size, phase, clip limit, checklist), shown whether or not it is up that night. */
  renderBodyDetail?: (body: CardBody) => ReactNode;
}

/**
 * Finds any object of the bundled catalog as you type (the search is local and offline: no request is made), and says for
 * the chosen night whether it is up and what it scores, even when it is not among tonight's best. Enter or the Search button
 * does the same as typing; they exist so a keyboard or a phone's "Go" key has something to press.
 */
export default function TargetSearch({ catalog, onRetryCatalog, scorer, nightWord, formatTime, planIds, listedAs, added, onAdd, renderNotFound, renderBodyDetail }: TargetSearchProps) {
  const [text, setText] = useState('');
  const [openBody, setOpenBody] = useState('');
  // What the Search button or Enter committed; typing updates `text` and the results follow it either way.
  const [, setSubmitted] = useState('');
  const uid = useId();
  const inputId = 'target-search'; // one search box on the page; the sticky strip jumps to it
  const hintId = `${uid}-find-hint`;
  const typed = text.trim();
  const result = useMemo(() => (catalog.status === 'ready' && typed !== '' ? catalog.index.search({ text: typed, limit: MAX_RESULTS }) : null), [catalog, typed]);
  // The planets and the Moon are not in the catalog: they answer to their own names, first, and are scored by the same night scorer.
  const bodies = useMemo(() => {
    const q = typed.toLowerCase();
    return q.length < BODY_MIN_LETTERS ? [] : SLOT_BODIES.filter((b) => b.toLowerCase().startsWith(q));
  }, [typed]);
  const rows = useMemo((): Row[] => {
    if (typed === '') return [];
    const planets = bodies.map((b): Row => ({ id: planetIdOf(b), name: b, aka: '', meta: 'Solar system', entry: scorer === null ? null : scorer.planet(b), type: null }));
    const targets = (result?.hits ?? []).map(({ target }): Row => {
      const shown = target.displayName ?? target.name;
      const designation = designationOf(target.id);
      return {
        id: target.id,
        name: shown,
        aka: designation !== '' && designation !== shown ? designation : '',
        meta: [typeLabel(target.type), sizeText(target.sizeArcmin), target.constellation].filter((x) => x !== undefined && x !== '').join(' · '),
        entry: scorer === null ? null : scorer.target(target),
        type: target.type,
      };
    });
    return [...planets, ...targets];
  }, [typed, bodies, result, scorer]);
  const notFound = result !== null && result.notFoundLocally && bodies.length === 0;
  const ready = catalog.status === 'ready' ? catalog.index.size : null;
  // One line says how many matched, or that none did, and sits in the live region so a screen reader hears the miss too.
  const summary =
    result === null && bodies.length === 0
      ? ''
      : notFound
        ? `“${typed}” is not in the bundled catalog.`
        : rows.length === 0
          ? 'No matches. Type the whole number, for example NGC 7000.'
          : result !== null && result.total + bodies.length > rows.length
            ? `${result.total + bodies.length} matches, showing the first ${rows.length}.`
            : `${rows.length} ${rows.length === 1 ? 'match' : 'matches'}.`;

  return (
    <div>
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
        Searches the bundled catalog{ready === null ? '' : ` of ${ready.toLocaleString('en-US')} objects`}, the solar system (Moon and planets) on this device, as you type. Nothing is sent anywhere.
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

      {/* Always on the page, so a screen reader hears the count or the miss when the text in it changes. */}
      <p aria-live="polite" className={`mt-3 min-h-4 font-normal ${notFound ? 'text-sm text-white/90' : 'text-xs text-white/70'}`}>{summary}</p>
      {(result !== null || bodies.length > 0) && (
        <div className="mt-1" data-testid="search-results">
          {notFound && renderNotFound !== undefined && (
            <div className="rounded border border-white/15 p-3 text-white/90 font-normal text-sm">
              {renderNotFound?.(typed)}
            </div>
          )}
          {rows.length > 0 && (
            <ul className="space-y-3" aria-label="Search results">
              {rows.map((r) => {
                const place = listedAs(r.id);
                const inPlan = planIds.has(r.id);
                const body = SLOT_BODIES.find((b) => planetIdOf(b) === r.id);
                const bodyOpen = body !== undefined && renderBodyDetail !== undefined && openBody === r.id;
                const outside = r.type !== null && place === undefined && r.entry !== null && r.entry.usableMinutes > 0 ? outsideTheList(r.type, r.entry) : '';
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/15 p-3 text-sm font-normal text-white/90">
                    <div className="min-w-0 flex-1 basis-56 break-words">
                      <p className="text-white">
                        {r.name}
                        {r.aka !== '' && <span className="ml-2 text-white/70">{r.aka}</span>}
                      </p>
                      <p className="text-white/70">{r.meta}</p>
                      <p className="mt-1">
                        {r.entry === null ? `No astronomical night ${nightWord === 'tonight' ? 'tonight' : 'on that date'}.` : nightStatus(r.entry, nightWord, formatTime)}
                        {place !== undefined && ` ${place}`}
                        {outside !== '' && ` ${outside}`}
                      </p>
                      {body !== undefined && renderBodyDetail !== undefined && (
                        <button
                          type="button"
                          aria-expanded={bodyOpen}
                          aria-controls={`${uid}-body-${r.id}`}
                          onClick={() => setOpenBody(bodyOpen ? '' : r.id)}
                          className="mt-1 min-h-11 rounded border border-white/30 px-3 text-sm text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        >
                          {bodyOpen ? `Hide ${r.name} detail` : `Show ${r.name} detail`}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col items-end">
                      <button
                        type="button"
                        aria-label={inPlan ? `${r.name} is in the plan` : `Add ${r.name} to the plan`}
                        aria-disabled={inPlan}
                        onClick={() => {
                          if (!inPlan) onAdd(r.id);
                        }}
                        className={`min-h-11 px-3 py-1.5 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 ${inPlan ? 'border-white/15 text-white/70' : 'border-white/30 text-white hover:bg-white/10'}`}
                      >
                        {inPlan ? 'In plan' : 'Add to plan'}
                      </button>
                      {added?.id === r.id && <span aria-hidden="true" className="mt-0.5 text-xs text-emerald-300">{added.text}</span>}
                    </div>
                    {bodyOpen && (
                      <div id={`${uid}-body-${r.id}`} className="basis-full rounded border border-white/15 bg-black/40 p-3">
                        {renderBodyDetail!(body!)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
