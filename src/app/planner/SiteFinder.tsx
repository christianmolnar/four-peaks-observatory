'use client';

import { useState } from 'react';
import { creditsFor, describeCoordinates, detailValues, lookupPlace, placeValues } from '@/planner/location/client';
import type { ClientFetch, SiteFieldKey } from '@/planner/location/client';
import type { PlaceCandidate } from '@/planner/location/types';
import WrapText from './WrapText';

const field =
  'min-h-11 w-full bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
const btn =
  'min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40';

export interface SiteFinderProps {
  /** The current latitude and longitude boxes, as typed. */
  latitudeText: string;
  longitudeText: string;
  /** Puts values into the site boxes; returns the labels of boxes kept because the user edited them. */
  onFill: (values: Partial<Record<SiteFieldKey, string>>) => string[];
  /** For tests. */
  fetchImpl?: ClientFetch;
}

const where = (c: PlaceCandidate) => [c.name, c.admin, c.country].filter(Boolean).join(', ');

/**
 * "Find my site": a text box and two buttons. Nothing is looked up while typing (the place service forbids autocomplete);
 * only a button press sends a request. A lookup fills the boxes you have not edited yourself and says which it kept.
 */
export default function SiteFinder({ latitudeText, longitudeText, onFill, fetchImpl }: SiteFinderProps) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<PlaceCandidate[] | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<string[]>([]);

  const report = (what: string, kept: string[]) =>
    setMessage(kept.length > 0 ? `${what} Kept your own entries for: ${kept.join(', ')}.` : what);

  const search = async () => {
    setBusy(true);
    setError(null);
    setMessage('');
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
    try {
      const lat = latitudeText.trim() === '' ? NaN : Number(latitudeText);
      const lon = longitudeText.trim() === '' ? NaN : Number(longitudeText);
      const d = await describeCoordinates(lat, lon, fetchImpl);
      setFound(null);
      setCredits(creditsFor([]));
      const kept = onFill(detailValues(d));
      report(`Filled in the time zone${d.elevationM !== undefined ? ' and elevation' : ''} for these coordinates.${d.notes.length ? ' ' + d.notes.join(' ') : ''}`, kept);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sm:col-span-2 xl:col-span-3 rounded border border-white/15 p-3">
      <label htmlFor="site-find-query" className="block text-white/90 font-normal text-sm mb-1">Find my site: city and state, or postal code</label>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <WrapText
            id="site-find-query"
            autoComplete="off"
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
      <p aria-live="polite" className="mt-2 text-sky-100 font-normal text-sm min-h-5">{busy ? 'Looking up…' : message}</p>
      {error && (
        <p role="alert" className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
      {found && found.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {found.map((c, i) => (
            <li key={`${c.latitude},${c.longitude},${i}`} className="flex flex-wrap items-center gap-3 rounded border border-white/15 p-2">
              <div className="min-w-0 flex-1 basis-56 text-white font-normal text-sm break-words">
                <div>{where(c)}</div>
                <div className="text-white/70">
                  {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                  {c.elevationM !== undefined ? ` · ${Math.round(c.elevationM)} m` : ' · elevation unknown'} · {c.timeZone}
                </div>
              </div>
              <button
                type="button"
                className={btn}
                aria-label={`Use ${where(c)}`}
                onClick={() => {
                  const kept = onFill(placeValues(c));
                  setFound(null);
                  report(`Filled in ${where(c)}. Check the values, then press Save.`, kept);
                }}
              >
                Use
              </button>
            </li>
          ))}
        </ul>
      )}
      {credits.length > 0 && <p className="mt-2 text-white/60 font-normal text-xs">{credits.join(' ')}</p>}
      <p className="mt-2 text-white/60 font-normal text-xs">Sky darkness (Bortle class) is not looked up. Set it in the box below.</p>
    </div>
  );
}
