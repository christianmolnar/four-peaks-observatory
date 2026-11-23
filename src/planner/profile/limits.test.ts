import { exposureFor } from '../exposure';
import { slotInputFor } from '../itinerary/resolve';
import { planTrainFor } from '../plan';
import { sampleProfile } from '../state';
import { addItem, replaceItem } from '../state/edit';
import { profilePathInWords, profileProblemText } from '../state/words';
import { GEAR_LIMITS, MAX_NAME_CHARS, enterText, gearProblems, problemText, rangeText, siteProblems, usableSites, valueText } from './limits';
import { reducedFocalNote, resolveTrain, trainGearNote } from './train';
import { ProfileError, parseProfile, validateProfile } from './validate';
import type { Profile } from './types';

const base = (): Profile => sampleProfile();
const opticalTrain = (p: Profile) => {
  const t = p.trains.find((x) => x.kind === 'optical');
  if (!t || t.kind !== 'optical') throw new Error('no optical train');
  return t;
};
/** The sample with one number of the first optical train's gear changed. */
function withValue(kind: 'scope' | 'camera', key: string, value: unknown): Profile {
  const p = base();
  const t = opticalTrain(p);
  const list = kind === 'scope' ? p.equipment.scopes : p.equipment.cameras;
  const id = kind === 'scope' ? t.scopeId : t.cameraId;
  return { ...p, equipment: { ...p.equipment, [kind === 'scope' ? 'scopes' : 'cameras']: list.map((x) => (x.id === id ? { ...x, [key]: value } : x)) } };
}

describe('the ranges, defined once', () => {
  it('are the domain ranges the planner states', () => {
    expect(rangeText(GEAR_LIMITS.focalLengthMm)).toBe('10 to 10,000 mm');
    expect(rangeText(GEAR_LIMITS.apertureMm)).toBe('5 to 1,000 mm');
    expect(rangeText(GEAR_LIMITS.pixelSizeUm)).toBe('1 to 25 µm');
    expect(rangeText(GEAR_LIMITS.sensorWidthPx)).toBe('100 to 20,000 px');
    expect(rangeText(GEAR_LIMITS.factor)).toBe('0.2 to 5');
    expect(rangeText(GEAR_LIMITS.sizeMm)).toBe('10 to 100 mm');
    expect(enterText(GEAR_LIMITS.focalLengthMm)).toBe('Enter a focal length between 10 and 10,000 mm.');
    expect(MAX_NAME_CHARS).toBe(80);
  });
  it('the validator refuses a typed or imported value outside them, in a plain sentence', () => {
    for (const [key, v] of [['focalLengthMm', 9], ['focalLengthMm', 10001], ['focalLengthMm', 1e300], ['focalLengthMm', 1e-300], ['apertureMm', 4], ['apertureMm', 1001]] as const) {
      expect(() => validateProfile(withValue('scope', key, v))).toThrow(/Enter an? (focal length|aperture) between/);
    }
    for (const [key, v] of [['pixelSizeUm', 0.9], ['pixelSizeUm', 26], ['pixelSizeUm', 1e-300], ['sensorWidthPx', 99], ['sensorWidthPx', 1e12], ['sensorWidthPx', 100.5]] as const) {
      expect(() => validateProfile(withValue('camera', key, v))).toThrow(/Enter (a pixel size|a whole number for the sensor width) between/);
    }
    expect(() => validateProfile(withValue('scope', 'focalLengthMm', 10))).not.toThrow();
    expect(() => validateProfile(withValue('scope', 'focalLengthMm', 10000))).not.toThrow();
  });
});

