import { addProject, addSession, addSessionsWithIds, removeSession, updateProject } from './edit';
import { seedHeldBy, seedSessions } from './seed';
import { PROJECTS_BACKUP_PREFIX, PROJECTS_KEY, HELD_TEXT, changeProjects, inspectProjects, listProjectsBackups, loadProjects, mergeProjects, openProjects, projectsText } from './store';
import type { ProjectsHandle } from './store';
import { L, NOW, memory, project, session } from './testkit';
import { EMPTY_PROJECTS } from './validate';
import type { ProjectsState } from './validate';

const stateOf = (...ps: ReturnType<typeof project>[]): ProjectsState => ({ version: 1, projects: ps });
const put = (storage: ReturnType<typeof memory>, state: ProjectsState) => storage.setItem(PROJECTS_KEY, projectsText(state));
const add = (id: string, minutes: number) => (s: ProjectsState) => addSession(s, 'p-1', { date: '2026-11-16', targetId: 'm31', filterId: L, minutes, note: id }, NOW).state;
const sessionsOf = (h: ProjectsHandle) => h.state.projects[0].sessions.map((s) => s.note).sort();

describe('reading the store', () => {
  it('nothing stored: no projects, nothing unusable, nothing written', () => {
    const s = memory();
    expect(loadProjects(s)).toEqual({ state: null, notices: [], unusable: null });
    const o = openProjects(s);
    expect(o.handle.state).toEqual(EMPTY_PROJECTS);
    expect(o.notes).toEqual([]);
    expect(s.keys()).toEqual([]);
  });

  it('round-trips what was written', () => {
    const s = memory();
    put(s, stateOf(project({ sessions: [session('a', 'm31', L, 10)] })));
    expect(loadProjects(s)).toMatchObject({ state: stateOf(project({ sessions: [session('a', 'm31', L, 10)] })), unusable: null, notices: [] });
  });

  it('unreadable text is held back and copied to a dated key before anything is written: not JSON, wrong shape, wrong version', () => {
    for (const text of ['{nope', '[1]', JSON.stringify({ version: 1 }), JSON.stringify({ version: 0, projects: [] })]) {
      const s = memory({ [PROJECTS_KEY]: text });
      const o = openProjects(s, 1000);
      expect(o.handle.state).toEqual(EMPTY_PROJECTS);
      expect(o.handle.held).toBeNull();
      expect(s.getItem(PROJECTS_KEY)).toBe(text); // not touched
      expect(listProjectsBackups(s).map((b) => b.text)).toEqual([text]);
      expect(o.notes.join(' ')).toMatch(/could not be read, so you start with none/);
      expect(o.notes.join(' ')).toContain(`${PROJECTS_BACKUP_PREFIX}1000`);
    }
  });

  it('a newer version is held: never written over, no copy needed, saving is off', () => {
    const text = JSON.stringify({ version: 2, projects: [{ anything: 1 }] });
    const s = memory({ [PROJECTS_KEY]: text });
    const o = openProjects(s);
    expect(o.handle.held).toBe('newer');
    const r = changeProjects(s, o.handle, (x) => x);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toBe(HELD_TEXT.newer);
    expect(s.getItem(PROJECTS_KEY)).toBe(text);
  });

  it('damaged text whose copy cannot be written is held, and not written over', () => {
    const s = memory({ [PROJECTS_KEY]: '{nope' }, (k) => (k.startsWith(PROJECTS_BACKUP_PREFIX) ? new Error('full') : null));
    const o = openProjects(s);
    expect(o.handle.held).toBe('nocopy');
    expect(o.notes.join(' ')).toMatch(/copy .* failed/);
    expect(changeProjects(s, o.handle, add('a', 5)).ok).toBe(false);
    expect(s.getItem(PROJECTS_KEY)).toBe('{nope');
  });

  it('a project with one bad value is left out in words and the others load; the text is copied before the next save', () => {
    const good = project({ id: 'good', name: 'Good' });
    const bad = { ...project({ id: 'bad', name: 'Bad one' }), sessions: [{ ...session('a', 'm31', L, 5), date: '2026-02-30' }] };
    const text = JSON.stringify({ version: 1, projects: [bad, good] });
    const s = memory({ [PROJECTS_KEY]: text });
    const r = loadProjects(s);
    expect(r.state!.projects.map((p) => p.id)).toEqual(['good']);
    expect(r.notices).toEqual(['The project "Bad one" could not be read and is left out (session 1, date: must be a real date, YYYY-MM-DD, in 2000 to 2100).']);
    expect(r.unusable).toEqual({ kind: 'repaired', text });
    const o = openProjects(s, 5);
    expect(listProjectsBackups(s).map((b) => b.text)).toEqual([text]);
    expect(o.handle.held).toBeNull();
  });

  it('every project bad is damaged, not an empty success; a hostile name is never printed raw', () => {
    const text = JSON.stringify({ version: 1, projects: [{ ...project(), name: `${'x'.repeat(100)}\nHOSTILE`, sessions: [{}] }] });
    const r = loadProjects(memory({ [PROJECTS_KEY]: text }));
    expect(r.state).toBeNull();
    expect(r.unusable!.kind).toBe('damaged');
    const said = r.notices.join(' ');
    expect(said).not.toMatch(/HOSTILE|\n/);
    expect(said.length).toBeLessThan(400);
  });

  it('a project that repeats an id is left out; more than the limit is counted', () => {
    const text = JSON.stringify({ version: 1, projects: [project(), project({ name: 'Other' }), ...Array.from({ length: 22 }, (_, i) => project({ id: `q${i}` }))] });
    const r = loadProjects(memory({ [PROJECTS_KEY]: text }));
    expect(r.state!.projects).toHaveLength(20);
    expect(r.notices.join(' ')).toMatch(/repeated the id of another project/);
    expect(r.notices.join(' ')).toMatch(/at most 20 projects, so 3 more/);
  });

  it('a storage that cannot be read throws in words; opening it says so and is not held', () => {
    const s = { ...memory(), getItem: () => { throw new Error('denied'); } };
    expect(() => loadProjects(s)).toThrow(/blocked\.$/);
    expect(() => loadProjects(s)).not.toThrow(/denied/);
    expect(openProjects(s).notes[0]).toMatch(/blocked/);
  });

  it('inspectProjects tells whole, newer and unreadable text apart', () => {
    expect(inspectProjects(projectsText(stateOf(project()))).kind).toBe('projects');
    expect(inspectProjects('{"version":9,"projects":[]}').kind).toBe('newer');
    expect(inspectProjects('{"version":1,"projects":[{}]}').kind).toBe('unreadable');
    expect(inspectProjects('nope').kind).toBe('unreadable');
  });
});

