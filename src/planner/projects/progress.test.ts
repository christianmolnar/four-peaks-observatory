import { computeProgress, sessionMinutes } from './progress';
import { L, line, project, session } from './testkit';

const bar = (p: ReturnType<typeof computeProgress>, target: string, filter: string) => p.targets.find((t) => t.targetId === target)!.lines.find((l) => l.filterId === filter)!;

describe('progress is computed from the planned minutes and the session log', () => {
  it('nothing logged: everything remains, no percent beyond 0', () => {
    const p = computeProgress(project());
    expect(p.overall).toEqual({ planned: 480, done: 0, remaining: 480, over: 0, percent: 0 });
    expect(p.exposures).toEqual({ planned: 480, done: 0 });
  });

  it('per target and filter: done, planned, remaining, percent; per filter and overall totals', () => {
    const p = computeProgress(project({ sessions: [session('a', 'm31', L, 120), session('b', 'm31', L, 60), session('c', 'm42', 'nbz', 30)] }));
    expect(bar(p, 'm31', L)).toMatchObject({ planned: 240, done: 180, remaining: 60, over: 0, percent: 75, optional: false });
    expect(p.targets[0].total).toMatchObject({ planned: 300, done: 180, remaining: 120 });
    expect(p.filters.map((f) => [f.filterId, f.planned, f.done])).toEqual([[L, 360, 180], ['nbz', 120, 30], ['nb3', 0, 0]]);
    expect(p.overall).toMatchObject({ planned: 480, done: 210, remaining: 270 });
    expect(p.overall.percent).toBeCloseTo(43.75);
  });

  it('planned exposures are planned seconds over the sub length; done exposures the same from the log', () => {
    const p = computeProgress(project({ sessions: [session('a', 'm31', L, 270)] }));
    expect(p.exposures).toEqual({ planned: 480, done: 270 });
    const q = computeProgress(project({ setup: { ...project().setup, subSeconds: 120 }, sessions: [session('a', 'm31', L, 270)] }));
    expect(q.exposures).toEqual({ planned: 240, done: 135 });
  });

  it('a session of exposures counts exposures times its own sub length', () => {
    const s = { id: 'x', date: '2026-11-16', targetId: 'm31', filterId: L, exposures: 30, subSeconds: 90, note: '' };
    expect(sessionMinutes(s)).toBe(45);
    expect(bar(computeProgress(project({ sessions: [s] })), 'm31', L).done).toBe(45);
  });
});

describe('optional time', () => {
  it('is excluded from every total, and shown apart', () => {
    const p = computeProgress(project({ sessions: [session('a', 'm42', 'nb3', 45), session('b', 'm42', L, 30)] }));
    expect(bar(p, 'm42', 'nb3')).toMatchObject({ optional: true, planned: 60, done: 45, percent: 75 });
    expect(p.overall.planned).toBe(480);
    expect(p.overall.done).toBe(30);
    expect(p.targets[1].total.planned).toBe(180);
    expect(p.filters.find((f) => f.filterId === 'nb3')).toMatchObject({ planned: 0, done: 0, percent: null });
    expect(p.optional).toEqual({ planned: 60, done: 45, lines: [{ targetId: 'm42', filterId: 'nb3', planned: 60, done: 45 }] });
    expect(p.exposures.planned).toBe(480);
  });
});

describe('what a bar must not hide', () => {
  it('over plan shows more than 100 percent, the minutes over, and what another line still needs', () => {
    const p = computeProgress(project({ sessions: [session('a', 'm31', L, 300)] }));
    expect(bar(p, 'm31', L)).toMatchObject({ done: 300, remaining: 0, over: 60, percent: 125 });
    expect(p.overall).toMatchObject({ done: 300, over: 60, remaining: 240 });
    expect(p.overall.percent).toBeCloseTo(62.5);
  });

  it('zero planned has no percent: null, never NaN or Infinity, and the done minutes still show', () => {
    const p = computeProgress(project({ targets: [{ id: 'm31', lines: [line(L, 0)] }], sessions: [session('a', 'm31', L, 10)] }));
    expect(bar(p, 'm31', L)).toMatchObject({ planned: 0, done: 10, remaining: 0, over: 10, percent: null });
    expect(p.overall.percent).toBeNull();
    expect(p.targets[0].total.percent).toBeNull();
    expect(p.exposures).toEqual({ planned: 0, done: 10 });
    expect(JSON.stringify(p)).not.toMatch(/NaN|Infinity/);
  });

  it('a project with no targets planned at all has no percent either', () => {
    const p = computeProgress(project({ targets: [{ id: 'm31', lines: [] }] }));
    expect(p.overall).toEqual({ planned: 0, done: 0, remaining: 0, over: 0, percent: null });
  });

  it('a session off the plan is kept and reported, and is in no bar', () => {
    const p = computeProgress(project({ sessions: [session('a', 'ngc1499', L, 40), session('b', 'm31', 'nb3', 20, '2026-11-15'), session('c', 'm31', L, 10)] }));
    expect(p.notInPlan.sessions).toEqual([
      { sessionId: 'a', date: '2026-11-16', targetId: 'ngc1499', filterId: L, minutes: 40, why: 'target' },
      { sessionId: 'b', date: '2026-11-15', targetId: 'm31', filterId: 'nb3', minutes: 20, why: 'filter' },
    ]);
    expect(p.notInPlan.minutes).toBe(60);
    expect(p.overall.done).toBe(10);
    expect(p.filters.find((f) => f.filterId === 'nb3')!.done).toBe(0);
  });

  it('a session whose filter is not in the project at all is off the plan too', () => {
    const p = computeProgress(project({ sessions: [session('a', 'm31', 'ha7', 5)] }));
    expect(p.notInPlan.sessions[0]).toMatchObject({ why: 'filter', filterId: 'ha7' });
  });

  it('sums stay exact: 600 sessions of one minute and a fraction add to the minute', () => {
    const sessions = Array.from({ length: 600 }, (_, i) => ({ id: `s${i}`, date: '2026-11-16', targetId: 'm31', filterId: L, exposures: 1, subSeconds: 1, note: '' }));
    expect(bar(computeProgress(project({ sessions })), 'm31', L).done).toBe(10);
  });
});

describe('5000 sessions', () => {
  it('are summed in a blink', () => {
    const sessions = Array.from({ length: 5000 }, (_, i) => session(`s${i}`, i % 2 ? 'm31' : 'm42', L, 1));
    const t0 = Date.now();
    const p = computeProgress(project({ sessions }));
    expect(Date.now() - t0).toBeLessThan(500);
    expect(p.overall.done).toBe(5000);
  });
});
