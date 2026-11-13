import { targetAltAz } from '../astro';
import { checkPlan, countFlips, planWarnings } from './check';
import type { ViolationKind } from './check';
import { buildFacts, nightOf } from './facts';
import { MERIDIAN_FLIP_MIN } from '../campaign/analysis';
import { isoOf, parseIso } from './instant';
import type { AiPlanInput } from './facts';
import { clock, earliestSlot, INPUT, lowMinute, MIN, night, planOf, transitOf, validSlots } from './testkit';

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
    const noon = night().start.getTime() - 6 * 60 * MIN;
    expect(kinds(INPUT, planOf(INPUT, [['t1', clock(noon), clock(noon + 60 * MIN)]]))).toContain('outside-night');
  });

  it('outside-night: ends after dawn', () => {
    const n = night();
    const end = clock(n.end.getTime() + 20 * MIN);
    expect(kinds(INPUT, planOf(INPUT, [['t1', clock(n.end.getTime() - 20 * MIN), end]]))).toContain('outside-night');
  });

  it('bad-time: end equal to start', () => {
    expect(kinds(INPUT, planOf(INPUT, [['t1', clock(night().start.getTime() + 60 * MIN), clock(night().start.getTime() + 60 * MIN)]]))).toContain('bad-time');
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
    expect(kinds(INPUT, { ...p, plan: [...p.plan, { id: 'zz', start: clock(night().start.getTime() + 60 * MIN), end: clock(night().start.getTime() + 120 * MIN) }] })).toContain('unknown-target');
    expect(kinds(INPUT, { ...p, cut: ['zz'], fitsAll: false })).toContain('unknown-target');
    expect(kinds(INPUT, { ...p, exposures: [...p.exposures, { id: 'zz', minutes: 5, subSeconds: 60 }] })).toContain('unknown-target');
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
    expect(facts.sampleTimes[0]).toBe(facts.night.start);
    expect(Date.parse(facts.sampleTimes[0])).toBeGreaterThanOrEqual(n.start.getTime());
    expect(Date.parse(facts.sampleTimes.at(-1)!)).toBeLessThanOrEqual(n.end.getTime());
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

const DENVER = { site: { latitude: 39.7, longitude: -105, elevationM: 0 }, timeZone: 'America/Denver', horizon: null, minAltitude: 30 };

describe('M1: clock changes', () => {
  const fall: AiPlanInput = { ...DENVER, date: '2026-10-31', targets: [{ id: 'a', name: 'a', raHours: 1, decDeg: 0 }] };
  it('instants carry the offset; a repeated clock hour is two different instants', () => {
    expect(parseIso('2026-11-01T01:30-06:00', 'America/Denver')).toMatchObject({ ok: true });
    const a = parseIso('2026-11-01T01:30-06:00', 'America/Denver');
    const b = parseIso('2026-11-01T01:30-07:00', 'America/Denver');
    expect(a.ok && b.ok && b.at.getTime() - a.at.getTime()).toBe(60 * MIN);
    expect(isoOf(new Date('2026-11-01T07:30:00Z'), 'America/Denver')).toBe('2026-11-01T01:30-06:00');
    expect(isoOf(new Date('2026-11-01T08:30:00Z'), 'America/Denver')).toBe('2026-11-01T01:30-07:00');
  });
  it('fall-back night: the evaluator input (01:30 to 02:30 on the repeated clock, 2 real hours) does not verify', () => {
    const n = nightOf(fall);
    const v = checkPlan(fall, n, planOf(fall, [['a', '2026-11-01T01:30-06:00', '2026-11-01T02:30-07:00']]));
    expect(v.map((x) => x.kind)).toContain('below-min-altitude');
    // The honest hour (01:30 MDT to 01:30 MST) is checked as 60 real minutes, not skipped.
    const hour = checkPlan(fall, n, planOf(fall, [['a', '2026-11-01T01:30-06:00', '2026-11-01T01:30-07:00']]));
    expect(hour.map((x) => x.kind)).not.toContain('bad-time');
  });
  it('the facts of that night list the repeated clock hour twice, told apart by offset', () => {
    const { facts } = buildFacts(fall);
    expect(new Set(facts.sampleTimes).size).toBe(facts.sampleTimes.length);
    expect(facts.sampleTimes.some((t) => t.endsWith('-06:00'))).toBe(true);
    expect(facts.sampleTimes.some((t) => t.endsWith('-07:00'))).toBe(true);
  });
  it('spring-forward: a clock time that does not exist, or a wrong offset, is bad-time', () => {
    const spring: AiPlanInput = { ...fall, date: '2026-03-07' };
    const n = nightOf(spring);
    for (const start of ['2026-03-08T02:30-07:00', '2026-03-08T02:30-06:00', '2026-03-08T01:30-06:00']) {
      const v = checkPlan(spring, n, planOf(spring, [['a', start, '2026-03-08T04:30-06:00']]));
      expect(v.map((x) => x.kind)).toContain('bad-time');
    }
    const ok = parseIso('2026-03-08T03:30-06:00', 'America/Denver');
    expect(ok.ok).toBe(true);
  });
  it('spring-forward: 01:30 MST to 03:30 MDT is 60 real minutes, so the verdict length must say 60', () => {
    const spring: AiPlanInput = { ...fall, date: '2026-03-07' };
    const n = nightOf(spring);
    const slot: [string, string, string] = ['a', '2026-03-08T01:30-07:00', '2026-03-08T03:30-06:00'];
    const bad120 = checkPlan(spring, n, planOf(spring, [slot], { lastTarget: { id: 'a', leftoverMinutes: 120, subSeconds: 120, frames: 60, usefulness: 'useful', reason: 'x' } }));
    expect(bad120.map((x) => x.message).join(' ')).toContain('is 60 min long');
  });
  it('a malformed or non-existent time never throws', () => {
    expect(parseIso('2026-02-31T01:30-07:00', 'America/Denver').ok).toBe(false);
    expect(parseIso('01:30', 'America/Denver').ok).toBe(false);
  });
});

describe('M2: the transit minute', () => {
  it('a slot that starts or ends at facts.targets[i].transit has no flip violation', () => {
    const { facts } = buildFacts(INPUT);
    const n = night();
    let tested = 0;
    for (const t of facts.targets) {
      if (!t.transit) continue;
      const at = Date.parse(t.transit);
      for (const slot of [[at, at + 30 * MIN], [at - 30 * MIN, at]]) {
        const v = checkPlan(INPUT, n, planOf(INPUT, [[t.id, clock(slot[0]), clock(slot[1])]]));
        expect(v.filter((x) => x.kind === 'flip-in-slot')).toEqual([]);
        tested++;
      }
      // One minute either side of the printed minute is inside the slot.
      const across = checkPlan(INPUT, n, planOf(INPUT, [[t.id, clock(at - MIN), clock(at + MIN)]]));
      expect(across.map((x) => x.kind)).toContain('flip-in-slot');
    }
    expect(tested).toBeGreaterThanOrEqual(2);
  });
});

describe('S2: degenerate plans', () => {
  it('an empty plan with a usable window is a violation naming the target and span', () => {
    const v = checkPlan(INPUT, night(), planOf(INPUT, []));
    const e = v.find((x) => x.kind === 'empty-plan');
    expect(e?.message).toContain('has no slot');
    expect(e?.message).toMatch(/usable for \d+ min/);
  });
  it('an empty plan on a night with no usable window is allowed', () => {
    const input: AiPlanInput = { ...INPUT, targets: [{ id: 's', name: 's', raHours: 12, decDeg: -80 }] };
    expect(checkPlan(input, night(input), planOf(input, [])).map((x) => x.kind)).not.toContain('empty-plan');
  });
  it('a cut target that fits free time (with slew) is a warning, not a violation', () => {
    const slots = validSlots().slice(0, 2);
    const plan = planOf(INPUT, slots);
    expect(checkPlan(INPUT, night(), plan)).toEqual([]);
    const w = planWarnings(INPUT, night(), plan);
    expect(w.find((x) => x.kind === 'cut-fits-free-time')?.id).toBe('t3');
  });
  it('no warning for a cut target that cannot fit', () => {
    const input: AiPlanInput = { ...INPUT, targets: [...INPUT.targets.slice(0, 1), { id: 's', name: 's', raHours: 12, decDeg: -80 }] };
    const slot = earliestSlot(input, 't1', night(input).start.getTime(), 60);
    const plan = planOf(input, [['t1', clock(slot.start), clock(slot.end)]]);
    expect(planWarnings(input, night(input), plan).filter((x) => x.kind === 'cut-fits-free-time')).toEqual([]);
  });
});

describe('last-target verdict', () => {
  const plan = (): ReturnType<typeof planOf> => planOf(INPUT, validSlots());
  const msg = (p: ReturnType<typeof planOf>): string => checkPlan(INPUT, night(), p).map((x) => `${x.kind}: ${x.message}`).join('\n');
  it('missing when the plan has a slot', () => {
    const { lastTarget, ...rest } = plan();
    void lastTarget;
    expect(kinds(INPUT, rest as ReturnType<typeof planOf>)).toEqual(['missing-verdict']);
  });
  it('names a different target than the last slot', () => {
    const p = plan();
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, id: 't1' } })).toContain('lastTarget is t1 but the last slot in time is t3');
  });
  it('leftoverMinutes must equal the last slot length', () => {
    const p = plan();
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, leftoverMinutes: 59 } })).toContain('leftoverMinutes is 59 but the last slot (t3) is 60 min long');
  });
  it('frames x sub may not exceed the slot', () => {
    const p = plan();
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, frames: 31 } })).toContain('31 frames x 120 s is 3720 s, more than the 3600 s slot');
    expect(kinds(INPUT, { ...p, lastTarget: { ...p.lastTarget!, frames: 30 } })).toEqual([]);
  });
  it('R3: frames must equal floor(minutes x 60 / sub), within 1', () => {
    const p = plan();
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, frames: 1 } })).toContain('lastTarget: 1 frames');
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, frames: 28 } })).toContain('should be 30');
    for (const f of [29, 30]) expect(kinds(INPUT, { ...p, lastTarget: { ...p.lastTarget!, frames: f } })).toEqual([]);
  });
  it('sub length must match the exposure entry; 0 frames cannot be useful', () => {
    const p = plan();
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, subSeconds: 60, frames: 60 } })).toContain('exposure entry for t3 says 120');
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, frames: 0, usefulness: 'useful' } })).toContain('0 frames');
    expect(msg({ ...p, lastTarget: { ...p.lastTarget!, frames: 0, usefulness: 'not_useful' } })).not.toContain('usefulness must be');
  });
  it('a verdict with no slot is a mismatch', () => {
    const input: AiPlanInput = { ...INPUT, targets: [{ id: 's', name: 's', raHours: 12, decDeg: -80 }] };
    const p = planOf(input, [], { lastTarget: { id: 's', leftoverMinutes: 0, subSeconds: 60, frames: 0, usefulness: 'not_useful', reason: 'x' } });
    expect(kinds(input, p)).toEqual(['verdict-mismatch']);
  });
  it('warns when 30+ min of night remain after the last slot and its target could use more', () => {
    const tr = Math.round(transitOf(INPUT, 't1') / MIN) * MIN;
    const p = planOf(INPUT, [['t1', clock(tr), clock(tr + 30 * MIN)]], { cut: ['t2', 't3'], fitsAll: false });
    expect(checkPlan(INPUT, night(), p)).toEqual([]);
    const w = planWarnings(INPUT, night(), p).find((x) => x.kind === 'free-time-after-last');
    expect(w?.id).toBe('t1');
    expect(w?.message).toContain('takes all the observable time left');
  });
  it('R3: warns when the last slot ends at its transit and the target stays usable long after the flip', () => {
    const p = planOf(INPUT, [
      ['t1', '2026-12-10T18:48-07:00', '2026-12-10T19:48-07:00'],
      ['t3', '2026-12-10T22:49-07:00', '2026-12-10T23:19-07:00'],
      ['t2', '2026-12-10T23:44-07:00', '2026-12-11T00:44-07:00'],
    ]);
    expect(checkPlan(INPUT, night(), p)).toEqual([]);
    const w = planWarnings(INPUT, night(), p).filter((x) => x.kind === 'free-time-after-last');
    expect(w).toHaveLength(1);
    expect(w[0].id).toBe('t2');
    expect(w[0].message).toContain('start at the transit');
    expect(w[0].message).toMatch(/usable (\d+) min after the transit/);
    const run = Number(/usable (\d+) min after the transit/.exec(w[0].message)![1]);
    expect(run).toBeGreaterThan(200);
    // The advice is real: the same target starting at its transit and running that long verifies.
    const moved = planOf(INPUT, [
      ['t1', '2026-12-10T18:48-07:00', '2026-12-10T19:48-07:00'],
      ['t3', '2026-12-10T22:49-07:00', '2026-12-10T23:19-07:00'],
      ['t2', '2026-12-11T00:44-07:00', clock(Date.parse('2026-12-11T00:44-07:00') + run * MIN)],
    ]);
    expect(checkPlan(INPUT, night(), moved)).toEqual([]);
    expect(planWarnings(INPUT, night(), moved)).toEqual([]);
  });
  it('R3: no transit-forward warning when the run after the transit is shorter than the slot or under the minimum', () => {
    const p = planOf(INPUT, [
      ['t1', '2026-12-10T18:48-07:00', '2026-12-10T19:48-07:00'],
      ['t3', '2026-12-10T22:49-07:00', '2026-12-10T23:19-07:00'],
      ['t2', '2026-12-10T23:44-07:00', '2026-12-11T00:44-07:00'],
    ]);
    const w = planWarnings({ ...INPUT, minAltitude: 60 }, night({ ...INPUT, minAltitude: 60 }), p);
    expect(w.filter((x) => x.message.includes('start at the transit'))).toEqual([]);
  });
  it('no warning when the last slot runs to the end of its window', () => {
    const { facts } = buildFacts(INPUT);
    const t1 = facts.targets[0];
    const [, end] = t1.windows.at(-1)!;
    const endMs = Date.parse(end);
    const p = planOf(INPUT, [['t1', clock(endMs - 30 * MIN), clock(endMs)]], { cut: ['t2', 't3'], fitsAll: false });
    const w = planWarnings(INPUT, night(), p).filter((x) => x.kind === 'free-time-after-last');
    expect(w).toEqual([]);
  });
});

