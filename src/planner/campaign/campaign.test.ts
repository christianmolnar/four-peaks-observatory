import { nextMeridianTransit, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { limitAltitudeAt } from '../horizon';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { clockOf } from '../itinerary/timeline';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints } from '../profile';
import { MAX_LOSS_MIN, MIN_USEFUL_MIN, planCampaign, scheduleNight } from './index';
import type { CampaignInput, CampaignSlot, CampaignSubject } from './index';

const PHX: Site = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
const TZ = 'America/Phoenix';
const MIN = 60000;

const subject = (id: string, raHours: number, decDeg: number, hoursPerNight: number): CampaignSubject => ({
  id, name: id, targets: [{ id, name: id, raHours, decDeg }], hoursPerNight,
});
const M42 = (h: number) => subject('m42', 5.588, -5.39, h);
const M31 = (h: number) => subject('m31', 0.712, 41.27, h);
const ROSETTE = (h: number) => subject('rosette', 6.52, 4.95, h);
const PLEIADES = (h: number) => subject('m45', 3.79, 24.1, h);

const base = (over: Partial<CampaignInput>): CampaignInput => ({
  subjects: [], site: PHX, timeZone: TZ, horizon: null, minAltitude: 25, startDate: '2026-12-10', nights: 1, ...over,
});

/** The oracle for "usable": the documented rule, evaluated straight from the astro functions. */
const usableAt = (s: CampaignSubject, input: CampaignInput, t: number): boolean => {
  const a = s.aim ?? s.targets[0];
  const p = targetAltAz(a.raHours, a.decDeg, new Date(t), input.site);
  return p.altitude >= limitAltitudeAt(input.horizon, p.azimuth, input.minAltitude) - 1e-6;
};
const assertSlotUsable = (slot: CampaignSlot, s: CampaignSubject, input: CampaignInput) => {
  const end = slot.end.getTime();
  for (let t = slot.start.getTime(); t <= end; t += 5 * MIN) expect(usableAt(s, input, t)).toBe(true);
  expect(usableAt(s, input, end)).toBe(true);
};

describe('winter site, 4 subjects at 2 h, 3 nights', () => {
  const horizon = arcToHorizonPoints([
    { startAz: 60, endAz: 110, heightDeg: 35 },
    { startAz: 230, endAz: 300, heightDeg: 42 },
  ]);
  const input = base({ subjects: [M42(2), M31(2), ROSETTE(2), PLEIADES(2)], horizon, nights: 3 });
  const result = planCampaign(input);

  it('places something on every night', () => {
    expect(result.nights).toHaveLength(3);
    for (const n of result.nights) expect(n.slots.length).toBeGreaterThan(0);
  });

  it('keeps every slot above the minimum altitude and outside every blocked zone, at each 5-minute sample', () => {
    for (const n of result.nights) {
      for (const slot of n.slots) {
        assertSlotUsable(slot, input.subjects.find((s) => s.id === slot.subjectId) as CampaignSubject, input);
      }
    }
  });

  it('never overlaps two slots and leaves the slew time between them', () => {
    for (const n of result.nights) {
      for (let i = 1; i < n.slots.length; i++) {
        expect(n.slots[i].start.getTime() - n.slots[i - 1].end.getTime()).toBeGreaterThanOrEqual(SLEW_CENTER_MIN * MIN);
      }
      for (const s of n.slots) {
        expect(s.start.getTime()).toBeGreaterThanOrEqual((n.start as Date).getTime());
        expect(s.end.getTime()).toBeLessThanOrEqual((n.end as Date).getTime());
      }
    }
  });

  it('is deterministic: two runs on the same input are deepEqual', () => {
    expect(planCampaign(input)).toEqual(result);
  });

  it('totals each subject across the nights', () => {
    for (const p of result.perSubject) {
      const sum = result.nights.reduce((a, n) => a + (n.outcomes.find((o) => o.subjectId === p.subjectId)?.gotMin ?? 0), 0);
      expect(p.gotMin).toBe(sum);
      expect(p.requestedMin).toBe(360);
    }
  });
});

