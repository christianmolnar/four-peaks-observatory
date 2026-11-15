import { MAX_SUBS, MAX_SUB_S, MIN_CUSTOM_SUB_S } from '../exposure';
import {
  FAVORITES_BACKUP_PREFIX,
  FAVORITES_KEY,
  FAVORITES_VERSION,
  MAX_FAVORITES,
  FavoritesError,
  favoriteOf,
  favoriteProblem,
  inspectFavorites,
  keepFavoritesCopy,
  listFavoritesBackups,
  loadFavorites,
  saveFavorites,
  validateFavorites,
  withFavorite,
  withoutFavorite,
} from './favorites';
import type { Favorite, FavoritesState } from './favorites';
import { PLANS_BACKUP_PREFIX, keepCopy, listBackups } from './plans';

const fav = (id: string, extra: Partial<Favorite> = {}): Favorite => ({
  id,
  preset: 'deep',
  subSeconds: 120,
  subCount: 30,
  filterName: 'No filter',
  trainName: 'C11',
  savedAt: '2026-12-01T00:00:00.000Z',
  ...extra,
});
const state = (...ids: string[]): FavoritesState => ({ version: FAVORITES_VERSION, favorites: ids.map((i) => fav(i)) });

/** An in-memory Storage with the parts the planner uses; `failSet` makes the next writes of keys with this prefix throw. */
function memory(initial: Record<string, string> = {}, failSet: (key: string) => boolean = () => false) {
  const m = new Map(Object.entries(initial));
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failSet(k)) throw new Error('quota');
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe('the favorites store', () => {
  it('round-trips what was saved', () => {
    const s = memory();
    saveFavorites(s, state('m31', 'm42'));
    expect(loadFavorites(s)).toEqual({ state: state('m31', 'm42'), unusable: null });
  });

  it('nothing stored is no favorites and nothing unusable', () => {
    expect(loadFavorites(memory())).toEqual({ state: null, unusable: null });
  });

  it('refuses a favorite with a bad number, an unknown preset or a repeated id, naming the path', () => {
    const bad = (f: object) => () => validateFavorites({ version: 1, favorites: [f] });
    expect(bad({ ...fav('a'), subSeconds: 0 })).toThrow(FavoritesError);
    expect(bad({ ...fav('a'), subSeconds: -5 })).toThrow(/subSeconds/);
    expect(bad({ ...fav('a'), subSeconds: Number.NaN })).toThrow(/subSeconds/);
    expect(() => validateFavorites({ version: 1, favorites: [{ ...fav('a'), subSeconds: MAX_SUB_S, subCount: MAX_SUBS }] })).not.toThrow();
    expect(bad({ ...fav('a'), subCount: 2.5 })).toThrow(/subCount/);
    expect(bad({ ...fav('a'), subCount: 0 })).toThrow(/subCount/);
    expect(bad({ ...fav('a'), preset: 'ultra' })).toThrow(/preset/);
    expect(bad({ ...fav('a'), base: 'ultra' })).toThrow(/base/);
    expect(bad({ ...fav('a'), savedAt: 'not a date' })).toThrow(/savedAt/);
    expect(() => validateFavorites({ version: 1, favorites: [fav('a'), fav('a')] })).toThrow(/duplicate/);
  });

  it('keeps a favorite saved under older limits: the store loads whole, and the favorite is judged by favoriteProblem, in plain words', () => {
    const old = { version: 1, favorites: [fav('m31', { subSeconds: 600 }), fav('m42'), fav('m33', { subSeconds: MIN_CUSTOM_SUB_S / 2 }), fav('m81', { subCount: MAX_SUBS + 1 })] };
    const s = memory({ [FAVORITES_KEY]: JSON.stringify(old) });
    const loaded = loadFavorites(s);
    expect(loaded.unusable).toBeNull();
    expect(loaded.state!.favorites.map((f) => f.id)).toEqual(['m31', 'm42', 'm33', 'm81']);
    const problems = loaded.state!.favorites.map((f) => favoriteProblem(f));
    expect(problems).toEqual([
      `its sub length is longer than the ${MAX_SUB_S} s a sub can be`,
      null,
      `its sub length is shorter than ${MIN_CUSTOM_SUB_S} s`,
      `its number of subs is more than the ${MAX_SUBS} a plan holds`,
    ]);
    expect(() => saveFavorites(memory(), loaded.state!)).not.toThrow(); // removing another favorite writes the list back, old one included
    expect(withoutFavorite(loaded.state!, 'm42').favorites.map((f) => f.id)).toEqual(['m31', 'm33', 'm81']);
  });

  it('a new favorite over the limits is refused in words and the store is unchanged', () => {
    const before = state('m31');
    expect(() => withFavorite(before, fav('m42', { subSeconds: MAX_SUB_S + 1 }))).toThrow(/^The favorite was not saved: its sub length is longer/);
    expect(() => withFavorite(before, fav('m42', { subCount: MAX_SUBS + 1 }))).toThrow(/more than the 500/);
    expect(before).toEqual(state('m31'));
  });

  it('holds at most 500 favorites: the 501st is refused in words and the store is unchanged', () => {
    const full: FavoritesState = { version: FAVORITES_VERSION, favorites: Array.from({ length: MAX_FAVORITES }, (_, i) => fav(`t${i}`)) };
    expect(() => validateFavorites(full)).not.toThrow();
    expect(() => withFavorite(full, fav('one-more'))).toThrow(/at most 500/);
    expect(withFavorite(full, fav('t3', { subCount: 10 })).favorites).toHaveLength(MAX_FAVORITES); // replacing is not adding
    expect(() => validateFavorites({ ...full, favorites: [...full.favorites, fav('x')] })).toThrow(/at most 500/);
  });

  it('saving a second favorite for an object replaces the first; removing takes only that one', () => {
    const a = withFavorite(state('m31', 'm42'), fav('m31', { subCount: 99 }));
    expect(favoriteOf(a, 'm31')!.subCount).toBe(99);
    expect(a.favorites).toHaveLength(2);
    const b = withoutFavorite(a, 'm31');
    expect(b.favorites.map((f) => f.id)).toEqual(['m42']);
    expect(withoutFavorite(b, 'nothing')).toEqual(b);
  });

  it('saveFavorites writes nothing for an invalid state', () => {
    const s = memory();
    expect(() => saveFavorites(s, { version: 1, favorites: [fav('a', { subCount: 0 })] })).toThrow(FavoritesError);
    expect(s.keys()).toEqual([]);
  });
});