describe('a stored profile with values outside the ranges', () => {
  // Sensor size is not an input of the exposure rate: it is flagged and not used for the field of view, and exposure still computes.
  const cases: [string, 'scope' | 'camera', string, number][] = [
    ['focal length 1e300', 'scope', 'focalLengthMm', 1e300],
    ['focal length 1e9', 'scope', 'focalLengthMm', 1e9],
    ['focal length 99,999', 'scope', 'focalLengthMm', 99999],
    ['aperture 1e300', 'scope', 'apertureMm', 1e300],
    ['pixel size 1e-300', 'camera', 'pixelSizeUm', 1e-300],
    ['pixel size 1e6', 'camera', 'pixelSizeUm', 1e6],
    ['sensor width 1e12', 'camera', 'sensorWidthPx', 1e12],
  ];
  const night = { moonIllumination: 0.1, moonSeparationDeg: 90, moonUp: false, usableMinutes: 300, acquisitionStart: new Date('2026-12-15T04:00:00Z'), transitTime: null };
  for (const [name, kind, key, v] of cases) {
    it(`${name}: loads with the value kept and flagged; no train, plan or exposure call throws; the exposure says why it is missing`, () => {
      const p = withValue(kind, key, v);
      const loaded = parseProfile(JSON.stringify(p), { lenient: true });
      const item = kind === 'scope' ? loaded.equipment.scopes : loaded.equipment.cameras;
      expect(JSON.stringify(item)).toContain(String(JSON.parse(JSON.stringify(v))));
      expect(gearProblems(loaded).map((g) => g.key)).toContain(key);
      expect(() => parseProfile(JSON.stringify(p))).toThrow(/Enter an? /);
      const t = opticalTrain(loaded);
      expect(() => resolveTrain(loaded, t)).not.toThrow();
      expect(() => planTrainFor(loaded, t)).not.toThrow();
      const slot = slotInputFor({ id: 'a', targetId: 'm31', trainId: t.id, filterId: null, mode: 'balanced', note: '' }, loaded, [{ id: 'm31', name: 'M31', raHours: 0.7, decDeg: 41 }] as never);
      const rig = { train: { focalRatio: slot.optics?.focalRatio, imageScale: slot.optics?.imageScale }, camera: slot.camera ?? {}, filter: null };
      let outcome: ReturnType<typeof exposureFor> | undefined;
      expect(() => {
        outcome = exposureFor({ id: 'm31', name: 'M31' } as never, rig as never, { bortle: 5 }, night, { preset: 'balanced' });
      }).not.toThrow();
      const note = trainGearNote(loaded, t);
      if (key.startsWith('sensor')) {
        expect(outcome?.ok).toBe(true);
        expect(note).toBeNull();
        return;
      }
      expect(outcome?.ok).toBe(false);
      expect(note).toMatch(/: outside .*\. No exposure\.$/);
      expect(slot.gearNote).toBe(note);
    });
  }
  it('the engine refuses a non-finite rate without throwing, whatever the rig says', () => {
    for (const rig of [
      { train: { focalRatio: Infinity, imageScale: 1 }, camera: { pixelSizeUm: 3.76 } },
      { train: { focalRatio: 5, imageScale: NaN }, camera: { pixelSizeUm: 3.76 } },
      { train: { focalRatio: 5, imageScale: 1 }, camera: { pixelSizeUm: 1e300 } },
      { train: { focalRatio: 1e-300, imageScale: 1 }, camera: { pixelSizeUm: 3.76 } },
    ]) {
      const r = exposureFor({ id: 'm31', name: 'M31' } as never, { ...rig, filter: null } as never, { bortle: 5 }, night, { preset: 'balanced' });
      expect(r.ok).toBe(false);
    }
  });
  it('at every corner of the ranges the engine gives numbers and does not throw', () => {
    const f = GEAR_LIMITS.focalLengthMm;
    const a = GEAR_LIMITS.apertureMm;
    const px = GEAR_LIMITS.pixelSizeUm;
    for (const focal of [f.min, f.max]) {
      for (const aperture of [a.min, a.max]) {
        for (const pixel of [px.min, px.max]) {
          const p = withValue('scope', 'focalLengthMm', focal);
          const t = opticalTrain(p);
          const q = { ...p, equipment: { ...p.equipment, scopes: p.equipment.scopes.map((s) => (s.id === t.scopeId ? { ...s, apertureMm: aperture } : s)), cameras: p.equipment.cameras.map((c) => (c.id === t.cameraId ? { ...c, pixelSizeUm: pixel } : c)) } };
          const slot = slotInputFor({ id: 'a', targetId: 'm31', trainId: t.id, filterId: null, mode: 'balanced', note: '' }, validateProfile(q), [{ id: 'm31', name: 'M31', raHours: 0.7, decDeg: 41 }] as never);
          const rig = { train: { focalRatio: slot.optics?.focalRatio, imageScale: slot.optics?.imageScale }, camera: slot.camera ?? {}, filter: null };
          expect(() => exposureFor({ id: 'm31', name: 'M31' } as never, rig as never, { bortle: 5 }, night, { preset: 'balanced' })).not.toThrow();
        }
      }
    }
  });
  it('a 14 mm f/2.8 lens (5 mm aperture), a 10 mm lens and a 24 µm CCD are accepted and give finite exposure numbers or a plain "not computed" sentence', () => {
    const p = base();
    const t = opticalTrain(p);
    for (const [focal, aperture, pixel] of [[14, 5, 24], [14, 5, 3.76], [10, 5, 25], [2800, 280, 24]] as const) {
      const q = validateProfile({ ...p, equipment: { ...p.equipment, scopes: p.equipment.scopes.map((s) => (s.id === t.scopeId ? { ...s, focalLengthMm: focal, apertureMm: aperture } : s)), cameras: p.equipment.cameras.map((c) => (c.id === t.cameraId ? { ...c, pixelSizeUm: pixel } : c)) }, trains: p.trains.map((x) => (x.id === t.id ? { ...t, accessoryIds: [] } : x)) });
      expect(trainGearNote(q, opticalTrain(q))).toBeNull();
      const slot = slotInputFor({ id: 'a', targetId: 'm31', trainId: t.id, filterId: null, mode: 'balanced', note: '' }, q, [{ id: 'm31', name: 'M31', raHours: 0.7, decDeg: 41 }] as never);
      const rig = { train: { focalRatio: slot.optics?.focalRatio, imageScale: slot.optics?.imageScale }, camera: slot.camera ?? {}, filter: null };
      const r = exposureFor({ id: 'm31', name: 'M31' } as never, rig as never, { bortle: 5 }, night, { preset: 'balanced' });
      if (r.ok) {
        expect(Number.isFinite(r.subSeconds) && Number.isFinite(r.subCount) && r.subSeconds > 0 && r.subCount > 0).toBe(true);
      } else {
        expect(r.missing.length).toBeGreaterThan(0);
      }
    }
  });
  it('a stored name longer than the cap is kept (it wraps); a typed one is refused with the cap said', () => {
    const p = base();
    const long = 'T'.repeat(400);
    const stored = { ...p, trains: p.trains.map((t, i) => (i === 0 ? { ...t, name: long } : t)) };
    expect(parseProfile(JSON.stringify(stored), { lenient: true }).trains[0].name).toBe(long);
    expect(() => parseProfile(JSON.stringify(stored))).toThrow(/at most 80 characters/);
    const scope = p.equipment.scopes[0];
    expect(() => replaceItem(p, 'scopes', scope.id, { name: 'S'.repeat(81), focalLengthMm: '800', apertureMm: '100' })).toThrow('Name: use at most 80 characters. This one has 81.');
    expect(replaceItem(p, 'scopes', scope.id, { name: 'S'.repeat(80), focalLengthMm: '800', apertureMm: '100' }).equipment.scopes[0].name).toHaveLength(80);
  });
});

