import { exposureFor } from '../exposure';
import { slotInputFor } from '../itinerary/resolve';
import { planTrainFor } from '../plan';
import { sampleProfile } from '../state';
import { addItem, replaceItem } from '../state/edit';
import { GEAR_LIMITS, MAX_NAME_CHARS, enterText, gearProblems, rangeText } from './limits';
import { resolveTrain, trainGearNote } from './train';
import { parseProfile, validateProfile } from './validate';
import type { Profile } from './types';

const base = (): Profile => sampleProfile();
const opticalTrain = (p: Profile) => {
  const t = p.trains.find((x) => x.kind === 'optical');
  if (!t || t.kind !== 'optical') throw new Error('no optical train');
  return t;
};
/** The sample with one number of the first optical train's gear changed. */
function withValue(kind: 'scope' | 'camera', key: string, value: number): Profile {
  const p = base();
  const t = opticalTrain(p);
  const list = kind === 'scope' ? p.equipment.scopes : p.equipment.cameras;
  const id = kind === 'scope' ? t.scopeId : t.cameraId;
  return { ...p, equipment: { ...p.equipment, [kind === 'scope' ? 'scopes' : 'cameras']: list.map((x) => (x.id === id ? { ...x, [key]: value } : x)) } };
}

describe('the ranges, defined once', () => {
  it('are the domain ranges the planner states', () => {
    expect(rangeText(GEAR_LIMITS.focalLengthMm)).toBe('50 to 10,000 mm');
    expect(rangeText(GEAR_LIMITS.apertureMm)).toBe('20 to 1,000 mm');
    expect(rangeText(GEAR_LIMITS.pixelSizeUm)).toBe('1 to 20 µm');
    expect(rangeText(GEAR_LIMITS.sensorWidthPx)).toBe('100 to 20,000 px');
    expect(rangeText(GEAR_LIMITS.factor)).toBe('0.2 to 5');
    expect(rangeText(GEAR_LIMITS.sizeMm)).toBe('10 to 100 mm');
    expect(enterText(GEAR_LIMITS.focalLengthMm)).toBe('Enter a focal length between 50 and 10,000 mm.');
    expect(MAX_NAME_CHARS).toBe(80);
  });
  it('the validator refuses a typed or imported value outside them, in a plain sentence', () => {
    for (const [key, v] of [['focalLengthMm', 49], ['focalLengthMm', 10001], ['focalLengthMm', 1e300], ['focalLengthMm', 1e-300], ['apertureMm', 19], ['apertureMm', 1001]] as const) {
      expect(() => validateProfile(withValue('scope', key, v))).toThrow(/Enter an? (focal length|aperture) between/);
    }
    for (const [key, v] of [['pixelSizeUm', 0.9], ['pixelSizeUm', 21], ['pixelSizeUm', 1e-300], ['sensorWidthPx', 99], ['sensorWidthPx', 1e12], ['sensorWidthPx', 100.5]] as const) {
      expect(() => validateProfile(withValue('camera', key, v))).toThrow(/Enter (a pixel size|a whole number for the sensor width) between/);
    }
    expect(() => validateProfile(withValue('scope', 'focalLengthMm', 50))).not.toThrow();
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
      expect(note).toMatch(/is outside .*, so no exposure is shown\. Change it in Gear\.$/);
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
    expect(save({ focalLengthMm: '-100' })).toThrow('Focal length: -100 is outside the allowed range. Enter a focal length between 50 and 10,000 mm.');
    expect(save({ focalLengthMm: 'abc' })).toThrow('Focal length: "abc" is not a number. Enter a focal length between 50 and 10,000 mm.');
    expect(save({ focalLengthMm: '99999' })).toThrow('between 50 and 10,000 mm.');
    expect(save({ focalLengthMm: '1e300' })).toThrow('between 50 and 10,000 mm.');
  });
  it('latitude, sensor width and time zone say what to enter', () => {
    const site = p.sites[0];
    const s = (t: Record<string, string>) => () => replaceItem(p, 'sites', site.id, { name: 'Site', latitude: '33', longitude: '-111', ...t });
    expect(s({ latitude: '95' })).toThrow('Latitude: 95 is outside the allowed range. Enter a latitude between -90 and 90 deg.');
    expect(s({ latitude: '' })).toThrow('Latitude: Enter a latitude between -90 and 90 deg.');
    expect(s({ timeZone: 'Mars/Olympus' })).toThrow('Time zone: "Mars/Olympus" is not a time zone name. Enter one such as America/Phoenix, or leave it empty to use your browser.');
    const cam = p.equipment.cameras[0];
    expect(() => replaceItem(p, 'cameras', cam.id, { name: 'Cam', sensorWidthPx: '0.5' })).toThrow('Sensor width: 0.5 is outside the allowed range. Enter a whole number for the sensor width between 100 and 20,000 px.');
  });
  it('an empty or a duplicate name says so plainly', () => {
    const two = addItem(p, 'scopes').equipment.scopes; // "New scope" beside the sample's scope
    expect(save({ name: '   ' })).toThrow('Name: enter a name for this scope.');
    expect(() => replaceItem(addItem(p, 'scopes'), 'scopes', two[0].id, { name: two[1].name.toUpperCase(), focalLengthMm: '800', apertureMm: '100' })).toThrow(`Name: there is already a scope named "${two[1].name.toUpperCase()}". Give this one a different name.`);
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
    expect(trainGearNote(q, t)).toBe(`Pixel size is not set for ${cam.name}, so no exposure is shown. Add it in Gear.`);
    expect(trainGearNote(p, t)).toBeNull();
  });
});
