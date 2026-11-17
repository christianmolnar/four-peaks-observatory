import { ProfileError, parseProfile, validateProfile } from './index';
import { sampleProfile } from '../state';
import { profileFromText, replaceItem, textsOf } from '../state/edit';
import type { Profile } from './index';

const NBZ = [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }];
const withFilter = (f: Record<string, unknown>): Profile => {
  const p = JSON.parse(JSON.stringify(sampleProfile())) as Profile;
  p.equipment.filters = [{ id: 'f1', name: 'Test dual', ...f }] as Profile['equipment']['filters'];
  p.trains = p.trains.map((t) => (t.kind === 'optical' ? { ...t, filterId: 'f1' } : t));
  return p;
};
const refusal = (f: Record<string, unknown>, lenient = false): string => {
  try {
    validateProfile(withFilter(f), { lenient });
  } catch (e) {
    expect(e).toBeInstanceOf(ProfileError);
    return (e as Error).message;
  }
  throw new Error(`accepted ${JSON.stringify(f)}`);
};

describe('a filter with passbands', () => {
  it('derives the two sums from the bands when the file has none', () => {
    const f = validateProfile(withFilter({ passbands: NBZ })).equipment.filters[0];
    expect(f).toMatchObject({ passbands: NBZ, passbandWidthNm: 17.5, narrowestBandNm: 8 });
  });
  it('round trips through JSON export and import without loss', () => {
    const once = validateProfile(withFilter({ passbands: NBZ, bandpassNotes: 'f/2', kind: 'dual-band' }));
    const text = JSON.stringify(once);
    expect(parseProfile(text)).toEqual(once);
    expect(profileFromText(text)).toEqual(once);
    expect(parseProfile(text, { lenient: true })).toEqual(once);
  });
  it('sums that agree with the bands are kept; sums that do not are refused, in both modes', () => {
    expect(validateProfile(withFilter({ passbands: NBZ, passbandWidthNm: 17.5, narrowestBandNm: 8 })).equipment.filters[0].passbandWidthNm).toBe(17.5);
    for (const lenient of [false, true]) {
      expect(refusal({ passbands: NBZ, passbandWidthNm: 20 }, lenient)).toMatch(/passbandWidthNm: Total passband width 20 nm does not match its passbands \(17\.5 nm\)/);
      expect(refusal({ passbands: NBZ, narrowestBandNm: 9 }, lenient)).toMatch(/narrowestBandNm: Narrowest band 9 nm does not match/);
    }
  });
  it('a file with no passbands is exactly what it was: sums alone stay valid and nothing is added', () => {
    const f = validateProfile(withFilter({ passbandWidthNm: 14, narrowestBandNm: 7 })).equipment.filters[0];
    expect(f).toEqual({ id: 'f1', name: 'Test dual', passbandWidthNm: 14, narrowestBandNm: 7 });
    expect('passbands' in f).toBe(false);
  });
  it('every shipped profile (the sample) loads unchanged', () => {
    const p = sampleProfile();
    expect(validateProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(p.equipment.filters.some((f) => f.passbands !== undefined)).toBe(false);
  });
  it.each([
    ['NaN', [{ centreNm: NaN, widthNm: 9 }]],
    ['a string', [{ centreNm: '656', widthNm: 9 }]],
    ['1e308', [{ centreNm: 656, widthNm: 1e308 }]],
    ['100 bands', Array.from({ length: 100 }, (_, i) => ({ centreNm: 400 + i, widthNm: 0.5 }))],
    ['a duplicate', [{ centreNm: 656, widthNm: 9 }, { centreNm: 656, widthNm: 9 }]],
    ['overlap', [{ centreNm: 656, widthNm: 20 }, { centreNm: 660, widthNm: 20 }]],
    ['width above the centre', [{ centreNm: 600, widthNm: 650 }]],
    ['an empty list', []],
    ['not a list', { centreNm: 656, widthNm: 9 }],
    ['a band that is not an object', [7]],
  ])('refuses %s with a plain sentence, in both modes', (_n, bands) => {
    for (const lenient of [false, true]) {
      const m = refusal({ passbands: bands }, lenient);
      expect(m).toMatch(/passbands/);
      expect(m).not.toMatch(/Infinity|NaN|e\+\d/);
    }
  });
  it('refuses an unknown key inside a band, naming it; a key starting with _ is a note and never copied (so __proto__ plants nothing)', () => {
    const planted = JSON.parse('{"id":"f1","name":"x","passbands":[{"centreNm":656,"widthNm":9,"__proto__":{"a":1}}]}');
    const p = withFilter({});
    p.equipment.filters = [planted];
    const kept = validateProfile(p).equipment.filters[0].passbands;
    expect(kept).toEqual([{ centreNm: 656, widthNm: 9 }]);
    expect(Object.keys(kept?.[0] ?? {})).toEqual(['centreNm', 'widthNm']);
    expect(() => validateProfile(withFilter({ passbands: [{ centreNm: 656, widthNm: 9, extra: 1 }] }))).toThrow(/passbands\[0\]\.extra: unknown field/);
    expect(({} as Record<string, unknown>).a).toBeUndefined();
  });
});

describe('the Gear form edits the bands and the sums stay consistent', () => {
  const base = () => validateProfile(withFilter({ passbands: NBZ }));
  const texts = (extra: Record<string, string> = {}) => ({ ...textsOf('filters', base().equipment.filters[0]), ...extra });
  it('textsOf gives the band boxes, empty when the filter has none', () => {
    expect(texts()).toMatchObject({ band1Centre: '656.3', band1Width: '9.5', band2Centre: '500.7', band2Width: '8', band3Centre: '', passbandWidthNm: '17.5', narrowestBandNm: '8' });
    expect(textsOf('filters', { id: 'x', name: 'x' })).toMatchObject({ band1Centre: '', band6Width: '' });
  });
  it('a band edit recomputes the sums', () => {
    const f = replaceItem(base(), 'filters', 'f1', texts({ band2Width: '12', passbandWidthNm: '', narrowestBandNm: '' })).equipment.filters[0];
    expect(f).toMatchObject({ passbands: [NBZ[0], { centreNm: 500.7, widthNm: 12 }], passbandWidthNm: 21.5, narrowestBandNm: 9.5 });
  });
  it('sums that disagree with the bands are refused in plain words, nothing saved', () => {
    expect(() => replaceItem(base(), 'filters', 'f1', texts({ passbandWidthNm: '40' }))).toThrow('Total passband width: 40 does not match the passbands (17.5 nm). Clear the box to use the passbands, or change the passbands.');
    expect(() => replaceItem(base(), 'filters', 'f1', texts({ narrowestBandNm: '3' }))).toThrow(/Narrowest band: 3 does not match the passbands \(8 nm\)/);
  });
  it('removing every band row keeps the typed sums as plain numbers and drops the field', () => {
    const cleared = texts({ band1Centre: '', band1Width: '', band2Centre: '', band2Width: '', passbandWidthNm: '17.5', narrowestBandNm: '8' });
    const f = replaceItem(base(), 'filters', 'f1', cleared).equipment.filters[0];
    expect('passbands' in f).toBe(false);
    expect(f).toMatchObject({ passbandWidthNm: 17.5, narrowestBandNm: 8 });
  });
  it('a row with one box empty, or a hostile value, is a plain problem and nothing is saved', () => {
    expect(() => replaceItem(base(), 'filters', 'f1', texts({ band2Width: '' }))).toThrow('Passband 2: enter both the centre and the width, or remove the row.');
    for (const v of ['NaN', 'abc', '1e308', '-3', '0', 'Infinity']) {
      expect(() => replaceItem(base(), 'filters', 'f1', texts({ band1Width: v }))).toThrow(/Passband 1 width/);
    }
    expect(() => replaceItem(base(), 'filters', 'f1', texts({ band2Centre: '660', band2Width: '20', band1Centre: '656', band1Width: '20' }))).toThrow(/overlap/);
  });
  it('a filter edited without passbands never gains the field', () => {
    const p = withFilter({ passbandWidthNm: 14, narrowestBandNm: 7 });
    const f = replaceItem(p, 'filters', 'f1', textsOf('filters', p.equipment.filters[0])).equipment.filters[0];
    expect(f).toEqual({ id: 'f1', name: 'Test dual', passbandWidthNm: 14, narrowestBandNm: 7 });
  });
});