describe('writing', () => {
  it('saves a change only after reading it back, and says Saved only then', () => {
    const s = memory();
    put(s, stateOf(project()));
    const o = openProjects(s);
    const r = changeProjects(s, o.handle, add('a', 30));
    expect(r.ok).toBe(true);
    expect(JSON.parse(s.getItem(PROJECTS_KEY)!).projects[0].sessions).toHaveLength(1);
    expect(r.handle.unsaved).toBe(false);
  });

  it('a change that breaks a limit is refused with a plain message and writes nothing', () => {
    const s = memory();
    put(s, stateOf(project()));
    const before = s.getItem(PROJECTS_KEY);
    const r = changeProjects(s, openProjects(s).handle, (st) => addSession(st, 'p-1', { date: '2026-11-16', targetId: 'm31', filterId: L, minutes: 1e308, note: '' }, NOW).state);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/^Not saved: .*impossibly large/);
    expect(s.getItem(PROJECTS_KEY)).toBe(before);
    expect(!r.ok && r.message).not.toMatch(/e\+|Infinity|NaN/);
  });

  it('full storage: no false Saved, a plain message, the change stays on the page, and the stored text is as it was', () => {
    let full = false;
    const s = memory({}, (k) => (full && k === PROJECTS_KEY ? Object.assign(new Error('quota'), { name: 'QuotaExceededError' }) : null));
    put(s, stateOf(project()));
    let h = openProjects(s).handle;
    const before = s.getItem(PROJECTS_KEY);
    full = true;
    const r = changeProjects(s, h, add('a', 30));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/browser storage is full/);
    expect(r.handle.unsaved).toBe(true);
    expect(sessionsOf(r.handle)).toEqual(['a']);
    expect(s.getItem(PROJECTS_KEY)).toBe(before);
    // space comes back: the next change keeps the one that was not saved, by id
    full = false;
    h = r.handle;
    const r2 = changeProjects(s, h, add('b', 20));
    expect(r2.ok).toBe(true);
    expect(sessionsOf(r2.handle)).toEqual(['a', 'b']);
    expect(JSON.parse(s.getItem(PROJECTS_KEY)!).projects[0].sessions).toHaveLength(2);
  });

  it('blocked storage: reading or writing, a plain message and no false Saved', () => {
    const s = memory();
    put(s, stateOf(project()));
    const h = openProjects(s).handle;
    const noWrite = { ...s, setItem: () => { throw Object.assign(new Error('SecurityError'), { name: 'SecurityError' }); } };
    const r = changeProjects(noWrite, h, add('a', 5));
    expect(!r.ok && r.message).toMatch(/blocked/);
    expect(r.handle.unsaved).toBe(true);
    const noRead = { ...s, getItem: () => { throw new Error('denied'); } };
    const r2 = changeProjects(noRead, h, add('a', 5));
    expect(!r2.ok && r2.message).toMatch(/blocked/);
    expect(r2.handle).toBe(h);
  });

  it('a write that does not stick (storage that ignores it) is not Saved', () => {
    const s = memory();
    put(s, stateOf(project()));
    const h = openProjects(s).handle;
    const liar = { ...s, setItem: () => undefined };
    const r = changeProjects(liar, h, add('a', 5));
    expect(r.ok).toBe(false);
  });

  it('stored text of another shape is copied to a dated key before it is replaced; if the copy fails nothing is written', () => {
    const odd = JSON.stringify({ ...stateOf(project()), extraField: 1 });
    const s = memory({ [PROJECTS_KEY]: odd });
    const h = openProjects(s, 10).handle;
    expect(listProjectsBackups(s)).toEqual([]);
    const r = changeProjects(s, h, add('a', 5), 20);
    expect(r.ok).toBe(true);
    expect(listProjectsBackups(s).map((b) => b.text)).toEqual([odd]);
    const s2 = memory({ [PROJECTS_KEY]: odd }, (k) => (k.startsWith(PROJECTS_BACKUP_PREFIX) ? new Error('full') : null));
    const r2 = changeProjects(s2, openProjects(s2).handle, add('a', 5));
    expect(!r2.ok && r2.message).toMatch(/stored projects could not be copied/);
    expect(s2.getItem(PROJECTS_KEY)).toBe(odd);
  });

  it('a held store is not written over, whatever the change', () => {
    const s = memory({ [PROJECTS_KEY]: '{"version":9,"projects":[]}' });
    const h = openProjects(s).handle;
    expect(changeProjects(s, h, add('a', 5)).ok).toBe(false);
    expect(s.getItem(PROJECTS_KEY)).toBe('{"version":9,"projects":[]}');
  });
});

