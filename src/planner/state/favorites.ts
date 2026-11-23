import { MAX_SUBS, MAX_SUB_S, MIN_CUSTOM_SUB_S, MODE_ORDER } from '../exposure';
import type { ExposureMode } from '../exposure';
import { keepCopy, listBackups } from './plans';
import type { Backup, PlanPreset } from './plans';

/** Where the favorite exposures live in this browser (one profile per browser), and the copies kept when the stored text could not be used. */
export const FAVORITES_KEY = 'fpo-planner-favorites-v1';
export const FAVORITES_VERSION = 1;
export const FAVORITES_BACKUP_PREFIX = `${FAVORITES_KEY}.bak.`;
export const MAX_FAVORITES = 500;
const MAX_NAME = 200;

const PRESETS: readonly PlanPreset[] = [...MODE_ORDER, 'custom'];

/** One object's favorite exposure: the numbers, how they were chosen, and the gear they were chosen on (for context only). */
export interface Favorite {
  /** The catalog id; once in the store. */
  id: string;
  preset: PlanPreset;
  /** The preset a custom favorite differs from. */
  base?: ExposureMode;
  subSeconds: number;
  subCount: number;
  filterName: string;
  trainName: string;
  savedAt: string;
}

export interface FavoritesState {
  version: typeof FAVORITES_VERSION;
  favorites: Favorite[];
}

export class FavoritesError extends Error {
  constructor(
    public readonly path: string,
    public readonly detail: string,
  ) {
    super(`${path}: ${detail}`);
    this.name = 'FavoritesError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(raw: Record<string, unknown>, key: string, path: string): string {
  const v = raw[key];
  if (typeof v !== 'string' || v.length > MAX_NAME) throw new FavoritesError(`${path}.${key}`, `must be text of at most ${MAX_NAME} characters`);
  return v;
}

function checkFavorite(raw: unknown, path: string): Favorite {
  if (!isRecord(raw)) throw new FavoritesError(path, 'must be an object');
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > MAX_NAME) throw new FavoritesError(`${path}.id`, 'must be a non-empty id');
  if (!PRESETS.includes(raw.preset as PlanPreset)) throw new FavoritesError(`${path}.preset`, `must be one of ${PRESETS.join(', ')}`);
  // The store only checks the shape: a favorite saved under older limits stays in the store and is shown as not usable (`favoriteProblem`), it never empties the list.
  if (typeof raw.subSeconds !== 'number' || !Number.isFinite(raw.subSeconds) || raw.subSeconds <= 0) {
    throw new FavoritesError(`${path}.subSeconds`, 'must be a number above 0');
  }
  if (typeof raw.subCount !== 'number' || !Number.isInteger(raw.subCount) || raw.subCount < 1) {
    throw new FavoritesError(`${path}.subCount`, 'must be a whole number of 1 or more');
  }
  if (raw.base !== undefined && !MODE_ORDER.includes(raw.base as ExposureMode)) throw new FavoritesError(`${path}.base`, `must be one of ${MODE_ORDER.join(', ')}`);
  if (typeof raw.savedAt !== 'string' || Number.isNaN(Date.parse(raw.savedAt))) throw new FavoritesError(`${path}.savedAt`, 'must be a date and time');
  return {
    id: raw.id,
    preset: raw.preset as PlanPreset,
    ...(raw.base === undefined ? {} : { base: raw.base as ExposureMode }),
    subSeconds: raw.subSeconds,
    subCount: raw.subCount,
    filterName: text(raw, 'filterName', path),
    trainName: text(raw, 'trainName', path),
    savedAt: raw.savedAt,
  };
}

/** Checks a parsed value field by field. Throws FavoritesError with the path of the first problem; never repairs. */
export function validateFavorites(input: unknown): FavoritesState {
  if (!isRecord(input)) throw new FavoritesError('$', 'must be an object');
  if (input.version !== FAVORITES_VERSION) throw new FavoritesError('$.version', `must be ${FAVORITES_VERSION}, found ${JSON.stringify(input.version)}`);
  if (!Array.isArray(input.favorites)) throw new FavoritesError('$.favorites', 'must be a list');
  if (input.favorites.length > MAX_FAVORITES) throw new FavoritesError('$.favorites', `at most ${MAX_FAVORITES} favorites, found ${input.favorites.length}`);
  const ids = new Set<string>();
  const favorites = input.favorites.map((raw: unknown, i: number) => {
    const f = checkFavorite(raw, `$.favorites[${i}]`);
    if (ids.has(f.id)) throw new FavoritesError(`$.favorites[${i}].id`, `duplicate favorite "${f.id}"`);
    ids.add(f.id);
    return f;
  });
  return { version: FAVORITES_VERSION, favorites };
}

export const EMPTY_FAVORITES: FavoritesState = { version: FAVORITES_VERSION, favorites: [] };

