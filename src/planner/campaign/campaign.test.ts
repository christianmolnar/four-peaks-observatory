import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { nextMeridianTransit } from '../astro';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { exposureFor } from '../exposure';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { clockOf } from '../itinerary/timeline';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints } from '../profile';
import { MIN_SLOT_MIN, planCampaign, scheduleNight, usefulRangeOf } from './index';
import type { CampaignSubject } from './index';
import { MIN, POR, PHX, SYD, TEST_EXPOSURE, assertValidNight, base, bestWorth, reachedTonight, subj, usableAt, worthOf } from './testkit';

const range = (minMin: number, maxMin: number): Partial<CampaignSubject> => ({ useful: { minMin, maxMin } });
const ZERO = (n: number): number[] => new Array<number>(n).fill(0);
/** The engine's night equals the exact oracle's best (targets made useful, then list order, then minutes). */
const expectBest = (input: ReturnType<typeof base>, night: ReturnType<typeof scheduleNight>, got: number[]): void => {
  expect(worthOf(night, input, got)).toBe(bestWorth(night, input, got));
};

describe('useful ranges', () => {
  const sb = (mu: number, over: Partial<CampaignSubject> = {}) => usefulRangeOf(subj('a', 1, 1, { type: 'galaxy', surfaceBrightnessMu: mu, ...over }));

  it('come from the exposure engine: the least is where Quick stops, the most where Deep stops, on the 5 minute grid', () => {
    // C11 f/10 broadband, Bortle 6 (TEST_EXPOSURE). Quick stops at 30 / 67.5 / 67.5 min, Deep at 30 / 238.x / 292.x min (exposureFor).
    expect(sb(20)).toEqual({ minMin: 30, maxMin: 30 });
    expect(sb(22)).toEqual({ minMin: 30, maxMin: 240 });
    expect(sb(24)).toEqual({ minMin: 70, maxMin: 295 });
  });

  it('differ between a bright, a medium and a faint subject (the catalog surface brightness reaches the engine)', () => {
    const [bright, medium, faint] = [sb(20), sb(22), sb(24)];
    expect(new Set([bright, medium, faint].map((r) => `${r.minMin}-${r.maxMin}`)).size).toBe(3);
    expect(bright.maxMin).toBeLessThan(medium.maxMin);
    expect(medium.maxMin).toBeLessThan(faint.maxMin);
    expect(bright.minMin).toBeLessThanOrEqual(faint.minMin);
  });

  it('match exposureFor for the same object, rig and sky (one entry point)', () => {
    const rig = TEST_EXPOSURE.rig;
    const night = { moonIllumination: 0, moonSeparationDeg: 180, moonUp: false, usableMinutes: 1440, acquisitionStart: null, transitTime: null };
    for (const mu of [20, 21, 22, 23, 24]) {
      const at = (preset: 'quick' | 'deep') => {
        const r = exposureFor({ id: 'a', name: 'a', type: 'galaxy', surfaceBrightnessMu: mu }, rig, { bortle: 6 }, night, { preset });
        if (!r.ok) throw new Error('not ok');
        return r.integrationMin;
      };
      const r = sb(mu);
      expect(r.minMin).toBeGreaterThanOrEqual(at('quick'));
      expect(r.minMin - at('quick')).toBeLessThan(5);
      expect(r.maxMin).toBeGreaterThanOrEqual(at('deep'));
      expect(r.maxMin - at('deep')).toBeLessThan(5);
    }
  });

  it('follow the rig and the filter: a narrowband filter shortens an emission object\'s range, and the sky lengthens it', () => {
    const dual = { id: 'd', name: 'dual', passbandWidthNm: 50, kind: 'dual-band' as const, blocksUvIr: true };
    const neb = (e: typeof TEST_EXPOSURE) => usefulRangeOf(subj('a', 1, 1, { type: 'nebula', surfaceBrightnessMu: 22, exposure: e }));
    const plain = neb(TEST_EXPOSURE);
    const filtered = neb({ ...TEST_EXPOSURE, rig: { ...TEST_EXPOSURE.rig, filter: dual } });
    expect(filtered.maxMin).toBeLessThan(plain.maxMin);
    expect(neb({ ...TEST_EXPOSURE, bortle: 8 }).maxMin).toBeGreaterThanOrEqual(plain.maxMin);
  });

  it('a subject with no surface brightness is a medium object (the engine assumes it), an explicit class stands for its row', () => {
    expect(usefulRangeOf(subj('a', 1, 1, { type: 'galaxy' }))).toEqual(sb(22));
    expect(usefulRangeOf(subj('a', 1, 1, { surfaceBrightness: 'low' }))).toEqual(sb(24));
    expect(usefulRangeOf(subj('a', 1, 1, { type: 'globular-cluster' }))).toEqual(sb(20));
  });

  it('a per-target override beats the engine', () => {
    expect(usefulRangeOf(subj('a', 1, 1, { surfaceBrightnessMu: 24, ...range(45, 100) }))).toEqual({ minMin: 45, maxMin: 100 });
  });

  it('a subject with neither an override nor an exposure to work from throws, naming the subject', () => {
    expect(() => usefulRangeOf({ id: 'zz', name: 'zz', targets: [{ id: 'zz', name: 'zz', raHours: 1, decDeg: 1 }] })).toThrow(/Subject zz: no useful range and no exposure/);
  });

  it('planning a subject with neither an override nor an exposure throws, naming the subject (no silent default)', () => {
    const bare = { id: 'zz', name: 'zz', targets: [{ id: 'zz', name: 'zz', raHours: 5.588, decDeg: -5.39 }] };
    expect(() => planCampaign(base({ subjects: [bare] }))).toThrow(/Subject zz: no useful range and no exposure/);
  });

  it('a rig with missing optics throws, naming what is missing', () => {
    const bad = subj('a', 1, 1, { exposure: { bortle: 6, rig: { train: {}, camera: {}, filter: null } } });
    expect(() => usefulRangeOf(bad)).toThrow(/needs .*focalRatio/);
  });
});

