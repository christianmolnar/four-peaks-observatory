import { starterTargets } from '../catalog';
import { astronomicalNight, bodyAltAz, moonIllumination, moonSeparation, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { arcToHorizonPoints } from '../profile';
import { limitAltitudeAt, usableWindows, usableWindowsOnTrack } from '../horizon';
import { opticalTrain } from '../optics';
import {
  altitudeTrack,
  angularSeparation,
  parseLocalDate,
  planTonight,
  seasonLabel,
  solarNoon,
  tonightsNight,
} from './index';
import type { PlanTrain, TonightInput } from './index';

const site: Site = { latitude: 40.0, longitude: -105.0 };
const DATE = '2026-12-15';

// 2800 mm, 3.76 um pixels, 6248 x 4176: about 29.7 x 19.9 arcmin.
const narrow: PlanTrain = {
  kind: 'optical',
  name: 'narrow',
  optics: opticalTrain(
    { focalLengthMm: 2800, apertureMm: 280 },
    { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 },
  ),
};
// 540 mm: about 154 x 103 arcmin.
const wide: PlanTrain = {
  kind: 'optical',
  name: 'wide',
  optics: opticalTrain(
    { focalLengthMm: 540, apertureMm: 280 },
    { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 },
  ),
};
const smart: PlanTrain = { kind: 'smart', name: 'smart', optics: null };

const base = (over: Partial<TonightInput> = {}): TonightInput => ({
  site,
  horizon: null,
  minAltitude: 20,
  date: DATE,
  train: narrow,
  targets: starterTargets,
  ...over,
});

describe('dates and night', () => {
  it('parses real dates and rejects others', () => {
    expect(parseLocalDate('2026-12-15')).toEqual({ year: 2026, month: 12, day: 15 });
    expect(() => parseLocalDate('2026-02-30')).toThrow(RangeError);
    expect(() => parseLocalDate('15/12/2026')).toThrow(RangeError);
  });

  it('puts solar noon at 12:00 UTC at longitude 0 and 19:00 UTC at 105 W', () => {
    expect(solarNoon('2026-12-15', 0).toISOString()).toBe('2026-12-15T12:00:00.000Z');
    expect(solarNoon('2026-12-15', -105).toISOString()).toBe('2026-12-15T19:00:00.000Z');
  });

  it('tonight is the astronomical night after that evening, 11 to 14 h in December at 40 N', () => {
    const n = tonightsNight(site, DATE);
    expect(n.kind).toBe('normal');
    const hours = (n.end!.getTime() - n.start!.getTime()) / 3600000;
    expect(hours).toBeGreaterThan(11);
    expect(hours).toBeLessThan(14);
    expect(n.start!.getTime()).toBeGreaterThan(solarNoon(DATE, site.longitude).getTime());
    expect(n).toEqual(astronomicalNight(site, solarNoon(DATE, site.longitude)));
  });

  it('returns no entries when there is no astronomical night', () => {
    const plan = planTonight(base({ site: { latitude: 85, longitude: 0 }, date: '2026-12-21' }));
    expect(plan.night.kind).toBe('polar-night');
    expect(plan.entries).toEqual([]);
  });
});

describe('usableWindowsOnTrack', () => {
  it('agrees with usableWindows for a fixed target', () => {
    const night = tonightsNight(site, DATE);
    const m42 = starterTargets.find((t) => t.id === 'm42')!;
    const args = { horizon: arcToHorizonPoints({ startAz: 150, endAz: 210, heightDeg: 45 }), minAltitude: 20, start: night.start!, end: night.end! };
    const a = usableWindows({ ...args, raHours: m42.raHours, decDeg: m42.decDeg, site });
    const b = usableWindowsOnTrack({ ...args, altAzAt: (d) => targetAltAz(m42.raHours, m42.decDeg, d, site) });
    expect(a.windows.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    // A moving body: Mars's windows lie inside the night and above the limit at their start.
    const mars = usableWindowsOnTrack({ ...args, altAzAt: (d) => bodyAltAz('Mars', d, site) });
    for (const w of mars.windows) {
      expect(w.start.getTime()).toBeGreaterThanOrEqual(night.start!.getTime());
      expect(w.end.getTime()).toBeLessThanOrEqual(night.end!.getTime());
    }
  });
});

describe('planTonight', () => {
  const plan = planTonight(base());
  const byId = (id: string) => plan.entries.find((e) => e.id === id)!;

  it('lists every catalog target plus the planets, flagged', () => {
    expect(plan.entries).toHaveLength(starterTargets.length + 7);
    const planets = plan.entries.filter((e) => e.isPlanet);
    expect(planets.map((p) => p.name).sort()).toEqual(['Jupiter', 'Mars', 'Mercury', 'Neptune', 'Saturn', 'Uranus', 'Venus']);
    for (const p of planets) {
      expect(p.type).toBe('planet');
      expect(p.inSeason).toBeNull();
      expect(p.fit).toBe('not-applicable');
      expect(p.moonSeparation).toBeGreaterThanOrEqual(0);
      expect(p.moonSeparation).toBeLessThanOrEqual(180);
    }
    expect(plan.entries.filter((e) => !e.isPlanet)).toHaveLength(starterTargets.length);
  });

  it('is sorted by score, highest first (fitting targets first), and never-up targets score 0', () => {
    const scores = plan.entries.filter((e) => e.fit !== 'too-large').map((e) => e.score.total);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const never = plan.entries.filter((e) => e.usableMinutes === 0);
    expect(never.length).toBeGreaterThan(0);
    for (const e of never) {
      expect(e.score.total).toBe(0);
      expect(e.windows).toEqual([]);
      expect(e.why).toMatch(/Never clears/);
    }
  });

  it('score total is the sum of its parts, clamped to 0..100', () => {
    for (const e of plan.entries.filter((x) => x.usableMinutes > 0)) {
      const s = e.score;
      const sum = s.usable + s.altitude + s.season + s.moon + s.fit;
      expect(s.total).toBe(Math.max(0, Math.min(100, Math.round(sum))));
      expect(s.usable).toBeLessThanOrEqual(50);
      expect(s.altitude).toBeLessThanOrEqual(30);
      expect(s.moon).toBeLessThanOrEqual(0);
      expect(s.moon).toBeGreaterThanOrEqual(-20);
    }
  });

  it('M42 in December: season, usable hours and peak match an independent scan', () => {
    const m42 = byId('m42');
    const night = plan.night;
    // Independent scan: one-minute altitude of M42, no horizon.
    const target = starterTargets.find((t) => t.id === 'm42')!;
    let best = -90;
    let bestT = 0;
    let up = 0;
    for (let t = night.start!.getTime(); t <= night.end!.getTime(); t += 60000) {
      const alt = targetAltAz(target.raHours, target.decDeg, new Date(t), site).altitude;
      if (alt > best) { best = alt; bestT = t; }
      if (alt >= 20) up += 1;
    }
    expect(m42.inSeason).toBe(true);
    expect(Math.abs(m42.peakAltitude - best)).toBeLessThan(0.5);
    expect(Math.abs(m42.peakTime.getTime() - bestT)).toBeLessThan(6 * 60000);
    expect(Math.abs(m42.usableMinutes - up)).toBeLessThan(11);
    expect(m42.moonIllumination).toBeCloseTo(moonIllumination(new Date((night.start!.getTime() + night.end!.getTime()) / 2)), 10);
    expect(m42.moonSeparation).toBeCloseTo(moonSeparation(target.raHours, target.decDeg, m42.peakTime, site), 10);
  });

  it('the why sentence is built from the entry numbers', () => {
    const m42 = byId('m42');
    expect(m42.why).toContain(`${(m42.usableMinutes / 60).toFixed(1)} h`);
    expect(m42.why).toContain(`${m42.peakAltitude.toFixed(0)} deg`);
    expect(m42.why).toContain(`${(m42.moonIllumination * 100).toFixed(0)}% lit`);
    expect(m42.why).toContain('flat 20 deg minimum (horizon not set)');
    expect(m42.why).toContain('in season');
  });

  it('formats times in why with the supplied formatter', () => {
    const p = planTonight(base(), () => 'HH:MM-test');
    expect(p.entries.find((e) => e.id === 'm42')!.why).toContain('HH:MM-test');
  });
});

describe('horizon', () => {
  it('with no horizon: horizonSet false and the flat minimum applies', () => {
    const plan = planTonight(base());
    expect(plan.horizonSet).toBe(false);
    const empty = planTonight(base({ horizon: [] }));
    expect(empty.horizonSet).toBe(false);
    expect(empty.entries.map((e) => e.usableMinutes)).toEqual(plan.entries.map((e) => e.usableMinutes));
  });

  it('a wall across the south shortens the southern windows and splits or removes them', () => {
    const open = planTonight(base());
    const walled = planTonight(base({ horizon: arcToHorizonPoints({ startAz: 90, endAz: 270, heightDeg: 60 }) }));
    expect(walled.horizonSet).toBe(true);
    const m42Open = open.entries.find((e) => e.id === 'm42')!;
    const m42Wall = walled.entries.find((e) => e.id === 'm42')!;
    expect(m42Open.usableMinutes).toBeGreaterThan(200);
    // M42 peaks near 45 deg due south, so a 60 deg wall there blocks it all.
    expect(m42Wall.usableMinutes).toBe(0);
    expect(m42Wall.windows).toEqual([]);
    expect(m42Wall.score.total).toBe(0);
    expect(m42Wall.why).toContain('horizon and 20 deg minimum');
    // Every entry is no better off with a wall.
    for (const e of walled.entries) {
      const o = open.entries.find((x) => x.id === e.id)!;
      expect(e.usableMinutes).toBeLessThanOrEqual(o.usableMinutes + 1e-6);
    }
  });

  it('a lower wall leaves windows but shorter than open sky', () => {
    const open = planTonight(base());
    const low = planTonight(base({ horizon: arcToHorizonPoints({ startAz: 90, endAz: 270, heightDeg: 35 }) }));
    const a = open.entries.find((e) => e.id === 'm42')!;
    const b = low.entries.find((e) => e.id === 'm42')!;
    expect(b.usableMinutes).toBeGreaterThan(0);
    expect(b.usableMinutes).toBeLessThan(a.usableMinutes);
  });
});

describe('fit', () => {
  it('flags a large target as too large for a narrow field and fits it in a wide one', () => {
    const n = planTonight(base({ train: narrow }));
    const w = planTonight(base({ train: wide }));
    const m31n = n.entries.find((e) => e.id === 'm31')!;
    const m27n = n.entries.find((e) => e.id === 'm27')!;
    const m31w = w.entries.find((e) => e.id === 'm31')!;
    expect(m31n.fit).toBe('too-large');
    expect(m31n.fitDetail).toContain('does not fit');
    expect(m27n.fit).toBe('fits');
    expect(m31w.fit).not.toBe('fits'); // 178 x 63 arcmin exceeds 154 x 103
    const m42w = w.entries.find((e) => e.id === 'm42')!;
    expect(m42w.fit).toBe('fits');
  });

  it('a too-large target loses 25 points and nothing else changes in its parts', () => {
    const n = planTonight(base({ train: narrow }));
    const w = planTonight(base({ train: wide }));
    const a = n.entries.find((e) => e.id === 'm42')!; // 85 x 60 arcmin: too large for 30 x 20
    const b = w.entries.find((e) => e.id === 'm42')!;
    expect(a.fit).toBe('too-large');
    expect(a.score.fit).toBe(-25);
    expect(b.score.fit).toBe(0);
    expect(a.score.usable).toBe(b.score.usable);
  });

  it('targets that do not fit sort below everything that fits, even with a higher score', () => {
    const n = planTonight(base({ train: narrow }));
    const kinds = n.entries.map((e) => e.fit === 'too-large');
    expect(kinds).toContain(true);
    expect(kinds).toContain(false);
    expect(kinds.indexOf(true)).toBeGreaterThan(kinds.lastIndexOf(false));
    const bestMiss = Math.max(...n.entries.filter((e) => e.fit === 'too-large').map((e) => e.score.total));
    const worstFit = Math.min(...n.entries.filter((e) => e.fit !== 'too-large').map((e) => e.score.total));
    expect(bestMiss).toBeGreaterThan(worstFit); // the order comes from the fit rule, not from the score
  });

  it('the why of a target that does not fit says so instead of recommending it', () => {
    const n = planTonight(base({ train: narrow }));
    const a = n.entries.find((e) => e.id === 'm42')!;
    expect(a.why).toMatch(/^Does not fit this setup/);
    expect(a.why).not.toContain('too large for the frame');
    const w = planTonight(base({ train: wide }));
    expect(w.entries.find((e) => e.id === 'm42')!.why).not.toMatch(/Does not fit/);
  });

  it('smart scopes get no fit math and no fit penalty, only altitude and horizon', () => {
    const s = planTonight(base({ train: smart }));
    for (const e of s.entries) {
      expect(e.fit).toBe('not-applicable');
      expect(e.score.fit).toBe(0);
      expect(e.fitDetail).toContain('not computed');
    }
    const n = planTonight(base({ train: narrow }));
    const m42s = s.entries.find((e) => e.id === 'm42')!;
    const m42n = n.entries.find((e) => e.id === 'm42')!;
    expect(m42s.usableMinutes).toBe(m42n.usableMinutes);
  });

  it('reports unknown fit when the train misses data, not a guess', () => {
    const t: PlanTrain = { kind: 'optical', name: 'partial', optics: opticalTrain({ focalLengthMm: 500 }, {}) };
    const p = planTonight(base({ train: t }));
    expect(p.entries.find((e) => e.id === 'm42')!.fit).toBe('unknown');
    expect(p.entries.find((e) => e.id === 'm42')!.fitDetail).toContain('camera.pixelSizeUm');
  });
});

describe('altitudeTrack', () => {
  it('runs from start to end with the limit at each azimuth', () => {
    const night = tonightsNight(site, DATE);
    const horizon = arcToHorizonPoints({ startAz: 90, endAz: 270, heightDeg: 40 });
    const t = altitudeTrack({ kind: 'fixed', raHours: 5.588, decDeg: -5.39 }, site, horizon, 20, night.start!, night.end!, 10);
    expect(t[0].time).toEqual(night.start);
    expect(t[t.length - 1].time).toEqual(night.end);
    for (const p of t) expect(p.limit).toBe(limitAltitudeAt(horizon, p.azimuth, 20));
    const flat = altitudeTrack({ kind: 'fixed', raHours: 5.588, decDeg: -5.39 }, site, null, 20, night.start!, night.end!);
    for (const p of flat) expect(p.limit).toBe(20);
  });

  it('rejects an empty span', () => {
    const d = new Date(0);
    expect(() => altitudeTrack({ kind: 'planet', body: 'Mars' }, site, null, 20, d, d)).toThrow(RangeError);
  });
});

describe('helpers', () => {
  it('angularSeparation: 90 deg between zenith and the horizon, 0 for equal, wraps azimuth', () => {
    expect(angularSeparation({ altitude: 90, azimuth: 0 }, { altitude: 0, azimuth: 123 })).toBeCloseTo(90, 9);
    expect(angularSeparation({ altitude: 30, azimuth: 10 }, { altitude: 30, azimuth: 10 })).toBeCloseTo(0, 6);
    expect(angularSeparation({ altitude: 0, azimuth: 359 }, { altitude: 0, azimuth: 1 })).toBeCloseTo(2, 9);
  });

  it('seasonLabel names a wrapping run', () => {
    expect(seasonLabel([10, 11, 12, 1, 2])).toBe('Oct to Feb');
    expect(seasonLabel([3, 4, 5])).toBe('Mar to May');
    expect(seasonLabel([7])).toBe('Jul');
    expect(seasonLabel([1, 3])).toBe('Jan, Mar');
    expect(seasonLabel([])).toBe('');
  });
});

describe('score and peak details (each pins a rule the list depends on)', () => {
  const wall = arcToHorizonPoints({ startAz: 150, endAz: 210, heightDeg: 50 });
  const walled = planTonight(base({ horizon: wall }));
  const fullWall = planTonight(base({ horizon: arcToHorizonPoints({ startAz: 90, endAz: 270, heightDeg: 60 }) }));
  const open = planTonight(base());

  it('the peak is the highest point while usable, not the highest of the night', () => {
    const m42Open = open.entries.find((e) => e.id === 'm42')!;
    const m42 = walled.entries.find((e) => e.id === 'm42')!;
    expect(m42.usableMinutes).toBeGreaterThan(0);
    // The wall hides the due-south transit, so the usable peak is clearly lower.
    expect(m42.peakAltitude).toBeLessThan(m42Open.peakAltitude - 3);
    for (const e of walled.entries.filter((x) => x.usableMinutes > 0)) {
      expect(e.peakAltitude).toBeGreaterThanOrEqual(limitAltitudeAt(wall, e.peakAzimuth, 20) - 1e-9);
      const inWindow = e.windows.some((w) => e.peakTime >= w.start && e.peakTime <= w.end);
      expect(inWindow).toBe(true);
    }
  });

  it('a planet\'s Moon separation is its real angle to the Moon at the peak', () => {
    const planets = open.entries.filter((e) => e.isPlanet);
    for (const p of planets) {
      const body = (p.source as { body: Parameters<typeof bodyAltAz>[0] }).body;
      const expected = angularSeparation(bodyAltAz('Moon', p.peakTime, site), bodyAltAz(body, p.peakTime, site));
      expect(p.moonSeparation).toBeCloseTo(expected, 9);
    }
    expect(new Set(planets.map((p) => p.moonSeparation.toFixed(1))).size).toBeGreaterThan(1);
  });

  it('the Moon only costs points while it is up at the peak', () => {
    // Find a date with a lit Moon that is down for some targets and up for others.
    let found: { up: number; down: number } | null = null;
    for (let day = 1; day <= 28 && !found; day++) {
      const p = planTonight(base({ date: `2026-12-${String(day).padStart(2, '0')}` }));
      if (p.entries[0] === undefined) continue;
      const usable = p.entries.filter((e) => e.usableMinutes > 0);
      const down = usable.filter((e) => !e.moonUp && e.moonIllumination > 0.3);
      const up = usable.filter((e) => e.moonUp && e.moonIllumination > 0.3);
      if (down.length > 0 && up.length > 0) {
        found = { up: up.length, down: down.length };
        for (const e of down) expect(e.score.moon).toBe(0);
        expect(up.some((e) => e.score.moon < 0)).toBe(true);
      }
    }
    expect(found).not.toBeNull();
  });

  it('a target that never clears the limit scores 0 even when its parts are positive', () => {
    const blocked = fullWall.entries.filter((e) => e.usableMinutes === 0 && (e.score.altitude > 0 || e.score.season > 0));
    expect(blocked.length).toBeGreaterThan(0);
    for (const e of blocked) expect(e.score.total).toBe(0);
  });
});
