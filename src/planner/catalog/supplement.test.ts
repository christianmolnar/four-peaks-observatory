import supplementData from '../data/catalog-supplement.json';
import overridesData from '../data/catalog-overrides.json';
import { applyPatches, loadOverrides, loadSupplement } from './supplement';
import type { CatalogObject } from './openngc';

const obj = (id: string, name: string, aliases?: string[]): CatalogObject => ({
  id,
  name,
  type: 'nebula',
  raHours: 1,
  decDeg: 1,
  ...(aliases === undefined ? {} : { aliases }),
});

describe('the data files', () => {
  it('say who wrote them and under which licence', () => {
    for (const f of [supplementData, overridesData]) expect(f).toMatchObject({ license: 'CC0-1.0', author: 'Four Peaks Observatory' });
  });

  it('parse, and every override says why', () => {
    expect(loadSupplement(supplementData).length).toBeGreaterThan(10);
    for (const o of loadOverrides(overridesData)) expect(o.reason.length).toBeGreaterThan(20);
  });

  it.each([
    ['no id', { entries: [{ names: ['x'] }] }],
    ['no names', { entries: [{ id: 'a', names: [] }] }],
    ['a blank name', { entries: [{ id: 'a', names: [' '] }] }],
  ])('the supplement rejects %s', (_l, raw) => {
    expect(() => loadSupplement(raw)).toThrow('catalog-supplement.json');
  });

  it.each([
    ['no reason', { entries: [{ id: 'a', name: 'B' }] }],
    ['no change', { entries: [{ id: 'a', reason: 'because of a long enough reason' }] }],
  ])('the overrides reject %s', (_l, raw) => {
    expect(() => loadOverrides(raw)).toThrow('catalog-overrides.json');
  });
});

describe('applyPatches', () => {
  const base = [obj('a', 'A', ['A1']), obj('b', 'Wrong Name', ['Other'])];

  it('adds supplement names once and leaves the input alone', () => {
    const out = applyPatches(base, { overrides: [], supplement: [{ id: 'a', names: ['Nick', 'A1', 'A'] }] });
    expect(out[0].aliases).toEqual(['A1', 'Nick']);
    expect(base[0].aliases).toEqual(['A1']);
  });

  it('an override renames, keeps the old name as an alias unless dropped, and drops names', () => {
    const out = applyPatches(base, { supplement: [], overrides: [{ id: 'b', name: 'B', dropNames: ['Wrong Name'], reason: 'test' }] });
    expect(out[1]).toMatchObject({ name: 'B', aliases: ['Other'] });
    const kept = applyPatches(base, { supplement: [], overrides: [{ id: 'b', name: 'B', reason: 'test' }] });
    expect(kept[1].aliases).toEqual(['Wrong Name', 'Other']);
  });

  it('throws on an id that is not in the catalog, and on dropping the name without a replacement', () => {
    expect(() => applyPatches(base, { overrides: [], supplement: [{ id: 'zz', names: ['x'] }] })).toThrow('"zz" is not in the catalog');
    expect(() => applyPatches(base, { supplement: [], overrides: [{ id: 'b', dropNames: ['Wrong Name'], reason: 'test' }] })).toThrow('without a replacement');
  });
});