describe('input checks', () => {
  const m42 = subj('m42', 5.588, -5.39);
  it('rejects a minimum altitude outside [0, 90)', () => {
    for (const minAltitude of [-30, -0.1, 90, 95]) expect(() => planCampaign(base({ subjects: [m42], minAltitude }))).toThrow(/minAltitude/);
    expect(() => planCampaign(base({ subjects: [m42], minAltitude: 0 }))).not.toThrow();
  });

  it('rejects more than 14 nights, a bad cap, a bad range, a bad value and duplicate ids', () => {
    expect(() => planCampaign(base({ subjects: [m42], nights: 15 }))).toThrow(/nights/);
    expect(() => planCampaign(base({ subjects: [{ ...m42, hoursPerNight: 2.01 }] }))).toThrow(/hoursPerNight/);
    expect(() => planCampaign(base({ subjects: [{ ...m42, ...range(100, 50) }] }))).toThrow(/useful range/);
    expect(() => planCampaign(base({ subjects: [{ ...m42, ...range(92, 300) }] }))).toThrow(/useful range/);
    expect(() => planCampaign(base({ subjects: [{ ...m42, value: 0 }] }))).toThrow(/value/);
    expect(() => planCampaign(base({ subjects: [m42, m42] }))).toThrow(/Duplicate/);
  });

  it('refuses a pair without an aim point', () => {
    const pair = { ...m42, targets: [...m42.targets, { id: 'x', name: 'x', raHours: 5.5, decDeg: -4.8 }] };
    expect(() => planCampaign(base({ subjects: [pair] }))).toThrow(/aim/);
  });

  it('honours a start time: nothing is placed before it', () => {
    const night = tonightsNight(PHX, '2026-12-10', 'America/Phoenix');
    const startTime = clockOf(new Date((night.start as Date).getTime() + 4 * 60 * MIN), 'America/Phoenix');
    const n = scheduleNight(base({ subjects: [m42], startTime }), 0);
    expect((n.start as Date).getTime()).toBeGreaterThanOrEqual((night.start as Date).getTime() + 4 * 60 * MIN - MIN);
    expect(n.slots[0].start.getTime()).toBeGreaterThanOrEqual((n.start as Date).getTime());
  });
});