describe('meridian transit', () => {
  it('places a 2 h slot on one side of the transit when a side fits (no flip)', () => {
    const input = base({ subjects: [M42(2)], minAltitude: 30 });
    const n = scheduleNight(input, 0);
    const slot = n.slots[0];
    const transit = n.subjects[0].transit as Date;
    expect(transit).not.toBeNull();
    expect(n.subjects[0].unavoidableFlip).toBe(false);
    expect(slot.flip).toBe(false);
    expect(slot.flipMin).toBe(0);
    expect(slot.integrationMin).toBe(120);
    const crosses = slot.start.getTime() < transit.getTime() && transit.getTime() < slot.end.getTime();
    expect(crosses).toBe(false);
  });

  it('marks the flip and counts its minutes when only a straddling slot of that length fits', () => {
    // M42 peaks near 51 deg here; above 45 deg it is up about 3.1 h, so 2 h cannot sit on one side of the transit.
    const input = base({ subjects: [M42(2)], minAltitude: 45 });
    const n = scheduleNight(input, 0);
    const slot = n.slots[0];
    const transit = n.subjects[0].transit as Date;
    expect(n.subjects[0].unavoidableFlip).toBe(true);
    expect(slot.flip).toBe(true);
    expect(slot.flipMin).toBe(MERIDIAN_FLIP_MIN);
    expect(slot.integrationMin).toBe(120);
    expect(slot.start.getTime()).toBeLessThan(transit.getTime());
    expect(slot.end.getTime()).toBeGreaterThan(transit.getTime());
    expect((slot.end.getTime() - slot.start.getTime()) / MIN).toBe(120 + MERIDIAN_FLIP_MIN);
    expect(n.packing.usedMin).toBe(120 + MERIDIAN_FLIP_MIN);
    assertSlotUsable(slot, input.subjects[0], input);
    expect(n.outcomes[0].reason).toBeNull();
  });

  it('uses the aim point of a pair for the transit', () => {
    const pair: CampaignSubject = {
      id: 'm42-rm', name: 'M42 + Running Man',
      targets: [{ id: 'm42', name: 'M42', raHours: 5.588, decDeg: -5.39 }, { id: 'ngc1977', name: 'Running Man', raHours: 5.585, decDeg: -4.84 }],
      aim: { raHours: 5.5865, decDeg: -5.1 },
      hoursPerNight: 2,
    };
    const n = scheduleNight(base({ subjects: [pair] }), 0);
    expect(n.subjects[0].transit?.getTime()).toBe(nextMeridianTransit(5.5865, -5.1, n.start as Date, PHX).getTime());
    expect(n.slots[0].integrationMin).toBe(120);
  });

  it('refuses a pair without an aim point', () => {
    const pair = { ...M42(2), targets: [...M42(2).targets, { id: 'x', name: 'x', raHours: 5.5, decDeg: -4.8 }] };
    expect(() => planCampaign(base({ subjects: [pair] }))).toThrow(/aim/);
  });
});