describe('two tabs', () => {
  it('both add a session; neither is lost, whichever saves first', () => {
    const s = memory();
    put(s, stateOf(project()));
    const a = openProjects(s).handle;
    const b = openProjects(s).handle;
    const ra = changeProjects(s, a, add('from A', 30));
    const rb = changeProjects(s, b, add('from B', 40)); // B is stale
    expect(ra.ok && rb.ok).toBe(true);
    expect(sessionsOf(rb.handle)).toEqual(['from A', 'from B']);
    const ra2 = changeProjects(s, ra.handle, add('from A again', 5));
    expect(sessionsOf(ra2.handle)).toEqual(['from A', 'from A again', 'from B']);
    expect(JSON.parse(s.getItem(PROJECTS_KEY)!).projects[0].sessions).toHaveLength(3);
  });

  it('both offer the seed: the second refuses in words, one project holds the hours once', () => {
    const s = memory();
    const a = openProjects(s).handle;
    const b = openProjects(s).handle; // both opened with nothing stored
    const seed = (st: ProjectsState) => {
      const held = seedHeldBy(st);
      if (held !== null) throw new Error(`already logged in “${held}”`);
      const made = addProject(st, { name: 'Marathon', setup: project().setup, targets: project().targets }, NOW);
      return addSessionsWithIds(made.state, made.id, seedSessions(), NOW);
    };
    const ra = changeProjects(s, a, seed);
    const rb = changeProjects(s, b, seed);
    expect(ra.ok).toBe(true);
    expect(!rb.ok && rb.message).toBe('Not saved: already logged in “Marathon”');
    const stored = JSON.parse(s.getItem(PROJECTS_KEY)!).projects;
    expect(stored).toHaveLength(1);
    expect(stored[0].sessions).toHaveLength(3);
  });

  it('another tab deleted a session: this tab does not bring it back', () => {
    const s = memory();
    put(s, stateOf(project({ sessions: [session('keep', 'm31', L, 5), session('gone', 'm31', L, 5)] })));
    const a = openProjects(s).handle;
    const b = openProjects(s).handle;
    changeProjects(s, a, (st) => removeSession(st, 'p-1', 'gone', NOW));
    const rb = changeProjects(s, b, (st) => updateProject(st, 'p-1', { name: 'Renamed' }, NOW));
    expect(rb.ok && rb.handle.state.projects[0].sessions.map((x) => x.id)).toEqual(['keep']);
  });

  it('another tab cleared the store: this tab starts from none, and a tab with unsaved work keeps it', () => {
    const s = memory();
    put(s, stateOf(project()));
    const a = openProjects(s).handle;
    s.removeItem(PROJECTS_KEY);
    const r = changeProjects(s, a, (st) => addProject(st, { name: 'New', setup: project().setup, targets: project().targets }, NOW).state);
    expect(r.ok && r.handle.state.projects.map((p) => p.name)).toEqual(['New']);
  });

  it('another tab saved text this one cannot use: held, nothing written', () => {
    const s = memory();
    put(s, stateOf(project()));
    const a = openProjects(s).handle;
    s.setItem(PROJECTS_KEY, '{"version":1,"projects":[{}]}');
    const r = changeProjects(s, a, add('a', 5));
    expect(!r.ok && r.message).toBe(HELD_TEXT.othertab);
    expect(r.handle.held).toBe('othertab');
    expect(s.getItem(PROJECTS_KEY)).toBe('{"version":1,"projects":[{}]}');
  });
});

