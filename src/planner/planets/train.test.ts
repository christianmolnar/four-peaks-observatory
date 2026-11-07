import sample from '../data/sample-profile.json';
import { validateProfile } from '../profile';
import { planetTrainInfo } from './train';

const profile = validateProfile(sample);
const train = (id: string) => profile.trains.find((t) => t.id === id)!;

describe('the planetary train from the profile', () => {
  it('native C11 + ASI676MC: 0.147 arcsec/px, 8.7 arcmin field, 279.4 mm aperture; the Powermate sibling is nominal at 0.059', () => {
    const i = planetTrainInfo(profile, train('planet-c11-676'));
    expect(i.apertureMm).toBe(279.4);
    expect(i.scaleArcsecPx).toBeCloseTo(0.14733, 4);
    expect(i.fieldArcmin).toBeCloseTo(8.72, 1);
    expect(i.missing).toBeNull();
    expect(i.variants.map((v) => [v.name, v.nominal, Number(v.scaleArcsecPx.toFixed(3))])).toEqual([
      ['C11 + ASI676MC (planets)', false, 0.147],
      ['C11 + 2.5x Powermate + ASI676MC (planets)', true, 0.059],
    ]);
  });
  it('the Powermate train as selected gives the nominal scale too', () => {
    expect(planetTrainInfo(profile, train('planet-c11-powermate-676')).scaleArcsecPx).toBeCloseTo(0.05893, 4);
  });
  it('a smart scope has no numbers and says why', () => {
    const i = planetTrainInfo(profile, train('smart-seestar-s50'));
    expect(i.scaleArcsecPx).toBeUndefined();
    expect(i.variants).toEqual([]);
    expect(i.missing).toMatch(/smart scope/);
  });
  it('a scope without an aperture is named, not guessed', () => {
    const p = validateProfile({ ...sample, equipment: { ...sample.equipment, scopes: sample.equipment.scopes.map((s) => ({ ...s, apertureMm: undefined })) } });
    const i = planetTrainInfo(p, p.trains.find((t) => t.id === 'planet-c11-676')!);
    expect(i.apertureMm).toBeUndefined();
    expect(i.missing).toMatch(/no aperture/);
  });
});