describe('plain messages for the boxes', () => {
  const p = base();
  const scope = p.equipment.scopes[0];
  const save = (texts: Record<string, string>) => () => replaceItem(p, 'scopes', scope.id, { name: 'Scope', focalLengthMm: '800', apertureMm: '100', ...texts });
  it('a focal length outside or not a number names the range', () => {
    expect(save({ focalLengthMm: '-100' })).toThrow('Focal length: -100 is outside the allowed range. Enter a focal length between 10 and 10,000 mm.');
    expect(save({ focalLengthMm: 'abc' })).toThrow('Focal length: "abc" is not a number. Enter a focal length between 10 and 10,000 mm.');
    expect(save({ focalLengthMm: '99999' })).toThrow('between 10 and 10,000 mm.');
    expect(save({ focalLengthMm: '1e300' })).toThrow('between 10 and 10,000 mm.');
  });
  it('latitude, sensor width and time zone say what to enter', () => {
    const site = p.sites[0];
    const s = (t: Record<string, string>) => () => replaceItem(p, 'sites', site.id, { name: 'Site', latitude: '33', longitude: '-111', ...t });
    expect(s({ latitude: '95' })).toThrow('Latitude: 95 is outside the allowed range. Enter a latitude between -90 and 90 deg.');
    expect(s({ latitude: '' })).toThrow('Latitude: the box is empty. Enter a latitude between -90 and 90 deg.');
    expect(s({ timeZone: 'Mars/Olympus' })).toThrow('Time zone: "Mars/Olympus" is not a time zone name. Example: America/Phoenix.');
    const cam = p.equipment.cameras[0];
    expect(() => replaceItem(p, 'cameras', cam.id, { name: 'Cam', sensorWidthPx: '0.5' })).toThrow('Sensor width: 0.5 is outside the allowed range. Enter a whole number for the sensor width between 100 and 20,000 px.');
  });
  it('an empty or a duplicate name says so plainly', () => {
    const two = addItem(p, 'scopes').equipment.scopes; // "New scope" beside the sample's scope
    expect(save({ name: '   ' })).toThrow('Name: enter a name for this scope.');
    expect(() => replaceItem(addItem(p, 'scopes'), 'scopes', two[0].id, { name: two[1].name.toUpperCase(), focalLengthMm: '800', apertureMm: '100' })).toThrow(`Name: scope "${two[1].name.toUpperCase()}" exists already.`);
  });
});

