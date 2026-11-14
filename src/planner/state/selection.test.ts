import { SELECTION_KEY, loadSelection, saveSelection } from './index';

const store = (text: string | null) => ({ getItem: (k: string) => (k === SELECTION_KEY ? text : null) });

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
    expect(() => loadSelection({ getItem: () => { throw new Error('denied'); } })).toThrow(/could not be read.*denied/);
  });
});
