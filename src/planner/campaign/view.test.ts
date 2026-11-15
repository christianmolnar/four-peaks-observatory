import { modeForMinutes } from '../ai/view';
import { arcToHorizonPoints } from '../profile';
import { planCampaign, usefulRangeOf } from './index';
import type { CampaignInput } from './index';
import { clockOf } from '../itinerary/timeline';
import { campaignInputOf, itineraryFromNight } from './view';
import { TEST_EXPOSURE } from './testkit';
import { FOUNTAIN_HILLS, subjects } from './testkit-real';

const horizon = arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
const targetsOf = (ids: string[]) => subjects(ids).map((s) => ({ ...s.targets[0], type: s.type }));
const form = (ids: string[], over: Partial<Parameters<typeof campaignInputOf>[0]> = {}) => ({
  targets: targetsOf(ids), exposure: TEST_EXPOSURE, limits: {}, site: FOUNTAIN_HILLS, timeZone: 'America/Phoenix', horizon, minAltitude: 20, startDate: '2026-11-14', nights: 3, ...over,
});

describe('campaignInputOf', () => {
  it('is the engine\'s own input: My plan in order, one subject per target, only the limits the user set', () => {
    const input: CampaignInput = campaignInputOf(form(['m31', 'm42', 'm81'], { limits: { m42: { hoursPerNight: 1.5 }, m81: { useful: { minMin: 45, maxMin: 150 } } } }));
    expect(input.subjects.map((s) => s.id)).toEqual(['m31', 'm42', 'm81']);
    expect(input.subjects[0]).toEqual({ ...subjects(['m31'])[0] }); // no cap, no override, no invented fields
    expect(input.subjects[1].hoursPerNight).toBe(1.5);
    expect(input.subjects[2].useful).toEqual({ minMin: 45, maxMin: 150 });
    expect(input).toMatchObject({ timeZone: 'America/Phoenix', minAltitude: 20, startDate: '2026-11-14', nights: 3, site: FOUNTAIN_HILLS });
    expect(input.horizon).toBe(horizon);
    expect(() => planCampaign(input)).not.toThrow();
  });
});

describe('campaignInputOf and the exposure engine', () => {
  it('carries the catalog surface brightness and the rig and sky onto each subject, so a bright, a medium and a faint target get different ranges', () => {
    const targets = [
      { id: 'b', name: 'bright', raHours: 5.6, decDeg: -5.4, type: 'galaxy', surfaceBrightness: 20 },
      { id: 'm', name: 'medium', raHours: 0.7, decDeg: 41.3, type: 'galaxy', surfaceBrightness: 22 },
      { id: 'f', name: 'faint', raHours: 2.4, decDeg: 42.3, type: 'galaxy', surfaceBrightness: 24 },
      { id: 'n', name: 'no number', raHours: 3.4, decDeg: 24.1, type: 'galaxy' },
    ];
    const input = campaignInputOf({ ...form([]), targets });
    expect(input.subjects.map((s) => s.surfaceBrightnessMu)).toEqual([20, 22, 24, undefined]);
    expect(input.subjects.every((s) => s.exposure === TEST_EXPOSURE)).toBe(true);
    const [b, m, f, n] = input.subjects.map((s) => usefulRangeOf(s));
    expect([b.maxMin, m.maxMin, f.maxMin].sort((x, y) => x - y)).toEqual([b.maxMin, m.maxMin, f.maxMin]);
    expect(new Set([b.maxMin, m.maxMin, f.maxMin]).size).toBe(3);
    expect(n).toEqual(m); // no number: the engine assumes a medium object
    expect(planCampaign(input).perSubject.map((p) => p.maxUsefulMin)).toEqual([b.maxMin, m.maxMin, f.maxMin, n.maxMin]);
  });
});

describe('itineraryFromNight', () => {
  const input = campaignInputOf(form(['m42', 'ngc1499', 'm81', 'm31', 'm33', 'ngc2237']));
  const result = planCampaign(input);

  it('takes a night\'s slots in time order, each in the mode the AI apply would pick for its minutes, starting at the first slot', () => {
    result.nights.forEach((n, i) => {
      const { items, startTime } = itineraryFromNight(n, i + 1, 'deep-c11-2600', null, 'America/Phoenix');
      expect(items.map((x) => x.targetId)).toEqual(n.slots.map((s) => s.subjectId));
      expect(items.map((x) => x.mode)).toEqual(n.slots.map((s) => modeForMinutes(s.integrationMin)));
      expect(items.every((x) => x.trainId === 'deep-c11-2600' && x.filterId === null)).toBe(true);
      expect(items.map((x) => x.id)).toEqual(items.map((_, k) => `s${k + 1}`));
      expect(startTime).toBe(n.slots.length > 0 ? clockOf(n.slots[0].start, 'America/Phoenix') : null);
      for (const it of items) expect(it.note).toMatch(new RegExp(`^From the several-night plan, night ${i + 1}, slot \\d+ of ${items.length}\\.`));
    });
    expect(result.nights.some((n) => n.slots.length > 0)).toBe(true);
  });
});