describe('R4: transit-forward warning when the transit minute is blocked', () => {
  const HORIZON_INPUT: AiPlanInput = { ...INPUT, horizon: [{ az: 0, alt: 0 }, { az: 170, alt: 0 }, { az: 172, alt: 80 }, { az: 188, alt: 80 }, { az: 190, alt: 0 }] };
  const slots: [string, string, string][] = [
    ['t1', '2026-12-10T18:48-07:00', '2026-12-10T19:48-07:00'],
    ['t2', '2026-12-10T23:21-07:00', '2026-12-11T00:21-07:00'],
  ];
  it('warns, names the first usable minute and the run from there, and the advice verifies', () => {
    const n = night(HORIZON_INPUT);
    const p = planOf(HORIZON_INPUT, slots);
    expect(checkPlan(HORIZON_INPUT, n, p)).toEqual([]);
    const w = planWarnings(HORIZON_INPUT, n, p).filter((x) => x.kind === 'free-time-after-last');
    expect(w).toHaveLength(1);
    expect(w[0].id).toBe('t2');
    expect(w[0].message).toContain('2026-12-11T01:07-07:00');
    expect(w[0].message).toMatch(/usable 196 min after the transit/);
    const moved = planOf(HORIZON_INPUT, [slots[0], ['t2', '2026-12-11T01:07-07:00', '2026-12-11T04:23-07:00']]);
    expect(checkPlan(HORIZON_INPUT, n, moved)).toEqual([]);
    expect(planWarnings(HORIZON_INPUT, n, moved).filter((x) => x.kind === 'free-time-after-last')).toEqual([]);
  });
});

