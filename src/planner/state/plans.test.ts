import { ITINERARY_KEY } from '../itinerary';
import { MY_PLAN_KEY } from './index';
import {
  MAX_PLANS,
  MAX_PLAN_TARGETS,
  PLANS_KEY,
  PlansError,
  clearOldPlanKeys,
  deletePlan,
  duplicatePlan,
  loadPlans,
  migrateOldPlan,
  newPlan,
  openPlan,
  renamePlan,
  savePlans,
  startPlans,
  updatePlan,
  validatePlans,
} from './plans';
import type { Plan, PlansState } from './plans';

const NOW = '2026-11-15T01:00:00.000Z';
const ctx = { date: '2026-11-14', siteId: 'home', trainId: 't1', now: NOW };

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const target = (id: string) => ({ id, preset: 'balanced' as const });
const planWith = (n: number, targets: string[] = []): Plan => ({
  id: `plan-${n}`,
  name: `Plan ${n}`,
  createdAt: NOW,
  updatedAt: NOW,
  date: '2026-11-14',
  siteId: 'home',
  trainId: 't1',
  startTime: null,
  targets: targets.map(target),
  notes: '',
});

describe('plans: create, open, rename, duplicate, delete', () => {
  it('starts with one empty plan for the date, site and train given', () => {
    const s = startPlans(ctx);
    expect(s.plans).toHaveLength(1);
    expect(s.openId).toBe(s.plans[0].id);
    expect(s.plans[0]).toMatchObject({ name: 'My plan', date: '2026-11-14', siteId: 'home', trainId: 't1', targets: [], startTime: null, notes: '' });
    expect(() => validatePlans(s)).not.toThrow();
  });

  it('New adds an empty plan with the given date, site and train, and opens it', () => {
    const s = newPlan(startPlans(ctx), { ...ctx, date: '2026-12-01', siteId: 'farm', trainId: 't2' });
    expect(s.plans).toHaveLength(2);
    const made = s.plans[1];
    expect(made).toMatchObject({ name: 'Plan 2', date: '2026-12-01', siteId: 'farm', trainId: 't2', targets: [] });
    expect(s.openId).toBe(made.id);
    expect(new Set(s.plans.map((p) => p.id)).size).toBe(2);
  });

  it('never reuses the id of a deleted plan that is still open elsewhere', () => {
    let s = startPlans(ctx);
    s = newPlan(s, ctx);
    const second = s.plans[1].id;
    s = deletePlan(s, second, ctx);
    s = newPlan(s, ctx);
    expect(s.plans.map((p) => p.id)).toHaveLength(new Set(s.plans.map((p) => p.id)).size);
  });

  it('opens another plan and rejects an id that does not exist', () => {
    let s = newPlan(startPlans(ctx), ctx);
    s = openPlan(s, s.plans[0].id);
    expect(s.openId).toBe(s.plans[0].id);
    expect(() => openPlan(s, 'nope')).toThrow(/no plan "nope"/);
  });

  it('renames a plan (trimmed) and refuses an empty or very long name', () => {
    const s0 = startPlans(ctx);
    const s = renamePlan(s0, s0.plans[0].id, '  Camping trip  ');
    expect(s.plans[0].name).toBe('Camping trip');
    expect(() => renamePlan(s, s.plans[0].id, '   ')).toThrow(/name/);
    expect(() => renamePlan(s, s.plans[0].id, 'x'.repeat(61))).toThrow(/at most 60/);
  });

  it('duplicates a plan with its targets, date, site, train and start time, opens the copy, and names it', () => {
    let s = startPlans(ctx);
    s = updatePlan(s, s.openId, { targets: [target('m31'), { id: 'ngc7000', preset: 'deep' }], startTime: '21:30' }, NOW);
    s = duplicatePlan(s, s.openId, NOW);
    expect(s.plans).toHaveLength(2);
    const [orig, copy] = s.plans;
    expect(copy.name).toBe('My plan (copy)');
    expect(copy.id).not.toBe(orig.id);
    expect(copy).toMatchObject({ date: orig.date, siteId: orig.siteId, trainId: orig.trainId, startTime: '21:30', targets: orig.targets });
    expect(s.openId).toBe(copy.id);
    // The copy's targets are its own: editing one leaves the other.
    expect(copy.targets).not.toBe(orig.targets);
  });

  it('deletes a plan; deleting the open one opens a neighbour; deleting the last leaves a fresh empty one', () => {
    let s = newPlan(newPlan(startPlans(ctx), ctx), ctx);
    const [a, b, c] = s.plans.map((p) => p.id);
    s = openPlan(s, b);
    s = deletePlan(s, b, ctx);
    expect(s.plans.map((p) => p.id)).toEqual([a, c]);
    expect(s.openId).toBe(c); // the one that took its place
    s = deletePlan(s, c, ctx);
    expect(s.openId).toBe(a);
    s = deletePlan(s, a, { ...ctx, date: '2027-01-01' });
    expect(s.plans).toHaveLength(1);
    expect(s.plans[0]).toMatchObject({ name: 'My plan', date: '2027-01-01', targets: [] });
    expect(s.openId).toBe(s.plans[0].id);
  });

  it('updatePlan changes only the fields given, stamps updatedAt, and keeps createdAt', () => {
    const s0 = startPlans(ctx);
    const later = '2026-11-15T02:00:00.000Z';
    const s = updatePlan(s0, s0.openId, { date: '2026-12-25', trainId: 't9' }, later);
    expect(s.plans[0]).toMatchObject({ date: '2026-12-25', trainId: 't9', siteId: 'home', createdAt: NOW, updatedAt: later });
  });
});

