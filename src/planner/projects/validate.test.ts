import { MAX_ID_CHARS, MAX_PROJECT_NAME, MAX_SESSION_NOTE, PROJECT_LIMITS } from './limits';
import { L, line, project, session } from './testkit';
import { ProjectsError, checkProject, isRealDate, validateProjects } from './validate';

const state = (...projects: unknown[]) => ({ version: 1, projects });
const refuses = (raw: unknown, re: RegExp) => {
  let err: unknown;
  try {
    checkProject(raw, '$.projects[0]');
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ProjectsError);
  // The path and detail (for code) name the field; the message (for people) is words with no path.
  const e = err as ProjectsError;
  expect(`${e.path}: ${e.detail}`).toMatch(re);
  expect(e.message).not.toMatch(/\$|\[\d+\]/);
  // The message says what is wrong in words and never the stored value.
  expect(e.message).not.toMatch(/NaN|Infinity|e\+|\[object|undefined|HOSTILE|__proto__/);
};
const withSession = (s: Record<string, unknown>) => ({ ...project(), sessions: [{ ...session('a', 'm31', L, 10), ...s }] });

describe('dates are real calendar dates', () => {
  it('accepts real ones, refuses the rest', () => {
    for (const d of ['2026-11-16', '2028-02-29', '2000-01-01', '2100-12-31']) expect(isRealDate(d)).toBe(true);
    for (const d of ['2026-02-30', '2026-13-01', '2026-00-10', '2027-02-29', '2026-11-31', '26-11-16', '2026-1-16', '1999-12-31', '2101-01-01', '', 'HOSTILE', 20261116, null, undefined, {}]) expect(isRealDate(d)).toBe(false);
  });
});

describe('a project is read only when every stored value is in range', () => {
  it('the project of the tests is whole, and reads back unchanged', () => {
    const p = project({ sessions: [session('a', 'm31', L, 10), { id: 'b', date: '2026-11-15', targetId: 'm42', filterId: 'nbz', exposures: 30, subSeconds: 60, note: 'x' }] });
    expect(checkProject(JSON.parse(JSON.stringify(p)), '$')).toEqual(p);
  });

  it.each([
    ['NaN as minutes (stored as null)', withSession({ minutes: null }), /not a usable number/],
    ['text as minutes', withSession({ minutes: '90' }), /not a usable number/],
    ['1e308 minutes', withSession({ minutes: 1e308 }), /impossibly large/],
    ['negative minutes', withSession({ minutes: -5 }), /outside the allowed range/],
    ['a fraction of a minute', withSession({ minutes: 2.5 }), /whole number/],
    ['over 100,000 minutes', withSession({ minutes: 100_001 }), /0 to 100,000 min/],
    ['a bad date', withSession({ date: '2026-02-30' }), /real date/],
    ['a date as text of a sentence', withSession({ date: 'HOSTILE' }), /real date/],
    ['minutes and exposures together', withSession({ minutes: 10, exposures: 3, subSeconds: 60 }), /not both/],
    ['neither minutes nor exposures', withSession({ minutes: undefined }), /holds minutes, or exposures/],
    ['exposures without a sub length', withSession({ minutes: undefined, exposures: 5 }), /holds minutes, or exposures/],
    ['a sub length of 0', withSession({ minutes: undefined, exposures: 5, subSeconds: 0 }), /subSeconds/],
    ['a sub length of 1e308', withSession({ minutes: undefined, exposures: 5, subSeconds: 1e308 }), /subSeconds/],
    ['exposures that add up to more than the limit', withSession({ minutes: undefined, exposures: 100_000, subSeconds: 300 }), /more than 100,000 minutes/],
    ['a note over the limit', withSession({ note: 'x'.repeat(MAX_SESSION_NOTE + 1) }), /at most 200/],
    ['a note with a line break', withSession({ note: 'a\nb' }), /line break/],
    ['an id of symbols', withSession({ id: '<script>' }), /plain letters/],
    ['an id past the limit', withSession({ id: 'a'.repeat(MAX_ID_CHARS + 1) }), /at most 80/],
    ['an empty target id', withSession({ targetId: '' }), /not empty/],
  ])('refuses %s', (_name, raw, re) => refuses(raw, re));

  it('refuses a duplicate session id, a duplicate target, a duplicate filter', () => {
    refuses({ ...project(), sessions: [session('a', 'm31', L, 1), session('a', 'm42', L, 1)] }, /same id/);
    refuses({ ...project(), targets: [{ id: 'm31', lines: [] }, { id: 'm31', lines: [] }] }, /target appears once/);
    refuses({ ...project(), targets: [{ id: 'm31', lines: [line(L, 5), line(L, 5)] }] }, /once on a target/);
    refuses({ ...project(), setup: { ...project().setup, filterIds: [L, L] } }, /filter appears once/);
  });

  it('refuses a plan line for a filter the project does not use, and a bad planned number', () => {
    refuses({ ...project(), targets: [{ id: 'm31', lines: [line('stranger', 5)] }] }, /not one of the filters/);
    refuses({ ...project(), targets: [{ id: 'm31', lines: [line(L, Number.POSITIVE_INFINITY)] }] }, /not a usable number/);
    refuses({ ...project(), targets: [{ id: 'm31', lines: [{ filterId: L, minutes: 5 }] }] }, /yes or no/);
  });

  it('holds 1 to 100 targets, 1 to 12 filters, 5000 sessions, a name of at most 60 characters', () => {
    const t = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, lines: [] }));
    expect(() => checkProject({ ...project(), targets: t(PROJECT_LIMITS.targets.max) }, '$')).not.toThrow();
    refuses({ ...project(), targets: t(101) }, /holds 1 to 100, found 101/);
    refuses({ ...project(), targets: [] }, /holds 1 to 100, found 0/);
    const f = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);
    expect(() => checkProject({ ...project(), setup: { ...project().setup, filterIds: f(12) }, targets: t(1) }, '$')).not.toThrow();
    refuses({ ...project(), setup: { ...project().setup, filterIds: f(13) } }, /holds 1 to 12, found 13/);
    refuses({ ...project(), setup: { ...project().setup, filterIds: [] } }, /holds 1 to 12, found 0/);
    const sessions = (n: number) => Array.from({ length: n }, (_, i) => session(`s${i}`, 'm31', L, 1));
    expect(checkProject({ ...project(), sessions: sessions(5000) }, '$').sessions).toHaveLength(5000);
    refuses({ ...project(), sessions: sessions(5001) }, /holds 0 to 5,000, found 5,001/);
    refuses({ ...project(), name: 'n'.repeat(MAX_PROJECT_NAME + 1) }, /at most 60/);
    refuses({ ...project(), name: '   ' }, /not empty/);
  });

  it('refuses a status, a setup sub length and a time that are not usable', () => {
    refuses({ ...project(), status: 'gone' }, /status/);
    refuses({ ...project(), setup: { ...project().setup, subSeconds: 0 } }, /subSeconds/);
    refuses({ ...project(), setup: { ...project().setup, subSeconds: 301 } }, /subSeconds/);
    refuses({ ...project(), createdAt: 'HOSTILE' }, /date and time/);
    refuses('HOSTILE', /must be an object/);
    refuses(null, /must be an object/);
  });

  it('prototype keys in the stored text change nothing and are not read as fields', () => {
    const text = JSON.stringify(project()).replace('{"id":"p-1"', '{"__proto__":{"minutes":1,"polluted":true},"constructor":{"x":1},"id":"p-1"');
    const p = checkProject(JSON.parse(text), '$');
    expect(p).toEqual(project());
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // an id or a name of a prototype key is only text
    const odd = checkProject({ ...project(), id: '__proto__', targets: [{ id: 'constructor', lines: [line(L, 5)] }], sessions: [session('toString', 'constructor', L, 5)] }, '$');
    expect(odd.id).toBe('__proto__');
  });

  it('the whole store refuses a list that is not a list, another version, two projects of one id, and more than the limit', () => {
    expect(validateProjects(state())).toEqual({ version: 1, projects: [] });
    expect(() => validateProjects({ version: 2, projects: [] })).toThrow(/version 1/);
    expect(() => validateProjects({ version: 1, projects: {} })).toThrow(/list/);
    expect(() => validateProjects(state(project(), project()))).toThrow(/same id/);
    expect(() => validateProjects(state(...Array.from({ length: 21 }, (_, i) => project({ id: `p${i}` }))))).toThrow(/at most 20/);
  });
});
