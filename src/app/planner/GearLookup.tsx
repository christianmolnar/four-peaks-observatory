'use client';

import { useId, useState } from 'react';
import { lookupSpecs, saveCorrection } from '@/planner/library/client';
import type { ClientFetch } from '@/planner/library/client';
import { DERIVED_BOXES, isEdited, labelOf, libraryClassOf, specsToTexts, textsToSpecs } from '@/planner/library/form';
import { BAND_BOX_KEYS, isBandBox } from '@/planner/profile/passbands';
import type { LibraryList } from '@/planner/library/form';
import { cleanName, nameKey } from '@/planner/library/specs';
import type { LibraryEntry, Specs } from '@/planner/library/specs';
import type { ListKey } from '@/planner/state/edit';

const btn =
  'min-h-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40';

/** What a card remembers about its last lookup (it lives in the Gear section, so saving the form does not lose it). */
export interface LookupState {
  entry: LibraryEntry;
  /** The boxes that held the user's own value when the lookup ran and were left as they were (box to its text then): "Apply library values" replaces them. A kept box the user has not touched since is not an edit. */
  kept: Record<string, string>;
}

export interface GearLookupProps {
  list: ListKey;
  /** The boxes as of the last render, for what is shown. */
  texts: Record<string, string>;
  /** The boxes right now: a lookup that finishes later merges against this, so nothing typed meanwhile is lost. */
  getTexts: () => Record<string, string>;
  /** Boxes holding a value a lookup wrote that the user has not edited since. Any other non-empty box is the user's own and is protected. */
  overwritable: ReadonlySet<string>;
  /** Puts new box texts in place; `changed` lists the boxes a lookup wrote and `entry` is the library entry they came from. */
  onApply: (texts: Record<string, string>, changed: string[], entry: LibraryEntry) => void;
  /** The saved gear item carries the "Filled by AI, check it" mark (set by an earlier lookup, kept across a reload). */
  aiMarked: boolean;
  state: LookupState | null;
  onState: (s: LookupState | null) => void;
  /** For tests. */
  fetchImpl?: ClientFetch;
}

/**
 * What a lookup does with the boxes: the library values go into empty boxes and boxes an earlier lookup wrote; a box the user typed is kept (and named, with the
 * "Apply library values" button). The passbands are one set, never mixed: if any band box is the user's own, all of them are kept. The two totals follow the bands.
 */
export function planFill(fill: Record<string, string>, now: Record<string, string>, overwritable: ReadonlySet<string>): { next: Record<string, string>; changed: string[]; kept: Record<string, string> } {
  const next = { ...now };
  const changed: string[] = [];
  const kept: Record<string, string> = {};
  const hasBands = fill.band1Centre !== undefined;
  const mine = (k: string) => (now[k] ?? '').trim() !== '' && !overwritable.has(k);
  const bandsProtected = hasBands && BAND_BOX_KEYS.some((k) => mine(k) && (now[k] ?? '').trim() !== (fill[k] ?? ''));
  for (const [key, v] of Object.entries(fill)) {
    if (hasBands && DERIVED_BOXES.includes(key)) continue;
    const have = (now[key] ?? '').trim();
    if (have === v) continue;
    if (isBandBox(key) ? !bandsProtected && (have === '' || overwritable.has(key)) : have === '' || overwritable.has(key)) {
      next[key] = v;
      changed.push(key);
    } else {
      kept[key] = now[key] ?? '';
    }
  }
  if (hasBands && !bandsProtected) {
    // Rows an earlier lookup filled that this entry has no band for are cleared.
    for (const k of BAND_BOX_KEYS) if (fill[k] === undefined && (now[k] ?? '') !== '') { next[k] = ''; changed.push(k); }
  }
  return { next, changed, kept };
}

const sentenceList = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/**
 * "Look up specs" for a scope, camera or filter: the name in the form is looked up in the shared library, then (owner only, the server decides) by the AI.
 * The boxes it can fill are filled, every one stays editable, and a value the user already had is kept until they press "Apply library values".
 * An AI-filled entry says "Filled by AI, check it" until it is confirmed or the user edits a box; a changed box offers "Save correction for everyone".
 */