describe('blocked horizon', () => {
  it('gives 0 minutes and a reason to a subject wholly behind a 42 degree zone', () => {
    // Dec -25 peaks near 31 deg in the south, under a 42 degree zone that spans every azimuth it uses above 20 deg.
    const wall = arcToHorizonPoints([{ startAz: 90, endAz: 270, heightDeg: 42 }]);
    const input = base({ subjects: [subject('low', 5.6, -25, 2), M31(2)], horizon: wall, minAltitude: 20 });
    const o = scheduleNight(input, 0).outcomes[0];
    expect(o.gotMin).toBe(0);
    expect(o.slot).toBeNull();
    expect(o.reason?.code).toBe('blocked-by-horizon');
    expect(o.reason?.text).toContain('blocked zone');
  });

  it('gives a subject partly behind a zone only its clear minutes', () => {
    const horizon = arcToHorizonPoints([{ startAz: 60, endAz: 140, heightDeg: 42 }]);
    const input = base({ subjects: [M42(10)], horizon, minAltitude: 20 });
    const n = scheduleNight(input, 0);
    const o = n.outcomes[0];
    const longest = Math.max(...n.subjects[0].windows.map((w) => (w.end.getTime() - w.start.getTime()) / MIN));
    expect(o.gotMin).toBeGreaterThan(0);
    expect(o.gotMin).toBeLessThan(600);
    expect(o.gotMin).toBeLessThanOrEqual(longest);
    expect(o.gotMin).toBeGreaterThanOrEqual(longest - 15);
    expect(o.reason?.code).toBe('window-too-short');
    assertSlotUsable(o.slot as CampaignSlot, input.subjects[0], input);
  });

  it('says so when a subject never clears the minimum altitude', () => {
    const input = base({ subjects: [subject('south', 5.6, -70, 1)], minAltitude: 20 });
    expect(scheduleNight(input, 0).outcomes[0].reason?.code).toBe('below-min-altitude');
  });
});

describe.each([2.5, 1.5])('packing: 4 x %s h in a 9 h night', (hours) => {
  const night = tonightsNight(PHX, '2026-12-10', TZ);
  const startTime = clockOf(new Date((night.end as Date).getTime() - 9 * 60 * MIN), TZ);
  const input = base({
    subjects: [M42(hours), M31(hours), ROSETTE(hours), PLEIADES(hours)],
    candidates: [subject('capella', 5.278, 45.998, hours)],
    startTime,
    minAltitude: 20,
  });
  const n = scheduleNight(input, 0);

  /** Brute force from the astro functions and the slots: the longest slot of >= 30 min that fits the room left, flip included. */
  const oracle = (s: CampaignSubject): number => {
    const t0 = (n.start as Date).getTime();
    const t1 = (n.end as Date).getTime();
    const a = s.targets[0];
    const transit = nextMeridianTransit(a.raHours, a.decDeg, n.start as Date, PHX).getTime();
    for (let len = Math.floor((t1 - t0) / (5 * MIN)) * 5; len >= 30; len -= 5) {
      for (let st = t0; ; st += 5 * MIN) {
        const crosses = transit > st && transit < st + len * MIN;
        const en = st + (len + (crosses ? MERIDIAN_FLIP_MIN : 0)) * MIN;
        if (en > t1) break;
        let ok = true;
        for (let t = st; t <= en && ok; t += 5 * MIN) ok = usableAt(s, input, t);
        ok = ok && usableAt(s, input, en);
        const pad = SLEW_CENTER_MIN * MIN;
        ok = ok && n.slots.every((o) => en + pad <= o.start.getTime() || st >= o.end.getTime() + pad);
        if (ok) return len;
      }
    }
    return 0;
  };

  it('is a 9 h night', () => {
    expect(n.packing.nightMin).toBeGreaterThanOrEqual(540);
    expect(n.packing.nightMin).toBeLessThan(541);
  });

  it('adds up: used + slew + left is the night', () => {
    const p = n.packing;
    expect(p.usedMin + p.slewMin + p.leftMin).toBe(p.nightMin);
    expect(p.usedMin).toBe(n.slots.reduce((a, s) => a + s.integrationMin + s.flipMin, 0));
    expect(p.slewMin).toBe((n.slots.length - 1) * SLEW_CENTER_MIN);
  });

  it('reports the longest length that fits for the candidate, as an independent search finds it', () => {
    const fit = n.packing.next.find((f) => f.subjectId === 'capella');
    expect(fit).toBeDefined();
    const expected = oracle(input.candidates?.[0] as CampaignSubject);
    console.log(`packing: used ${n.packing.usedMin} slew ${n.packing.slewMin} left ${n.packing.leftMin}; slots ${n.slots.map((s) => `${s.subjectId}:${s.integrationMin}${s.flip ? '+flip' : ''}`).join(' ')}; capella fits ${fit?.fitMin} (oracle ${expected})`);
    expect(fit?.fitMin).toBe(expected);
    expect((fit?.fitMin ?? 0) % 5).toBe(0);
  });

  it('lists subjects that got no minutes among the next-fit answers', () => {
    for (const o of n.outcomes.filter((x) => x.gotMin === 0)) expect(n.packing.next.some((f) => f.subjectId === o.subjectId)).toBe(true);
  });
});

