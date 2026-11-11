import { starterTargets } from '../catalog';
import { horizonAltitudeAt, normalizeHorizon, usableWindows, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint } from '../horizon';
import { tonightsNight } from '../plan';
import { sampleProfile } from '../state';
import {
  EDGE_STEP_DEG,
  MAX_ZONES,
  ProfileError,
  arcToHorizonPoints,
  arcsConflict,
  migrateProfile,
  parseProfile,
  validateProfile,
} from './index';
import type { BlockedArc, Profile } from './index';

const withZones = (zones: unknown): unknown => {
  const p = JSON.parse(JSON.stringify(sampleProfile()));
  p.sites[0].blockedArcs = zones;
  return p;
};
const msgOf = (v: unknown): string => {
  try {
    validateProfile(v);
  } catch (e) {
    expect(e).toBeInstanceOf(ProfileError);
    return (e as Error).message;
  }
  throw new Error('expected a ProfileError');
};

const A: BlockedArc = { startAz: 100, endAz: 160, heightDeg: 60 };
const B: BlockedArc = { startAz: 220, endAz: 300, heightDeg: 20 };
const C: BlockedArc = { startAz: 320, endAz: 20, heightDeg: 35 };
const D: BlockedArc = { startAz: 40, endAz: 80, heightDeg: 10 };