export default function GearLookup({ list, texts, getTexts, overwritable, onApply, aiMarked, state, onState, fetchImpl }: GearLookupProps) {
  const uid = useId();
  const statusId = `${uid}-lookup-status`;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cls = libraryClassOf(list);
  if (cls === null) return null;
  const lib = list as LibraryList;

  const entry = state?.entry;
  // The result belongs to the name that was looked up; another name hides it.
  const current = entry !== undefined && nameKey(texts.name ?? '') === entry.nameKey ? entry : undefined;
  const keptNow = Object.keys(state?.kept ?? {}).filter((k) => (texts[k] ?? '') === state?.kept[k]);
  const edited = current !== undefined && isEdited(lib, current.specs, texts, keptNow);

  const lookup = async () => {
    let name: string;
    try {
      name = cleanName(getTexts().name ?? '');
    } catch (e) {
      setError(null);
      setMessage((e as Error).message);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage('Looking up…');
    const result = await lookupSpecs(cls, name, fetchImpl);
    setBusy(false);
    if (result.kind === 'error') {
      setMessage('');
      setError(result.message);
      return;
    }
    if (result.kind === 'none') {
      setMessage(result.message);
      return;
    }
    const { next, changed, kept } = planFill(specsToTexts(lib, result.entry.specs), getTexts(), overwritable);
    if (changed.length > 0) onApply(next, changed, result.entry);
    onState({ entry: result.entry, kept });
    setMessage(result.from === 'model' ? 'The AI looked this up.' : '');
  };

  const apply = () => {
    if (!state || !current) return;
    const fill = specsToTexts(lib, current.specs);
    const next = { ...getTexts() };
    const keys = Object.keys(state.kept);
    for (const key of keys) if (fill[key] !== undefined) next[key] = fill[key];
    // The passbands are one set: replacing any of them replaces all, and a row the entry has no band for is cleared.
    if (keys.some(isBandBox)) for (const k of BAND_BOX_KEYS) { next[k] = fill[k] ?? ''; if (!keys.includes(k)) keys.push(k); }
    onApply(next, keys, current);
    onState({ entry: current, kept: {} });
  };

  const save = async (specs: Specs | undefined) => {
    if (!current) return;
    setBusy(true);
    setError(null);
    const r = await saveCorrection(cls, current.name, specs, fetchImpl);
    setBusy(false);
    if (r.kind === 'error') {
      setError(r.message);
      return;
    }
    onState({ entry: r.entry, kept: {} });
    setMessage('Saved for everyone.');
  };

  const saveCorrectionClick = () => {
    if (!current) return;
    const r = textsToSpecs(lib, getTexts(), current.specs);
    if ('problem' in r) {
      setError(r.problem);
      return;
    }
    void save(r.specs);
  };

  const keptLabels = [...new Set(keptNow.map((k) => (isBandBox(k) ? 'Passbands' : k === 'bandpassNotes' ? labelOf(k) : `${labelOf(k)} ${texts[k] ?? ''}`.trim())))];
  const status = (() => {
    if (!current) return aiMarked && !state ? { warn: true, text: 'Filled by AI, check it.' } : null;
    if (edited) return { warn: false, text: 'You changed these values. They are not saved for others yet.' };
    if (current.source === 'model' && !current.confirmed) return { warn: true, text: 'Filled by AI, check it.' };
    if (current.source === 'seed' && !current.confirmed) return { warn: true, text: 'From the library, not yet checked against the maker.' };
    return { warn: false, text: 'From the library, confirmed.' };
  })();

  return (
    <div className="sm:col-span-2 xl:col-span-3 min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={btn} disabled={busy} aria-describedby={statusId} onClick={() => void lookup()}>
          Look up specs
        </button>
        <span className="min-w-0 break-words text-p-t1/80 font-normal text-sm">Fills the boxes below from the shared library. Every value stays editable.</span>
      </div>
      <div id={statusId} aria-live="polite" className="mt-2 min-w-0 break-words text-sm font-normal text-p-info-text">
        {message}
      </div>
      {error && (
        <p role="alert" className="mt-2 break-words bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm">
          <span aria-hidden="true">! </span>
          {error}
        </p>
      )}
      {status && (
        <div className="mt-2 min-w-0">
          <p className={`break-words text-sm font-normal ${status.warn ? 'bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text' : 'text-p-t1/80'}`}>
            {status.warn && <span aria-hidden="true">! </span>}
            {status.text}
          </p>
          {current && keptLabels.length > 0 && !edited && (
            <p className="mt-2 break-words text-sm font-normal text-p-t1/80">
              Kept your {sentenceList(keptLabels)}.{' '}
              <button type="button" className={btn} onClick={apply}>Apply library values</button>
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {edited ? (
              <button type="button" className={btn} disabled={busy} onClick={saveCorrectionClick}>Save correction for everyone</button>
            ) : (
              current && !current.confirmed && <button type="button" className={btn} disabled={busy} onClick={() => void save(undefined)}>These values are right</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
