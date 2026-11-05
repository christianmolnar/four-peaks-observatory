import {
  horizonAltitudeAt,
  limitAltitudeAt,
  normalizeHorizon,
  usableWindows,
} from './index';
import type { HorizonPoint } from './index';
import { targetAltAz } from '../astro';
import type { Site } from '../astro';

const boulder: Site = { latitude: 40.0, longitude: -105.0 };

describe('horizonAltitudeAt', () => {
  const pts: HorizonPoint[] = [
    { az: 350, alt: 10 },
    { az: 90, alt: 0 },
    { az: 180, alt: 20 },
  ];

  it('returns null (not set) with no points', () => {
    expect(horizonAltitudeAt(null, 120)).toBeNull();
    expect(horizonAltitudeAt(undefined, 120)).toBeNull();
    expect(horizonAltitudeAt([], 120)).toBeNull();
  });

  it('interpolates linearly between sorted points', () => {
    expect(horizonAltitudeAt(pts, 135)).toBeCloseTo(10, 9);
    expect(horizonAltitudeAt(pts, 90)).toBe(0);
    expect(horizonAltitudeAt(pts, 180)).toBe(20);
  });

  it('is continuous across 0/360', () => {
    // 350 -> 90 wraps through north: 100 degrees of span, from 10 down to 0.
    expect(horizonAltitudeAt(pts, 0)).toBeCloseTo(10 - (10 * 10) / 100, 9);
    expect(horizonAltitudeAt(pts, 360)).toBeCloseTo(horizonAltitudeAt(pts, 0)!, 9);
    expect(horizonAltitudeAt(pts, -10)).toBeCloseTo(10, 9);
    const eps = 1e-6;
    expect(Math.abs(horizonAltitudeAt(pts, 359.999999)! - horizonAltitudeAt(pts, eps)!)).toBeLessThan(1e-4);
    // Sweep across the seam: no step larger than the local slope allows.
    let prev = horizonAltitudeAt(pts, 340)!;
    for (let az = 340.5; az <= 380; az += 0.5) {
      const v = horizonAltitudeAt(pts, az)!;
      expect(Math.abs(v - prev)).toBeLessThan(0.2);
      prev = v;
    }
  });

  it('handles a single point as a constant horizon', () => {
    expect(horizonAltitudeAt([{ az: 200, alt: 7 }], 10)).toBe(7);
  });

  it('rejects bad data loudly', () => {
    expect(() => normalizeHorizon([{ az: 360, alt: 1 }])).toThrow(RangeError);
    expect(() => normalizeHorizon([{ az: 10, alt: 95 }])).toThrow(RangeError);
    expect(() => normalizeHorizon([{ az: 10, alt: 1 }, { az: 10, alt: 2 }])).toThrow(RangeError);
  });

  it('limitAltitudeAt uses the higher of horizon and minimum', () => {
    expect(limitAltitudeAt(pts, 180, 30)).toBe(30);
    expect(limitAltitudeAt(pts, 180, 5)).toBe(20);
    expect(limitAltitudeAt(null, 180, 30)).toBe(30);
  });
});

describe('usableWindows', () => {
  // Winter night at the fixture site, 2026-01-15 ~02:00 UTC to ~13:00 UTC .
  const start = new Date(Date.UTC(2026, 0, 16, 2, 0));
  const end = new Date(Date.UTC(2026, 0, 16, 13, 0));

  it('gives one all-night window for a circumpolar target', () => {
    // Dec +88: altitude stays within ~33.6 +/- 2 degrees all night.
    const r = usableWindows({
      raHours: 2.5, decDeg: 88, site: boulder, minAltitude: 20, start, end,
    });
    expect(r.windows).toHaveLength(1);
    expect(r.windows[0].start.getTime()).toBe(start.getTime());
    expect(r.windows[0].end.getTime()).toBe(end.getTime());
  });

  it('gives no window for a target that never rises', () => {
    const r = usableWindows({
      raHours: 12, decDeg: -80, site: boulder, minAltitude: 20, start, end,
    });
    expect(r.windows).toEqual([]);
  });

  it('returns two windows when a horizon obstruction blocks the target mid-night', () => {
    // Pick the RA that is on the meridian (highest altitude) at the middle of the window.
    const mid = new Date((start.getTime() + end.getTime()) / 2);
    let raAtMid = 0;
    let bestAlt = -90;
    for (let ra = 0; ra < 24; ra += 0.01) {
      const alt = targetAltAz(ra, 0, mid, boulder).altitude;
      if (alt > bestAlt) { bestAlt = alt; raAtMid = ra; }
    }
    // A wall of 80 deg across due south (az 150..210) blocks the transit.
    const wall: HorizonPoint[] = [
      { az: 0, alt: 0 }, { az: 140, alt: 0 }, { az: 150, alt: 80 },
      { az: 210, alt: 80 }, { az: 220, alt: 0 },
    ];
    const open = usableWindows({
      raHours: raAtMid, decDeg: 0, site: boulder, horizon: [{ az: 0, alt: 0 }],
      minAltitude: 10, start, end,
    });
    expect(open.windows).toHaveLength(1);
    const blocked = usableWindows({
      raHours: raAtMid, decDeg: 0, site: boulder, horizon: wall,
      minAltitude: 10, start, end,
    });
    expect(blocked.horizonSet).toBe(true);
    expect(blocked.windows).toHaveLength(2);
    const [a, b] = blocked.windows;
    expect(a.end.getTime()).toBeLessThan(b.start.getTime());
    // The gap is centred on the meridian passage.
    const gapMid = (a.end.getTime() + b.start.getTime()) / 2;
    expect(Math.abs(gapMid - mid.getTime())).toBeLessThan(40 * 60000);
    // Edges sit at the blocking azimuths: at each edge the target is at the wall.
    const atEnd = targetAltAz(raAtMid, 0, a.end, boulder);
    expect(atEnd.azimuth).toBeGreaterThan(140);
    expect(atEnd.azimuth).toBeLessThan(155);
  });

  it('reports horizonSet:false and applies only the flat minimum when no horizon is given', () => {
    const flat = usableWindows({
      raHours: 2.5, decDeg: 88, site: boulder, minAltitude: 20, start, end,
    });
    expect(flat.horizonSet).toBe(false);
    const empty = usableWindows({
      raHours: 2.5, decDeg: 88, site: boulder, horizon: [], minAltitude: 20, start, end,
    });
    expect(empty.horizonSet).toBe(false);
    expect(empty.windows).toEqual(flat.windows);
    // A raised minimum shortens the window by the same rule, with no hidden obstruction.
    const high = usableWindows({
      raHours: 2.5, decDeg: 88, site: boulder, minAltitude: 80, start, end,
    });
    expect(high.windows).toEqual([]);
  });

  it('rejects an inverted range', () => {
    expect(() =>
      usableWindows({ raHours: 1, decDeg: 1, site: boulder, minAltitude: 0, start: end, end: start }),
    ).toThrow(RangeError);
  });
});