describe('packing: total minutes come first', () => {
  const four = [M42(2.5), M31(2.5), ROSETTE(2.5), PLEIADES(2.5)];

  it.each([30, 20])('Phoenix 2026-12-10, min alt %s: four subjects at 2.5 h all get 150', (minAltitude) => {
    const input = base({ subjects: four, minAltitude });
    const n = scheduleNight(input, 0);
    expect(n.outcomes.map((o) => o.gotMin)).toEqual([150, 150, 150, 150]);
    expect(n.outcomes.every((o) => o.reason === null)).toBe(true);
    for (const s of n.slots) assertSlotUsable(s, four.find((x) => x.id === s.subjectId) as CampaignSubject, input);
    if (minAltitude === 30) {
      expect(n.packing.usedMin).toBe(610);
      expect(n.slots.filter((s) => s.flip)).toHaveLength(1);
    }
  });

  it('a 9 h night gives three of four subjects their full 2.5 h', () => {
    const night = tonightsNight(PHX, '2026-12-10', TZ);
    const startTime = clockOf(new Date((night.end as Date).getTime() - 9 * 60 * MIN), TZ);
    const n = scheduleNight(base({ subjects: four, startTime, minAltitude: 20 }), 0);
    expect(n.outcomes.filter((o) => o.gotMin === 150).length).toBeGreaterThanOrEqual(3);
  });
});

describe('short reasons', () => {
  it('blames the flip, not the window, when the window holds the imaging time but not the flip too', () => {
    // M42 on 2026-12-10 at min alt 48.1: one 129.4 min window, transit inside it.
    const input = base({ subjects: [M42(2)], minAltitude: 48.1 });
    const n = scheduleNight(input, 0);
    const o = n.outcomes[0];
    expect(n.subjects[0].windows.map((w) => (w.end.getTime() - w.start.getTime()) / MIN)[0]).toBeGreaterThanOrEqual(120);
    expect(o.gotMin).toBeLessThan(120);
    expect(o.reason?.code).toBe('flip-cuts-slot');
    expect(o.reason?.text).toContain('flip');
    expect(n.subjects[0].unavoidableFlip).toBe(false);
  });
});

describe('carrying a shortfall across nights', () => {
  it('gives every one of six 2 h subjects minutes on at least one of three nights', () => {
    const horizon = arcToHorizonPoints([
      { startAz: 60, endAz: 110, heightDeg: 40 },
      { startAz: 230, endAz: 300, heightDeg: 47 },
      { startAz: 120, endAz: 160, heightDeg: 35 },
      { startAz: 0, endAz: 40, heightDeg: 33 },
    ]);
    // Without the carry-over the Pleiades get 0 min on all three nights here.
    const subs = [M42(2), M31(2), ROSETTE(2), PLEIADES(2), subject('m33', 1.564, 30.66, 2), subject('m1', 5.575, 22.01, 2)];
    const r = planCampaign(base({ subjects: subs, horizon, nights: 3, minAltitude: 25 }));
    expect(r.perSubject.map((p) => p.gotMin > 0)).toEqual([true, true, true, true, true, true]);
    expect(planCampaign(base({ subjects: subs, horizon, nights: 3, minAltitude: 25 }))).toEqual(r);
  });
});

