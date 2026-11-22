'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_FAVORITES,
  FAVORITES_KEY,
  inspectFavorites,
  keepFavoritesCopy,
  listFavoritesBackups,
  loadFavorites,
  saveFavorites,
} from '@/planner/state/favorites';
import type { FavoritesState } from '@/planner/state/favorites';

/** What a held store says, in plain words: saving is off and the stored text is not touched. */
const HELD_TEXT = {
  newer: 'Your saved favorites were made by a newer version of the planner, so saving favorites is off here.',
  nocopy: 'Your saved favorites could not be read whole and no copy could be kept, so saving favorites is off here. Free some browser storage and reload; if it stays, use Reset all in the Gear tab.',
  othertab: 'Another tab saved favorites this page cannot use, so saving favorites is off here. Reload this tab; if it still cannot be read, use Reset all in the Gear tab.',
} as const;
type HeldWhy = keyof typeof HELD_TEXT;

/** The result of a change: done, or why not (said in words by the caller). */
export type FavoritesResult = { ok: true } | { ok: false; message: string };

export interface FavoritesApi {
  state: FavoritesState;
  /** Plain words for why saving favorites is off (a held store), or null. */
  blocked: string | null;
  /** Makes the next favorites from the latest stored ones (another tab's save is taken up first) and stores them. Nothing changes when it is refused or the write fails. */
  change: (edit: (s: FavoritesState) => FavoritesState) => FavoritesResult;
  /** What was found when the favorites were read (damaged, copied, held), in plain words; empty when all was well. */
  notes: string[];
  /** Clears `notes` once the user has read them. */
  clearNotes: () => void;
  /** Forgets what was read, after Reset all removed the stored copies. */
  reset: () => void;
}

const readText = (): string | null => {
  try {
    return window.localStorage.getItem(FAVORITES_KEY);
  } catch {
    return null;
  }
};

/**
 * The favorite exposures: read once the page is in the browser, kept in step with other tabs, and written only from the latest stored
 * text. Text that cannot be used is copied to a dated key first (the plans store's `keepCopy`); a newer version's text, or text whose copy
 * failed, is held: never written over, saving is off, and `blocked` says why. `notes` are the sentences the page shows about what was found.
 */
export function useFavorites(): FavoritesApi {
  const [state, setState] = useState<FavoritesState>(EMPTY_FAVORITES);
  const [heldWhy, setHeldWhy] = useState<HeldWhy | null>(null);
  const stateRef = useRef<FavoritesState>(EMPTY_FAVORITES);
  // The text this tab last read or wrote: a different text in storage is another tab's save.
  const savedText = useRef<string | null>(null);
  // The stored text this tab holds back (never written over).
  const heldText = useRef<string | null>(null);
  const heldWhyRef = useRef<HeldWhy | null>(null);
  heldWhyRef.current = heldWhy;
  const [notes, setNotes] = useState<string[]>([]);

  const adopt = useCallback((next: FavoritesState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const hold = useCallback((text: string, why: HeldWhy) => {
    heldText.current = text;
    setHeldWhy(why);
  }, []);
  const release = useCallback(() => {
    heldText.current = null;
    setHeldWhy(null);
  }, []);

  useEffect(() => {
    try {
      const r = loadFavorites(window.localStorage);
      savedText.current = readText();
      if (r.state !== null) adopt(r.state);
      if (r.unusable === null) return;
      const { kind, text, why } = r.unusable;
      if (kind === 'newer') {
        hold(text, 'newer');
        return;
      }
      try {
        const key = keepFavoritesCopy(window.localStorage, text);
        const n = listFavoritesBackups(window.localStorage).length;
        setNotes([`Your saved favorites could not be read (${why}), so they start over. A copy is kept under the backup name "${key}"; ${n} ${n === 1 ? 'copy is' : 'copies are'} kept in this browser.`]);
      } catch (e) {
        hold(text, 'nocopy');
        setNotes([`The copy of your damaged favorites failed: ${(e as Error).message}.`]);
      }
    } catch (e) {
      setNotes([(e as Error).message]);
    }
  }, [adopt, hold]);

  // Another tab saved, cleared or reset the favorites: this tab follows. Text it cannot use is held; a held tab follows too.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key !== null && e.key !== FAVORITES_KEY) return;
      const text = e.key === null ? readText() : e.newValue;
      if (text === null) {
        release();
        savedText.current = null;
        adopt(EMPTY_FAVORITES);
        return;
      }
      if (text === heldText.current) return;
      const found = inspectFavorites(text);
      if (found.kind === 'favorites') {
        release();
        savedText.current = text;
        adopt(found.state);
      } else hold(text, found.kind === 'newer' ? 'newer' : 'othertab');
    };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, [adopt, hold, release]);

  const change = useCallback(
    (edit: (s: FavoritesState) => FavoritesState): FavoritesResult => {
      if (heldText.current !== null) return { ok: false, message: HELD_TEXT[heldWhyRef.current ?? 'othertab'] };
      let base = stateRef.current;
      const text = readText();
      if (text === null && savedText.current !== null) base = EMPTY_FAVORITES; // cleared in another tab
      else if (text !== null && text !== savedText.current) {
        const found = inspectFavorites(text);
        if (found.kind !== 'favorites') {
          const why: HeldWhy = found.kind === 'newer' ? 'newer' : 'othertab';
          hold(text, why);
          return { ok: false, message: HELD_TEXT[why] };
        }
        base = found.state;
      }
      let next: FavoritesState;
      try {
        next = edit(base);
        saveFavorites(window.localStorage, next);
      } catch (e) {
        return { ok: false, message: `Favorite not saved: ${(e as Error).message}` };
      }
      savedText.current = readText();
      adopt(next);
      return { ok: true };
    },
    [adopt, hold],
  );
  const reset = useCallback(() => {
    release();
    savedText.current = null;
    setNotes([]);
    adopt(EMPTY_FAVORITES);
  }, [adopt, release]);

  const clearNotes = useCallback(() => setNotes([]), []);
  return { state, blocked: heldWhy === null ? null : HELD_TEXT[heldWhy], notes, clearNotes, change, reset };
}