describe('rows with no pixel size', () => {
  it('say which camera, and what to do, in one sentence', () => {
    const p = base();
    const t = opticalTrain(p);
    const cam = p.equipment.cameras.find((c) => c.id === t.cameraId)!;
    const { pixelSizeUm: _x, ...rest } = cam;
    void _x;
    const q = { ...p, equipment: { ...p.equipment, cameras: p.equipment.cameras.map((c) => (c.id === cam.id ? rest : c)) } };
    expect(trainGearNote(q, t)).toBe(`Pixel size not set for ${cam.name}. No exposure.`);
    expect(trainGearNote(p, t)).toBeNull();
  });
});

describe('a stored value that is negative, zero, empty or text (round 3)', () => {
  it('loads leniently, is flagged in words, and the planner leaves it out', () => {
    for (const v of [-100, 0, null, 'abc']) {
      const p = withValue('scope', 'focalLengthMm', v as never);
      expect(() => parseProfile(JSON.stringify(p))).toThrow(/Enter a focal length between 10 and 10,000 mm\. It is /); // typed or imported: refused
      const loaded = parseProfile(JSON.stringify(p), { lenient: true });
      const [flag] = gearProblems(loaded);
      expect(flag.key).toBe('focalLengthMm');
      expect(problemText(flag)).not.toMatch(/\$\.|undefined|NaN/);
      expect(trainGearNote(loaded, opticalTrain(loaded))).toMatch(typeof v === 'number' ? /\(-?\d+ mm\): outside 10 to 10,000 mm\. No exposure\.$/ : /: (nothing|"abc"), not a number\. No exposure\.$/);
    }
  });
  it('reads absurd values plainly and a text value as not a number', () => {
    expect(problemText({ key: 'focalLengthMm', value: 1e300 })).toBe('Focal length: impossibly large number, outside 10 to 10,000 mm.');
    expect(problemText({ key: 'pixelSizeUm', value: 1e-300 })).toBe('Pixel size: impossibly small number, outside 1 to 25 µm.');
    expect(problemText({ key: 'focalLengthMm', value: -100 })).toBe('Focal length -100 mm: outside 10 to 10,000 mm.');
    expect(problemText({ key: 'focalLengthMm', value: 'abc' })).toBe('Focal length: "abc", not a number. Use 10 to 10,000 mm.');
    expect(problemText({ key: 'focalLengthMm', value: null })).toMatch(/: nothing, not a number/);
  });
  it('a profile problem is told by item and box, never by path', () => {
    const p = JSON.parse(JSON.stringify(base()));
    p.equipment.cameras[0].sensorWidthPx = 'wide';
    const bad = (() => { try { parseProfile(JSON.stringify(p)); } catch (e) { return e as ProfileError; } throw new Error('no error'); })();
    expect(profileProblemText(bad, p)).toBe(`Camera "${p.equipment.cameras[0].name}", sensor width: Enter a whole number for the sensor width between 100 and 20,000 px. It is "wide".`);
    expect(profilePathInWords('$.trains[1].accessoryIds[0]', p)).toBe(`train "${p.trains[1].name}", accessory 1`);
    expect(profilePathInWords('$', p)).toBe('the saved profile');
  });
});