describe('migration v2 -> v3', () => {
  const v2 = (arc: unknown) => {
    const p = JSON.parse(JSON.stringify(sampleProfile())) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    p.version = 2;
    delete p.sites[0].blockedArcs;
    p.sites[0].blockedArc = arc;
    return p;
  };

  it('turns one arc into a one-zone list and null into none; nothing else changes', () => {
    const one = migrateProfile(v2({ startAz: 120, endAz: 320, heightDeg: 42 })) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(one.version).toBe(3);
    expect(one.sites[0].blockedArcs).toEqual([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
    expect(one.sites[0]).not.toHaveProperty('blockedArc');
    const none = migrateProfile(v2(null)) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(none.sites[0].blockedArcs).toEqual([]);
    const { blockedArcs: _a, ...restNew } = one.sites[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
    const { blockedArc: _b, ...restOld } = v2(null).sites[0]; // eslint-disable-line @typescript-eslint/no-unused-vars
    expect(restNew).toEqual(restOld);
    expect(one.equipment).toEqual(v2(null).equipment);
    expect(one.trains).toEqual(v2(null).trains);
  });

  it('does not mutate its input', () => {
    const input = v2({ startAz: 1, endAz: 2, heightDeg: 3 });
    const before = JSON.stringify(input);
    migrateProfile(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('a v2 file (as JSON text) still loads, as the sample does, with one zone', () => {
    const p = parseProfile(JSON.stringify(v2({ startAz: 120, endAz: 320, heightDeg: 42 })));
    expect(p).toEqual(sampleProfile());
    expect(p.version).toBe(3);
  });

  it('a v2 profile that lacks the arc field is still rejected at its path', () => {
    const p = v2(null);
    delete p.sites[0].blockedArc;
    expect(msgOf(p)).toMatch(/^\$\.sites\[0\]\.blockedArcs: expected a list/);
  });

  it('a v3 profile with the old field name is rejected', () => {
    const p = JSON.parse(JSON.stringify(sampleProfile()));
    p.sites[0].blockedArc = null;
    expect(msgOf(p)).toMatch(/blockedArc: unknown field/);
  });
});

describe('validator: zone count and overlap', () => {
  it(`accepts 0 to ${MAX_ZONES} zones in any order`, () => {
    for (const zones of [[], [A], [A, B], [B, A], [A, B, C], [A, B, C, D]]) {
      expect(validateProfile(withZones(zones)).sites[0].blockedArcs).toEqual(zones);
    }
  });

  it('refuses a fifth zone and says the limit', () => {
    const E: BlockedArc = { startAz: 170, endAz: 200, heightDeg: 5 };
    expect(msgOf(withZones([A, B, C, D, E]))).toBe('$.sites[0].blockedArcs: at most 4 blocked zones, got 5');
  });

  it('refuses overlapping zones, naming both and the path of the later one', () => {
    expect(msgOf(withZones([A, { startAz: 150, endAz: 200, heightDeg: 30 }]))).toMatch(
      /^\$\.sites\[0\]\.blockedArcs\[1\]: zone 2 overlaps or touches zone 1/,
    );
  });

  it('refuses a zone inside another, and one that wraps over another across north', () => {
    expect(msgOf(withZones([A, { startAz: 110, endAz: 120, heightDeg: 5 }]))).toMatch(/overlaps or touches/);
    expect(msgOf(withZones([{ startAz: 300, endAz: 60, heightDeg: 5 }, { startAz: 10, endAz: 20, heightDeg: 5 }]))).toMatch(/overlaps or touches/);
    expect(msgOf(withZones([{ startAz: 300, endAz: 60, heightDeg: 5 }, { startAz: 350, endAz: 100, heightDeg: 5 }]))).toMatch(/overlaps or touches/);
  });

  it('refuses touching zones: at a shared azimuth the horizon would have two heights', () => {
    expect(msgOf(withZones([A, { startAz: 160, endAz: 200, heightDeg: 30 }]))).toMatch(/overlaps or touches/);
    expect(msgOf(withZones([{ startAz: 300, endAz: 0, heightDeg: 5 }, { startAz: 0, endAz: 50, heightDeg: 9 }]))).toMatch(/overlaps or touches/);
    // Touching is what breaks the horizon function: the two edges land on one azimuth.
    expect(() => normalizeHorizon([{ az: 160, alt: 60 }, { az: 160, alt: 30 }])).toThrow(/Duplicate/);
  });

  it('allows zones with a gap of 1 degree and wide zones that leave room for each other', () => {
    expect(() => validateProfile(withZones([A, { startAz: 161, endAz: 200, heightDeg: 30 }]))).not.toThrow();
    expect(() => validateProfile(withZones([{ startAz: 0, endAz: 179, heightDeg: 5 }, { startAz: 180, endAz: 359, heightDeg: 9 }]))).not.toThrow();
  });

  it('each zone still obeys the single-arc rules, with its own index in the path', () => {
    expect(msgOf(withZones([A, { startAz: 200, endAz: 200, heightDeg: 5 }]))).toMatch(/^\$\.sites\[0\]\.blockedArcs\[1\]: arc must span at least/);
    expect(msgOf(withZones([A, { startAz: 200, endAz: 250, heightDeg: 95 }]))).toMatch(/^\$\.sites\[0\]\.blockedArcs\[1\]\.heightDeg/);
    expect(msgOf(withZones([{ startAz: 0, endAz: 359.95, heightDeg: 5 }]))).toMatch(/blockedArcs\[0\]: arc must leave/);
    expect(msgOf(withZones(null))).toMatch(/^\$\.sites\[0\]\.blockedArcs: expected an array/);
  });

  it('a gap of exactly MIN_ARC_DEG is accepted in either order', () => {
    const x = { startAz: 300, endAz: 60, heightDeg: 5 };
    const y = { startAz: 60.1, endAz: 90, heightDeg: 5 };
    expect(arcsConflict(x, y)).toBe(false);
    expect(arcsConflict(y, x)).toBe(false);
    expect(arcsConflict(x, { ...y, startAz: 60.09 })).toBe(true);
    expect(arcsConflict({ ...y, startAz: 60.09 }, x)).toBe(true);
  });

  it('arcsConflict is symmetric', () => {
    const arcs = [A, B, C, D, { startAz: 150, endAz: 230, heightDeg: 1 }, { startAz: 350, endAz: 30, heightDeg: 1 }];
    for (const x of arcs) for (const y of arcs) expect(arcsConflict(x, y)).toBe(arcsConflict(y, x));
    expect(arcsConflict(A, A)).toBe(true);
  });
});

describe('arcToHorizonPoints with zones', () => {
  it('four zones give one sorted list of 16 points with distinct azimuths', () => {
    const pts = arcToHorizonPoints([A, B, C, D]);
    expect(pts).toHaveLength(16);
    expect(pts.map((p) => p.az)).toEqual([...pts.map((p) => p.az)].sort((a, b) => a - b));
    expect(new Set(pts.map((p) => p.az)).size).toBe(16);
  });

  it('the order of the zones does not change the points', () => {
    expect(arcToHorizonPoints([D, C, B, A])).toEqual(arcToHorizonPoints([A, B, C, D]));
  });

  it('each zone has its own height, 0 between zones, and wraps across north', () => {
    const pts = arcToHorizonPoints([A, B, C]);
    expect(horizonAltitudeAt(pts, 130)).toBe(60);
    expect(horizonAltitudeAt(pts, 260)).toBe(20);
    expect(horizonAltitudeAt(pts, 340)).toBe(35);
    expect(horizonAltitudeAt(pts, 10)).toBe(35);
    for (const az of [30, 190, 310]) expect(horizonAltitudeAt(pts, az)).toBe(0);
    expect(horizonAltitudeAt(pts, 100)).toBe(60);
    expect(horizonAltitudeAt(pts, 300)).toBe(20);
  });

  it('refuses zones that overlap, loudly', () => {
    expect(() => arcToHorizonPoints([A, { startAz: 150, endAz: 200, heightDeg: 30 }])).toThrow(/Zones 1 and 2 overlap/);
    expect(() => arcToHorizonPoints([A, { startAz: 160, endAz: 200, heightDeg: 30 }])).toThrow(RangeError);
  });

  it('the narrowest allowed gap keeps both edges apart', () => {
    const pts = arcToHorizonPoints([A, { startAz: 160.1, endAz: 200, heightDeg: 30 }]);
    expect(new Set(pts.map((p) => p.az)).size).toBe(8);
    expect(EDGE_STEP_DEG * 2).toBeLessThan(0.1);
  });

  it('no zones is a set, clear horizon', () => {
    expect(arcToHorizonPoints([])).toEqual([{ az: 0, alt: 0 }]);
  });
});

describe('scheduling with two zones', () => {
  const site = { latitude: 33.6115, longitude: -111.719 };
  const night = tonightsNight(site, '2026-12-15', 'America/Phoenix');
  const zones: BlockedArc[] = [
    { startAz: 100, endAz: 200, heightDeg: 60 }, // A: high wall to the south-east
    { startAz: 220, endAz: 320, heightDeg: 20 }, // B: low wall to the west
  ];
  const still = (altitude: number, azimuth: number) => ({
    horizon: arcToHorizonPoints(zones),
    minAltitude: 10,
    start: night.start as Date,
    end: night.end as Date,
    altAzAt: () => ({ altitude, azimuth }),
  });

  it('a target at 30 deg behind zone A (60 deg high) is blocked all night', () => {
    expect(usableWindowsOnTrack(still(30, 150)).windows).toEqual([]);
  });

  it('a target at 30 deg in zone B (20 deg high) is visible all night', () => {
    const r = usableWindowsOnTrack(still(30, 270));
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0].start).toEqual(night.start);
    expect(r.windows[0].end).toEqual(night.end);
  });

  it('a target at 15 deg in zone B is blocked, and one at 70 deg in zone A is clear', () => {
    expect(usableWindowsOnTrack(still(15, 270)).windows).toEqual([]);
    expect(usableWindowsOnTrack(still(70, 150)).windows).toHaveLength(1);
  });

  it('between the zones only the flat minimum applies', () => {
    expect(usableWindowsOnTrack(still(12, 210)).windows).toHaveLength(1);
    expect(usableWindowsOnTrack(still(8, 210)).windows).toEqual([]);
  });
});

describe('one zone is exactly what main produced', () => {
  // The single-arc function as it was on main, kept here as the reference.
  const legacy = ({ startAz, endAz, heightDeg }: BlockedArc): HorizonPoint[] => {
    const wrap = (az: number) => ((az % 360) + 360) % 360;
    return normalizeHorizon([
      { az: wrap(startAz - 0.01), alt: 0 },
      { az: wrap(startAz), alt: heightDeg },
      { az: wrap(endAz), alt: heightDeg },
      { az: wrap(endAz + 0.01), alt: 0 },
    ]);
  };
  const sample: Profile = sampleProfile();
  const site = { latitude: sample.sites[0].latitude, longitude: sample.sites[0].longitude, elevationM: 500 };
  const nights = ['2026-11-08', '2026-12-21', '2027-04-10'].map((d) => tonightsNight(site, d, 'America/Phoenix'));
  const single: BlockedArc[] = [
    { startAz: 120, endAz: 320, heightDeg: 42 },
    { startAz: 300, endAz: 60, heightDeg: 35 },
    { startAz: 0, endAz: 90, heightDeg: 20 },
  ];

  it('gives byte-identical points', () => {
    for (const z of single) expect(JSON.stringify(arcToHorizonPoints([z]))).toBe(JSON.stringify(legacy(z)));
  });

  it('gives the same usable windows for every starter target on three nights', () => {
    let windows = 0;
    for (const z of single) {
      for (const night of nights) {
        for (const t of starterTargets) {
          const args = { raHours: t.raHours, decDeg: t.decDeg, site, minAltitude: 20, start: night.start as Date, end: night.end as Date };
          const a = usableWindows({ ...args, horizon: arcToHorizonPoints([z]) });
          const b = usableWindows({ ...args, horizon: legacy(z) });
          expect(a).toEqual(b);
          windows += a.windows.length;
        }
      }
    }
    expect(windows).toBeGreaterThan(0);
  });

  it('the sample profile has exactly one zone, 120 to 320 at 42', () => {
    expect(sample.sites[0].blockedArcs).toEqual([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
  });
});
