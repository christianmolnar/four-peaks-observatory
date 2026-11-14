'use client';

import { useEffect, useRef, useState } from 'react';
import { creditsFor, describeCoordinates, detailValues, fillSiteFields, lookupPlace, placeValues } from '@/planner/location/client';
import type { ClientFetch, FieldChange, SiteFieldKey } from '@/planner/location/client';
import type { PlaceCandidate } from '@/planner/location/types';
import WrapText from './WrapText';

const field =
  'min-h-11 w-full bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
const btn =
  'min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';

export interface SiteFinderProps {
  /** The site's boxes as they are now. */
  texts: Record<string, string>;
  /** Boxes holding a value that a lookup put there and the user has not edited since. Any other non-empty box is protected. */
  overwritable: ReadonlySet<string>;
  /** Puts the new box texts in place; `changed` lists the boxes a lookup wrote. */
  onApply: (texts: Record<string, string>, changed: SiteFieldKey[]) => void;
  /** For tests. */
  fetchImpl?: ClientFetch;
}

const where = (c: PlaceCandidate) => [c.name, c.admin, c.country].filter(Boolean).join(', ');
const show = (c: FieldChange) => `${c.label} ${c.from.trim() === '' ? 'empty' : c.from} to ${c.to}`;
const wouldChange = (changes: FieldChange[]) => `Would change: ${changes.map(show).join(', ')}.`;

/**
 * "Find my site": a text box and two buttons. Nothing is looked up while typing (the place service forbids autocomplete);
 * only a button press sends a request. A lookup never silently replaces a value already in a box: "Use" fills empty boxes (and
 * boxes an earlier lookup filled), lists what it kept, and "Replace" is the explicit way to overwrite the rest.
 */
export default function SiteFinder({ texts, overwritable, onApply, fetchImpl }: SiteFinderProps) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<PlaceCandidate[] | null>(null);
  /** Result of a coordinates lookup, waiting for Replace when it would overwrite a saved value. */
  const [pending, setPending] = useState<Partial<Record<SiteFieldKey, string>> | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<string[]>([]);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  // The result list or button just pressed disappears; move focus to the status message so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (focusTick > 0) messageRef.current?.focus();
  }, [focusTick]);

  const apply = (what: string, values: Partial<Record<SiteFieldKey, string>>, replace: boolean, suffix: string) => {
    const r = fillSiteFields(texts, overwritable, values, replace);
    onApply(r.texts, r.changed);
    const parts = [what];
    if (r.replaced.length > 0) parts.push(`Replaced: ${r.replaced.map(show).join(', ')}.`);
    if (r.kept.length > 0) parts.push(`Kept your own entries for: ${r.kept.map((c) => c.label).join(', ')}.`);
    if (suffix) parts.push(suffix);
    setMessage(parts.join(' '));
    setFocusTick((t) => t + 1);
  };

  const search = async () => {
    setBusy(true);
    setError(null);
    setMessage('');
    setPending(null);
    try {
      const list = await lookupPlace(query, fetchImpl);
      setFound(list);
      setCredits(creditsFor(list));
      setMessage(list.length === 0 ? 'Nothing found. Try the city and state, or a postal code.' : 'Choose the place that is your site.');
    } catch (e) {
      setFound(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fromCoordinates = async () => {
    setBusy(true);
    setError(null);
    setMessage('');
    setPending(null);
    try {
      const latText = texts.latitude ?? '';
      const lonText = texts.longitude ?? '';
      const lat = latText.trim() === '' ? NaN : Number(latText);
      const lon = lonText.trim() === '' ? NaN : Number(lonText);
      const d = await describeCoordinates(lat, lon, fetchImpl);
      setFound(null);
      setCredits(creditsFor([]));
      const values = detailValues(d);
      const notes = d.notes.length ? ' ' + d.notes.join(' ') : '';
      const { kept } = fillSiteFields(texts, overwritable, values);
      apply(`Filled in the time zone${d.elevationM !== undefined ? ' and elevation' : ''} for these coordinates.${notes}`, values, false, '');
      if (kept.length > 0) setPending(values);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2 xl:col-span-3 rounded border border-white/15 p-3">
      <label htmlFor="site-find-query" className="block text-white/90 font-normal text-sm mb-1">Find my site: city and state, or postal code</label>
      <p id="site-find-hint" className="text-white/60 font-normal text-xs mb-1">A city or ZIP is enough; don&apos;t enter a street address.</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <WrapText
            id="site-find-query"
            autoComplete="off"
            aria-describedby="site-find-hint"
            maxLength={100}
            placeholder="Phoenix, AZ or 85001"
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!busy) void search();
              }
            }}
          />
        </div>
        <button type="button" className={btn} disabled={busy} onClick={() => void search()}>Find</button>
      </div>
      <div className="mt-2">
        <button type="button" className={btn} disabled={busy} onClick={() => void fromCoordinates()}>
          Look up elevation and time zone for the latitude and longitude below
        </button>
      </div>
      <p ref={messageRef} tabIndex={-1} aria-live="polite" className="mt-2 text-sky-100 font-normal text-sm min-h-5 focus:outline-none focus:ring-2 focus:ring-sky-400 rounded">{busy ? 'Looking up…' : message}</p>
      {pending && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-white/15 p-2 text-white font-normal text-sm">
          <div className="min-w-0 flex-1 basis-56 break-words">{wouldChange(fillSiteFields(texts, overwritable, pending).kept)}</div>
          <button
            type="button"
            className={btn}
            onClick={() => {
              apply('Filled in the time zone and elevation for these coordinates.', pending, true, '');
              setPending(null);
            }}
          >
            Replace
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
      {found && found.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {found.map((c, i) => {
            const would = fillSiteFields(texts, overwritable, placeValues(c)).kept;
            const done = () => setFound(null);
            return (
              <li key={`${c.latitude},${c.longitude},${i}`} className="flex flex-wrap items-center gap-3 rounded border border-white/15 p-2">
                <div className="min-w-0 flex-1 basis-56 text-white font-normal text-sm break-words">
                  <div>{where(c)}</div>
                  <div className="text-white/70">
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                    {c.elevationM !== undefined ? ` · ${Math.round(c.elevationM)} m` : ' · elevation unknown'} · {c.timeZone}
                  </div>
                  {would.length > 0 && <div className="text-amber-100 mt-1">{wouldChange(would)}</div>}
                </div>
                <button
                  type="button"
                  className={btn}
                  aria-label={`Use ${where(c)}`}
                  onClick={() => {
                    done();
                    apply(`Filled in ${where(c)}.`, placeValues(c), false, 'Check the values, then press Save.');
                  }}
                >
                  Use
                </button>
                {would.length > 0 && (
                  <button
                    type="button"
                    className={btn}
                    aria-label={`Replace saved values with ${where(c)}`}
                    onClick={() => {
                      done();
                      apply(`Filled in ${where(c)}.`, placeValues(c), true, 'Check the values, then press Save.');
                    }}
                  >
                    Replace
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {credits.length > 0 && <p className="mt-2 text-white/60 font-normal text-xs">{credits.join(' ')}</p>}
      <p className="mt-2 text-white/60 font-normal text-xs">Sky darkness (Bortle class) is not looked up. Set it in the box below.</p>
    </div>
  );
}