describe('round 4: odd stored types and the whole-scope range', () => {
  it('the whole-scope focal length range is the scope range: one floor', () => {
    expect(GEAR_LIMITS.effectiveFocalLengthMm.min).toBe(GEAR_LIMITS.focalLengthMm.min);
    expect(GEAR_LIMITS.effectiveFocalLengthMm.max).toBe(GEAR_LIMITS.focalLengthMm.max);
  });

  it.each([
    [{}, 'something that is not a number'],
    [[1], 'something that is not a number'],
    ['abc', '"abc"'],
    [null, 'nothing'],
    [true, '"true"'],
  ])('a stored %j reads in words, never "[object Object]", and is not called "outside" the range', (value, shown) => {
    expect(valueText('focalLengthMm', value)).toBe(shown);
    const text = problemText({ key: 'focalLengthMm', value });
    expect(text).not.toMatch(/\[object|outside/);
    expect(text).toContain('not a number. Use 10 to 10,000 mm.');
  });

  it('a site with a bad number is kept, flagged and not usable', () => {
    const p = base();
    const bad = { ...p, sites: [{ ...p.sites[0], latitude: -100 }, { ...p.sites[0], id: 'ok', name: 'Fine' }] };
    const kept = validateProfile(bad, { lenient: true });
    expect(kept.sites[0].latitude).toBe(-100);
    expect(siteProblems(kept).map((x) => [x.id, x.key])).toEqual([[p.sites[0].id, 'latitude']]);
    expect(usableSites(kept).map((s) => s.id)).toEqual(['ok']);
    expect(problemText({ key: 'latitude', value: -100 })).toBe('Latitude -100 deg: outside -90 to 90 deg.');
    expect(() => validateProfile(bad)).toThrow(ProfileError); // typed or imported: still refused
  });

  it('a 14 mm lens with a 0.7x reducer is 9.8 mm: a note, and the exposure is still given', () => {
    const p = base();
    const t = opticalTrain(p);
    const scopes = [...p.equipment.scopes, { id: 'wide', name: '14 mm lens', focalLengthMm: 14, apertureMm: 5 }];
    const accessories = [...p.equipment.accessories, { id: 'red', name: 'Reducer 0.7x', factor: 0.7 }];
    const next: Profile = { ...p, equipment: { ...p.equipment, scopes, accessories } };
    const train = { ...t, scopeId: 'wide', accessoryIds: ['red'] };
    expect(reducedFocalNote(next, train)).toBe('Focal length 9.8 mm, under 10 mm');
    expect(trainGearNote(next, train)).toBeNull();
    expect(reducedFocalNote(next, { ...train, accessoryIds: [] })).toBeNull();
    expect(reducedFocalNote(next, { ...train, scopeId: t.scopeId })).toBeNull(); // 2800 mm x 0.7 is far over the floor
  });
});