describe('output', () => {
  it('reports whole minutes', () => {
    const p = scheduleNight(base({ subjects: [M42(2)], candidates: [M31(2)] }), 0).packing;
    for (const v of [p.nightMin, p.usedMin, p.slewMin, p.leftMin]) expect(Number.isInteger(v)).toBe(true);
  });
});

describe('input checks', () => {
  it('rejects a minimum altitude outside [0, 90)', () => {
    for (const minAltitude of [-30, -0.1, 90, 95]) expect(() => planCampaign(base({ subjects: [M42(2)], minAltitude }))).toThrow(/minAltitude/);
    expect(() => planCampaign(base({ subjects: [M42(2)], minAltitude: 0 }))).not.toThrow();
  });

  it('rejects more than 14 nights, bad hours and duplicate ids', () => {
    expect(() => planCampaign(base({ subjects: [M42(2)], nights: 15 }))).toThrow(/nights/);
    expect(() => planCampaign(base({ subjects: [M42(2.01)] }))).toThrow(/hoursPerNight/);
    expect(() => planCampaign(base({ subjects: [M42(2), M42(1)] }))).toThrow(/Duplicate/);
  });

  it('honours a start time: nothing is placed before it', () => {
    const night = tonightsNight(PHX, '2026-12-10', TZ);
    const startTime = clockOf(new Date((night.start as Date).getTime() + 4 * 60 * MIN), TZ);
    const n = scheduleNight(base({ subjects: [M42(2)], startTime }), 0);
    expect((n.start as Date).getTime()).toBeGreaterThanOrEqual((night.start as Date).getTime() + 4 * 60 * MIN - MIN);
    expect(n.slots[0].start.getTime()).toBeGreaterThanOrEqual((n.start as Date).getTime());
  });
});

