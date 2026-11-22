'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { creditsFor, describeCoordinates, detailValues, fillSiteFields, lookupPlace, placeValues } from '@/planner/location/client';
import type { ClientFetch, FieldChange, SiteFieldKey } from '@/planner/location/client';
import type { PlaceCandidate } from '@/planner/location/types';
import WrapText from './WrapText';

const field =
  'min-h-11 w-full bg-p-bg/60 border border-p-line/30 rounded px-2 py-1 text-p-t1 font-normal text-sm';
const btn =
  'min-h-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40';

export interface SiteFinderProps {
  /** The site's boxes as they were at the last render, for what is shown. */
  texts: Record<string, string>;
  /** The site's boxes right now. A lookup result is merged against this, never against `texts`, so nothing typed while it ran is lost. */
  getTexts: () => Record<string, string>;
  /** Boxes holding a value that a lookup put there and the user has not edited since. Any other non-empty box is protected. */
  overwritable: ReadonlySet<string>;
  /** Puts the new box texts in place; `changed` lists the boxes a lookup wrote. */
  onApply: (texts: Record<string, string>, changed: SiteFieldKey[]) => void;
  /** The id of the text box, when something outside needs to focus it; defaults to one unique to this instance. */
  inputId?: string;
  /** For tests. */
  fetchImpl?: ClientFetch;
}

const FIELD_NAMES: Record<SiteFieldKey, string> = { latitude: 'latitude', longitude: 'longitude', elevationM: 'elevation', timeZone: 'time zone' };
const placeLead = (c: PlaceCandidate, filled: string[]) => (filled.length > 0 ? `Filled in ${where(c)}: ${sentenceList(filled)}.` : '');
const where = (c: PlaceCandidate) => [c.name, c.admin, c.country].filter(Boolean).join(', ');
const show = (c: FieldChange) => `${c.label} ${c.from.trim() === '' ? 'empty' : c.from} to ${c.to}`;
const sentenceList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const wouldChange = (changes: FieldChange[]) => `Would change: ${changes.map(show).join(', ')}.`;

/**
 * "Find my site": a text box and two buttons. Nothing is looked up while typing (the place service forbids autocomplete);
 * only a button press sends a request. A lookup never silently replaces a value already in a box: "Use" fills empty boxes (and
 * boxes an earlier lookup filled), lists what it kept, and "Replace" is the explicit way to overwrite the rest.
 */
