import { SELECTION_KEY, loadSelection, saveSelection } from './index';

const store = (text: string | null) => ({ getItem: (k: string) => (k === SELECTION_KEY ? text : null), removeItem: () => {} });

describe('saved site and train choice', () => {
  it('is null when nothing is stored, and round-trips what was saved', () => {
    expect(loadSelection(store(null))).toBeNull();
    let written = '';
    saveSelection({ setItem: (_k, v) => { written = v; } }, { siteId: 's', trainId: 't' });
    expect(loadSelection(store(written))).toEqual({ siteId: 's', trainId: 't' });
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