describe('exact packing (inputs where heuristics lost minutes)', () => {
  const POR: Site = { latitude: 45.52, longitude: -122.68, elevationM: 0 };
  const SYD: Site = { latitude: -33.87, longitude: 151.21, elevationM: 0 };
  const total = (n: { outcomes: { gotMin: number }[] }): number => n.outcomes.reduce((a, o) => a + o.gotMin, 0);
  const got = (n: { outcomes: { subjectId: string; gotMin: number }[] }, id: string): number => n.outcomes.find((o) => o.subjectId === id)?.gotMin ?? -1;

  it('Phoenix 2026-12-10, four zones, min alt 25, six 2 h subjects: within 5 min of 555 / 550 / 545, everybody gets a useful share', () => {
    const horizon = arcToHorizonPoints([
      { startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 },
      { startAz: 150, endAz: 170, heightDeg: 50 }, { startAz: 340, endAz: 20, heightDeg: 30 },
    ]);
    const input = base({
      subjects: [M42(2), M31(2), ROSETTE(2), PLEIADES(2), subject('m33', 1.564, 30.66, 2), subject('m1', 5.575, 22.01, 2)],
      horizon, nights: 3,
    });
    const r = planCampaign(input);
    [555, 550, 545].forEach((best, k) => {
      expect(total(r.nights[k])).toBeLessThanOrEqual(best);
      expect(total(r.nights[k])).toBeGreaterThanOrEqual(best - MAX_LOSS_MIN);
    });
    expect(r.perSubject.every((p) => p.gotMin >= MIN_USEFUL_MIN)).toBe(true);
    expect(planCampaign(input)).toEqual(r);
  });

  it('Sydney 2027-05-10, min alt 30, five subjects: within 5 min of 620, all five get a useful slot, no flip', () => {
    const input = base({
      site: SYD, timeZone: 'Australia/Sydney', startDate: '2027-05-10', minAltitude: 30,
      subjects: [subject('m8', 18.06, -24.38, 3), subject('m104', 12.666, -11.62, 3), subject('tuc', 0.4, -72.08, 3.5), subject('m16', 18.313, -13.78, 2.5), subject('car', 10.75, -59.87, 3)],
    });
    const n = scheduleNight(input, 0);
    expect(total(n)).toBeGreaterThanOrEqual(620 - MAX_LOSS_MIN);
    expect(n.outcomes.every((o) => o.gotMin >= MIN_USEFUL_MIN)).toBe(true);
    expect(n.slots.filter((s) => s.flip)).toHaveLength(0);
  });

  it('Portland 2027-03-15, min alt 30, four 2.5 h subjects: within 5 min of 510, M101 at 150', () => {
    const input = base({
      site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-03-15', minAltitude: 30,
      subjects: [subject('m81', 9.926, 69.07, 2.5), subject('m51', 13.498, 47.2, 2.5), subject('m101', 14.053, 54.35, 2.5), subject('m44', 8.67, 19.67, 2.5)],
    });
    const n = scheduleNight(input, 0);
    expect(total(n)).toBeGreaterThanOrEqual(510 - MAX_LOSS_MIN);
    expect(got(n, 'm101')).toBe(150);
  });

  it('Portland 2027-01-20, min alt 30, seven 2 h subjects (beam): within 5 min of 440 / 435 / 430, everybody gets a useful share', () => {
    const input = base({
      site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-01-20', minAltitude: 30, nights: 3,
      subjects: [M42(2), M31(2), ROSETTE(2), PLEIADES(2), subject('m33', 1.564, 30.66, 2), subject('m1', 5.575, 22.01, 2), subject('ic434', 5.68, -2.46, 2)],
    });
    const r = planCampaign(input);
    [440, 435, 430].forEach((best, k) => {
      expect(total(r.nights[k])).toBeLessThanOrEqual(best);
      expect(total(r.nights[k])).toBeGreaterThanOrEqual(best - MAX_LOSS_MIN);
    });
    expect(r.perSubject.every((p) => p.gotMin >= MIN_USEFUL_MIN)).toBe(true);
    expect(planCampaign(input)).toEqual(r);
  });

  it('Phoenix 2027-03-15, two zones, six 2.5 h subjects: the carry costs at most 5 min a night', () => {
    const horizon = arcToHorizonPoints([{ startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 290, heightDeg: 42 }]);
    const input = base({
      startDate: '2027-03-15', horizon, nights: 3,
      subjects: [subject('m81', 9.926, 69.07, 2.5), subject('m51', 13.498, 47.2, 2.5), subject('m101', 14.053, 54.35, 2.5), subject('m44', 8.67, 19.67, 2.5), subject('m65', 11.32, 13.09, 2.5), subject('m104', 12.666, -11.62, 2.5)],
    });
    const r = planCampaign(input);
    r.nights.forEach((n, k) => {
      expect(total(n)).toBeLessThanOrEqual(total(scheduleNight(input, k)));
      expect(total(n)).toBeGreaterThanOrEqual(total(scheduleNight(input, k)) - MAX_LOSS_MIN);
    });
  });

  it('says the grid lost the edge, not the flip, when the window holds the time and the flip', () => {
    // M81 from Portland on 2027-03-15 at min alt 63.6: a 192 min window, 3 h wanted.
    const input = base({
      site: POR, timeZone: 'America/Los_Angeles', startDate: '2027-03-15', minAltitude: 63.6,
      subjects: [subject('m81', 9.926, 69.07, 3)],
    });
    const o = scheduleNight(input, 0).outcomes[0];
    expect(o.gotMin).toBeLessThan(180);
    expect(o.reason?.code).toBe('window-too-short');
    expect(o.reason?.text).toContain('grid');
  });

  it('5 subjects x 10 h x 14 nights runs in a few seconds', () => {
    const input = base({ subjects: [M42(10), M31(10), ROSETTE(10), PLEIADES(10), subject('m1', 5.575, 22.01, 10)], nights: 14, minAltitude: 20 });
    // CPU time, not wall clock: jest workers running other suites at the same time do not count against it.
    const t = process.cpuUsage();
    planCampaign(input);
    const used = process.cpuUsage(t);
    expect((used.user + used.system) / 1000).toBeLessThan(10000);
  });
});
