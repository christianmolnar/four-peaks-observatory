import { addProject, addSession, addSessionsWithIds, compareIncomingProjects, importProjects, removeProject, removeSession, updateProject, updateSession } from './edit';
import { computeProgress } from './progress';
import { missingSeedSessions, seedSessions } from './seed';
import { L, NOW, line, project, session } from './testkit';
import { EMPTY_PROJECTS } from './validate';
import type { ProjectsState } from './validate';

const one = (...ps: ReturnType<typeof project>[]): ProjectsState => ({ version: 1, projects: ps });
const draft = { date: '2026-11-16', targetId: 'm31', filterId: L, minutes: 30, note: '' };

describe('changes check every limit', () => {
  it('adds a project with a made id, and refuses an empty plan or a bad name', () => {
    const { state, id } = addProject(EMPTY_PROJECTS, { name: '  Fall  ', setup: project().setup, targets: project().targets }, NOW);
    expect(state.projects[0]).toMatchObject({ id, name: 'Fall', status: 'active', sessions: [], createdAt: NOW, updatedAt: NOW });
    expect(() => addProject(EMPTY_PROJECTS, { name: 'x', setup: project().setup, targets: [] }, NOW)).toThrow(/holds 1 to 100/);
    expect(() => addProject(EMPTY_PROJECTS, { name: '', setup: project().setup, targets: project().targets }, NOW)).toThrow(/not empty/);
  });

  it('refuses a 21st project in words', () => {
    let s = EMPTY_PROJECTS;
    for (let i = 0; i < 20; i++) s = addProject(s, { name: `P${i}`, setup: project().setup, targets: project().targets }, `2026-11-17T01:00:${String(i).padStart(2, '0')}.000Z`).state;
    expect(new Set(s.projects.map((p) => p.id)).size).toBe(20);
    expect(() => addProject(s, { name: 'one more', setup: project().setup, targets: project().targets }, NOW)).toThrow(/at most 20 projects/);
  });

  it('adds, edits and removes a session; ids are unique and the project is stamped', () => {
    const later = '2026-11-18T00:00:00.000Z';
    const a = addSession(one(project()), 'p-1', draft, NOW);
    const b = addSession(a.state, 'p-1', draft, NOW);
    expect(a.id).not.toBe(b.id);
    const edited = updateSession(b.state, 'p-1', a.id, { ...draft, minutes: 45 }, later);
    expect(edited.projects[0].sessions.map((s) => s.minutes)).toEqual([45, 30]);
    expect(edited.projects[0].updatedAt).toBe(later);
    expect(removeSession(edited, 'p-1', a.id, later).projects[0].sessions.map((s) => s.id)).toEqual([b.id]);
    expect(() => removeSession(edited, 'p-1', 'nope', later)).toThrow(/no such session/);
    expect(() => addSession(edited, 'zzz', draft, NOW)).toThrow(/no such project/);
  });

  it('refuses a session out of range and changes nothing', () => {
    const s = one(project());
    for (const bad of [{ minutes: -1 }, { minutes: Number.NaN }, { minutes: 1e308 }, { date: '2026-02-30' }, { note: 'a'.repeat(201) }]) expect(() => addSession(s, 'p-1', { ...draft, ...bad }, NOW)).toThrow();
    expect(s.projects[0].sessions).toEqual([]);
  });

  it('refuses the 5001st session', () => {
    const full = one(project({ sessions: Array.from({ length: 5000 }, (_, i) => session(`s${i}`, 'm31', L, 1)) }));
    expect(() => addSession(full, 'p-1', draft, NOW)).toThrow(/5,000/);
  });

  it('takes a target out of the plan: its sessions stay and are reported as not in the plan', () => {
    const s = one(project({ sessions: [session('a', 'm42', L, 30)] }));
    const next = updateProject(s, 'p-1', { targets: [{ id: 'm31', lines: [line(L, 60)] }] }, NOW);
    expect(next.projects[0].sessions).toHaveLength(1);
    expect(computeProgress(next.projects[0]).notInPlan.sessions).toHaveLength(1);
  });

  it('removes a project and leaves the others', () => {
    expect(removeProject(one(project(), project({ id: 'p-2' })), 'p-1').projects.map((p) => p.id)).toEqual(['p-2']);
    expect(() => removeProject(one(project()), 'zzz')).toThrow(/no such project/);
  });
});

