import { MAX_PLANS, MAX_PLAN_NAME, compareIncoming, importPlans, startPlans, updatePlan, validatePlans } from '../state/plans';
import type { Plan, PlansState } from '../state/plans';
import { MAX_ENTRIES_READ, MAX_PLANS_FILE_CHARS, PlansFileError, gearInEverything, plansFileText, readPlansFile } from './plans-file';
import { sheetTotal } from './share';

const NOW = '2026-11-14T00:00:00.000Z';
const dateText = (iso: string) => iso;
const read = (text: string) => readPlansFile(text, '2026-11-15', dateText);

function state(n: number): PlansState {
  let s = startPlans({ date: '2026-11-14', siteId: 'home', trainId: 't1', now: NOW });
  s = updatePlan(s, 'plan-1', { targets: [{ id: 'm42', preset: 'balanced', note: 'first' }, { id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90, subCount: 40 }, start: '20:00', end: '21:00', favorite: 'ask' }], startTime: '19:30', notes: 'two\nlines' }, NOW);
  for (let i = 2; i <= n; i++) s = { ...s, plans: [...s.plans, { ...s.plans[0], id: `plan-${i}`, name: `Plan ${i}` }] };
  return s;
}
const fileOf = (plans: Plan[], extra: Record<string, unknown> = {}) => JSON.stringify({ format: 'four-peaks-planner', kind: 'plans', version: 1, plans, ...extra });
const raw = (over: Record<string, unknown> = {}, n = 1) => ({ ...state(1).plans[0], id: `p${n}`, ...over });

describe('round trip', () => {
  it('exports then imports the same plans, field for field', () => {
    const s = state(4);
    const out = read(plansFileText({ exportedAt: NOW, plans: s.plans, sheets: [], profile: null }));
    expect(out.notices).toEqual([]);
    expect(out.plans).toEqual(s.plans);
    const fresh = startPlans({ date: '2026-11-14', siteId: 'home', trainId: 't1', now: NOW });
    const into: PlansState = { ...fresh, plans: [] as Plan[] };
    // the store never holds zero plans; start from one and check the imported ones follow it unchanged
    const r = importPlans(fresh, out.plans.map((p, i) => ({ ...p, id: `x${i}` })), 'copy');
    expect(r.added).toBe(4);
    expect(r.state.plans.slice(1).map((p) => ({ ...p, id: '' }))).toEqual(s.plans.map((p) => ({ ...p, id: '' })));
    expect(into.plans).toEqual([]);
  });
  it('an "everything" file keeps its gear for Import profile and its plans for Import plans', () => {
    const text = plansFileText({ exportedAt: NOW, plans: state(1).plans, sheets: [], profile: { version: 3 } as never });
    expect(read(text).hasGear).toBe(true);
    expect(JSON.parse(gearInEverything(text)!)).toEqual({ version: 3 });
    expect(gearInEverything(fileOf([]))).toBeNull();
  });
  it('a plans file with sheets reads the same (the sheets are for people)', () => {
    const s = state(2);
    const sheets = [{ name: 'x', rows: [] }] as never;
    expect(read(plansFileText({ exportedAt: NOW, plans: s.plans, sheets, profile: null })).plans).toEqual(s.plans);
    expect(sheetTotal([])).toBeNull();
  });
});

describe('a file that is not a plans file is refused in plain words', () => {
  const refuses = (text: string, re: RegExp) => {
    expect(() => read(text)).toThrow(PlansFileError);
    expect(() => read(text)).toThrow(re);
    try {
      read(text);
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\$\.|expected|must be|undefined|\[object/);
    }
  };
  it('empty, not JSON, not an object', () => {
    refuses('   ', /empty/);
    refuses('{nope', /not valid JSON/);
    refuses('[1,2]', /should be an object/);
    refuses('42', /should be an object/);
    refuses('"text"', /should be an object/);
  });
  it('a gear profile, another program\'s file, no plans', () => {
    refuses(JSON.stringify({ version: 3, sites: [], equipment: {}, trains: [] }), /gear profile/);
    refuses(JSON.stringify({ format: 'other', version: 1, plans: [] }), /not made by this planner/);
    refuses(fileOf([]), /no plans/);
    refuses(JSON.stringify({ format: 'four-peaks-planner', version: 1 }), /no list of plans/);
  });
  it('a missing, text or other version; a newer one says so and imports nothing', () => {
    refuses(JSON.stringify({ format: 'four-peaks-planner', plans: [raw()] }), /no version/);
    refuses(JSON.stringify({ format: 'four-peaks-planner', version: '1', plans: [raw()] }), /version is not a number/);
    refuses(JSON.stringify({ format: 'four-peaks-planner', version: 0, plans: [raw()] }), /Version 0/);
    refuses(JSON.stringify({ format: 'four-peaks-planner', version: 9, plans: [raw()] }), /Newer file version 9/);
  });
  it('a file over the size limit, without parsing it', () => {
    refuses('x'.repeat(MAX_PLANS_FILE_CHARS + 1), /too large/);
  });
});

