import { ITINERARY_KEY, serializeItinerary } from '../itinerary';
import type { ItineraryItem } from '../itinerary';
import { MY_PLAN_KEY, saveMyPlan } from './index';
import {
  EXPOSURE_NOTICE_KEY,
  MAX_PLANS,
  MAX_PLAN_TARGETS,
  PLANS_BACKUP_KEY,
  PLANS_BACKUP_PREFIX,
  listBackups,
  PLANS_KEY,
  PlansError,
  adoptStored,
  clearOldPlanKeys,
  cutMessage,
  deletePlan,
  duplicatePlan,
  inspectStored,
  keepCopy,
  loadPlans,
  migrateOldPlan,
  newPlan,
  openPlan,
  renamePlan,
  savePlans,
  startPlans,
  updatePlan,
  validatePlans,
  withMigratedPlan,
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
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
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
    expect(() => newPlan(s, ctx)).toThrow(/Plan limit: 50/);
    expect(() => duplicatePlan(s, s.openId, NOW)).toThrow(/Plan limit: 50/);
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
  const TODAY = '2026-11-14';
  it('round-trips through storage, with the open plan id', () => {
    let s = newPlan(startPlans(ctx), ctx);
    s = updatePlan(s, s.openId, { targets: [target('m31'), { id: 'm42', preset: 'custom', custom: { subSeconds: 120, totalMin: 90 }, start: '22:00', end: '23:30', note: 'wide' }], notes: 'bring the heater' }, NOW);
    const m = memory();
    savePlans(m, s);
    expect(JSON.parse(m.data.get(PLANS_KEY) as string).version).toBe(1);
    expect(loadPlans(m, TODAY)).toEqual({ state: s, notices: [], unusable: null });
  });

  it('is null when nothing is stored', () => {
    expect(loadPlans(memory(), TODAY)).toEqual({ state: null, notices: [], unusable: null });
  });

  it('falls back to the first plan when the open id is gone', () => {
    const s = startPlans(ctx);
    const loaded = validatePlans({ ...s, openId: 'gone' });
    expect(loaded.openId).toBe(s.plans[0].id);
  });

  const five = (patch: (plans: Record<string, unknown>[]) => void) => {
    const plans = [1, 2, 3, 4, 5].map((n) => ({ ...planWith(n, ['m31', 'm42']) })) as unknown as Record<string, unknown>[];
    patch(plans);
    return JSON.stringify({ version: 1, openId: 'plan-3', plans });
  };

  it.each([
    ['not json', '{nope'],
    ['an array', '[]'],
    ['null', 'null'],
    ['no plans', JSON.stringify({ version: 1, openId: 'x', plans: [] })],
    ['plans that are not a list', JSON.stringify({ version: 1, openId: 'x', plans: {} })],
    ['a version that is not a number', JSON.stringify({ version: 'one', openId: 'x', plans: [planWith(1)] })],
    ['the only plan with an empty name', JSON.stringify({ version: 1, openId: 'plan-1', plans: [{ ...planWith(1), name: '' }] })],
  ])('damaged storage (%s) starts over in memory and is never removed', (_what, text) => {
    const m = memory({ [PLANS_KEY]: text });
    const r = loadPlans(m, TODAY);
    expect(r.state).toBeNull();
    expect(r.notices.join(' ')).toMatch(/Saved plans unreadable/);
    expect(r.unusable).toEqual({ kind: 'damaged', text });
    expect(m.data.get(PLANS_KEY)).toBe(text);
  });

  it('a version above 1 is "made by a newer version", is never removed, and is not called damaged', () => {
    const v2 = JSON.stringify({ ...JSON.parse(JSON.stringify(startPlans(ctx))), version: 2 });
    const m = memory({ [PLANS_KEY]: v2 });
    const r = loadPlans(m, TODAY);
    expect(r.state).toBeNull();
    expect(r.unusable).toEqual({ kind: 'newer', text: v2 });
    expect(r.notices.join(' ')).toMatch(/made by a newer version of the planner/);
    expect(r.notices.join(' ')).not.toMatch(/damaged/);
    expect(m.data.get(PLANS_KEY)).toBe(v2);
  });

  it('one plan with an unknown preset among five: all five load, the preset is Balanced, and it is said', () => {
    const text = five((p) => { p[2].targets = [{ id: 'm31', preset: 'huge', custom: { subSeconds: 60 } }, { id: 'm42', preset: 'deep' }]; });
    const m = memory({ [PLANS_KEY]: text });
    const r = loadPlans(m, TODAY);
    expect(r.state!.plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2', 'plan-3', 'plan-4', 'plan-5']);
    expect(r.state!.plans[2].targets).toEqual([{ id: 'm31', preset: 'balanced' }, { id: 'm42', preset: 'deep' }]);
    expect(r.state!.openId).toBe('plan-3');
    expect(r.notices).toEqual(['Plan "Plan 3": 1 unknown preset set to Balanced.']);
    expect(r.unusable).toEqual({ kind: 'repaired', text });
    expect(m.data.get(PLANS_KEY)).toBe(text);
  });

  it('a plan with a bad date is set to today, alone, and said', () => {
    const r = loadPlans(memory({ [PLANS_KEY]: five((p) => { p[0].date = '14/11/2026'; }) }), TODAY);
    expect(r.state!.plans).toHaveLength(5);
    expect(r.state!.plans[0].date).toBe(TODAY);
    expect(r.notices).toEqual([`Plan "Plan 1": no usable date, set to ${TODAY}.`]);
  });

  it('a plan that cannot be repaired is left out alone, by name, and the other four load', () => {
    const r = loadPlans(memory({ [PLANS_KEY]: five((p) => { p[3].startTime = '9pm'; }) }), TODAY);
    expect(r.state!.plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2', 'plan-3', 'plan-5']);
    expect(r.notices).toHaveLength(1);
    expect(r.notices[0]).toMatch(/^The plan "Plan 4" could not be read and is left out \(start time: must be a 24 h time/);
    expect(r.notices[0]).not.toContain('$.');
    expect(r.unusable!.kind).toBe('repaired');
  });

  it('a repeated plan id and more than 50 plans are left out, said, and the rest load', () => {
    const dup = loadPlans(memory({ [PLANS_KEY]: five((p) => { p[1].id = 'plan-1'; }) }), TODAY);
    expect(dup.state!.plans).toHaveLength(4);
    expect(dup.notices[0]).toMatch(/repeats an id: left out/);
    const many = JSON.stringify({ version: 1, openId: 'p0', plans: Array.from({ length: MAX_PLANS + 2 }, (_, i) => ({ ...planWith(1), id: `p${i}`, name: `P${i}` })) });
    const over = loadPlans(memory({ [PLANS_KEY]: many }), TODAY);
    expect(over.state!.plans).toHaveLength(MAX_PLANS);
    expect(over.notices).toEqual([`Plan limit ${MAX_PLANS}: 2 left out.`]);
  });

  it('says so when storage cannot be read', () => {
    expect(() => loadPlans({ getItem: () => { throw new Error('denied'); } }, TODAY)).toThrow(/unreadable.*denied/);
  });

  it('keepCopy gives every copy its own key, never overwrites one and does not repeat a text', () => {
    const m = memory();
    const a = keepCopy(m, 'first', 1000);
    expect(a).toBe(`${PLANS_BACKUP_PREFIX}1000`);
    expect(keepCopy(m, 'first', 2000)).toBe(a); // same text: no duplicate
    const b = keepCopy(m, 'second', 1000); // a clock that did not move still takes a later key
    expect(b).toBe(`${PLANS_BACKUP_PREFIX}1001`);
    expect(m.data.get(a)).toBe('first');
    expect(m.data.get(b)).toBe('second');
    expect(PLANS_BACKUP_KEY).toBe('fpo-planner-plans-v1.bak');
  });

  it('keepCopy keeps the newest 5 and drops only the oldest beyond that; the single old key is the oldest', () => {
    const m = memory({ [PLANS_BACKUP_KEY]: 'legacy' });
    const keys = [1, 2, 3, 4].map((n) => keepCopy(m, `t${n}`, n * 10));
    expect(listBackups(m).map((b) => b.text)).toEqual(['legacy', 't1', 't2', 't3', 't4']);
    const fifth = keepCopy(m, 't5', 50);
    expect(listBackups(m).map((b) => b.text)).toEqual(['t1', 't2', 't3', 't4', 't5']); // only the oldest went
    expect(m.data.get(fifth)).toBe('t5');
    expect(keys.every((k) => m.data.has(k))).toBe(true);
    expect(m.data.get(PLANS_KEY)).toBeUndefined();
  });

  it('keepCopy removes nothing when the new copy cannot be written', () => {
    const m = memory({ [PLANS_BACKUP_KEY]: 'a', [`${PLANS_BACKUP_PREFIX}1`]: 'b', [`${PLANS_BACKUP_PREFIX}2`]: 'c', [`${PLANS_BACKUP_PREFIX}3`]: 'd', [`${PLANS_BACKUP_PREFIX}4`]: 'e' });
    m.setItem = () => {
      throw new Error('full');
    };
    expect(() => keepCopy(m, 'new', 9)).toThrow('full');
    expect(listBackups(m)).toHaveLength(5);
  });

  it('adoptStored takes the plans another tab saved and keeps this tab\'s open plan when it is still there', () => {
    const mine = { ...newPlan(startPlans(ctx), ctx), openId: 'plan-1' };
    const other = newPlan(newPlan(startPlans(ctx), ctx), ctx); // plan-1..3, opened plan-3
    const adopted = adoptStored(mine, JSON.stringify(other))!;
    expect(adopted.plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2', 'plan-3']);
    expect(adopted.openId).toBe('plan-1');
    expect(adoptStored({ ...mine, openId: 'plan-9' }, JSON.stringify(other))!.openId).toBe('plan-3');
    expect(adoptStored(mine, '{nope')).toBeNull();
    expect(adoptStored(mine, JSON.stringify({ ...other, version: 2 }))).toBeNull();
  });

  it('validatePlans names the first problem with its path', () => {
    expect(() => validatePlans({ version: 1, openId: 'a', plans: [{ ...planWith(1), date: 'x' }] })).toThrow(PlansError);
    expect(() => validatePlans({ version: 1, openId: 'a', plans: [{ ...planWith(1), date: 'x' }] })).toThrow(/\$\.plans\[0\]\.date/);
    expect(() => validatePlans({ version: 2, openId: 'a', plans: [planWith(1)] })).toThrow(/\$\.version/);
    expect(() => savePlans(memory(), { version: 1, openId: 'a', plans: [{ ...planWith(1), targets: [{ id: 'm31', preset: 'huge' as never }] }] })).toThrow(/preset/);
  });
});

/** The old page's own writers: `saveMyPlan` and `serializeItinerary`, as main wrote them. */
const slot = (n: number, targetId: string, mode: ItineraryItem['mode'], note = ''): ItineraryItem => ({ id: `s${n}`, targetId, trainId: 't1', filterId: null, mode, note });
const oldBrowser = (myPlan: string[] | null, items: ItineraryItem[] | null, startTime: string | null = null) => {
  const m = memory();
  if (myPlan !== null) saveMyPlan(m, myPlan);
  if (items !== null) m.setItem(ITINERARY_KEY, serializeItinerary(items, startTime));
  return m;
};
const ids = (plan: Plan | null) => plan!.targets.map((t) => t.id);

describe('plans: migration from the old My plan and itinerary', () => {
  it('is nothing when neither old key is stored', () => {
    expect(migrateOldPlan(memory(), ctx)).toEqual({ plan: null, problems: [], clear: [], cut: [] });
  });

  it('turns the My plan list into one plan named My plan (from before), targets in order, balanced', () => {
    const { plan, problems, clear } = migrateOldPlan(oldBrowser(['ngc7000', 'm31', 'planet-jupiter'], null), ctx);
    expect(problems).toEqual([]);
    expect(clear).toEqual([MY_PLAN_KEY]);
    expect(plan).toMatchObject({ name: 'My plan (from before)', date: '2026-11-14', siteId: 'home', trainId: 't1', startTime: null });
    expect(plan!.targets).toEqual([target('ngc7000'), target('m31'), target('planet-jupiter')]);
  });

  it('case A: the itinerary\'s slots come first in slot order, then the rest of My plan; presets, notes and start time stay', () => {
    const m = oldBrowser(['m31', 'ngc7000', 'm42', 'm13'], [slot(1, 'm42', 'deep', 'first'), slot(2, 'm31', 'quick')], '21:30');
    const { plan, problems, clear } = migrateOldPlan(m, ctx);
    expect(problems).toEqual([]);
    expect(clear).toEqual([MY_PLAN_KEY, ITINERARY_KEY]);
    expect(plan!.startTime).toBe('21:30');
    expect(plan!.targets).toEqual([
      { id: 'm42', preset: 'deep', note: 'first' },
      { id: 'm31', preset: 'quick' },
      { id: 'ngc7000', preset: 'balanced' },
      { id: 'm13', preset: 'balanced' },
    ]);
  });

  it('case B: My plan longer than 8 and itinerary-only targets: the first 8 of the plan are the old timeline', () => {
    const mine = Array.from({ length: 10 }, (_, i) => `a${i}`);
    const { plan } = migrateOldPlan(oldBrowser(mine, [slot(1, 'm42', 'deep'), slot(2, 'm45', 'quick')]), ctx);
    expect(ids(plan).slice(0, 2)).toEqual(['m42', 'm45']);
    expect(ids(plan)).toEqual(['m42', 'm45', ...mine]);
  });

  it('case C: two slots for one target merge: first mode, notes joined, and a plain line says so', () => {
    const { plan, problems } = migrateOldPlan(oldBrowser(null, [slot(1, 'm42', 'deep', 'Ha pass'), slot(2, 'm13', 'balanced'), slot(3, 'm42', 'quick', 'OIII pass')]), ctx);
    expect(plan!.targets).toEqual([{ id: 'm42', preset: 'deep', note: 'Ha pass / OIII pass' }, target('m13')]);
    expect(problems).toEqual(['Repeated slots merged: m42.']);
  });

  it('joined notes are cut at the 200-character note limit', () => {
    const { plan } = migrateOldPlan(oldBrowser(null, [slot(1, 'm42', 'deep', 'a'.repeat(150)), slot(2, 'm42', 'deep', 'b'.repeat(150))]), ctx);
    expect(plan!.targets[0].note).toHaveLength(200);
    expect(() => validatePlans(startPlans(ctx, plan))).not.toThrow();
  });

  it('reads an itinerary of the first version (no start time) and an itinerary with no My plan', () => {
    const m = memory({ [ITINERARY_KEY]: JSON.stringify({ version: 1, items: [slot(1, 'm13', 'balanced')] }) });
    const { plan } = migrateOldPlan(m, ctx);
    expect(plan!.startTime).toBeNull();
    expect(plan!.targets).toEqual([target('m13')]);
  });

  it('migrates nothing for an empty old plan and an empty itinerary; both keys are still cleared', () => {
    const r = migrateOldPlan(oldBrowser([], []), ctx);
    expect(r.plan).toBeNull();
    expect(r.clear).toEqual([MY_PLAN_KEY, ITINERARY_KEY]);
  });

  it('keeps what is readable and says what was not, when one old key is damaged; the damaged key is cleared', () => {
    const itin = serializeItinerary([slot(1, 'm31', 'deep'), slot(2, 'm42', 'quick')], null);
    const a = migrateOldPlan(memory({ [MY_PLAN_KEY]: '{nope', [ITINERARY_KEY]: itin }), ctx);
    expect(a.problems).toEqual([expect.stringMatching(/Saved plan damaged/)]);
    expect(ids(a.plan)).toEqual(['m31', 'm42']);
    expect(a.clear).toEqual([MY_PLAN_KEY, ITINERARY_KEY]);
    const b = migrateOldPlan(memory({ [MY_PLAN_KEY]: JSON.stringify({ version: 1, ids: ['ngc7000', 'm31'] }), [ITINERARY_KEY]: '{"version":9}' }), ctx);
    expect(b.problems).toEqual(['Saved night timeline unreadable, not carried over.']);
    expect(ids(b.plan)).toEqual(['ngc7000', 'm31']);
    expect(b.clear).toEqual([MY_PLAN_KEY, ITINERARY_KEY]);
  });

  it('case J: a My plan key the browser cannot read is not cleared; the itinerary still migrates', () => {
    const m = oldBrowser(['m31'], [slot(1, 'm42', 'deep')]);
    const get = m.getItem;
    const r = migrateOldPlan({ getItem: (k) => { if (k === MY_PLAN_KEY) throw new Error('denied'); return get(k); }, removeItem: m.removeItem }, ctx);
    expect(ids(r.plan)).toEqual(['m42']);
    expect(r.problems).toEqual([expect.stringMatching(/unreadable.*denied/)]);
    expect(r.clear).toEqual([ITINERARY_KEY]);
  });

  it('case K: an itinerary key the browser cannot read is not cleared; My plan still migrates', () => {
    const m = oldBrowser(['m31'], [slot(1, 'm42', 'deep')]);
    const get = m.getItem;
    const r = migrateOldPlan({ getItem: (k) => { if (k === ITINERARY_KEY) throw new Error('denied'); return get(k); }, removeItem: m.removeItem }, ctx);
    expect(ids(r.plan)).toEqual(['m31']);
    expect(r.problems).toEqual([expect.stringMatching(/night timeline unreadable.*denied/i)]);
    expect(r.clear).toEqual([MY_PLAN_KEY]);
  });

  it('case O: past 50 targets, the end of My plan is cut, and the cut ones are named', () => {
    const many = Array.from({ length: 50 }, (_, i) => `a${i}`);
    const { plan, problems, cut } = migrateOldPlan(oldBrowser(many, [slot(1, 'extra', 'deep')]), ctx);
    expect(plan!.targets).toHaveLength(MAX_PLAN_TARGETS);
    expect(ids(plan)[0]).toBe('extra');
    expect(ids(plan)).not.toContain('a49');
    expect(problems).toEqual([]);
    expect(cut).toEqual(['a49']);
    expect(cutMessage(cut, (id) => `Name of ${id}`)).toBe('Target limit 50, left out: Name of a49.');
  });

  it('leaves the old keys alone when reading; clearOldPlanKeys removes the ones named and the orphan exposure notice', () => {
    const m = oldBrowser(['m31'], [slot(1, 'm42', 'deep')]);
    m.setItem(EXPOSURE_NOTICE_KEY, '1');
    const { clear } = migrateOldPlan(m, ctx);
    expect(m.data.has(MY_PLAN_KEY) && m.data.has(ITINERARY_KEY)).toBe(true);
    clearOldPlanKeys(m, clear);
    expect([MY_PLAN_KEY, ITINERARY_KEY, EXPOSURE_NOTICE_KEY].some((k) => m.data.has(k))).toBe(false);
    const n = oldBrowser(['m31'], null);
    clearOldPlanKeys(n, [ITINERARY_KEY]);
    expect(n.data.has(MY_PLAN_KEY)).toBe(true); // not named: kept
  });

  it('startPlans with a migrated plan opens it', () => {
    const { plan } = migrateOldPlan(oldBrowser(['m31'], null), ctx);
    const s: PlansState = startPlans(ctx, plan);
    expect(s.plans).toEqual([plan]);
    expect(s.openId).toBe(plan!.id);
  });
});

describe('plans: what another tab stored', () => {
  const mine = startPlans(ctx);
  it('inspectStored tells whole plans, a newer version and unreadable text apart', () => {
    expect(inspectStored(mine, JSON.stringify(mine)).kind).toBe('plans');
    expect(inspectStored(mine, JSON.stringify({ ...mine, version: 2 })).kind).toBe('newer');
    expect(inspectStored(mine, '{nope').kind).toBe('unreadable');
    expect(inspectStored(mine, JSON.stringify({ version: 1, plans: [{ id: 'x' }] })).kind).toBe('unreadable');
  });
  it('withMigratedPlan adds the carried-over plan last, under a new id, and leaves the open plan', () => {
    const carried = migrateOldPlan(oldBrowser(['m31'], null), ctx).plan!;
    const next = withMigratedPlan(mine, carried);
    expect(next.plans.map((p) => p.id)).toEqual(['plan-1', 'plan-2']);
    expect(next.openId).toBe('plan-1');
  });
});