describe('mergeProjects: by id, nothing lost', () => {
  it('unions sessions by id inside a project and projects by id', () => {
    const base = stateOf(project({ sessions: [session('a', 'm31', L, 5), session('b', 'm31', L, 5)] }), project({ id: 'p-2', name: 'Other' }));
    const mine = stateOf(project({ sessions: [session('b', 'm31', L, 99), session('c', 'm31', L, 7)], updatedAt: '2026-11-18T00:00:00.000Z', name: 'Newer name' }), project({ id: 'p-3', name: 'Mine only' }));
    const m = mergeProjects(base, mine);
    expect(m.projects.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);
    expect(m.projects[0].name).toBe('Newer name');
    expect(m.projects[0].sessions.map((s) => [s.id, s.minutes])).toEqual([['a', 5], ['b', 99], ['c', 7]]);
  });

  it('refuses, in words, a merge that would pass 5000 sessions', () => {
    const many = (from: number) => Array.from({ length: 3000 }, (_, i) => session(`s${from + i}`, 'm31', L, 1));
    expect(() => mergeProjects(stateOf(project({ sessions: many(0) })), stateOf(project({ sessions: many(3000) })))).toThrow(/5,000/);
  });
});

describe('5000 sessions', () => {
  it('load, change and save in well under a second, and the 5001st is refused', () => {
    const sessions = Array.from({ length: 4999 }, (_, i) => session(`s${i}`, i % 2 ? 'm31' : 'm42', L, 1, `2026-11-${String((i % 28) + 1).padStart(2, '0')}`));
    const s = memory();
    put(s, stateOf(project({ sessions })));
    const t0 = Date.now();
    const h = openProjects(s).handle;
    const r = changeProjects(s, h, add('last', 5));
    expect(r.ok).toBe(true);
    expect(Date.now() - t0).toBeLessThan(1500);
    const over = changeProjects(s, r.handle, add('one too many', 5));
    expect(!over.ok && over.message).toMatch(/^Not saved: .*5,000/);
    expect(JSON.parse(s.getItem(PROJECTS_KEY)!).projects[0].sessions).toHaveLength(5000);
  });
});