describe('R4: meridian flips', () => {
  const tr = Math.round(transitOf(INPUT, 't2') / MIN) * MIN;
  const crossing = (len = 60): ReturnType<typeof planOf> => planOf(INPUT, [['t2', clock(tr - 30 * MIN), clock(tr - 30 * MIN + len * MIN)]]);
  const ON: AiPlanInput = { ...INPUT, allowFlips: true };
  const withVerdict = (p: ReturnType<typeof planOf>, frames: number, over: object = {}): ReturnType<typeof planOf> => ({ ...p, lastTarget: { ...p.lastTarget!, frames, ...over } });

  it('off (the default): a crossing slot is a violation and no flip is counted as allowed', () => {
    const v = checkPlan(INPUT, night(), crossing()).filter((x) => x.kind === 'flip-in-slot');
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('flips are not allowed');
    expect(checkPlan({ ...INPUT, allowFlips: false }, night(), crossing()).map((x) => x.kind)).toContain('flip-in-slot');
    expect(buildFacts(INPUT).facts.meridianFlips).toEqual({ allowed: false, minutes: MERIDIAN_FLIP_MIN });
  });
  it('off: a slot may still start or end at the transit', () => {
    expect(kinds(INPUT, planOf(INPUT, [['t2', clock(tr - 60 * MIN), clock(tr)]]))).toEqual([]);
    expect(kinds(INPUT, planOf(INPUT, [['t2', clock(tr), clock(tr + 60 * MIN)]]))).toEqual([]);
  });
  it('on: a crossing slot with the flip taken out verifies and is counted', () => {
    const p = crossing();
    const eff = 60 - MERIDIAN_FLIP_MIN;
    const ok = withVerdict({ ...p, plan: [{ ...p.plan[0], exposureMinutes: eff }] }, (eff * 60) / 120);
    expect(checkPlan(ON, night(ON), ok)).toEqual([]);
    expect(countFlips(ON, night(ON), ok)).toBe(1);
    expect(buildFacts(ON).facts.meridianFlips).toEqual({ allowed: true, minutes: MERIDIAN_FLIP_MIN });
    expect(countFlips(INPUT, night(), planOf(INPUT, [['t2', clock(tr), clock(tr + 60 * MIN)]]))).toBe(0);
  });
  it('on: frames and exposureMinutes must respect the flip time', () => {
    const p = crossing();
    const bad = withVerdict(p, 30);
    expect(checkPlan(ON, night(ON), bad).map((x) => x.message).join('\n')).toContain(`should be 25`);
    expect(checkPlan(ON, night(ON), withVerdict(p, 24))).toEqual([]);
    expect(checkPlan(ON, night(ON), withVerdict(p, 25))).toEqual([]);
    const over = { ...p, plan: [{ ...p.plan[0], exposureMinutes: 55 }] };
    expect(checkPlan(ON, night(ON), withVerdict(over, 25)).map((x) => x.kind)).toEqual(['exposure-mismatch']);
    // not crossing: no allowance taken
    expect(checkPlan(ON, night(ON), planOf(ON, [['t2', clock(tr - 60 * MIN), clock(tr)]]))).toEqual([]);
  });
  it('on: a slot no longer than the flip is a violation', () => {
    const p = planOf(ON, [['t2', clock(tr - 5 * MIN), clock(tr - 5 * MIN + MERIDIAN_FLIP_MIN * MIN)]]);
    const k = checkPlan(ON, night(ON), withVerdict(p, 0, { usefulness: 'not_useful' })).map((x) => x.kind);
    expect(k).toContain('flip-in-slot');
  });
  it('on: the transit-forward advice is not given (a crossing slot is allowed)', () => {
    const p = planOf(ON, [['t2', clock(tr - 60 * MIN), clock(tr)]]);
    expect(planWarnings(INPUT, night(), p).some((x) => x.message.includes('start at the transit'))).toBe(true);
    expect(planWarnings(ON, night(ON), p).some((x) => x.message.includes('start at the transit'))).toBe(false);
  });
});