describe('text that cannot be used is reported, never removed or repaired', () => {
  it('damaged JSON and a field that fails are "damaged", with the text and why', () => {
    const a = loadFavorites(memory({ [FAVORITES_KEY]: '{"version":1,"favorites":[{' }));
    expect(a.state).toBeNull();
    expect(a.unusable).toMatchObject({ kind: 'damaged', text: '{"version":1,"favorites":[{', why: 'it is not valid JSON' });
    const text = JSON.stringify({ version: 1, favorites: [{ ...fav('a'), subCount: -1 }] });
    const s = memory({ [FAVORITES_KEY]: text });
    const b = loadFavorites(s);
    expect(b.unusable).toMatchObject({ kind: 'damaged', text });
    expect(b.unusable!.why).toMatch(/\$\.favorites\[0\]\.subCount/);
    expect(s.getItem(FAVORITES_KEY)).toBe(text); // still there
  });

  it('a newer version is "newer", not damaged', () => {
    const text = JSON.stringify({ version: 2, favorites: [], future: true });
    expect(loadFavorites(memory({ [FAVORITES_KEY]: text })).unusable).toMatchObject({ kind: 'newer', text });
    expect(inspectFavorites(text)).toEqual({ kind: 'newer' });
    expect(inspectFavorites('nope')).toEqual({ kind: 'unreadable' });
    expect(inspectFavorites(JSON.stringify(state('a')))).toEqual({ kind: 'favorites', state: state('a') });
  });

  it('a storage that cannot be read throws, in words', () => {
    expect(() =>
      loadFavorites({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toThrow(/could not be read \(browser storage is blocked or unavailable\): blocked/);
  });
});

describe('the dated copy reuses the plans store, in its own key space', () => {
  it('writes a copy under the favorites prefix, never overwrites one, and returns the same key for the same text', () => {
    const s = memory();
    const k1 = keepFavoritesCopy(s, 'one');
    expect(k1.startsWith(FAVORITES_BACKUP_PREFIX)).toBe(true);
    expect(keepFavoritesCopy(s, 'one')).toBe(k1);
    const k2 = keepFavoritesCopy(s, 'two');
    expect(k2).not.toBe(k1);
    expect(s.getItem(k1)).toBe('one');
    expect(listFavoritesBackups(s).map((b) => b.text)).toEqual(['one', 'two']);
  });

  it('plans copies and favorites copies do not count against or remove each other', () => {
    const s = memory();
    for (let i = 0; i < 7; i++) keepCopy(s, `plans ${i}`);
    expect(listBackups(s).map((b) => b.text)).toHaveLength(5);
    const fk = keepFavoritesCopy(s, 'fav copy');
    expect(listBackups(s)).toHaveLength(5); // the plans' newest five are untouched
    expect(s.getItem(fk)).toBe('fav copy');
    for (let i = 0; i < 7; i++) keepFavoritesCopy(s, `fav ${i}`);
    expect(listFavoritesBackups(s)).toHaveLength(5);
    expect(listBackups(s).every((b) => b.key.startsWith(PLANS_BACKUP_PREFIX))).toBe(true);
    expect(listBackups(s).map((b) => b.text)).toEqual(['plans 2', 'plans 3', 'plans 4', 'plans 5', 'plans 6']);
  });

  it('a copy that cannot be written throws and removes nothing', () => {
    const s = memory({}, (k) => k.startsWith(FAVORITES_BACKUP_PREFIX));
    expect(() => keepFavoritesCopy(s, 'x')).toThrow('quota');
    expect(s.keys()).toEqual([]);
  });

});