describe('a fit night: winter site, four zones, six targets', () => {
  const horizon = arcToHorizonPoints([
    { startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 },
    { startAz: 150, endAz: 170, heightDeg: 50 }, { startAz: 340, endAz: 20, heightDeg: 30 },
  ]);
  const six = (over: Partial<CampaignSubject>): CampaignSubject[] =>
    [subj('t1', 5.588, -5.39, over), subj('t2', 0.712, 41.27, over), subj('t3', 6.52, 4.95, over), subj('t4', 3.79, 24.1, over), subj('t5', 1.564, 30.66, over), subj('t6', 5.575, 22.01, over)];

  it('at 90 min each all six fit on one night; leftover lengthens, no slot is a token', () => {
    const input = base({ subjects: six(range(90, 300)), horizon });
    const n = scheduleNight(input, 0);
    expect(reachedTonight(n, input, ZERO(6))).toBe(6);
    expect(n.outcomes.every((o) => o.gotMin >= 90)).toBe(true);
    expect(n.cutLine.firstCutId).toBeNull();
    expect(n.cutLine.text).toBeNull();
    // Leftover went to lengthening: at least one target is above its minimum.
    expect(n.outcomes.some((o) => o.gotMin > 90)).toBe(true);
    expectBest(input, n, ZERO(6));
    assertValidNight(n, input);
  });

  it('at 150 min each only three fit; the first three in list order that can are kept, the rest are cut and named', () => {
    const input = base({ subjects: six(range(150, 300)), horizon });
    const r = planCampaign(input);
    const n = r.nights[0];
    expectBest(input, n, ZERO(6));
    expect(reachedTonight(n, input, ZERO(6))).toBe(3);
    expect(r.perSubject.map((p) => p.status)).toEqual(['useful', 'useful', 'cut', 'useful', 'cut', 'cut']);
    expect(r.cutLine.cutIds).toEqual(['t3', 't5', 't6']);
    expect(r.cutLine.firstCutId).toBe('t3');
    expect(r.cutLine.lastFitId).toBe('t2');
    for (const p of r.perSubject.filter((x) => x.status === 'cut')) {
      expect(p.totalMin).toBe(0);
      expect(p.nightsUsed).toBe(0);
      expect(p.reason?.code).toBe('no-room');
    }
    expect(r.cutLine.needMin).toBe(153);
    expect(r.cutLine.text).toContain('t3');
    assertValidNight(n, input);
  });

  it('three nights: the cut targets roll to the next nights, totals add up toward maxUseful, full targets drop out', () => {
    const input = base({ subjects: six(range(150, 300)), horizon, nights: 3 });
    const r = planCampaign(input);
    const got = ZERO(6);
    r.nights.forEach((n) => {
      expectBest(input, n, got);
      assertValidNight(n, input);
      n.outcomes.forEach((o, i) => {
        // A target already at 300 is never placed again.
        if (got[i] >= 300) expect(o.gotMin).toBe(0);
        got[i] += o.gotMin;
      });
    });
    r.perSubject.forEach((p, i) => {
      expect(p.totalMin).toBe(got[i]);
      expect(p.totalMin).toBeLessThanOrEqual(300);
      expect(p.nightsUsed).toBe(r.nights.filter((n) => n.outcomes[i].gotMin > 0).length);
      expect(p.status).toBe(p.totalMin >= 300 ? 'full' : p.totalMin >= 150 ? 'useful' : 'cut');
    });
    expect(r.perSubject.filter((p) => p.status !== 'cut').length).toBeGreaterThan(3);
    expect(planCampaign(input)).toEqual(r);
  });
});

