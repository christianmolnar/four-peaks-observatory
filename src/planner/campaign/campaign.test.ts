import { nextMeridianTransit, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { MERIDIAN_FLIP_MIN } from '../exposure/constants';
import { limitAltitudeAt } from '../horizon';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { clockOf } from '../itinerary/timeline';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints } from '../profile';
import { planCampaign, scheduleNight } from './index';
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
  const end = slot.start.getTime() + slot.integrationMin * MIN;
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

describe('input checks', () => {
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
