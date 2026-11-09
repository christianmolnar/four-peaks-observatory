import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { bodyAltAz, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { altAzOf } from '../plan';
import type { TargetSource } from '../plan';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import { buildItinerary } from './index';
import type { ItineraryItem } from './index';
import { slotInputFor } from './resolve';
import { clockOf, clockToInstant, makeScale, slotAltitudes, timelineGeometry } from './timeline';

const profile = validateProfile(sample);
const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
const ZONE = 'America/Phoenix'; // UTC-7 all year
const HORIZON = arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 });
const NIGHT = tonightsNight(SITE, '2026-12-15'); // 01:49 to 12:55 UTC
const fmt = (d: Date) => d.toISOString().slice(11, 16);
const MIN = 60000;
let n = 0;
const item = (targetId: string): ItineraryItem => ({ id: `t${++n}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' });
const build = (ids: string[], startAt?: Date | null) =>
  buildItinerary({ site: SITE, night: NIGHT, horizon: HORIZON, minAltitude: 20, bortle: 6, slots: ids.map((id) => slotInputFor(item(id), profile, starterTargets)), startAt, formatTime: fmt });

describe('start time as a clock time', () => {
  it('an evening time is tonight, a small-hours time is after midnight, a morning time is after the night', () => {
    expect(clockToInstant('21:00', NIGHT.start as Date, ZONE).toISOString()).toBe('2026-12-16T04:00:00.000Z');
    expect(clockToInstant('02:00', NIGHT.start as Date, ZONE).toISOString()).toBe('2026-12-16T09:00:00.000Z');
    expect(clockToInstant('12:00', NIGHT.start as Date, ZONE).toISOString()).toBe('2026-12-16T19:00:00.000Z');
    expect(clockToInstant('17:00', NIGHT.start as Date, ZONE).toISOString()).toBe('2026-12-16T00:00:00.000Z');
  });
  it('clockOf reads the same clock back in the zone', () => {
    expect(clockOf(new Date('2026-12-16T04:05:00Z'), ZONE)).toBe('21:05');
    expect(clockOf(clockToInstant('23:45', NIGHT.start as Date, ZONE), ZONE)).toBe('23:45');
  });
  it('rejects text that is not HH:MM', () => {
    expect(() => clockToInstant('9pm', NIGHT.start as Date, ZONE)).toThrow(RangeError);
  });
});

describe('start time in the schedule', () => {
  it('no start time: the first slot starts when the night starts or its target clears the horizon, as before', () => {
    const plan = build(['m31']);
    expect(plan.startsAt).toEqual(NIGHT.start);
    expect(plan.startNote).toBeNull();
  });
  it('a later start moves every slot: the first starts no earlier, and each later slot moves by the same step', () => {
    const base = build(['m31', 'ic405']);
    const late = new Date((NIGHT.start as Date).getTime() + 120 * MIN);
    const moved = build(['m31', 'ic405'], late);
    expect(moved.startsAt).toEqual(late);
    expect(moved.slots[0].start.getTime()).toBeGreaterThanOrEqual(late.getTime());
    expect(moved.slots[0].start.getTime()).toBeGreaterThan(base.slots[0].start.getTime());
    expect(moved.slots[1].start.getTime()).toBeGreaterThan(base.slots[1].start.getTime());
    expect(moved.slots[1].start.getTime() - moved.slots[0].end.getTime()).toBe(3 * MIN);
  });
  it('a start before the night begins at the night start, and says so in plain words', () => {
    const plan = build(['m31'], new Date((NIGHT.start as Date).getTime() - 90 * MIN));
    expect(plan.startsAt).toEqual(NIGHT.start);
    expect(plan.startNote).toBe(`Your start time is before the night: imaging begins when the night starts, ${fmt(NIGHT.start as Date)}.`);
    expect(plan.slots[0].end.getTime()).toBeGreaterThan(plan.slots[0].start.getTime());
  });
  it('a start in the same minute as the night start is the night start: no warning', () => {
    const ns = (NIGHT.start as Date).getTime();
    const sameMinute = new Date(ns - (ns % MIN)); // the clock reads HH:MM with no seconds, the night starts a few seconds later
    expect(sameMinute.getTime()).toBeLessThanOrEqual(ns);
    const plan = build(['m31'], sameMinute);
    expect(plan.startNote).toBeNull();
    expect(plan.startsAt).toEqual(NIGHT.start);
    expect(build(['m31'], new Date(sameMinute.getTime() - MIN)).startNote).toMatch(/^Your start time is before the night/);
  });
  it('the first slot with no time left names the start time you gave, not "as the night starts"', () => {
    // M31's only window closes at 06:35 UTC at this site and date; a start at 08:00 UTC is after it.
    const start = new Date('2026-12-16T08:00:00Z');
    const plan = build(['m31'], start);
    expect(plan.slots[0].warnings.map((w) => w.code)).toEqual(['no-time']);
    expect(plan.slots[0].warnings[0].text).toBe('No usable time left for Andromeda Galaxy tonight: its window closes at 06:35, before your start time (08:00).');
  });
  it('a start after the night ends gives every slot no time and a message, and does not throw', () => {
    const plan = build(['m31', 'm42'], new Date((NIGHT.end as Date).getTime() + 30 * MIN));
    expect(plan.startNote).toMatch(/is after the night ends \(12:55\), so there is no time for any slot\.$/);
    for (const s of plan.slots) {
      expect(s.end.getTime()).toBe(s.start.getTime());
      expect(s.altitudes).toBeNull();
      expect(s.warnings.map((w) => w.code)).toEqual(['no-time']);
    }
    expect(plan.totals.ends).toBeNull();
  });
});

describe('altitude through a slot', () => {
  it('start, middle and end match the astro functions at the same instants to 0.1 degree', () => {
    const plan = build(['m31', 'ic405']);
    const targets = [starterTargets.find((t) => t.id === 'm31')!, starterTargets.find((t) => t.id === 'ic405')!];
    plan.slots.forEach((s, k) => {
      const a = s.altitudes!;
      const mid = new Date(s.start.getTime() + (s.end.getTime() - s.start.getTime()) / 2);
      expect(a.start.at).toEqual(s.start);
      expect(a.end.at).toEqual(s.end);
      for (const [pt, when] of [[a.start, s.start], [a.middle, mid], [a.end, s.end]] as const) {
        const ref = targetAltAz(targets[k].raHours, targets[k].decDeg, when, SITE);
        expect(Math.abs(pt.altitude - ref.altitude)).toBeLessThan(0.1);
        expect(Math.abs(pt.azimuth - ref.azimuth)).toBeLessThan(0.1);
      }
    });
  });
  it('a planet or the Moon is read from bodyAltAz', () => {
    const plan = build(['planet-jupiter']);
    const s = plan.slots[0];
    const a = s.altitudes!;
    expect(Math.abs(a.middle.altitude - bodyAltAz('Jupiter', new Date(s.start.getTime() + (s.end.getTime() - s.start.getTime()) / 2), SITE).altitude)).toBeLessThan(0.1);
    expect(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']).toContain(a.start.direction);
  });
  it('trend: climbing all through is rising, over the top is peaks, down all through is falling (values read off the astro track)', () => {
    const m42 = starterTargets.find((t) => t.id === 'm42')!;
    const src = { kind: 'fixed', raHours: m42.raHours, decDeg: m42.decDeg } as const;
    const h = (hour: number) => new Date(Date.UTC(2026, 11, 16, hour));
    const rising = slotAltitudes(src, SITE, h(2), h(4), null, 0); // 4 to 28 degrees
    const peaks = slotAltitudes(src, SITE, h(6), h(8), null, 0); // 46, over the top, to 50 at the ends but higher between
    const falling = slotAltitudes(src, SITE, h(8), h(10), null, 0); // 50 down to 36
    expect([rising.trend, peaks.trend, falling.trend]).toEqual(['rising', 'peaks', 'falling']);
    expect(rising.end.altitude).toBeGreaterThan(rising.start.altitude);
    expect(falling.end.altitude).toBeLessThan(falling.start.altitude);
    const jupiter = { kind: 'planet', body: 'Jupiter' } as const;
    expect(slotAltitudes(jupiter, SITE, h(4), h(6), null, 0).trend).toBe('rising');
    expect(slotAltitudes({ kind: 'planet', body: 'Saturn' }, SITE, h(4), h(6), null, 0).trend).toBe('falling');
  });
  it('flags a start or end under the limit with the existing warning style', () => {
    const src = { kind: 'fixed', raHours: 5.9, decDeg: -5 } as const;
    const a = slotAltitudes(src, SITE, NIGHT.start as Date, new Date((NIGHT.start as Date).getTime() + 30 * MIN), arcToHorizonPoints({ startAz: 0, endAz: 359, heightDeg: 89 }), 20);
    expect(a.start.belowLimit).toBe(true);
    expect(a.start.limit).toBeGreaterThanOrEqual(80);
  });
});

describe('trend from the meridian transit, checked against 1-minute sampling', () => {
  const PHX_NIGHT = tonightsNight(SITE, '2026-11-08', ZONE);
  // Phoenix clock time on the night of 2026-11-08 (UTC-7): evening times are 08 Nov, small hours are 09 Nov.
  const phx = (day: number, hhmm: string) => new Date(`2026-11-${String(day).padStart(2, '0')}T${hhmm}:00-07:00`);
  const rosette = starterTargets.find((t) => t.id === 'ngc2237')!;
  const rosetteSrc: TargetSource = { kind: 'fixed', raHours: rosette.raHours, decDeg: rosette.decDeg };

  it('the evaluator cases: Saturn 21:39 to 22:09 and the Rosette Nebula 02:01 to 03:51 at the sample site peak inside the slot', () => {
    expect(PHX_NIGHT.kind).toBe('normal');
    expect(slotAltitudes({ kind: 'planet', body: 'Saturn' }, SITE, phx(8, '21:39'), phx(8, '22:09'), HORIZON, 20).trend).toBe('peaks');
    expect(slotAltitudes(rosetteSrc, SITE, phx(9, '02:01'), phx(9, '03:51'), HORIZON, 20).trend).toBe('peaks');
  });

  // The truth: the highest minute of a 1-minute track. A slot whose highest minute is inside it peaks; otherwise the end against the start.
  const truth = (source: TargetSource, site: Site, a: number, b: number): { trend: 'rising' | 'peaks' | 'falling'; ambiguous: boolean } => {
    const alts: number[] = [];
    for (let t = a; t <= b; t += MIN) alts.push(altAzOf(source, site, new Date(t)).altitude);
    const top = alts.indexOf(Math.max(...alts));
    // A highest minute 1 to 3 minutes inside an end is within what the two methods can tell apart (the Moon's hour angle 0 is not its exact highest minute).
    const last = alts.length - 1;
    // ... and so is a highest minute at an end that is flat to 0.01 degree against the next minute in (the true top may be 30 seconds inside).
    const flatEnd = (top === 0 && alts[0] - alts[1] < 0.01) || (top === last && alts[last] - alts[last - 1] < 0.01);
    const ambiguous = (top >= 1 && top <= 3) || (top <= last - 1 && top >= last - 3) || flatEnd;
    const trend = top > 0 && top < alts.length - 1 ? 'peaks' : alts[alts.length - 1] >= alts[0] ? 'rising' : 'falling';
    return { trend, ambiguous };
  };
  const SITES: [string, Site][] = [
    ['Phoenix', SITE],
    ['Sydney', { latitude: -33.87, longitude: 151.21, elevationM: 0 }],
    ['Reykjavik', { latitude: 64.15, longitude: -21.94, elevationM: 0 }],
    ['New York', { latitude: 40.71, longitude: -74.0, elevationM: 0 }],
    ['Apia', { latitude: -13.83, longitude: -171.76, elevationM: 0 }],
    ['Kiritimati', { latitude: 1.87, longitude: -157.4, elevationM: 0 }],
  ];
  const fixed = ['m31', 'm42', 'ngc2237', 'm13', 'm8', 'm51'].map((id) => starterTargets.find((t) => t.id === id)!);
  const sources: TargetSource[] = [
    ...(['Moon', 'Jupiter', 'Saturn', 'Mars', 'Venus', 'Uranus'] as const).map((body): TargetSource => ({ kind: 'planet', body })),
    ...fixed.map((t): TargetSource => ({ kind: 'fixed', raHours: t.raHours, decDeg: t.decDeg })),
  ];

  it('agrees with the highest minute of a 1-minute track on 6 sites, for planets, the Moon and fixed targets', () => {
    let checked = 0;
    let peaksSeen = 0;
    const wrong: string[] = [];
    for (const [name, site] of SITES) {
      const night = tonightsNight(site, '2026-11-08');
      if (night.kind !== 'normal') continue;
      const n0 = (night.start as Date).getTime();
      const n1 = (night.end as Date).getTime();
      for (const source of sources) {
        for (const lenMin of [20, 45, 110]) {
          for (let a = n0; a + lenMin * MIN <= n1; a += 53 * MIN) {
            const b = a + lenMin * MIN;
            const ref = truth(source, site, a, b);
            if (ref.ambiguous) continue;
            const got = slotAltitudes(source, site, new Date(a), new Date(b), null, 0).trend;
            checked++;
            if (ref.trend === 'peaks') peaksSeen++;
            if (got !== ref.trend) wrong.push(`${name} ${JSON.stringify(source)} ${new Date(a).toISOString()} +${lenMin}: ${got} vs ${ref.trend}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(peaksSeen).toBeGreaterThan(20);
    expect(wrong).toEqual([]);
  });
});