/** What `loadFavorites` found: the favorites (null when none could be used) and the stored text that could not be used as it was. */
export interface LoadedFavorites {
  state: FavoritesState | null;
  /** `newer`: made by a newer version of the planner. `damaged`: not usable as it is. The text stays in storage; the page copies it first (`keepCopy`) and, for `newer`, never writes over it. */
  unusable: { kind: 'newer' | 'damaged'; text: string; why: string } | null;
}

/** Reads the stored favorites. Nothing is removed or repaired; a storage that cannot be read throws, in words. */
export function loadFavorites(storage: Pick<Storage, 'getItem'>): LoadedFavorites {
  let stored: string | null;
  try {
    stored = storage.getItem(FAVORITES_KEY);
  } catch (e) {
    throw new Error(`Favorites unreadable (storage blocked): ${(e as Error).message}`);
  }
  if (stored === null) return { state: null, unusable: null };
  let input: unknown;
  try {
    input = JSON.parse(stored);
  } catch {
    return { state: null, unusable: { kind: 'damaged', text: stored, why: 'it is not valid JSON' } };
  }
  if (isRecord(input) && typeof input.version === 'number' && input.version > FAVORITES_VERSION) return { state: null, unusable: { kind: 'newer', text: stored, why: 'made by a newer version of the planner' } };
  try {
    return { state: validateFavorites(input), unusable: null };
  } catch (e) {
    if (e instanceof FavoritesError) return { state: null, unusable: { kind: 'damaged', text: stored, why: `${e.path}: ${e.detail}` } };
    throw e;
  }
}

/** What another tab's stored text is to this one: whole favorites, favorites of a newer version, or text this version cannot use. */
export type StoredFavorites = { kind: 'favorites'; state: FavoritesState } | { kind: 'newer' } | { kind: 'unreadable' };

export function inspectFavorites(stored: string): StoredFavorites {
  let input: unknown;
  try {
    input = JSON.parse(stored);
  } catch {
    return { kind: 'unreadable' };
  }
  if (isRecord(input) && typeof input.version === 'number' && input.version > FAVORITES_VERSION) return { kind: 'newer' };
  try {
    return { kind: 'favorites', state: validateFavorites(input) };
  } catch (e) {
    if (e instanceof FavoritesError) return { kind: 'unreadable' };
    throw e;
  }
}

/** Validates, then stores. Throws on an invalid state and writes nothing. */
export function saveFavorites(storage: Pick<Storage, 'setItem'>, state: FavoritesState): void {
  validateFavorites(state);
  storage.setItem(FAVORITES_KEY, JSON.stringify(state));
}

/** Copies stored favorites text to a dated key of its own (never overwritten; the plans store's copy rules). Returns the key; throws when the copy cannot be written. */
export const keepFavoritesCopy = (storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>, text: string): string => keepCopy(storage, text, Date.now(), FAVORITES_BACKUP_PREFIX);

/** Every favorites copy in storage, oldest first. */
export const listFavoritesBackups = (storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Backup[] => listBackups(storage, FAVORITES_BACKUP_PREFIX);

/** The plain reason a favorite's numbers are outside today's limits (a sub under MIN_CUSTOM_SUB_S or over MAX_SUB_S, more than MAX_SUBS subs), or null when it can be used. */
export function favoriteProblem(f: Pick<Favorite, 'subSeconds' | 'subCount'>): string | null {
  if (f.subSeconds < MIN_CUSTOM_SUB_S) return `its sub length is shorter than ${MIN_CUSTOM_SUB_S} s`;
  if (f.subSeconds > MAX_SUB_S) return `its sub length is longer than the ${MAX_SUB_S} s a sub can be`;
  if (f.subCount > MAX_SUBS) return `its number of subs is more than the ${MAX_SUBS} a plan holds`;
  return null;
}

/** The favorite of this object, or null. */
export const favoriteOf = (s: FavoritesState, id: string): Favorite | null => s.favorites.find((f) => f.id === id) ?? null;

/** Adds the favorite, or replaces the one of the same object. Throws, in words, at the limit. */
export function withFavorite(s: FavoritesState, f: Favorite): FavoritesState {
  const problem = favoriteProblem(f);
  if (problem !== null) throw new Error(`The favorite was not saved: ${problem}.`);
  const others = s.favorites.filter((x) => x.id !== f.id);
  if (others.length >= MAX_FAVORITES) throw new Error(`Favorites limit: ${MAX_FAVORITES}`);
  const next = { ...s, favorites: [...others, f] };
  validateFavorites(next);
  return next;
}

/** Removes the one favorite; every other stays. */
export const withoutFavorite = (s: FavoritesState, id: string): FavoritesState => ({ ...s, favorites: s.favorites.filter((f) => f.id !== id) });
