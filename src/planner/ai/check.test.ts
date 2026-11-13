import { targetAltAz } from '../astro';
import { checkPlan } from './check';
import type { ViolationKind } from './check';
import { buildFacts } from './facts';
import type { AiPlanInput } from './facts';
import { clock, INPUT, lowMinute, MIN, night, planOf, transitOf, validSlots } from './testkit';

const kinds = (input: AiPlanInput, plan: ReturnType<typeof planOf>): ViolationKind[] => checkPlan(input, night(input), plan).map((v) => v.kind);

describe('checkPlan', () => {
  it('passes a plan whose slots are usable, flip-free and apart', () => {
    const slots = validSlots();
    expect(checkPlan(INPUT, night(), planOf(INPUT, slots))).toEqual([]);
  });

  it('passes a plan with a cut list when fitsAll is false', () => {
    const slots = validSlots().slice(0, 2);
    const plan = planOf(INPUT, slots);
    expect(plan.cut).toEqual(['t3']);
    expect(plan.fitsAll).toBe(false);
    expect(checkPlan(INPUT, night(), plan)).toEqual([]);
  });

  it('below-min-altitude: names the slot, the first low minute and its altitude', () => {
    const start = lowMinute(INPUT, 't1', 25, 40);
    const plan = planOf(INPUT, [['t1', clock(start), clock(start + 40 * MIN)]]);
    const v = checkPlan(INPUT, night(), plan).find((x) => x.kind === 'below-min-altitude');
    expect(v).toBeDefined();
    const t = INPUT.targets[0];
    const alt = targetAltAz(t.raHours, t.decDeg, new Date(start), INPUT.site).altitude;
    expect(v!.message).toContain(`t1 ${clock(start)}-${clock(start + 40 * MIN)} is below 25 deg at ${clock(start)} (${alt.toFixed(1)} deg)`);
  });

  it('blocked-by-horizon: a zone higher than the minimum, target between the two', () => {
    const input: AiPlanInput = { ...INPUT, horizon: [{ az: 0, alt: 70 }, { az: 180, alt: 70 }] };
    const n = night(input);
    let start = 0;
    for (let ms = Math.ceil(n.start.getTime() / MIN) * MIN; ms < n.end.getTime() - 30 * MIN; ms += MIN) {
      const p = targetAltAz(input.targets[1].raHours, input.targets[1].decDeg, new Date(ms), input.site);
      if (p.altitude >= 25 && p.altitude < 60) { start = ms; break; }
    }
    expect(start).toBeGreaterThan(0);
    const v = checkPlan(input, n, planOf(input, [['t2', clock(start), clock(start + 20 * MIN)]]));
    expect(v.map((x) => x.kind)).toContain('blocked-by-horizon');
    expect(v.map((x) => x.kind)).not.toContain('below-min-altitude');
  });

  it('flip-in-slot: transit strictly inside; touching it at either end is fine', () => {
    const tr = Math.round(transitOf(INPUT, 't2') / MIN) * MIN;
    const around = planOf(INPUT, [['t2', clock(tr - 30 * MIN), clock(tr + 30 * MIN)]]);
    const v = checkPlan(INPUT, night(), around).find((x) => x.kind === 'flip-in-slot');
    expect(v?.message).toContain('t2');
    expect(v?.message).toContain('mid-slot');
    // Whole-minute slots that end before, or start after, the transit minute have none.
    const exact = transitOf(INPUT, 't2');
    const endBefore = Math.floor(exact / MIN) * MIN;
    expect(kinds(INPUT, planOf(INPUT, [['t2', clock(endBefore - 30 * MIN), clock(endBefore)]]))).not.toContain('flip-in-slot');
    const startAfter = Math.ceil(exact / MIN) * MIN;
    expect(kinds(INPUT, planOf(INPUT, [['t2', clock(startAfter), clock(startAfter + 30 * MIN)]]))).not.toContain('flip-in-slot');
  });

  it('outside-night: starts before dusk', () => {
    expect(kinds(INPUT, planOf(INPUT, [['t1', '12:00', '13:00']]))).toContain('outside-night');
  });

  it('outside-night: ends after dawn', () => {
    const n = night();
    const end = clock(n.end.getTime() + 20 * MIN);
    expect(kinds(INPUT, planOf(INPUT, [['t1', clock(n.end.getTime() - 20 * MIN), end]]))).toContain('outside-night');
  });

  it('bad-time: end equal to start', () => {
    expect(kinds(INPUT, planOf(INPUT, [['t1', '22:00', '22:00']]))).toContain('bad-time');
  });

  it('overlap and slew-gap between consecutive slots', () => {
    const base = validSlots();
    // t2 starts 1 minute before t1 ends: overlap.
    const first = base[0];
    const ov = planOf(INPUT, [first, [base[1][0], clock(parseClock(first[2]) - MIN), base[1][2]]]);
    expect(kinds(INPUT, ov)).toContain('overlap');
    // t2 starts 1 minute after t1 ends: under the 3 minute slew.
    const gap = planOf(INPUT, [first, [base[1][0], clock(parseClock(first[2]) + MIN), base[1][2]]]);
    const v = checkPlan(INPUT, night(), gap).find((x) => x.kind === 'slew-gap');
    expect(v?.message).toContain('1 min, the slew needs 3');
  });

  it('duplicate-slot', () => {
    const [a] = validSlots();
    expect(kinds(INPUT, planOf(INPUT, [a, a]))).toContain('duplicate-slot');
  });

  it('unknown-target in plan, cut and exposures', () => {
    const slots = validSlots();
    const p = planOf(INPUT, slots, {});
    expect(kinds(INPUT, { ...p, plan: [...p.plan, { id: 'zz', start: '22:00', end: '23:00' }] })).toContain('unknown-target');
    expect(kinds(INPUT, { ...p, cut: ['zz'], fitsAll: false })).toContain('unknown-target');
    expect(kinds(INPUT, { ...p, exposures: [...p.exposures, { id: 'zz', minutes: 5 }] })).toContain('unknown-target');
  });

  it('in-plan-and-cut, duplicate-cut, missing-target', () => {
    const slots = validSlots();
    const p = planOf(INPUT, slots);
    const both = checkPlan(INPUT, night(), { ...p, cut: ['t1'], fitsAll: false });
    expect(both.map((v) => v.kind)).toContain('in-plan-and-cut');
    const dup = planOf(INPUT, slots.slice(0, 2));
    expect(kinds(INPUT, { ...dup, cut: ['t3', 't3'] })).toContain('duplicate-cut');
    const missing = checkPlan(INPUT, night(), { ...p, plan: p.plan.slice(0, 2), cut: [], fitsAll: true });
    expect(missing.map((v) => v.message)).toContain('t3 is in neither the plan nor the cut list.');
  });

  it('missing-exposure', () => {
    const p = planOf(INPUT, validSlots());
    expect(kinds(INPUT, { ...p, exposures: p.exposures.slice(1) })).toContain('missing-exposure');
  });

  it('fits-flag: fitsAll disagrees with the cut list', () => {
    const p = planOf(INPUT, validSlots());
    expect(kinds(INPUT, { ...p, fitsAll: false })).toEqual(['fits-flag']);
    const cut = planOf(INPUT, validSlots().slice(0, 2));
    expect(kinds(INPUT, { ...cut, fitsAll: true })).toEqual(['fits-flag']);
  });
});

