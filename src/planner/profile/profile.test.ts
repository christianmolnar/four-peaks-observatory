import {
  ProfileError,
  arcToHorizonPoints,
  emptyProfile,
  parseProfile,
  migrateProfile,
  validateProfile,
} from './index';
import { horizonAltitudeAt, limitAltitudeAt } from '../horizon';
import type { Profile } from './index';

// Neutral fixture; no real gear or places.
const full = (): Profile => ({
  version: 3,
  sites: [
    { id: 's1', name: 'Test Ridge', latitude: 40, longitude: -105, elevationM: 1500, blockedArcs: [{ startAz: 100, endAz: 200, heightDeg: 30 }] },
    { id: 's2', name: 'Open Field', latitude: -33, longitude: 151, blockedArcs: [] },
  ],
  equipment: {
    scopes: [{ id: 'sc', name: 'Scope', focalLengthMm: 1000, apertureMm: 200 }],
    accessories: [{ id: 'ac', name: 'Reducer', factor: 0.8 }],
    cameras: [{ id: 'cm', name: 'Cam', pixelSizeUm: 4, sensorWidthPx: 4000, sensorHeightPx: 3000, colour: true, hasUvIrCut: false, readNoiseClass: 'low' }],
    smartScopes: [{ id: 'sm', name: 'Smart', mountMode: 'eq', focalLengthMm: 250 }],
    filters: [
      { id: 'f1', name: 'Test dual', kind: 'dual-band', sizeMm: 48, bandpassNotes: 'Ha 7, OIII 7', passbandWidthNm: 14, narrowestBandNm: 7, blocksUvIr: true, ratedMinFRatio: 3, maxIncidentAngleDeg: 8 },
      { id: 'f2', name: 'Bare filter' },
    ],
  },
  trains: [
    { kind: 'optical', id: 't1', name: 'Main', scopeId: 'sc', accessoryIds: ['ac'], cameraId: 'cm', filterId: 'f1' },
    { kind: 'smart', id: 't2', name: 'Smart', smartScopeId: 'sm' },
  ],
  plans: [{ id: 'p1', name: 'Night', date: '2026-12-05', siteId: 's1', trainId: 't1', targetIds: ['m42'], notes: 'bring dew heater' }],
});

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const failsAt = (mutate: (p: any) => void, path: string): void => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = clone(full());
  mutate(p);
  try {
    validateProfile(p);
  } catch (e) {
    expect(e).toBeInstanceOf(ProfileError);
    expect((e as Error).message.startsWith(path)).toBe(true);
    return;
  }
  throw new Error(`expected a ProfileError at ${path}`);
};