describe('hostile contents never crash and never reach the store whole', () => {
  it('3,000-character names are left out with a short sentence', () => {
    const out = read(fileOf([raw({ name: 'x'.repeat(3000) }, 1), raw({}, 2)]));
    expect(out.plans.map((p) => p.id)).toEqual(['p2']);
    expect(out.notices).toHaveLength(1);
    expect(out.notices[0].length).toBeLessThan(200);
    expect(out.notices[0]).toMatch(/name holds at most 60 characters/);
  });
  it('10,000 plans are refused as too large; 8,000 small ones read 50 and say the rest are left out', () => {
    expect(() => read(fileOf(Array.from({ length: 10_000 }, (_, i) => raw({}, i))))).toThrow(/too large/);
    const small = (i: number) => ({ id: `p${i}`, name: 'P', createdAt: '2026-11-14', updatedAt: '2026-11-14', date: '2026-11-14', siteId: 's', trainId: 't', startTime: null, targets: [], notes: '' });
    const out = read(fileOf(Array.from({ length: 8_000 }, (_, i) => small(i)) as never));
    expect(out.plans).toHaveLength(MAX_PLANS);
    expect(out.notices.join(' ')).toMatch(new RegExp(`${8_000 - MAX_PLANS} left out`));
    const bad = read(fileOf([small(1), ...Array.from({ length: 6_000 }, () => ({ nope: 1 }))] as never));
    expect(bad.plans).toHaveLength(1);
    expect(bad.notices.length).toBeLessThanOrEqual(10);
    expect(MAX_ENTRIES_READ).toBeLessThan(6_000);
  });
  it('a file of 10,000 unreadable plans says none could be read, in a few lines', () => {
    expect(() => read(fileOf(Array.from({ length: 10_000 }, () => ({ nope: 1 })) as never))).toThrow(/None of the plans in the file could be read/);
    try {
      read(fileOf(Array.from({ length: 10_000 }, () => ({ nope: 1 })) as never));
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(1500);
    }
  });
  it('duplicate ids inside the file: the first is kept, the repeat is said', () => {
    const out = read(fileOf([raw({ name: 'First' }, 1), raw({ name: 'Second' }, 1)]));
    expect(out.plans.map((p) => p.name)).toEqual(['First']);
    expect(out.notices[0]).toMatch(/repeats an id/);
  });
  it('wrong types inside a plan are said without the validator\'s words', () => {
    const out = read(fileOf([raw({ name: 'Bad times', targets: [{ id: 'm42', preset: 'balanced', start: 'soon' }] }, 1), raw({ targets: 'none' }, 2), raw({}, 3), 7 as never, null as never]));
    expect(out.plans.map((p) => p.id)).toEqual(['p3']);
    const said = out.notices.join(' ');
    expect(said).toMatch(/target 1, start time: it is not a 24-hour time/);
    expect(said).toMatch(/targets: it is not a list/);
    expect(said).not.toMatch(/\$\.|must be|expected/);
  });
  it('an unknown preset becomes Balanced and a bad date becomes the day given, each said', () => {
    const out = read(fileOf([raw({ date: 'yesterday', targets: [{ id: 'm42', preset: 'ultra' }] })]));
    expect(out.plans[0].targets[0].preset).toBe('balanced');
    expect(out.plans[0].date).toBe('2026-11-15');
    expect(out.notices).toHaveLength(2);
  });
  it('out-of-limit exposure numbers are kept as stored (the row says they are not used), never turned into something else', () => {
    const out = read(fileOf([raw({ targets: [{ id: 'm42', preset: 'custom', base: 'balanced', custom: { subSeconds: 900, subCount: 5000 } }] })]));
    expect(out.plans[0].targets[0].custom).toEqual({ subSeconds: 900, subCount: 5000 });
  });
  it('prototype pollution keys in a plan do not reach the plan', () => {
    const out = read(fileOf([JSON.parse('{"__proto__":{"x":1},"constructor":{"y":2}}')], {}).replace('"plans":[', `"plans":[${JSON.stringify(raw({}, 1))},`));
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.keys(out.plans[0])).not.toContain('__proto__');
  });
});