describe('plans: limits', () => {
  it(`holds at most ${MAX_PLANS} plans`, () => {
    let s = startPlans(ctx);
    for (let i = 1; i < MAX_PLANS; i++) s = newPlan(s, ctx);
    expect(s.plans).toHaveLength(MAX_PLANS);
    expect(() => newPlan(s, ctx)).toThrow(/at most 50 plans/);
    expect(() => duplicatePlan(s, s.openId, NOW)).toThrow(/at most 50 plans/);
  });

  it(`holds at most ${MAX_PLAN_TARGETS} targets in one plan`, () => {
    const s = startPlans(ctx);
    const ok = Array.from({ length: MAX_PLAN_TARGETS }, (_, i) => target(`t${i}`));
    expect(updatePlan(s, s.openId, { targets: ok }, NOW).plans[0].targets).toHaveLength(MAX_PLAN_TARGETS);
    expect(() => updatePlan(s, s.openId, { targets: [...ok, target('extra')] }, NOW)).toThrow(/at most 50 targets/);
  });

  it('refuses a plan with the same target twice', () => {
    const s = startPlans(ctx);
    expect(() => updatePlan(s, s.openId, { targets: [target('m31'), target('m31')] }, NOW)).toThrow(/duplicate/);
  });
});

describe('plans: stored copy', () => {
  it('round-trips through storage, with the open plan id', () => {
    let s = newPlan(startPlans(ctx), ctx);
    s = updatePlan(s, s.openId, { targets: [target('m31'), { id: 'm42', preset: 'custom', custom: { subSeconds: 120, totalMin: 90 }, start: '22:00', end: '23:30', note: 'wide' }], notes: 'bring the heater' }, NOW);
    const m = memory();
    savePlans(m, s);
    expect(JSON.parse(m.data.get(PLANS_KEY) as string).version).toBe(1);
    expect(loadPlans(m)).toEqual(s);
  });

  it('is null when nothing is stored', () => {
    expect(loadPlans(memory())).toBeNull();
  });

  it('falls back to the first plan when the open id is gone', () => {
    const s = startPlans(ctx);
    const loaded = validatePlans({ ...s, openId: 'gone' });
    expect(loaded.openId).toBe(s.plans[0].id);
  });

  const good = JSON.stringify(startPlans(ctx));
  const bad = (patch: (p: Record<string, unknown>) => void) => {
    const o = JSON.parse(good);
    patch(o.plans[0]);
    return JSON.stringify(o);
  };
  it.each([
    ['not json', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a wrong version', JSON.stringify({ ...JSON.parse(good), version: 2 })],
    ['no plans', JSON.stringify({ ...JSON.parse(good), plans: [] })],
    ['plans that are not a list', JSON.stringify({ ...JSON.parse(good), plans: {} })],
    ['too many plans', JSON.stringify({ ...JSON.parse(good), plans: Array.from({ length: MAX_PLANS + 1 }, (_, i) => ({ ...JSON.parse(good).plans[0], id: `p${i}` })) })],
    ['a repeated plan id', JSON.stringify({ ...JSON.parse(good), plans: [JSON.parse(good).plans[0], JSON.parse(good).plans[0]] })],
    ['an empty name', bad((p) => { p.name = ''; })],
    ['a bad date', bad((p) => { p.date = '14/11/2026'; })],
    ['a bad start time', bad((p) => { p.startTime = '9pm'; })],
    ['an unknown preset', bad((p) => { p.targets = [{ id: 'm31', preset: 'huge' }]; })],
    ['too many targets', bad((p) => { p.targets = Array.from({ length: MAX_PLAN_TARGETS + 1 }, (_, i) => ({ id: `t${i}`, preset: 'deep' })); })],
    ['a custom value that is not a positive number', bad((p) => { p.targets = [{ id: 'm31', preset: 'custom', custom: { subSeconds: -5 } }]; })],
    ['a target time that is not a time', bad((p) => { p.targets = [{ id: 'm31', preset: 'deep', start: '25:99' }]; })],
    ['notes that are not text', bad((p) => { p.notes = 4; })],
  ])('says damaged storage is damaged and removes it: %s', (_what, text) => {
    const m = memory({ [PLANS_KEY]: text });
    expect(() => loadPlans(m)).toThrow(/Your saved plans are damaged/);
    expect(m.data.has(PLANS_KEY)).toBe(false);
  });

  it('says so when damaged storage cannot be removed, and when it cannot be read', () => {
    expect(() => loadPlans({ getItem: () => 'x', removeItem: () => { throw new Error('denied'); } })).toThrow(/damaged and could not be cleared.*denied/);
    expect(() => loadPlans({ getItem: () => { throw new Error('denied'); }, removeItem: () => {} })).toThrow(/could not be read.*denied/);
  });

  it('validatePlans names the first problem with its path', () => {
    expect(() => validatePlans({ version: 1, openId: 'a', plans: [{ ...planWith(1), date: 'x' }] })).toThrow(PlansError);
    expect(() => validatePlans({ version: 1, openId: 'a', plans: [{ ...planWith(1), date: 'x' }] })).toThrow(/\$\.plans\[0\]\.date/);
  });
});

describe('plans: migration from the old My plan and itinerary', () => {
  const oldMyPlan = '{"version":1,"ids":["ngc7000","m31","planet-jupiter"]}';
  const itineraryV2 = JSON.stringify({
    version: 2,
    startTime: '21:30',
    items: [
      { id: 's1', targetId: 'm31', trainId: 't1', filterId: null, mode: 'deep', note: 'long one' },
      { id: 's2', targetId: 'm42', trainId: 't1', filterId: 'f1', mode: 'quick', note: '' },
      { id: 's3', targetId: 'm31', trainId: 't1', filterId: null, mode: 'quick', note: 'again' },
    ],
  });

  it('is nothing when neither old key is stored', () => {
    expect(migrateOldPlan(memory(), ctx)).toEqual({ plan: null, problems: [] });
  });

  it('turns the My plan list into one plan named My plan, targets in order, balanced', () => {
    const { plan, problems } = migrateOldPlan(memory({ [MY_PLAN_KEY]: oldMyPlan }), ctx);
    expect(problems).toEqual([]);
    expect(plan).toMatchObject({ name: 'My plan', date: '2026-11-14', siteId: 'home', trainId: 't1', startTime: null });
    expect(plan!.targets).toEqual([target('ngc7000'), target('m31'), target('planet-jupiter')]);
  });

  it('carries the itinerary onto the same targets: modes become presets, notes stay, the start time stays, itinerary-only targets follow, repeats are dropped', () => {
    const { plan, problems } = migrateOldPlan(memory({ [MY_PLAN_KEY]: oldMyPlan, [ITINERARY_KEY]: itineraryV2 }), ctx);
    expect(problems).toEqual([]);
    expect(plan!.startTime).toBe('21:30');
    expect(plan!.targets).toEqual([
      { id: 'ngc7000', preset: 'balanced' },
      { id: 'm31', preset: 'deep', note: 'long one' },
      { id: 'planet-jupiter', preset: 'balanced' },
      { id: 'm42', preset: 'quick' },
    ]);
  });

  it('reads an itinerary of the first version (no start time) and an itinerary with no My plan', () => {
    const v1 = JSON.stringify({ version: 1, items: [{ id: 's1', targetId: 'm13', trainId: 't1', filterId: null, mode: 'balanced', note: '' }] });
    const { plan } = migrateOldPlan(memory({ [ITINERARY_KEY]: v1 }), ctx);
    expect(plan!.startTime).toBeNull();
    expect(plan!.targets).toEqual([target('m13')]);
  });

  it('migrates nothing for an empty old plan and an empty itinerary', () => {
    expect(migrateOldPlan(memory({ [MY_PLAN_KEY]: '{"version":1,"ids":[]}', [ITINERARY_KEY]: '{"version":2,"items":[],"startTime":null}' }), ctx).plan).toBeNull();
  });

  it('keeps what is readable and says what was not, when one old key is damaged', () => {
    const a = migrateOldPlan(memory({ [MY_PLAN_KEY]: '{nope', [ITINERARY_KEY]: itineraryV2 }), ctx);
    expect(a.problems).toEqual([expect.stringMatching(/saved plan is damaged/)]);
    expect(a.plan!.targets.map((t) => t.id)).toEqual(['m31', 'm42']);
    const b = migrateOldPlan(memory({ [MY_PLAN_KEY]: oldMyPlan, [ITINERARY_KEY]: '{"version":9}' }), ctx);
    expect(b.problems).toEqual(['Your saved night timeline could not be read, so it was not carried over.']);
    expect(b.plan!.targets.map((t) => t.id)).toEqual(['ngc7000', 'm31', 'planet-jupiter']);
  });

  it('keeps at most 50 targets', () => {
    const many = JSON.stringify({ version: 1, ids: Array.from({ length: 50 }, (_, i) => `a${i}`) });
    const itin = JSON.stringify({ version: 1, items: [{ id: 's1', targetId: 'extra', trainId: 't1', filterId: null, mode: 'deep', note: '' }] });
    const { plan } = migrateOldPlan(memory({ [MY_PLAN_KEY]: many, [ITINERARY_KEY]: itin }), ctx);
    expect(plan!.targets).toHaveLength(MAX_PLAN_TARGETS);
  });

  it('leaves the old keys alone when reading, and clearOldPlanKeys removes both', () => {
    const m = memory({ [MY_PLAN_KEY]: oldMyPlan, [ITINERARY_KEY]: itineraryV2 });
    migrateOldPlan(m, ctx);
    expect(m.data.has(MY_PLAN_KEY) && m.data.has(ITINERARY_KEY)).toBe(true);
    clearOldPlanKeys(m);
    expect(m.data.has(MY_PLAN_KEY) || m.data.has(ITINERARY_KEY)).toBe(false);
  });

  it('startPlans with a migrated plan opens it', () => {
    const { plan } = migrateOldPlan(memory({ [MY_PLAN_KEY]: oldMyPlan }), ctx);
    const s: PlansState = startPlans(ctx, plan);
    expect(s.plans).toEqual([plan]);
    expect(s.openId).toBe(plan!.id);
  });
});