describe('restated rows from earlier rounds: how many fit at minUseful, which is cut', () => {
  const four = (over: Partial<CampaignSubject>): CampaignSubject[] =>
    [subj('m81', 9.926, 69.07, over), subj('m51', 13.498, 47.2, over), subj('m101', 14.053, 54.35, over), subj('m44', 8.67, 19.67, over)];
  const portland = { site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-03-15', minAltitude: 30 };

  it('Portland 2027-03-15, min alt 30, four targets: all fit at 90; at 150 three fit and the last in the list is cut with 153 needed, 5 left', () => {
    const all = base({ ...portland, subjects: four({}) });
    const a = scheduleNight(all, 0);
    expect(reachedTonight(a, all, ZERO(4))).toBe(4);
    expectBest(all, a, ZERO(4));

    const tight = base({ ...portland, subjects: four(range(150, 300)) });
    const r = planCampaign(tight);
    expectBest(tight, r.nights[0], ZERO(4));
    expect(r.perSubject.map((p) => p.status)).toEqual(['useful', 'useful', 'useful', 'cut']);
    expect(r.cutLine).toMatchObject({ firstCutId: 'm44', lastFitId: 'm101', needMin: 153, leftMin: 5, cutIds: ['m44'] });
    expect(r.cutLine.text).toBe('m44: needs 153 min, 5 left (2027-03-15)');
  });

  it('Portland, min 200: two fit, the first of the other two is named as the cut line', () => {
    const input = base({ ...portland, subjects: four(range(200, 300)) });
    const r = planCampaign(input);
    expectBest(input, r.nights[0], ZERO(4));
    expect(r.perSubject.map((p) => p.status)).toEqual(['full', 'useful', 'cut', 'cut']);
    expect(r.cutLine.firstCutId).toBe('m101');
    expect(r.cutLine.lastFitId).toBe('m51');
  });

  it('Phoenix 2026-12-10, four zones, six targets, one night at 150: three fit, in list-order priority', () => {
    const horizon = arcToHorizonPoints([
      { startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 },
      { startAz: 150, endAz: 170, heightDeg: 50 }, { startAz: 340, endAz: 20, heightDeg: 30 },
    ]);
    const input = base({
      horizon,
      subjects: [subj('m42', 5.588, -5.39, range(150, 300)), subj('m31', 0.712, 41.27, range(150, 300)), subj('ros', 6.52, 4.95, range(150, 300)), subj('m45', 3.79, 24.1, range(150, 300)), subj('m33', 1.564, 30.66, range(150, 300)), subj('m1', 5.575, 22.01, range(150, 300))],
    });
    const r = planCampaign(input);
    expectBest(input, r.nights[0], ZERO(6));
    expect(r.perSubject.filter((p) => p.status !== 'cut').map((p) => p.subjectId)).toEqual(['m42', 'm31', 'm45']);
  });

  it('Sydney 2027-05-10, min alt 30, five targets at 150: four fit; the fifth is cut because its clear time holds 150 min only without the flip', () => {
    const input = base({
      site: SYD, timeZone: 'Australia/Sydney', startDate: '2027-05-10', minAltitude: 30,
      subjects: [subj('m8', 18.06, -24.38, range(150, 300)), subj('m104', 12.666, -11.62, range(150, 300)), subj('tuc', 0.4, -72.08, range(150, 300)), subj('m16', 18.313, -13.78, range(150, 300)), subj('car', 10.75, -59.87, range(150, 300))],
    });
    const r = planCampaign(input);
    expectBest(input, r.nights[0], ZERO(5));
    expect(r.cutLine.cutIds).toEqual(['tuc']);
    expect(r.perSubject[2].reason?.code).toBe('flip-cuts-slot');
    expect(r.cutLine.lastFitId).toBe('m104');
  });

  it('Portland 2027-01-20, min alt 30, seven targets (beam), three nights at 120: every target gets its minimum within the nights, and no night is worse than the exact best by more than one target', () => {
    const seven = [subj('m42', 5.588, -5.39), subj('m31', 0.712, 41.27), subj('ros', 6.52, 4.95), subj('m45', 3.79, 24.1), subj('m33', 1.564, 30.66), subj('m1', 5.575, 22.01), subj('ic434', 5.68, -2.46)]
      .map((s) => ({ ...s, ...range(120, 300) }));
    const input = base({ site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-01-20', minAltitude: 30, nights: 3, subjects: seven });
    const r = planCampaign(input);
    const got = ZERO(7);
    r.nights.forEach((n) => {
      expectBest(input, n, got);
      assertValidNight(n, input);
      n.outcomes.forEach((o, i) => { got[i] += o.gotMin; });
    });
    expect(r.perSubject.every((p) => p.status !== 'cut')).toBe(true);
    expect(r.cutLine.firstCutId).toBeNull();
  });
});

describe('edge lists', () => {
  it('one target: it is made useful, then lengthened to maxUseful and stops there', () => {
    const input = base({ subjects: [subj('only', 5.588, -5.39, range(60, 180))], nights: 3 });
    const r = planCampaign(input);
    expectBest(input, r.nights[0], [0]);
    expect(r.nights[0].outcomes[0].gotMin).toBeGreaterThanOrEqual(60);
    expect(r.perSubject[0].status).toBe('full');
    expect(r.perSubject[0].totalMin).toBe(180);
    // At maxUseful it is done: no later night places it again.
    let sum = 0;
    for (const n of r.nights) {
      if (sum >= 180) expect(n.slots).toHaveLength(0);
      sum += n.outcomes[0].gotMin;
    }
    expect(r.cutLine.text).toBeNull();
  });

  it('a list where all fit reports no cut', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(30, 60)), subj('b', 0.712, 41.27, range(30, 60)), subj('c', 6.52, 4.95, range(30, 60))] });
    const r = planCampaign(input);
    expect(r.perSubject.map((p) => p.status)).toEqual(['full', 'full', 'full']);
    expect(r.cutLine).toEqual({ lastFitId: null, firstCutId: null, needMin: null, leftMin: null, text: null, cutIds: [] });
    expect(r.nights[0].cutLine.entries.every((e) => e.fits)).toBe(true);
  });

  it('a list where none fit: every target is cut with a reason, no slot is placed', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(900, 900)), subj('b', 0.712, 41.27, range(900, 900))] });
    const r = planCampaign(input);
    expect(r.nights[0].slots).toEqual([]);
    expect(r.perSubject.map((p) => p.status)).toEqual(['cut', 'cut']);
    expect(r.perSubject.every((p) => p.reason?.code === 'window-too-short' && p.totalMin === 0)).toBe(true);
    expect(r.cutLine.firstCutId).toBe('a');
    expect(r.cutLine.lastFitId).toBeNull();
    expect(r.cutLine.cutIds).toEqual(['a', 'b']);
  });

  it('no token slot: a target whose clear time is under its minUseful gets nothing, however much night is free', () => {
    // Dec -25 peaks near 31 degrees here: it is above 31 for well under 120 min.
    const input = base({ subjects: [subj('low', 5.6, -25, range(120, 300))], minAltitude: 31 });
    const r = planCampaign(input);
    expect(r.nights[0].slots).toEqual([]);
    expect(r.perSubject[0].status).toBe('cut');
    expect(r.perSubject[0].reason?.text).toContain('needs 120 min');
  });
});

