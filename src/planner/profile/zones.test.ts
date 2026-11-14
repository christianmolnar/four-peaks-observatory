import { starterTargets } from '../catalog';
import { horizonAltitudeAt, normalizeHorizon, usableWindows, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint } from '../horizon';
import { tonightsNight } from '../plan';
import { sampleProfile } from '../state';
import {
  MAX_ZONES,
  ProfileError,
  arcToHorizonPoints,
  zoneSpans,
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

  it('accepts overlapping zones, saved unchanged', () => {
    const zones = [A, { startAz: 150, endAz: 200, heightDeg: 30 }];
    expect(validateProfile(withZones(zones)).sites[0].blockedArcs).toEqual(zones);
  });

  it('accepts a zone inside another, one that wraps over another across north, and a repeat of the same zone', () => {
    for (const zones of [
      [A, { startAz: 110, endAz: 120, heightDeg: 5 }],
      [{ startAz: 300, endAz: 60, heightDeg: 5 }, { startAz: 10, endAz: 20, heightDeg: 5 }],
      [{ startAz: 300, endAz: 60, heightDeg: 5 }, { startAz: 350, endAz: 100, heightDeg: 5 }],
      [A, A],
    ]) {
      expect(validateProfile(withZones(zones)).sites[0].blockedArcs).toEqual(zones);
    }
  });

  it('accepts touching zones and zones with a gap of any size, so old profiles stay valid', () => {
    for (const zones of [
      [A, { startAz: 160, endAz: 200, heightDeg: 30 }],
      [{ startAz: 300, endAz: 0, heightDeg: 5 }, { startAz: 0, endAz: 50, heightDeg: 9 }],
      [A, { startAz: 160.01, endAz: 200, heightDeg: 30 }],
      [A, { startAz: 161, endAz: 200, heightDeg: 30 }],
      [{ startAz: 0, endAz: 179, heightDeg: 5 }, { startAz: 180, endAz: 359, heightDeg: 9 }],
    ]) {
      expect(validateProfile(withZones(zones)).sites[0].blockedArcs).toEqual(zones);
    }
  });

  it('the profile version is unchanged: the stored shape is the same list of zones', () => {
    expect(validateProfile(withZones([A, A])).version).toBe(3);
  });

  it('each zone still obeys the single-arc rules, with its own index in the path', () => {
    expect(msgOf(withZones([A, { startAz: 200, endAz: 200, heightDeg: 5 }]))).toMatch(/^\$\.sites\[0\]\.blockedArcs\[1\]: arc must span at least/);
    expect(msgOf(withZones([A, { startAz: 200, endAz: 250, heightDeg: 95 }]))).toMatch(/^\$\.sites\[0\]\.blockedArcs\[1\]\.heightDeg/);
    expect(msgOf(withZones([{ startAz: 0, endAz: 359.95, heightDeg: 5 }]))).toMatch(/blockedArcs\[0\]: arc must leave/);
    expect(msgOf(withZones(null))).toMatch(/^\$\.sites\[0\]\.blockedArcs: expected an array/);
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

  it('a zone too narrow to place its edges is still refused loudly', () => {
    expect(() => arcToHorizonPoints([A, { startAz: 200, endAz: 200.01, heightDeg: 30 }])).toThrow(RangeError);
  });

  it('no zones is a set, clear horizon', () => {
    expect(arcToHorizonPoints([])).toEqual([{ az: 0, alt: 0 }]);
  });
});

const sortedDistinct = (pts: HorizonPoint[]) => {
  const azs = pts.map((p) => p.az);
  expect(azs).toEqual([...azs].sort((a, b) => a - b));
  expect(new Set(azs).size).toBe(azs.length);
};

describe('overlapping zones: one height per azimuth, the highest', () => {
  const z = (startAz: number, endAz: number, heightDeg: number): BlockedArc => ({ startAz, endAz, heightDeg });

  it('overlap: the shared stretch takes the higher height, either order, each side keeps its own', () => {
    for (const zones of [[z(100, 200, 30), z(150, 250, 50)], [z(150, 250, 50), z(100, 200, 30)]]) {
      const pts = arcToHorizonPoints(zones);
      sortedDistinct(pts);
      expect(horizonAltitudeAt(pts, 120)).toBe(30);
      expect(horizonAltitudeAt(pts, 150)).toBe(50);
      expect(horizonAltitudeAt(pts, 175)).toBe(50);
      expect(horizonAltitudeAt(pts, 200)).toBe(50);
      expect(horizonAltitudeAt(pts, 230)).toBe(50);
      expect(horizonAltitudeAt(pts, 99)).toBe(0);
      expect(horizonAltitudeAt(pts, 251)).toBe(0);
    }
  });

  it('overlap where the lower zone sticks out the far side: its own height shows there', () => {
    const pts = arcToHorizonPoints([z(100, 200, 50), z(150, 250, 30)]);
    sortedDistinct(pts);
    expect(horizonAltitudeAt(pts, 125)).toBe(50);
    expect(horizonAltitudeAt(pts, 175)).toBe(50);
    expect(horizonAltitudeAt(pts, 200)).toBe(50);
    expect(horizonAltitudeAt(pts, 225)).toBe(30);
    expect(horizonAltitudeAt(pts, 250)).toBe(30);
  });

  it('touching zones: the shared azimuth is the higher one, no duplicate points', () => {
    const pts = arcToHorizonPoints([z(100, 160, 60), z(160, 200, 30)]);
    sortedDistinct(pts);
    expect(horizonAltitudeAt(pts, 160)).toBe(60);
    expect(horizonAltitudeAt(pts, 130)).toBe(60);
    expect(horizonAltitudeAt(pts, 180)).toBe(30);
    const flipped = arcToHorizonPoints([z(100, 160, 30), z(160, 200, 60)]);
    sortedDistinct(flipped);
    expect(horizonAltitudeAt(flipped, 160)).toBe(60);
    expect(horizonAltitudeAt(flipped, 130)).toBe(30);
    expect(horizonAltitudeAt(flipped, 180)).toBe(60);
  });

  it('touching zones of equal height join into one stretch', () => {
    const pts = arcToHorizonPoints([z(100, 160, 40), z(160, 200, 40)]);
    sortedDistinct(pts);
    expect(pts).toEqual(arcToHorizonPoints([z(100, 200, 40)]));
  });

  it('nested: the inner zone raises its stretch only when it is higher', () => {
    const higher = arcToHorizonPoints([z(100, 200, 20), z(140, 160, 70)]);
    sortedDistinct(higher);
    expect(horizonAltitudeAt(higher, 120)).toBe(20);
    expect(horizonAltitudeAt(higher, 150)).toBe(70);
    expect(horizonAltitudeAt(higher, 180)).toBe(20);
    const lower = arcToHorizonPoints([z(100, 200, 70), z(140, 160, 20)]);
    sortedDistinct(lower);
    expect(lower).toEqual(arcToHorizonPoints([z(100, 200, 70)]));
  });

  it('the same zone twice, and the same start or end shared, give no duplicates', () => {
    expect(arcToHorizonPoints([A, A])).toEqual(arcToHorizonPoints([A]));
    const sharedStart = arcToHorizonPoints([z(100, 150, 30), z(100, 200, 50)]);
    sortedDistinct(sharedStart);
    expect(horizonAltitudeAt(sharedStart, 100)).toBe(50);
    expect(horizonAltitudeAt(sharedStart, 125)).toBe(50);
    expect(horizonAltitudeAt(sharedStart, 175)).toBe(50);
    const sharedEnd = arcToHorizonPoints([z(100, 200, 30), z(150, 200, 50)]);
    sortedDistinct(sharedEnd);
    expect(horizonAltitudeAt(sharedEnd, 125)).toBe(30);
    expect(horizonAltitudeAt(sharedEnd, 200)).toBe(50);
    expect(horizonAltitudeAt(sharedEnd, 201)).toBe(0);
  });

  it('wrap past 360: overlap across north, from both sides', () => {
    const pts = arcToHorizonPoints([z(300, 60, 25), z(340, 120, 45)]);
    sortedDistinct(pts);
    expect(horizonAltitudeAt(pts, 310)).toBe(25);
    expect(horizonAltitudeAt(pts, 350)).toBe(45);
    expect(horizonAltitudeAt(pts, 0)).toBe(45);
    expect(horizonAltitudeAt(pts, 50)).toBe(45);
    expect(horizonAltitudeAt(pts, 100)).toBe(45);
    expect(horizonAltitudeAt(pts, 130)).toBe(0);
    expect(horizonAltitudeAt(pts, 290)).toBe(0);
    // A zone ending at north overlapping one starting before it.
    const edge = arcToHorizonPoints([z(300, 0, 25), z(350, 30, 45)]);
    sortedDistinct(edge);
    expect(horizonAltitudeAt(edge, 320)).toBe(25);
    expect(horizonAltitudeAt(edge, 355)).toBe(45);
    expect(horizonAltitudeAt(edge, 0)).toBe(45);
    expect(horizonAltitudeAt(edge, 20)).toBe(45);
  });

  it('four overlapping zones at different heights: the highest of those present at every azimuth', () => {
    const zones = [z(100, 220, 15), z(150, 260, 40), z(200, 300, 25), z(330, 170, 60)];
    const pts = arcToHorizonPoints(zones);
    sortedDistinct(pts);
    const expected = (az: number) =>
      Math.max(0, ...zones.filter((a) => (az - a.startAz + 360) % 360 <= (a.endAz - a.startAz + 360) % 360).map((a) => a.heightDeg));
    for (let az = 0; az < 360; az += 5) expect(horizonAltitudeAt(pts, az)).toBeCloseTo(expected(az), 6);
    // Every order of the same zones is the same horizon.
    expect(arcToHorizonPoints([...zones].reverse())).toEqual(pts);
    expect(arcToHorizonPoints([zones[2], zones[0], zones[3], zones[1]])).toEqual(pts);
  });

  it('zones that cover the whole circle between them leave no open horizon and no zero point', () => {
    const pts = arcToHorizonPoints([z(0, 200, 30), z(180, 359, 50)]);
    sortedDistinct(pts);
    expect(horizonAltitudeAt(pts, 90)).toBe(30);
    expect(horizonAltitudeAt(pts, 190)).toBe(50);
    expect(horizonAltitudeAt(pts, 270)).toBe(50);
  });

  it('edges closer together than the edge step still give distinct, ordered points', () => {
    const pts = arcToHorizonPoints([z(100, 200, 30), z(200.005, 250, 50)]);
    sortedDistinct(pts);
    expect(horizonAltitudeAt(pts, 150)).toBe(30);
    expect(horizonAltitudeAt(pts, 225)).toBe(50);
  });

  it('a target on an overlap azimuth is blocked by the highest zone, not the lower', () => {
    const site = { latitude: 33.6115, longitude: -111.719 };
    const night = tonightsNight(site, '2026-12-15', 'America/Phoenix');
    const at = (horizon: HorizonPoint[]) =>
      usableWindowsOnTrack({ horizon, minAltitude: 10, start: night.start as Date, end: night.end as Date, altAzAt: () => ({ altitude: 40, azimuth: 175 }) });
    // 40 deg up at azimuth 175: clear of the 30 deg zone, behind the 60 deg one, and so behind both where they overlap.
    expect(at(arcToHorizonPoints([z(100, 200, 30)])).windows).toHaveLength(1);
    expect(at(arcToHorizonPoints([z(100, 200, 30), z(150, 250, 60)])).windows).toHaveLength(0);
    expect(at(arcToHorizonPoints([z(150, 250, 60), z(100, 200, 30)])).windows).toHaveLength(0);
  });
});

describe('zoneSpans: where the blocked region comes from', () => {
  const z = (startAz: number, endAz: number, heightDeg: number): BlockedArc => ({ startAz, endAz, heightDeg });

  it('separate zones are one span each; open horizon is not listed', () => {
    expect(zoneSpans([A, B])).toEqual([
      { from: 100, to: 160, zones: [0], heightDeg: 60 },
      { from: 220, to: 300, zones: [1], heightDeg: 20 },
    ]);
    expect(zoneSpans([])).toEqual([]);
  });

  it('an overlap is its own span with both zones and the higher height', () => {
    expect(zoneSpans([z(100, 200, 30), z(150, 250, 50)])).toEqual([
      { from: 100, to: 150, zones: [0], heightDeg: 30 },
      { from: 150, to: 200, zones: [0, 1], heightDeg: 50 },
      { from: 200, to: 250, zones: [1], heightDeg: 50 },
    ]);
  });

  it('a span may cross north', () => {
    expect(zoneSpans([z(300, 60, 25), z(340, 20, 45)])).toEqual([
      { from: 20, to: 60, zones: [0], heightDeg: 25 },
      { from: 300, to: 340, zones: [0], heightDeg: 25 },
      { from: 340, to: 20, zones: [0, 1], heightDeg: 45 },
    ]);
    expect(zoneSpans([z(300, 60, 25)])).toEqual([{ from: 300, to: 60, zones: [0], heightDeg: 25 }]);
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