describe('graph geometry', () => {
  const frame = { width: 400, height: 200, margin: { left: 40, right: 10, top: 10, bottom: 30 } };
  const t0 = Date.UTC(2026, 11, 16, 2);
  const t1 = Date.UTC(2026, 11, 16, 12);
  it('time and altitude map onto the plot area: edges, middle, clamped altitude', () => {
    const { x, y } = makeScale(t0, t1, frame);
    expect(x(t0)).toBe(40);
    expect(x(t1)).toBe(390);
    expect(x((t0 + t1) / 2)).toBe(215);
    expect(y(90)).toBe(10);
    expect(y(0)).toBe(170);
    expect(y(-5)).toBe(170);
    expect(y(45)).toBe(90);
  });
  it('each timed slot starts and ends at the x of its times; connectors join end to next start; an empty slot draws nothing', () => {
    const h = (hour: number) => new Date(Date.UTC(2026, 11, 16, hour));
    const alt = (v: number) => () => v;
    const slots = [
      { id: 'a', start: h(3), end: h(5), altitudeAt: alt(30) },
      { id: 'b', start: h(6), end: h(6), altitudeAt: alt(45) },
      { id: 'c', start: h(7), end: h(10), altitudeAt: alt(60) },
    ];
    const { x, y } = makeScale(t0, t1, frame);
    const g = timelineGeometry(h(2), h(12), slots, frame);
    expect(g.segments.map((s) => [s.number, s.timed])).toEqual([[1, true], [2, false], [3, true]]);
    expect(g.segments[0].x0).toBeCloseTo(x(h(3).getTime()), 9);
    expect(g.segments[0].x1).toBeCloseTo(x(h(5).getTime()), 9);
    expect(g.segments[0].points[0]).toEqual({ x: g.segments[0].x0, y: y(30) });
    expect(g.segments[0].points.at(-1)).toEqual({ x: g.segments[0].x1, y: y(30) });
    expect(g.segments[1].points).toEqual([]);
    expect(g.connectors).toEqual([{ fromId: 'a', toId: 'c', from: { x: g.segments[0].x1, y: y(30) }, to: { x: g.segments[2].x0, y: y(60) } }]);
  });
  it('a slot runs only between its start and end: every sample lies inside', () => {
    const h = (hour: number) => new Date(Date.UTC(2026, 11, 16, hour));
    const g = timelineGeometry(h(2), h(12), [{ id: 'a', start: h(4), end: h(6), altitudeAt: (d) => d.getUTCHours() * 3 }], frame);
    const xs = g.segments[0].points.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(g.segments[0].x0, 9);
    expect(Math.max(...xs)).toBeCloseTo(g.segments[0].x1, 9);
    expect(g.segments[0].points.length).toBe(25);
  });
});