describe('validateProfile', () => {
  it('accepts an empty profile', () => {
    expect(validateProfile(emptyProfile())).toEqual(emptyProfile());
  });

  it('accepts a full profile unchanged', () => {
    expect(validateProfile(full())).toEqual(full());
  });

  it('rejects bad values with the field path', () => {
    failsAt((p) => { p.sites[0].latitude = 95; }, '$.sites[0].latitude');
    failsAt((p) => { p.sites[1].longitude = 'west'; }, '$.sites[1].longitude');
    failsAt((p) => { p.equipment.scopes[0].focalLengthMm = -5; }, '$.equipment.scopes[0].focalLengthMm');
    failsAt((p) => { p.equipment.cameras[0].sensorWidthPx = 10.5; }, '$.equipment.cameras[0].sensorWidthPx');
    failsAt((p) => { p.equipment.accessories[0].factor = 0; }, '$.equipment.accessories[0].factor');
    failsAt((p) => { p.equipment.smartScopes[0].mountMode = 'polar'; }, '$.equipment.smartScopes[0].mountMode');
    failsAt((p) => { p.trains[0].kind = 'weird'; }, '$.trains[0].kind');
    failsAt((p) => { p.plans[0].date = '2026-02-30'; }, '$.plans[0].date');
    failsAt((p) => { p.plans[0].targetIds = [3]; }, '$.plans[0].targetIds[0]');
    failsAt((p) => { p.version = 4; }, '$.version');
    failsAt((p) => { p.version = 0; }, '$.version');
    failsAt((p) => { p.equipment.filters[0].kind = 'rainbow'; }, '$.equipment.filters[0].kind');
    failsAt((p) => { p.equipment.filters[0].sizeMm = -48; }, '$.equipment.filters[0].sizeMm');
    failsAt((p) => { p.equipment.filters[0].blocksUvIr = 'yes'; }, '$.equipment.filters[0].blocksUvIr');
    failsAt((p) => { p.equipment.filters[0].ratedMinFRatio = 0; }, '$.equipment.filters[0].ratedMinFRatio');
    failsAt((p) => { p.equipment.filters[0].maxIncidentAngleDeg = 90; }, '$.equipment.filters[0].maxIncidentAngleDeg');
    failsAt((p) => { p.equipment.filters[0].bandwith = 7; }, '$.equipment.filters[0].bandwith');
    failsAt((p) => { p.equipment.filters[1].id = 'f1'; }, '$.equipment.filters[1].id');
    failsAt((p) => { delete p.equipment.filters; }, '$.equipment.filters');
    failsAt((p) => { p.equipment.cameras[0].readNoiseClass = 'tiny'; }, '$.equipment.cameras[0].readNoiseClass');
    failsAt((p) => { p.equipment.cameras[0].hasUvIrCut = 'no'; }, '$.equipment.cameras[0].hasUvIrCut');
    failsAt((p) => { p.trains[0].filterId = 'nope'; }, '$.trains[0].filterId');
    failsAt((p) => { p.trains[0].filterId = ''; }, '$.trains[0].filterId');
    failsAt((p) => { delete p.equipment; }, '$.equipment');
  });

  it('rejects bad arcs', () => {
    failsAt((p) => { p.sites[0].blockedArcs[0].heightDeg = 120; }, '$.sites[0].blockedArcs[0].heightDeg');
    failsAt((p) => { p.sites[0].blockedArcs[0].endAz = 100; }, '$.sites[0].blockedArcs[0]');
    failsAt((p) => { p.sites[0].blockedArcs[0].startAz = 360; }, '$.sites[0].blockedArcs[0].startAz');
    failsAt((p) => { p.sites[0].blockedArcs = [{ startAz: 0, endAz: 359.95, heightDeg: 10 }]; }, '$.sites[0].blockedArcs[0]');
    failsAt((p) => { delete p.sites[0].blockedArcs; }, '$.sites[0].blockedArcs');
    failsAt((p) => { p.sites[0].blockedArcs = null; }, '$.sites[0].blockedArcs');
  });

  it('explains arcs that cannot be fixed by the old advice', () => {
    const msg = (arc: unknown): string => {
      const p = clone(full()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
      p.sites[0].blockedArcs = [arc];
      try { validateProfile(p); } catch (e) { return (e as Error).message; }
      throw new Error('expected an error');
    };
    // 0 to 360 is a zero-length arc once 360 becomes 0: do not say "use 0 instead of 360".
    expect(msg({ startAz: 0, endAz: 360, heightDeg: 10 })).not.toMatch(/use 0 instead/);
    expect(msg({ startAz: 0, endAz: 360, heightDeg: 10 })).toMatch(/start and end must differ/);
    // A near-full arc must not be told to use null, which means nothing is blocked.
    expect(msg({ startAz: 0, endAz: 359.95, heightDeg: 10 })).not.toMatch(/use null/);
    expect(msg({ startAz: 0, endAz: 359.95, heightDeg: 10 })).toMatch(/shorten it/);
    // The advice still works where it applies.
    const p = clone(full());
    p.sites[0].blockedArcs = [{ startAz: 100, endAz: 360, heightDeg: 10 }];
    expect(() => validateProfile(p)).toThrow('$.sites[0].blockedArcs[0].endAz: use 0 instead of 360');
    p.sites[0].blockedArcs = [{ startAz: 100, endAz: 0, heightDeg: 10 }];
    expect(() => validateProfile(p)).not.toThrow();
  });

  it('rejects unknown fields with their path, but allows _ notes', () => {
    failsAt((p) => { p.equipment.scopes[0].focalLengthmm = 2800; }, '$.equipment.scopes[0].focalLengthmm');
    failsAt((p) => { p.sites[0].lat = 1; }, '$.sites[0].lat');
    failsAt((p) => { p.sites[0].blockedArcs[0].heigthDeg = 1; }, '$.sites[0].blockedArcs[0].heigthDeg');
    failsAt((p) => { p.equipment.accessories[0].factr = 1; }, '$.equipment.accessories[0].factr');
    failsAt((p) => { p.equipment.cameras[0].pixelSize = 1; }, '$.equipment.cameras[0].pixelSize');
    failsAt((p) => { p.equipment.smartScopes[0].mount = 'eq'; }, '$.equipment.smartScopes[0].mount');
    failsAt((p) => { p.trains[0].camera = 'x'; }, '$.trains[0].camera');
    failsAt((p) => { p.trains[1].scopeId = 'x'; }, '$.trains[1].scopeId');
    failsAt((p) => { p.plans[0].target = 'x'; }, '$.plans[0].target');
    failsAt((p) => { p.equipment.extra = []; }, '$.equipment.extra');
    failsAt((p) => { p.extra = 1; }, '$.extra');
    const p = clone(full()) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    p._comment = 'x';
    p.sites[0]._source = 'y';
    p.sites[0].blockedArcs[0]._note = 'z';
    p.trains[0]._why = 'w';
    expect(() => validateProfile(p)).not.toThrow();
  });

  it('rejects duplicate ids and dangling references', () => {
    failsAt((p) => { p.trains[0].cameraId = 'nope'; }, '$.trains[0].cameraId');
    failsAt((p) => { p.sites[1].id = 's1'; }, '$.sites[1].id');
    failsAt((p) => { p.trains[0].scopeId = 'nope'; }, '$.trains[0].scopeId');
    failsAt((p) => { p.trains[0].accessoryIds = ['nope']; }, '$.trains[0].accessoryIds[0]');
    failsAt((p) => { p.trains[1].smartScopeId = 'nope'; }, '$.trains[1].smartScopeId');
    failsAt((p) => { p.plans[0].siteId = 'nope'; }, '$.plans[0].siteId');
    failsAt((p) => { p.plans[0].trainId = 'nope'; }, '$.plans[0].trainId');
  });

  it('allows unknown specs to be absent but not present and wrong', () => {
    const p = clone(full());
    delete (p.equipment.scopes[0] as { focalLengthMm?: number }).focalLengthMm;
    expect(validateProfile(p).equipment.scopes[0].focalLengthMm).toBeUndefined();
    (p.equipment.scopes[0] as { focalLengthMm?: unknown }).focalLengthMm = null;
    expect(() => validateProfile(p)).toThrow('$.equipment.scopes[0].focalLengthMm');
  });
});

describe('parseProfile', () => {
  it('round-trips JSON text', () => {
    expect(parseProfile(JSON.stringify(full()))).toEqual(full());
  });

  it('says what is wrong with malformed JSON', () => {
    expect(() => parseProfile('{"version": 1,')).toThrow(/^\$: not valid JSON/);
    expect(() => parseProfile('')).toThrow(/not valid JSON/);
  });

  it('rejects non-objects', () => {
    expect(() => parseProfile('[]')).toThrow('$: expected an object');
    expect(() => parseProfile('null')).toThrow('$: expected an object');
  });

  it('names the field when a value is wrong', () => {
    const bad = clone(full());
    bad.sites[0].latitude = 200;
    expect(() => parseProfile(JSON.stringify(bad))).toThrow(/\$\.sites\[0\]\.latitude: expected a number from -90 to 90/);
  });
});

describe('arcToHorizonPoints', () => {
  it('arc 120 to 320 at 42: limit 42 at az 200, none at az 90, correct on both edges', () => {
    const pts = arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
    expect(horizonAltitudeAt(pts, 200)).toBe(42);
    expect(horizonAltitudeAt(pts, 90)).toBe(0);
    expect(horizonAltitudeAt(pts, 120)).toBe(42);
    expect(horizonAltitudeAt(pts, 320)).toBe(42);
    expect(horizonAltitudeAt(pts, 119.9)).toBe(0);
    expect(horizonAltitudeAt(pts, 320.1)).toBe(0);
    expect(horizonAltitudeAt(pts, 0)).toBe(0);
    expect(limitAltitudeAt(pts, 200, 20)).toBe(42);
    expect(limitAltitudeAt(pts, 90, 20)).toBe(20);
  });

  it('wraps across north: arc 300 to 60', () => {
    const pts = arcToHorizonPoints([{ startAz: 300, endAz: 60, heightDeg: 35 }]);
    for (const az of [300, 330, 359.99, 0, 360, 30, 60]) {
      expect(horizonAltitudeAt(pts, az)).toBe(35);
    }
    for (const az of [61, 120, 180, 299]) {
      expect(horizonAltitudeAt(pts, az)).toBe(0);
    }
  });

  it('wrap when the start edge sits at 0 and the end edge at 359', () => {
    const pts = arcToHorizonPoints([{ startAz: 0, endAz: 90, heightDeg: 20 }]);
    expect(horizonAltitudeAt(pts, 0)).toBe(20);
    expect(horizonAltitudeAt(pts, 90)).toBe(20);
    expect(horizonAltitudeAt(pts, 359.995)).toBeCloseTo(10, 5); // inside the edge step
    expect(horizonAltitudeAt(pts, 200)).toBe(0);
  });

  it('returns sorted points with no duplicate azimuths', () => {
    const pts = arcToHorizonPoints([{ startAz: 300, endAz: 60, heightDeg: 35 }]);
    expect(pts).toHaveLength(4);
    expect(pts.map((p) => p.az)).toEqual([...pts.map((p) => p.az)].sort((a, b) => a - b));
    expect(new Set(pts.map((p) => p.az)).size).toBe(4);
  });

  it('no arc is a set, clear horizon', () => {
    const pts = arcToHorizonPoints([]);
    expect(horizonAltitudeAt(pts, 123)).toBe(0);
  });

  it('refuses arcs too narrow to place their edges', () => {
    expect(() => arcToHorizonPoints([{ startAz: 10, endAz: 10.001, heightDeg: 5 }])).toThrow(RangeError);
  });
});

describe('filters and the v1 -> v2 migration', () => {
  // A profile as the v1 app saved it: no filters, no camera window or colour fields.
  const v1Text = JSON.stringify({
    version: 1,
    sites: [{ id: 's1', name: 'Saved Ridge', latitude: 40, longitude: -105, blockedArc: { startAz: 100, endAz: 200, heightDeg: 33 } }],
    equipment: {
      scopes: [{ id: 'sc', name: 'Scope', focalLengthMm: 1000, apertureMm: 200 }],
      accessories: [{ id: 'ac', name: 'Reducer', factor: 0.8 }],
      cameras: [{ id: 'cm', name: 'Cam', pixelSizeUm: 4, sensorWidthPx: 4000, sensorHeightPx: 3000 }],
      smartScopes: [{ id: 'sm', name: 'Smart', mountMode: 'eq' }],
    },
    trains: [{ kind: 'optical', id: 't1', name: 'Main', scopeId: 'sc', accessoryIds: ['ac'], cameraId: 'cm' }],
    plans: [{ id: 'p1', name: 'Night', date: '2026-12-05', siteId: 's1', trainId: 't1', targetIds: ['m42'], notes: 'kept' }],
  });

  it('loads a saved v1 profile as v3, keeps every field, and adds an empty filter library', () => {
    const p = parseProfile(v1Text);
    expect(p.version).toBe(3);
    expect(p.equipment.filters).toEqual([]);
    const old = JSON.parse(v1Text);
    expect(p.sites).toEqual([{ id: 's1', name: 'Saved Ridge', latitude: 40, longitude: -105, blockedArcs: [old.sites[0].blockedArc] }]);
    expect(p.equipment.scopes).toEqual(old.equipment.scopes);
    expect(p.equipment.accessories).toEqual(old.equipment.accessories);
    expect(p.equipment.cameras).toEqual(old.equipment.cameras);
    expect(p.equipment.smartScopes).toEqual(old.equipment.smartScopes);
    expect(p.trains).toEqual(old.trains);
    expect(p.plans).toEqual(old.plans);
    expect(p.trains[0]).not.toHaveProperty('filterId');
  });

  it('migrateProfile does not mutate its input and leaves unknown versions to the validator', () => {
    const input = JSON.parse(v1Text);
    const before = JSON.stringify(input);
    expect((migrateProfile(input) as { version: number }).version).toBe(3);
    expect(JSON.stringify(input)).toBe(before);
    expect(migrateProfile({ version: 7 })).toEqual({ version: 7 });
    expect(migrateProfile(null)).toBeNull();
    expect(migrateProfile([1])).toEqual([1]);
  });

  it('a v1 profile whose equipment is not an object still fails at the equipment path', () => {
    expect(() => validateProfile({ version: 1, sites: [], equipment: 5, trains: [], plans: [] })).toThrow(/^\$\.equipment: expected an object/);
  });

  it('a v1 file with a stray filters list gets the empty list, since v1 had no such field', () => {
    const o = JSON.parse(v1Text);
    o.equipment.filters = [{ id: 'f', name: 'F' }];
    expect(validateProfile(o).equipment.filters).toEqual([]);
  });

  it('keeps a filter with only an id and a name: unknown values stay absent', () => {
    const p = validateProfile(full());
    expect(p.equipment.filters[1]).toEqual({ id: 'f2', name: 'Bare filter' });
  });

  it('round-trips a train with a filter through JSON', () => {
    const p = validateProfile(JSON.parse(JSON.stringify(full())));
    expect((p.trains[0] as { filterId?: string }).filterId).toBe('f1');
    expect(p.equipment.cameras[0]).toMatchObject({ colour: true, hasUvIrCut: false, readNoiseClass: 'low' });
  });
});