describe('reasons', () => {
  it('a target wholly behind a zone is cut as blocked', () => {
    const wall = arcToHorizonPoints([{ startAz: 90, endAz: 270, heightDeg: 42 }]);
    const input = base({ subjects: [subj('low', 5.6, -25), subj('m31', 0.712, 41.27)], horizon: wall, minAltitude: 20 });
    const r = planCampaign(input);
    expect(r.perSubject[0].status).toBe('cut');
    expect(r.perSubject[0].reason?.code).toBe('blocked-by-horizon');
    expect(r.nights[0].outcomes[0].reason?.text).toContain('blocked zone');
  });

  it('a target that never clears the minimum altitude is cut as below-min-altitude', () => {
    const r = planCampaign(base({ subjects: [subj('south', 5.6, -70)], minAltitude: 20 }));
    expect(r.perSubject[0].reason?.code).toBe('below-min-altitude');
  });

  it('polar night is named as such', () => {
    const r = planCampaign({
      subjects: [subj('m82', 9.93, 69.68)], site: { latitude: 85, longitude: 0, elevationM: 0 }, timeZone: 'UTC',
      horizon: null, minAltitude: 25, startDate: '2026-12-21', nights: 1,
    });
    expect(r.perSubject[0].reason?.code).toBe('polar-night');
    expect(r.cutLine.text).toContain('Polar night');
  });

  it('blames the flip when the clear time holds the imaging but not the flip too', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(120, 300))], minAltitude: 48.1 });
    const r = planCampaign(input);
    expect(r.perSubject[0].reason?.code).toBe('flip-cuts-slot');
    expect(r.perSubject[0].reason?.text).toContain('flip');
  });

  it('says the grid lost the edge, not the flip, when the clear time holds the time and the flip', () => {
    const input = base({
      site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-03-15', minAltitude: 63.6,
      subjects: [subj('a', 9.926, 69.07, range(180, 300))],
    });
    const r = planCampaign(input);
    expect(r.perSubject[0].reason?.code).toBe('window-too-short');
    expect(r.perSubject[0].reason?.text).toContain('grid');
  });
});

