import type { ProfileFilter } from '@/planner/profile';
import { nbRowView, readHours } from './nbRow';
import type { NbRowInput } from './nbRow';

const NBZ: ProfileFilter = { id: 'nbz', name: 'NBZ II', passbands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3: ProfileFilter = { id: 'nb3', name: 'NB3-PM', passbands: [{ centreNm: 500.7, widthNm: 21 }, { centreNm: 672.4, widthNm: 19 }] };
const UNKNOWN: ProfileFilter = { id: 'u', name: 'Mystery' };

const base: NbRowInput = {
  body: false,
  target: { id: 'ngc2237', type: 'nebula', surfaceBrightness: 22 },
  light: { kind: 'ok', minutes: 120, usableMinutes: 360 },
  gear: { fRatio: 1.9, focalLengthMm: 560, pixelUm: 3.76, colour: true, readNoiseClass: 'low' },
  bortle: 6,
  bortleAssumed: false,
  knee: 'balanced',
  filters: [NBZ, NB3, UNKNOWN],
  hoursText: undefined,
  ticks: undefined,
};

describe('readHours', () => {
  it.each([['2', 2], ['3.5', 3.5], [' 4 ', 4], ['0.25', 0.25]])('reads %j', (t, n) => expect(readHours(t)).toBe(n));
  it.each([[''], ['abc'], ['0'], ['-1'], ['49'], ['1e2'], ['2,5'], ['NaN']])('refuses %j', (t) => expect(readHours(t)).toBeNull());
});

describe('nbRowView', () => {
  it('works out the Rosette numbers from the row: B is the planned light, every gear filter is listed, recommended ones are ticked', () => {
    const v = nbRowView(base);
    if (v.kind !== 'panel') throw new Error(v.kind);
    expect(v.hours).toBe(2);
    expect(v.hoursText).toBe('2');
    expect(v.result.filters.map((f) => f.filterId)).toEqual(['nbz', 'nb3', 'u']);
    expect([...v.ticked].sort()).toEqual(['nb3', 'nbz']);
    expect(v.result.filters.find((f) => f.filterId === 'u')?.verdict).toBe('cannot-judge');
    expect(v.assumptions).toEqual([]);
  });
  it('a different typed time updates the numbers', () => {
    const at = (t: string) => {
      const v = nbRowView({ ...base, hoursText: t });
      if (v.kind !== 'panel') throw new Error(v.kind);
      return v;
    };
    expect(at('4').hours).toBe(4);
    expect(at('4').result.filters[0].minutes).not.toBe(at('2').result.filters[0].minutes);
  });
  it('a typed time that is not a number says so and gives no minutes', () => {
    const v = nbRowView({ ...base, hoursText: 'lots' });
    expect(v).toEqual({ kind: 'hours-error', hoursText: 'lots', error: expect.stringMatching(/from 0.25 to 48/) });
  });
  it('unticking removes a filter from the ticked set, and ticking restores it', () => {
    const off = nbRowView({ ...base, ticks: new Map([['nbz', false]]) });
    const on = nbRowView({ ...base, ticks: new Map([['nbz', true]]) });
    if (off.kind !== 'panel' || on.kind !== 'panel') throw new Error('panel');
    expect(off.ticked.has('nbz')).toBe(false);
    expect(off.ticked.has('nb3')).toBe(true);
    expect(on.ticked.has('nbz')).toBe(true);
  });
  it('a filter with no minutes is never ticked, even if the user ticked it before the time changed', () => {
    const v = nbRowView({ ...base, ticks: new Map([['u', true]]) });
    if (v.kind !== 'panel') throw new Error('panel');
    expect(v.ticked.has('u')).toBe(false);
  });
  it('says what it assumed: no catalog brightness, no read noise class, no Bortle class', () => {
    const v = nbRowView({ ...base, target: { id: 'ngc2237', type: 'nebula' }, gear: { fRatio: 1.9, focalLengthMm: 560, pixelUm: 3.76 }, bortleAssumed: true });
    if (v.kind !== 'panel') throw new Error('panel');
    expect(v.assumptions).toHaveLength(3);
    expect(v.assumptions.join(' ')).toMatch(/surface brightness/);
    expect(v.assumptions.join(' ')).toMatch(/read noise/);
    expect(v.assumptions.join(' ')).toMatch(/Bortle/);
  });
  it('a galaxy gives a panel whose filters all say no narrowband', () => {
    const v = nbRowView({ ...base, target: { id: 'ngc224', type: 'galaxy', surfaceBrightness: 23 } });
    if (v.kind !== 'panel') throw new Error('panel');
    expect(v.ticked.size).toBe(0);
    expect(v.result.filters.filter((f) => f.verdict !== 'cannot-judge').every((f) => /no narrowband/i.test(f.reason))).toBe(true);
  });
  it.each([
    ['a body', { body: true }],
    ['a target outside the catalog', { target: null }],
    ['no planned light', { light: { kind: 'none' as const, reason: 'x' } }],
  ])('shows nothing for %s (the mix line says why)', (_n, over) => expect(nbRowView({ ...base, ...over })).toEqual({ kind: 'hidden' }));
  it('says so for a mono camera, missing gear numbers, no filters, a target not up', () => {
    expect(nbRowView({ ...base, gear: { ...(base.gear as object), colour: false } })).toMatchObject({ kind: 'message', text: expect.stringMatching(/mono/) });
    expect(nbRowView({ ...base, gear: { fRatio: 1.9, colour: true } })).toMatchObject({ kind: 'message', text: expect.stringMatching(/focal length, the pixel size/) });
    expect(nbRowView({ ...base, gear: { problem: 'A smart scope has its filter built in.' } })).toEqual({ kind: 'message', text: 'A smart scope has its filter built in.' });
    expect(nbRowView({ ...base, filters: [] })).toMatchObject({ kind: 'message', text: expect.stringMatching(/no filters in your gear/) });
    expect(nbRowView({ ...base, light: { kind: 'ok', minutes: 60, usableMinutes: 0 } })).toMatchObject({ kind: 'message' });
  });
});