function parseClock(c: string): number {
  // Instant of an in-night clock reading, via the night start.
  const n = night().start.getTime();
  for (let ms = Math.floor(n / MIN) * MIN; ms < n + 24 * 60 * MIN; ms += MIN) if (clock(ms) === c) return ms;
  throw new Error(c);
}

describe('buildFacts', () => {
  it('is facts only: windows agree with the check and samples carry flags', () => {
    const { facts, night: n } = buildFacts(INPUT);
    expect(facts.targets).toHaveLength(3);
    expect(facts.sampleTimes[0]).toBe(clock(n.start));
    for (const t of facts.targets) {
      expect(t.samples).toHaveLength(facts.sampleTimes.length);
      expect(t.windows.length).toBeGreaterThan(0);
      for (const row of t.samples) expect(['ok', 'low', 'blocked']).toContain(row[2]);
    }
    expect(facts.moon.altitudeDeg).toHaveLength(facts.sampleTimes.length);
    expect(facts.slewMin).toBe(3);
  });

  it('a target that never clears the minimum has no windows', () => {
    const input: AiPlanInput = { ...INPUT, targets: [{ id: 's', name: 's', raHours: 12, decDeg: -80 }] };
    const { facts } = buildFacts(input);
    expect(facts.targets[0].windows).toEqual([]);
    expect(facts.targets[0].samples.every((r) => r[2] === 'low')).toBe(true);
  });
});