describe('meridian flip', () => {
  it('marks the flip and counts its minutes when only a straddling slot fits', () => {
    // At 45 degrees the target is up about 3.1 h: 120 min cannot sit on one side of the transit.
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(120, 120))], minAltitude: 45 });
    const n = scheduleNight(input, 0);
    const slot = n.slots[0];
    expect(n.subjects[0].unavoidableFlip).toBe(true);
    expect(slot.flip).toBe(true);
    expect(slot.flipMin).toBe(MERIDIAN_FLIP_MIN);
    expect(slot.integrationMin).toBe(120);
    expect(n.packing.usedMin).toBe(120 + MERIDIAN_FLIP_MIN);
    assertValidNight(n, input);
  });

  it('prefers a clean side when one fits', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(120, 120))], minAltitude: 30 });
    const n = scheduleNight(input, 0);
    expect(n.subjects[0].unavoidableFlip).toBe(false);
    expect(n.slots[0].flip).toBe(false);
  });

  it('uses the aim point of a pair for the transit', () => {
    const pair: CampaignSubject = {
      id: 'pair', name: 'pair',
      targets: [{ id: 'p1', name: 'p1', raHours: 5.588, decDeg: -5.39 }, { id: 'p2', name: 'p2', raHours: 5.585, decDeg: -4.84 }],
      aim: { raHours: 5.5865, decDeg: -5.1 },
      exposure: TEST_EXPOSURE,
    };
    const n = scheduleNight(base({ subjects: [pair] }), 0);
    expect(n.subjects[0].transit?.getTime()).toBe(nextMeridianTransit(5.5865, -5.1, n.start as Date, PHX).getTime());
    expect(n.slots[0].integrationMin).toBeGreaterThanOrEqual(usefulRangeOf(pair).minMin);
  });
});

