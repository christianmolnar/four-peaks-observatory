import type { Site } from '../astro';
import { arcToHorizonPoints } from '../profile';
import targetsData from '../data/targets.json';
import { MAX_LOSS_MIN, MIN_USEFUL_MIN, planCampaign, scheduleNight } from './index';
import type { CampaignInput, CampaignResult, CampaignSubject } from './index';

/** Lists where a subject that got one slot used to be dropped for the rest of the campaign (round 4 evaluation). */

const SITES: Record<string, { site: Site; timeZone: string }> = {
  PHX: { site: { latitude: 33.6115, longitude: -111.719, elevationM: 0 }, timeZone: 'America/Phoenix' },
  POR: { site: { latitude: 45.52, longitude: -122.68, elevationM: 0 }, timeZone: 'America/Los_Angeles' },
};
const cat = new Map((targetsData.targets as { id: string; raHours: number; decDeg: number }[]).map((t) => [t.id, t]));
const C = (id: string, hours: number): CampaignSubject => {
  const t = cat.get(id) as { raHours: number; decDeg: number };
  return { id, name: id, targets: [{ id, name: id, raHours: t.raHours, decDeg: t.decDeg }], hoursPerNight: hours };
};
const X = (id: string, raHours: number, decDeg: number, hours: number): CampaignSubject => ({ id, name: id, targets: [{ id, name: id, raHours, decDeg }], hoursPerNight: hours });
const input = (site: string, startDate: string, nights: number, subjects: CampaignSubject[], over: Partial<CampaignInput> = {}): CampaignInput =>
  ({ subjects, ...SITES[site], horizon: null, minAltitude: 25, startDate, nights, ...over });

const ZONES = arcToHorizonPoints([{ startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 }, { startAz: 150, endAz: 170, heightDeg: 50 }]);
const H6_ZONES = arcToHorizonPoints([{ startAz: 60, endAz: 110, heightDeg: 35 }, { startAz: 230, endAz: 300, heightDeg: 42 }, { startAz: 150, endAz: 170, heightDeg: 50 }, { startAz: 340, endAz: 20, heightDeg: 30 }]);
const H6 = [X('m42', 5.588, -5.39, 2), X('m31', 0.712, 41.27, 2), X('ros', 6.52, 4.95, 2), X('m45', 3.79, 24.1, 2), X('m33', 1.564, 30.66, 2), X('m1', 5.575, 22.01, 2)];
const MIXED7 = [C('m27', 2), C('ngc2359', 2), C('m82', 2), C('m31', 3), C('ngc1499', 3), C('m42', 3), C('ngc7000', 3)];
const HUGE6 = [C('m31', 4), C('ngc1499', 3), C('ngc7000', 4), C('m42', 3), C('ngc2237', 4), C('m16', 3)];
const SUMMER5 = [C('m27', 2), C('m16', 2), C('ngc7000', 2), C('m13', 1.5), C('m8', 2)];

const ROWS: Record<string, CampaignInput> = {
  'H6 Phoenix 2026-12-10, four zones, 14 nights': input('PHX', '2026-12-10', 14, H6, { horizon: H6_ZONES }),
  'mixed 7 Phoenix 2026-12-10, three zones, 14 nights': input('PHX', '2026-12-10', 14, MIXED7, { horizon: ZONES }),
  'huge 6 Portland 2027-03-15, three zones, 4 nights': input('POR', '2027-03-15', 4, HUGE6, { horizon: ZONES }),
  'mixed 7 Portland 2027-03-15, no zones, 4 nights': input('POR', '2027-03-15', 4, MIXED7),
  'summer Phoenix 2027-06-20, 5 nights': input('PHX', '2027-06-20', 5, SUMMER5),
};

const useful = (s: CampaignSubject): number => Math.min(MIN_USEFUL_MIN, s.hoursPerNight * 60);
const feasible = (r: CampaignResult, i: number, k: number, s: CampaignSubject): boolean => (r.nights[k].subjects[i]?.usableMin ?? 0) >= useful(s);

describe.each(Object.entries(ROWS))('%s', (_label, inp) => {
  const r = planCampaign(inp);

  it('has no token slot: every slot is at least min(30, requested)', () => {
    r.nights.forEach((n) => n.outcomes.forEach((o, i) => {
      if (o.gotMin > 0) expect(o.gotMin).toBeGreaterThanOrEqual(useful(inp.subjects[i]));
    }));
  });

  it('gives every subject that is ever feasible a useful share, and never drops one for 3 feasible nights in a row', () => {
    inp.subjects.forEach((s, i) => {
      const nights = r.nights.map((_, k) => feasible(r, i, k, s));
      if (nights.some(Boolean)) expect(r.perSubject[i].gotMin).toBeGreaterThanOrEqual(useful(s));
      let run = 0;
      r.nights.forEach((n, k) => {
        run = nights[k] && n.outcomes[i].gotMin === 0 ? run + 1 : 0;
        expect(run).toBeLessThan(3);
      });
    });
  });

  it('keeps each night within 5 min of the best total', () => {
    r.nights.forEach((n, k) => {
      if (!n.start) return;
      const idle = scheduleNight(inp, k);
      const total = (x: typeof n): number => x.outcomes.reduce((a, o) => a + o.gotMin, 0);
      expect(total(n)).toBeLessThanOrEqual(total(idle));
      expect(total(n)).toBeGreaterThanOrEqual(total(idle) - MAX_LOSS_MIN);
    });
  });
});

describe('the two round-4 drops', () => {
  it('H6: M42 gets a useful slot on 13 of 14 nights and 1000+ of 1680 min', () => {
    const inp = ROWS['H6 Phoenix 2026-12-10, four zones, 14 nights'];
    const r = planCampaign(inp);
    expect(r.nights.filter((n) => n.outcomes[0].gotMin >= MIN_USEFUL_MIN).length).toBeGreaterThanOrEqual(13);
    expect(r.perSubject[0].gotMin).toBeGreaterThanOrEqual(1000);
  });

  it('mixed 7: M42 gets 1000+ of 2520 min; M27, which never clears the horizon, stays at 0 with a reason', () => {
    const inp = ROWS['mixed 7 Phoenix 2026-12-10, three zones, 14 nights'];
    const r = planCampaign(inp);
    expect(r.perSubject[5].gotMin).toBeGreaterThanOrEqual(1000);
    expect(r.perSubject[0].gotMin).toBe(0);
    expect(r.nights[0].outcomes[0].reason).not.toBeNull();
  });
});

describe('polar night', () => {
  it('says so, not "no astronomical night"', () => {
    const inp: CampaignInput = {
      subjects: [X('m82', 9.93, 69.68, 4)], site: { latitude: 85, longitude: 0, elevationM: 0 }, timeZone: 'UTC',
      horizon: null, minAltitude: 25, startDate: '2026-12-21', nights: 1,
    };
    const o = planCampaign(inp).nights[0].outcomes[0];
    expect(o.reason?.code).toBe('polar-night');
    expect(o.reason?.text).toContain('Polar night');
  });
});
