import { SELECTION_KEY, loadSelection, saveSelection } from './index';

const store = (text: string | null) => ({ getItem: (k: string) => (k === SELECTION_KEY ? text : null), removeItem: () => {} });

describe('saved site and train choice', () => {
  it('is null when nothing is stored, and round-trips what was saved', () => {
    expect(loadSelection(store(null))).toBeNull();
    let written = '';
    saveSelection({ setItem: (_k, v) => { written = v; } }, { siteId: 's', trainId: 't' });
    expect(loadSelection(store(written))).toEqual({ siteId: 's', trainId: 't' });
  });
  it('keeps the list type with the site and train, and reads a selection saved without one', () => {
    let written = '';
    saveSelection({ setItem: (_k, v) => { written = v; } }, { siteId: 's', trainId: 't', typeId: 'globular-clusters' });
    expect(loadSelection(store(written))).toEqual({ siteId: 's', trainId: 't', typeId: 'globular-clusters' });
    expect(loadSelection(store('{"siteId":"s","trainId":"t"}'))).toEqual({ siteId: 's', trainId: 't' });
    // A type that is not text falls back to All; the site and train beside it are kept.
    expect(loadSelection(store('{"siteId":"s","trainId":"t","typeId":3}'))).toEqual({ siteId: 's', trainId: 't' });
  });
  it.each(['{nope', '[]', '{"siteId":"s"}', '{"siteId":1,"trainId":"t"}', 'null'])('says a damaged value is damaged: %s', (text) => {
    expect(() => loadSelection(store(text))).toThrow(/damaged/);
  });
  it('says blocked storage is blocked', () => {
    expect(() => loadSelection({ getItem: () => { throw new Error('denied'); }, removeItem: () => {} })).toThrow(/could not be read.*denied/);
  });
  it('removes a damaged value from storage when it reports it, and leaves a good one', () => {
    const removed: string[] = [];
    const s = (text: string) => ({ getItem: () => text, removeItem: (k: string) => { removed.push(k); } });
    expect(() => loadSelection(s('{nope'))).toThrow(/damaged/);
    expect(removed).toEqual([SELECTION_KEY]);
    loadSelection(s('{"siteId":"s","trainId":"t"}'));
    expect(removed).toEqual([SELECTION_KEY]);
  });
  it('says so when a damaged value cannot be removed', () => {
    expect(() => loadSelection({ getItem: () => 'x', removeItem: () => { throw new Error('denied'); } })).toThrow(/damaged and could not be cleared.*denied/);
  });
});