export default function SiteFinder({ texts, getTexts, overwritable, onApply, inputId, fetchImpl }: SiteFinderProps) {
  // One finder per site form, and several forms can be on the page: the ids are per instance, so each box keeps its own name and hint.
  const uid = useId();
  const queryId = inputId ?? `${uid}-site-find-query`;
  const hintId = `${uid}-site-find-hint`;
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<PlaceCandidate[] | null>(null);
  /** Result of a coordinates lookup, waiting for Replace when it would overwrite a saved value. Good only for the coordinates it was looked up for. */
  const [pending, setPending] = useState<{ values: Partial<Record<SiteFieldKey, string>>; latitude: string; longitude: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<string[]>([]);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [focusTick, setFocusTick] = useState(0);
  // The result list or button just pressed disappears; move focus to the status message so keyboard and screen-reader users keep their place.
  useEffect(() => {
    if (focusTick > 0) messageRef.current?.focus();
  }, [focusTick]);

  /**
   * Puts values into the boxes as they are now, and says what happened from what actually happened:
   * `lead(filled)` opens the sentence (filled: the boxes written into an empty or lookup-filled box), then what was replaced and what was kept.
   */
  const apply = (lead: (filled: string[]) => string, values: Partial<Record<SiteFieldKey, string>>, replace: boolean, suffix: string, notes = '') => {
    const r = fillSiteFields(getTexts(), overwritable, values, replace);
    onApply(r.texts, r.changed);
    const replacedKeys = new Set<string>(r.replaced.map((c) => c.key));
    const filled = r.changed.filter((k) => !replacedKeys.has(k)).map((k) => FIELD_NAMES[k]);
    const parts = [lead(filled)];
    if (r.replaced.length > 0) parts.push(`Replaced: ${r.replaced.map(show).join(', ')}.`);
    if (r.kept.length > 0) parts.push(`Kept your own entries for: ${r.kept.map((c) => c.label).join(', ')}.`);
    if (suffix) parts.push(suffix);
    if (notes) parts.push(notes);
    setMessage(parts.filter(Boolean).join(' '));
    setFocusTick((t) => t + 1);
    return r;
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
      const latText = getTexts().latitude ?? '';
      const lonText = getTexts().longitude ?? '';
      const lat = latText.trim() === '' ? NaN : Number(latText);
      const lon = lonText.trim() === '' ? NaN : Number(lonText);
      const d = await describeCoordinates(lat, lon, fetchImpl);
      setFound(null);
      setCredits(creditsFor([]));
      const now = getTexts();
      if ((now.latitude ?? '') !== latText || (now.longitude ?? '') !== lonText) {
        setMessage('The latitude or longitude changed while looking up, so nothing was filled in. Press the button again.');
        return;
      }
      const values = detailValues(d);
      const r = apply(
        (filled) => (filled.length > 0 ? `Filled in the ${sentenceList(filled)} for these coordinates.` : ''),
        values,
        false,
        '',
        d.notes.join(' '),
      );
      if (r.changed.length === 0 && r.kept.length === 0 && d.notes.length === 0) setMessage('Nothing to change: the boxes already match these coordinates.');
      if (r.kept.length > 0) setPending({ values, latitude: latText, longitude: lonText });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // A waiting Replace belongs to the coordinates it was looked up for; change them and it is gone. It shows only while it would still change something.
  const pendingKept =
    pending && (texts.latitude ?? '') === pending.latitude && (texts.longitude ?? '') === pending.longitude ? fillSiteFields(texts, overwritable, pending.values).kept : [];

  return (
    <div className="sm:col-span-2 xl:col-span-3 rounded border border-p-line/15 p-3">
      <label htmlFor={queryId} className="block text-p-t1 font-normal text-sm mb-1">Find my site: city and state, or postal code</label>
      <p id={hintId} className="text-p-t1/70 font-normal text-sm mb-1">A city or ZIP is enough; don&apos;t enter a street address.</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <WrapText
            id={queryId}
            autoComplete="off"
            aria-describedby={hintId}
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
      <p ref={messageRef} tabIndex={-1} aria-live="polite" className="mt-2 text-p-info-text font-normal text-sm min-h-5 rounded">{busy ? 'Looking up…' : message}</p>
      {pendingKept.length > 0 && pending && (
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded border border-p-line/15 p-2 text-p-t1 font-normal text-sm">
          <div className="min-w-0 flex-1 basis-56 break-words">{wouldChange(pendingKept)}</div>
          <button
            type="button"
            className={btn}
            onClick={() => {
              apply((filled) => (filled.length > 0 ? `Filled in the ${sentenceList(filled)} for these coordinates.` : ''), pending.values, true, '');
              setPending(null);
            }}
          >
            Replace
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm">
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
              <li key={`${c.latitude},${c.longitude},${i}`} className="flex flex-wrap items-center gap-3 rounded border border-p-line/15 p-2">
                <div className="min-w-0 flex-1 basis-56 text-p-t1 font-normal text-sm break-words">
                  <div>{where(c)}</div>
                  <div className="text-p-t1/70">
                    {c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}
                    {c.elevationM !== undefined ? ` · ${Math.round(c.elevationM)} m` : ' · elevation unknown'} · {c.timeZone}
                  </div>
                  {would.length > 0 && <div className="text-p-would mt-1">{wouldChange(would)}</div>}
                </div>
                <button
                  type="button"
                  className={btn}
                  aria-label={`Use ${where(c)}`}
                  onClick={() => {
                    done();
                    apply((filled) => placeLead(c, filled), placeValues(c), false, 'Check the values, then press Save.');
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
                      apply((filled) => placeLead(c, filled), placeValues(c), true, 'Check the values, then press Save.');
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
      {credits.length > 0 && <p className="mt-2 text-p-t1/70 font-normal text-sm">{credits.join(' ')}</p>}
      <p className="mt-2 text-p-t1/70 font-normal text-sm">Sky darkness (Bortle class) is not looked up. Set it in the box below.</p>
    </div>
  );
}
