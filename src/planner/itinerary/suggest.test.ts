import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import { buildItinerary } from './index';
import type { ItineraryItem } from './index';
import { slotInputFor } from './resolve';
import { orderCandidates, suggestOrder } from './suggest';
import type { OrderCandidate } from './suggest';

// A made-up night: minute 0 is 20:00. Same train and filter everywhere, so every changeover is the 3 minute slew.
const T0 = Date.UTC(2026, 11, 16, 3);
const at = (min: number) => new Date(T0 + min * 60000);
const fmt = (d: Date) => d.toISOString().slice(11, 16);
const cand = (id: string, from: number, to: number, durationMin: number, alt = 40, over: Partial<OrderCandidate> = {}): OrderCandidate => ({
  id, name: id.toUpperCase(), trainId: 'a', filterId: null, windows: [{ start: at(from), end: at(to) }], durationMin, altitudeAt: () => alt, ...over,
});
const START = at(0);

// The sample table: three targets with known windows.
//   WEST  clear 0 to 200, wants 150
//   EAST  clear 240 to 600, wants 150
//   ALL   clear 0 to 600, wants 150
const WEST = cand('west', 0, 200, 150);
const EAST = cand('east', 240, 600, 150);
const ALL = cand('all', 0, 600, 150);

describe('suggested order', () => {
  it('puts the target that sets first, the all-night one next, the one that rises last at the end', () => {
    const r = suggestOrder([EAST, WEST, ALL], START, fmt);
    expect(r.order).toEqual(['west', 'all', 'east']);
    expect(r.changed).toBe(true);
    expect(r.currentLightMin).toBe(300); // east waits for its window; west's window has closed by then
    expect(r.suggestedLightMin).toBe(450); // all three get their full length
    expect(r.steps.map((s) => s.name)).toEqual(['WEST', 'ALL', 'EAST']);
    expect(r.steps[0].reason).toMatch(/window closes first, at \d\d:\d\d/);
    expect(r.steps[2].reason).toMatch(/clears the horizon last/);
  });

  it('never schedules a slot outside its window when another order avoids it: both orders of a pair, same answer', () => {
    const early = cand('early', 0, 160, 150);
    const late = cand('late', 170, 600, 150);
    for (const input of [[early, late], [late, early]]) {
      const r = suggestOrder(input, START, fmt);
      expect(r.order).toEqual(['early', 'late']);
      expect(r.suggestedLightMin).toBe(300);
    }
  });

  it('keeps the order when it is already the best, and says so', () => {
    const r = suggestOrder([WEST, ALL, EAST], START, fmt);
    expect(r.order).toEqual(['west', 'all', 'east']);
    expect(r.changed).toBe(false);
    expect(r.suggestedLightMin).toBe(r.currentLightMin);
  });

  it('ties are stable: identical targets stay in the order given, in every starting order', () => {
    const a = cand('a1', 0, 600, 100);
    const b = cand('b1', 0, 600, 100);
    const c = cand('c1', 0, 600, 100);
    for (const input of [[a, b, c], [c, a, b], [b, c, a]]) {
      const r = suggestOrder(input, START, fmt);
      expect(r.order).toEqual(input.map((x) => x.id));
      expect(r.changed).toBe(false);
    }
  });

  it('with equal imaging time, the higher target wins; with equal height, the earlier finish wins', () => {
    // "sinking" is 70 degrees at minute 0 and loses 1 degree per 10 minutes; "climbing" is 20 and gains 1 per 10.
    const min = (d: Date) => (d.getTime() - T0) / 60000;
    const sinking = cand('sinking', 0, 600, 100, 0, { altitudeAt: (d) => 70 - min(d) / 10 });
    const climbing = cand('climbing', 0, 600, 100, 0, { altitudeAt: (d) => 20 + min(d) / 10 });
    expect(suggestOrder([climbing, sinking], START, fmt).order).toEqual(['sinking', 'climbing']);
    expect(suggestOrder([sinking, climbing], START, fmt).changed).toBe(false);
    // Same altitude: a different train costs a 15 minute swap, so the two on one train sit together and finish sooner.
    const x1 = cand('x1', 0, 600, 60, 40, { trainId: 'a' });
    const y = cand('y', 0, 600, 60, 40, { trainId: 'b' });
    const x2 = cand('x2', 0, 600, 60, 40, { trainId: 'a' });
    expect(suggestOrder([x1, y, x2], START, fmt).order).toEqual(['x1', 'x2', 'y']);
  });

  it('counts the changeover: a swap that pushes the last slot out of its window makes another order better', () => {
    // Window of "tight" closes at 140. After "big" (120 min) a train swap (3+15+3 = 21) leaves 140 - 141 < 0: no room.
    const big = cand('big', 0, 600, 120, 40, { trainId: 'a' });
    const tight = cand('tight', 0, 140, 60, 40, { trainId: 'b' });
    const r = suggestOrder([big, tight], START, fmt);
    expect(r.order).toEqual(['tight', 'big']);
    expect(r.suggestedLightMin).toBe(180);
    expect(r.currentLightMin).toBe(120);
  });

  it('a target with no window tonight, or no length, is not moved and does not disturb the rest', () => {
    const none = cand('none', 0, 0, 0, 40, { windows: [] });
    const r = suggestOrder([none, EAST, WEST, ALL], START, fmt);
    expect(r.order).toEqual(['west', 'all', 'east', 'none']);
    expect(r.steps.map((s) => s.id)).toEqual(['west', 'all', 'east']);
  });

  it('an empty or one-slot list has nothing to change', () => {
    expect(suggestOrder([], START, fmt)).toMatchObject({ order: [], changed: false, steps: [] });
    expect(suggestOrder([ALL], START, fmt)).toMatchObject({ order: ['all'], changed: false });
  });

  it('is deterministic and handles eight slots quickly', () => {
    const eight = Array.from({ length: 8 }, (_, i) => cand(`s${i}`, i * 40, 300 + i * 40, 50, 30 + i));
    const t = Date.now();
    const one = suggestOrder(eight, START, fmt);
    expect(suggestOrder(eight, START, fmt)).toEqual(one);
    expect(Date.now() - t).toBeLessThan(5000);
  });
});

describe('with the real schedule', () => {
  const profile = validateProfile(sample);
  const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
  const NIGHT = tonightsNight(SITE, '2026-12-15');
  const base = { site: SITE, night: NIGHT, horizon: arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 }), minAltitude: 20, bortle: 6, formatTime: fmt };
  const items = (ids: string[]): ItineraryItem[] => ids.map((targetId, i) => ({ id: `r${i}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }));
  const input = (its: ItineraryItem[]) => ({ ...base, slots: its.map((i) => slotInputFor(i, profile, starterTargets)) });
  const light = (its: ItineraryItem[]) => buildItinerary(input(its)).totals.integrationMin;

  it('applying the suggested order never gives less imaging than the order it replaces, and a second suggestion changes nothing', () => {
    for (const ids of [['m31', 'm42', 'm33'], ['m42', 'm33', 'm31'], ['ic405', 'm31', 'm42', 'm33']]) {
      const its = items(ids);
      const r = suggestOrder(orderCandidates(input(its)), NIGHT.start as Date, fmt);
      const reordered = r.order.map((id) => its.find((i) => i.id === id)!);
      expect(light(reordered)).toBeGreaterThanOrEqual(light(its) - 1);
      expect(suggestOrder(orderCandidates(input(reordered)), NIGHT.start as Date, fmt).changed).toBe(false);
    }
  });
});
