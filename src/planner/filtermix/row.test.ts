import { NOT_IN_CATALOG_MIX_TEXT, NOT_UP_MIX_TEXT, NO_PROFILE_MIX_TEXT, SOLAR_MIX_TEXT, rowMix } from './row';
import type { RowMixInput } from './row';

const NB3 = { id: 'nb3', name: 'NB3-PM', bands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] };
const base: RowMixInput = { body: false, target: { id: 'm42', type: 'nebula' }, light: { kind: 'ok', minutes: 120, usableMinutes: 300 }, filters: [NB3], noFilters: 'No filter in the setup.' };

describe('rowMix', () => {
  it('works out the mix from the row’s own light', () => {
    const r = rowMix(base);
    expect(r.kind).toBe('mix');
    if (r.kind === 'mix') expect(r.availableMin).toBe(120);
  });

  it('says why there is no number, in plain words, for each case', () => {
    expect(rowMix({ ...base, body: true })).toEqual({ kind: 'message', text: SOLAR_MIX_TEXT });
    expect(rowMix({ ...base, target: null })).toEqual({ kind: 'message', text: NOT_IN_CATALOG_MIX_TEXT });
    expect(rowMix({ ...base, light: { kind: 'none', reason: 'Numbers appear once the night has loaded.' } })).toEqual({ kind: 'message', text: 'No planned light to split yet. Numbers appear once the night has loaded.' });
    expect(rowMix({ ...base, light: { kind: 'ok', minutes: 0, usableMinutes: 0 } })).toEqual({ kind: 'message', text: NOT_UP_MIX_TEXT });
    expect(rowMix({ ...base, light: { kind: 'ok', minutes: 0, usableMinutes: 200 } })).toEqual({ kind: 'message', text: NOT_UP_MIX_TEXT });
    expect(rowMix({ ...base, target: { id: 'm42', type: 'star' } })).toEqual({ kind: 'message', text: NO_PROFILE_MIX_TEXT });
    expect(rowMix({ ...base, filters: [] })).toEqual({ kind: 'message', text: 'No filter in the setup.' });
  });

  it('a filter without bands is named and the rest of the message is the engine’s', () => {
    const r = rowMix({ ...base, filters: [{ id: 'x', name: 'Mystery' }] });
    expect(r.kind).toBe('none');
    if (r.kind === 'none') expect(r.skipped[0]).toMatchObject({ name: 'Mystery', verdict: 'skipped' });
  });

  it('never prints NaN or Infinity for odd light', () => {
    for (const minutes of [Number.NaN, Infinity, -1]) {
      const r = rowMix({ ...base, light: { kind: 'ok', minutes, usableMinutes: 100 } });
      expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
    }
  });
});
