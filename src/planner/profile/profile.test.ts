import {
  ProfileError,
  arcToHorizonPoints,
  emptyProfile,
  parseProfile,
  validateProfile,
} from './index';
import { horizonAltitudeAt, limitAltitudeAt } from '../horizon';
import type { Profile } from './index';

// Neutral fixture; no real gear or places.
const full = (): Profile => ({
  version: 1,
  sites: [
    { id: 's1', name: 'Test Ridge', latitude: 40, longitude: -105, elevationM: 1500, blockedArc: { startAz: 100, endAz: 200, heightDeg: 30 } },
    { id: 's2', name: 'Open Field', latitude: -33, longitude: 151, blockedArc: null },
  ],
  equipment: {
    scopes: [{ id: 'sc', name: 'Scope', focalLengthMm: 1000, apertureMm: 200 }],
    accessories: [{ id: 'ac', name: 'Reducer', factor: 0.8 }],
    cameras: [{ id: 'cm', name: 'Cam', pixelSizeUm: 4, sensorWidthPx: 4000, sensorHeightPx: 3000 }],
    smartScopes: [{ id: 'sm', name: 'Smart', mountMode: 'eq', focalLengthMm: 250 }],
  },
  trains: [
    { kind: 'optical', id: 't1', name: 'Main', scopeId: 'sc', accessoryIds: ['ac'], cameraId: 'cm' },
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
    failsAt((p) => { p.version = 2; }, '$.version');
    failsAt((p) => { delete p.equipment; }, '$.equipment');
  });

  it('rejects bad arcs', () => {
    failsAt((p) => { p.sites[0].blockedArc.heightDeg = 120; }, '$.sites[0].blockedArc.heightDeg');
    failsAt((p) => { p.sites[0].blockedArc.endAz = 100; }, '$.sites[0].blockedArc');
    failsAt((p) => { p.sites[0].blockedArc.startAz = 360; }, '$.sites[0].blockedArc.startAz');
    failsAt((p) => { p.sites[0].blockedArc = { startAz: 0, endAz: 359.95, heightDeg: 10 }; }, '$.sites[0].blockedArc');
    failsAt((p) => { delete p.sites[0].blockedArc; }, '$.sites[0].blockedArc');
  });

  it('rejects duplicate ids and dangling references', () => {
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
    const pts = arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 });
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
    const pts = arcToHorizonPoints({ startAz: 300, endAz: 60, heightDeg: 35 });
    for (const az of [300, 330, 359.99, 0, 360, 30, 60]) {
      expect(horizonAltitudeAt(pts, az)).toBe(35);
    }
    for (const az of [61, 120, 180, 299]) {
      expect(horizonAltitudeAt(pts, az)).toBe(0);
    }
  });

  it('wrap when the start edge sits at 0 and the end edge at 359', () => {
    const pts = arcToHorizonPoints({ startAz: 0, endAz: 90, heightDeg: 20 });
    expect(horizonAltitudeAt(pts, 0)).toBe(20);
    expect(horizonAltitudeAt(pts, 90)).toBe(20);
    expect(horizonAltitudeAt(pts, 359.995)).toBeCloseTo(10, 5); // inside the edge step
    expect(horizonAltitudeAt(pts, 200)).toBe(0);
  });

  it('returns sorted points with no duplicate azimuths', () => {
    const pts = arcToHorizonPoints({ startAz: 300, endAz: 60, heightDeg: 35 });
    expect(pts).toHaveLength(4);
    expect(pts.map((p) => p.az)).toEqual([...pts.map((p) => p.az)].sort((a, b) => a - b));
    expect(new Set(pts.map((p) => p.az)).size).toBe(4);
  });

  it('no arc is a set, clear horizon', () => {
    const pts = arcToHorizonPoints(null);
    expect(horizonAltitudeAt(pts, 123)).toBe(0);
  });

  it('refuses arcs too narrow to place their edges', () => {
    expect(() => arcToHorizonPoints({ startAz: 10, endAz: 10.001, heightDeg: 5 })).toThrow(RangeError);
  });
});