describe('changeProjects refuses in words, never throws, when the two copies together pass a limit', () => {
  const noPath = (m: string) => expect(m).not.toMatch(/\$|\[\d+\]|projects\[/);
  const many = (from: number, n: number) => Array.from({ length: n }, (_, i) => session(`s${from + i}`, 'm31', L, 1));

  it('past 5,000 sessions: refused, the stored text and this page\'s state stay as they were, still unsaved', () => {
    const s = memory();
    put(s, stateOf(project({ sessions: many(0, 3000) })));
    const a = openProjects(s).handle;
    // this page holds 3,000 sessions of its own that never reached storage; another tab saved 3,000 others
    const mine: ProjectsHandle = { ...a, state: stateOf(project({ sessions: many(10000, 3000) })), unsaved: true };
    const before = s.getItem(PROJECTS_KEY);
    let r: ReturnType<typeof changeProjects> | undefined;
    expect(() => (r = changeProjects(s, mine, add('x', 5)))).not.toThrow();
    expect(r?.ok).toBe(false);
    if (r === undefined || r.ok) throw new Error('expected a refusal');
    expect(r.message).toMatch(/^Not saved: .*sessions: holds 0 to 5,000, found 6,000/);
    noPath(r.message);
    // The remedy is true: this change was not made; the earlier unsaved ones are kept; removing in this page cannot help.
    expect(r.message).toContain('pass a limit');
    expect(r.message).not.toContain('remove some sessions or projects and change something again');
    expect(r.handle).toBe(mine);
    expect(r.handle.unsaved).toBe(true);
    expect(s.getItem(PROJECTS_KEY)).toBe(before);
  });

  it('past 20 projects: each tab added a 20th while one write failed', () => {
    const s = memory();
    const mk = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => project({ id: `${prefix}${i}`, name: `${prefix}${i}` }));
    put(s, stateOf(...mk('a', 11)));
    const a = openProjects(s).handle;
    const mine: ProjectsHandle = { ...a, state: stateOf(...mk('b', 10)), unsaved: true };
    const before = s.getItem(PROJECTS_KEY);
    let r: ReturnType<typeof changeProjects> | undefined;
    expect(() => (r = changeProjects(s, mine, (st) => st))).not.toThrow();
    if (r === undefined || r.ok) throw new Error('expected a refusal');
    expect(r.message).toMatch(/^Not saved: .*at most 20 projects, found 21/);
    noPath(r.message);
    expect(r.handle).toBe(mine);
    expect(s.getItem(PROJECTS_KEY)).toBe(before);
  });

  it('a stored copy cleared in another tab, merged back with this page\'s unsaved projects past a limit: refused too', () => {
    const s = memory();
    put(s, stateOf(project()));
    const a = openProjects(s).handle;
    s.removeItem(PROJECTS_KEY);
    const mine: ProjectsHandle = { ...a, state: stateOf(project({ sessions: many(0, 5001) })), unsaved: true };
    const r = changeProjects(s, mine, (st) => st);
    expect(r.ok).toBe(false);
    expect(r.handle).toBe(mine);
  });

  it('an edit that breaks a limit is refused in words (the refusal message holds no path)', () => {
    const s = memory();
    put(s, stateOf(project()));
    const h = openProjects(s).handle;
    const r = changeProjects(s, h, (st) => updateProject(st, 'p-1', { targets: [{ id: 'm31', lines: [{ filterId: L, minutes: -5, optional: false }] }] }, NOW));
    if (r.ok) throw new Error('expected a refusal');
    expect(r.message).toBe('Not saved: target 1, filter line 1, minutes: -5 is outside the allowed range; use a whole number, 0 to 100,000 min');
    const raw = changeProjects(s, h, (st) => ({ ...st, projects: [{ ...st.projects[0], name: 'x'.repeat(80) }] }));
    if (raw.ok) throw new Error('expected a refusal');
    expect(raw.message).toBe('Not saved: name: a name has at most 60 characters');
  });
});