describe('cap and value', () => {
  const two = (a: Partial<CampaignSubject>, b: Partial<CampaignSubject>): CampaignSubject[] => [subj('a', 5.588, -5.39, a), subj('b', 0.712, 41.27, b)];

  it('hoursPerNight caps the lengthening but never lowers the first useful slot below minUseful', () => {
    const input = base({ subjects: two({ hoursPerNight: 1, ...range(90, 300) }, { hoursPerNight: 2.5, ...range(60, 300) }) });
    const n = scheduleNight(input, 0);
    expectBest(input, n, ZERO(2));
    expect(n.outcomes[0].gotMin).toBe(90);
    expect(n.outcomes[1].gotMin).toBeLessThanOrEqual(150);
    expect(n.outcomes[1].gotMin).toBeGreaterThanOrEqual(60);
  });

  it('leftover goes to the higher value first; with no values, to the earlier target in the list', () => {
    const t = (value: [number | undefined, number | undefined]) => base({ subjects: two({ ...range(60, 480), value: value[0] }, { ...range(60, 480), value: value[1] }) });
    const byList = scheduleNight(t([undefined, undefined]), 0);
    const byValue = scheduleNight(t([1, 5]), 0);
    expect(byList.outcomes[0].gotMin).toBeGreaterThan(60);
    expect(byList.outcomes[0].gotMin).toBeGreaterThanOrEqual(byValue.outcomes[0].gotMin);
    expect(byValue.outcomes[1].gotMin).toBeGreaterThanOrEqual(byList.outcomes[1].gotMin);
    expect(byValue.outcomes[1].gotMin + byValue.outcomes[0].gotMin).toBe(byList.outcomes[1].gotMin + byList.outcomes[0].gotMin);
  });
});

describe('candidates', () => {
  it('reports the longest length that fits for a candidate in the room left, whole minutes', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39, range(60, 120))], candidates: [subj('c', 5.278, 45.998)] });
    const n = scheduleNight(input, 0);
    const fit = n.packing.next.find((f) => f.subjectId === 'c');
    expect(fit?.fitMin).toBeGreaterThanOrEqual(MIN_SLOT_MIN);
    expect((fit?.fitMin ?? 0) % 5).toBe(0);
    const p = n.packing;
    expect(p.usedMin + p.slewMin + p.leftMin).toBe(p.nightMin);
    for (const v of [p.nightMin, p.usedMin, p.slewMin, p.leftMin]) expect(Number.isInteger(v)).toBe(true);
    expect(p.slewMin).toBe((n.slots.length - 1) * SLEW_CENTER_MIN);
  });
});

describe('determinism and speed', () => {
  it('two runs on the same input are deepEqual', () => {
    const input = base({ subjects: [subj('a', 5.588, -5.39), subj('b', 0.712, 41.27), subj('c', 6.52, 4.95), subj('d', 3.79, 24.1)], nights: 3 });
    expect(planCampaign(input)).toEqual(planCampaign(input));
  });

  it('every slot is usable at its samples across a 14-night, 6-target run, and the run takes seconds', () => {
    const input = base({
      subjects: [subj('a', 5.588, -5.39), subj('b', 0.712, 41.27), subj('c', 6.52, 4.95), subj('d', 3.79, 24.1), subj('e', 5.575, 22.01), subj('f', 1.564, 30.66)],
      nights: 14, minAltitude: 20,
    });
    // CPU time, not wall clock: jest workers running other suites at the same time do not count against it.
    const t = process.cpuUsage();
    const r = planCampaign(input);
    const used = process.cpuUsage(t);
    expect((used.user + used.system) / 1000).toBeLessThan(10000);
    r.nights.forEach((n) => assertValidNight(n, input));
    expect(r.nights.every((n) => n.slots.every((s) => usableAt(input.subjects.find((x) => x.id === s.subjectId) as CampaignSubject, input, s.start.getTime())))).toBe(true);
  });
});

describe('source', () => {
  it('names no target and has no per-object logic', () => {
    const dir = __dirname;
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'testkit.ts');
    expect(files.length).toBeGreaterThan(3);
    const named = /\b(M ?\d{1,3}|NGC ?\d+|IC ?\d+)\b|\b(Orion|Andromeda|Pleiades|Rosette|Veil|Horsehead|Crab|Sombrero|Whirlpool)\b/i;
    for (const f of files) {
      // Catalog numbers are matched with their capital M; a lowercase m2 is a variable.
      const text = readFileSync(join(dir, f), 'utf8').replace(/\bm\d{1,3}\b/g, '');
      expect({ f, hit: text.match(named)?.[0] ?? null }).toEqual({ f, hit: null });
    }
  });
});