describe('importPlans never overwrites', () => {
  const here = state(2);
  const mine = (p: Plan, over: Partial<Plan> = {}): Plan => ({ ...p, ...over });
  it('adds new ids after the existing plans and leaves the open plan and every existing plan alone', () => {
    const r = importPlans(here, [mine(here.plans[0], { id: 'new', name: 'New', notes: 'a new one' })], 'copy');
    expect(r).toMatchObject({ added: 1, copies: 0, skipped: 0, leftOut: 0 });
    expect(r.state.plans.slice(0, 2)).toEqual(here.plans);
    expect(r.state.openId).toBe(here.openId);
  });
  it('an identical plan that is already here is skipped, even when copies are asked for', () => {
    const r = importPlans(here, [here.plans[1]], 'copy');
    expect(r).toMatchObject({ added: 0, skipped: 1 });
    expect(r.state.plans).toEqual(here.plans);
  });
  it('a different plan with the same id is a copy with a new id and "(imported)" in its name, or skipped on request', () => {
    const changed = mine(here.plans[1], { name: 'Changed', notes: 'other' });
    const c = importPlans(here, [changed], 'copy');
    expect(c).toMatchObject({ added: 1, copies: 1 });
    expect(c.state.plans[1]).toEqual(here.plans[1]);
    expect(c.state.plans[2].name).toBe('Changed (imported)');
    expect(here.plans.some((p) => p.id === c.state.plans[2].id)).toBe(false);
    expect(importPlans(here, [changed], 'skip')).toMatchObject({ added: 0, skipped: 0, clashSkipped: 1 });
    expect(importPlans(c.state, [changed], 'copy')).toMatchObject({ added: 0, skipped: 1 });
    const twice = importPlans(c.state, [{ ...changed, notes: 'other again' }], 'copy');
    expect(twice.state.plans[3].name).toBe('Changed (imported) 2');
  });
  it('a plan whose content is already here is a repeat whatever its id and name, so the same file twice adds nothing', () => {
    const renamed = mine(here.plans[1], { id: 'other-id', name: 'Another name' });
    expect(importPlans(here, [renamed], 'copy')).toMatchObject({ added: 0, skipped: 1 });
    const changed = mine(here.plans[1], { notes: 'changed' });
    const once = importPlans(here, [changed], 'copy');
    expect(once).toMatchObject({ added: 1, copies: 1 });
    const again = importPlans(once.state, [changed], 'copy');
    expect(again).toMatchObject({ added: 0, skipped: 1 });
    expect(again.state.plans).toHaveLength(once.state.plans.length);
    expect(importPlans(once.state, [changed], 'skip')).toMatchObject({ added: 0, skipped: 1, clashSkipped: 0 });
  });
  it('compareIncoming counts repeats, id clashes and new plans apart', () => {
    const incoming = [mine(here.plans[0], { id: 'x', name: 'x' }), mine(here.plans[1], { notes: 'changed' }), mine(here.plans[1], { id: 'new', notes: 'brand new' })];
    expect(compareIncoming(here, incoming)).toEqual({ same: 1, clash: 1, fresh: 1 });
  });
  it('a long name stays within the name limit when "(imported)" is added', () => {
    const long = mine(here.plans[1], { name: 'n'.repeat(MAX_PLAN_NAME), notes: 'z' });
    const r = importPlans(here, [long], 'copy');
    expect(r.state.plans[2].name).toHaveLength(MAX_PLAN_NAME);
    expect(r.state.plans[2].name.endsWith(' (imported)')).toBe(true);
  });
  it('stops at the plan limit and counts what it left out', () => {
    const full = state(MAX_PLANS - 1);
    const r = importPlans(full, [raw({ notes: 'a' }, 1), raw({ notes: 'b' }, 2), raw({ notes: 'c' }, 3)].map((p) => p as Plan), 'copy');
    expect(r.state.plans).toHaveLength(MAX_PLANS);
    expect(r).toMatchObject({ added: 1, leftOut: 2 });
    expect(() => validatePlans(r.state)).not.toThrow();
  });
});