describe('the seed: the hours already captured on 2026-11-16, offered, never applied by itself', () => {
  it('is the three broadband sessions, valid, and in no total of an empty plan', () => {
    const seed = seedSessions();
    expect(seed.map((s) => [s.targetId, s.filterId, s.minutes, s.date])).toEqual([
      ['ic1805', L, 120, '2026-11-16'],
      ['m42', L, 50, '2026-11-16'],
      ['ngc2237', L, 60, '2026-11-16'],
    ]);
    expect(seedSessions()).toEqual(seed);
  });

  it('adds to a project whose plan holds them: 230 minutes done; a second offer adds nothing', () => {
    const p = project({ targets: [{ id: 'ic1805', lines: [line(L, 240)] }, { id: 'm42', lines: [line(L, 120)] }, { id: 'ngc2237', lines: [line(L, 120)] }] });
    const once = addSessionsWithIds(one(p), 'p-1', missingSeedSessions(p), NOW);
    const prog = computeProgress(once.projects[0]);
    expect(prog.overall).toMatchObject({ planned: 480, done: 230 });
    expect(prog.notInPlan.sessions).toEqual([]);
    expect(missingSeedSessions(once.projects[0])).toEqual([]);
    const twice = addSessionsWithIds(once, 'p-1', seedSessions(), NOW);
    expect(twice).toEqual(once);
  });

  it('into a project that does not plan some of those targets they are kept and said to be not in the plan', () => {
    const next = addSessionsWithIds(one(project()), 'p-1', seedSessions(), NOW);
    const p = computeProgress(next.projects[0]);
    expect(p.notInPlan.sessions.map((s) => s.targetId)).toEqual(['ic1805', 'ngc2237']); // M42 is in this plan
    expect(p.overall.done).toBe(50);
    expect(next.projects[0].sessions).toHaveLength(3);
  });

  it('the seed sessions can be entered after the fact: sessions of an earlier date are accepted', () => {
    expect(() => addSession(one(project()), 'p-1', { ...draft, date: '2026-11-01' }, NOW)).not.toThrow();
  });
});

describe('import: repeat adds nothing, ids are never written over', () => {
  const mine = project({ sessions: [session('a', 'm31', L, 30)] });

  it('a project already here (same content, any id or name) is a repeat', () => {
    const s = one(mine);
    const r = importProjects(s, [{ ...mine, id: 'other-id', name: 'Renamed' }, mine], 'copy', NOW);
    expect(r).toMatchObject({ added: 0, skipped: 2, copies: 0 });
    expect(r.state).toEqual(s);
    expect(compareIncomingProjects(s, [mine])).toEqual({ same: 1, clash: 0, fresh: 0 });
  });

  it('a new project is added whole, sessions included, and a second import of it adds nothing', () => {
    const fresh = project({ id: 'p-9', name: 'Spring', sessions: [session('x', 'm42', 'nbz', 12), { id: 'y', date: '2026-11-01', targetId: 'm42', filterId: L, exposures: 7, subSeconds: 45, note: 'late' }] });
    const first = importProjects(one(mine), [fresh], 'copy', NOW);
    expect(first).toMatchObject({ added: 1, copies: 0 });
    expect(first.state.projects[1]).toEqual(fresh);
    expect(importProjects(first.state, [fresh], 'copy', NOW)).toMatchObject({ added: 0, skipped: 1 });
  });

  it('an id of a different project here: copy under a new id and name, or skip; the one here is untouched', () => {
    const clash = { ...mine, name: 'Different', targets: [{ id: 'm33', lines: [line(L, 5)] }] };
    const s = one(mine);
    const copy = importProjects(s, [clash], 'copy', NOW);
    expect(copy).toMatchObject({ added: 1, copies: 1 });
    expect(copy.state.projects[0]).toEqual(mine);
    expect(copy.state.projects[1].id).not.toBe(mine.id);
    expect(copy.state.projects[1].name).toBe('Different (imported)');
    expect(compareIncomingProjects(s, [clash])).toEqual({ same: 0, clash: 1, fresh: 0 });
    const skip = importProjects(s, [clash], 'skip', NOW);
    expect(skip).toMatchObject({ added: 0, clashSkipped: 1 });
    expect(skip.state).toEqual(s);
    expect(importProjects(copy.state, [clash], 'copy', NOW)).toMatchObject({ added: 0, skipped: 1 });
  });

  it('past the limit, projects are left out and counted, never dropped silently', () => {
    const full = one(...Array.from({ length: 20 }, (_, i) => project({ id: `p${i}`, name: `P${i}` })));
    const r = importProjects(full, [project({ id: 'new', targets: [{ id: 'zzz', lines: [] }] })], 'copy', NOW);
    expect(r).toMatchObject({ added: 0, leftOut: 1 });
  });
});
