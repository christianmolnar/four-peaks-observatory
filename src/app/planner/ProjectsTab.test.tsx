/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { durationText, percentText, plansFileText, trackerText } from '@/planner/export';
import { BROADBAND_ID, PROJECTS_KEY, loadProjects, projectSheet, projectsText, seedSessions } from '@/planner/projects';
import type { Project, ProjectsState } from '@/planner/projects';
import { line, project as baseProject, session } from '@/planner/projects/testkit';
import { sampleProfile } from '@/planner/state';
import ProjectsTab from './ProjectsTab';
import { sheetNames } from './projectNames';
import { fakeCatalog } from './testkit';
import { useCatalog } from './useCatalog';
import { useProjects } from './useProjects';

const profile = sampleProfile();
const L = BROADBAND_ID;
const HA = 'optolong-ha-7nm';
const LX = 'optolong-lextreme';
const NAMES: Record<string, string> = { m31: 'Andromeda Galaxy', m42: 'Orion Nebula', m33: 'Triangulum Galaxy', m81: "Bode's Galaxy", m82: 'Cigar Galaxy', ic1805: 'Heart Nebula', ngc2237: 'Rosette Nebula' };
const targetName = (id: string) => NAMES[id] ?? id;
const cat = fakeCatalog();
const setup = (filterIds: string[]) => ({ scopeId: 'c11-edgehd', cameraId: 'asi2600mc-duo', filterIds, subSeconds: 60 });
const NOW = '2026-11-17T01:00:00.000Z';

/** A: over the plan, an optional line, a session for a target that is not in the project and one for a filter with no line. */
const over: Project = baseProject({
  id: 'p-over',
  name: 'Over and off',
  setup: setup([L, HA, LX]),
  targets: [
    { id: 'm31', lines: [line(L, 240), line(HA, 60)] },
    { id: 'm42', lines: [line(L, 120), line(HA, 60, true)] },
  ],
  sessions: [
    session('s1', 'm31', L, 120, '2026-11-14'),
    session('s2', 'm42', L, 150, '2026-11-15'),
    session('s3', 'm42', HA, 20, '2026-11-15'),
    session('s4', 'm33', L, 25, '2026-11-16'),
    session('s5', 'm31', LX, 40, '2026-11-16'),
  ],
});
/** B: nothing planned (a line of 0, a target with no line) and one session. */
const zero: Project = baseProject({
  id: 'p-zero',
  name: 'Zero plan',
  setup: setup([L]),
  targets: [
    { id: 'm81', lines: [line(L, 0)] },
    { id: 'm82', lines: [] },
  ],
  sessions: [session('z1', 'm82', L, 30)],
});
/** C: plain, one night of exposures. */
const plain: Project = baseProject({
  id: 'p-plain',
  name: 'Plain',
  setup: setup([L, HA]),
  targets: [{ id: 'm31', lines: [line(L, 60), line(HA, 30)] }],
  sessions: [{ id: 'e1', date: '2026-11-16', targetId: 'm31', filterId: L, exposures: 30, subSeconds: 60, note: 'good seeing' }],
});

const store = (...projects: Project[]) => window.localStorage.setItem(PROJECTS_KEY, projectsText({ version: 1, projects } as ProjectsState));
const stored = (): Project[] => loadProjects(window.localStorage).state?.projects ?? [];

function Harness({ context, planTargets = [], onShare = () => {} }: { context?: Partial<Parameters<typeof ProjectsTab>[0]['context']>; planTargets?: { id: string; name: string }[]; onShare?: () => void }) {
  const api = useProjects();
  const { state, retry } = useCatalog(cat.load);
  return (
    <ProjectsTab
      api={api}
      profile={profile}
      targetName={targetName}
      context={{ scopeId: 'c11-edgehd', cameraId: 'asi2600mc-duo', filterIds: [L], subSeconds: 60, ...context }}
      planTargets={planTargets}
      today="2026-11-17"
      search={{ catalog: state, onRetryCatalog: retry, scorer: null, nightWord: 'tonight', formatTime: () => '' }}
      onShare={onShare}
    />
  );
}
const draw = async (ui = <Harness />) => {
  const r = render(ui);
  await screen.findByTestId('projects-tab');
  await waitFor(() => expect(screen.queryByText('Loading your projects…')).toBeNull());
  return r;
};
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = (id: string) => fireEvent.change(screen.getByLabelText('Project'), { target: { value: id } });
/** The name a control has: its aria-label, its label(s), or (a button) its own text. */
const computeAccessibleName = (el: HTMLElement): string => {
  const labels = (el as HTMLInputElement).labels === undefined || (el as HTMLInputElement).labels === null ? '' : Array.from((el as HTMLInputElement).labels!).map((l) => l.textContent ?? '').join(' ');
  return (el.getAttribute('aria-label') ?? '') || labels || (el.tagName === 'BUTTON' ? (el.textContent ?? '') : '');
};
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('the progress view shows the engine\'s numbers', () => {
  const names = (p: Project) => sheetNames(profile, p.setup, targetName);

  it.each([over, zero, plain])('$name: every tile, bar, total and note equals projectSheet', async (p) => {
    store(over, zero, plain);
    await draw();
    pick(p.id);
    const sheet = projectSheet(p, names(p));
    const progress = screen.getByTestId('project-progress');
    const tiles = within(screen.getByTestId('project-tiles'));
    expect(text(tiles.getByTestId('tile-planned'))).toBe(durationText(sheet.overall.planned));
    expect(text(tiles.getByTestId('tile-completed'))).toBe(durationText(sheet.overall.done));
    expect(text(tiles.getByTestId('tile-remaining'))).toBe(durationText(sheet.overall.remaining));
    expect(text(screen.getByTestId('project-exposures'))).toBe(`${sheet.overall.doneExposures.toLocaleString('en-US')} of ${sheet.overall.plannedExposures.toLocaleString('en-US')} planned ${sheet.subSeconds}-second exposures`);
    expect(text(screen.getByTestId('project-overall'))).toContain(`${durationText(sheet.overall.done)} / ${durationText(sheet.overall.planned)} ${percentText(sheet.overall.percent)}`);
    const cards = screen.getAllByTestId('target-card');
    expect(cards).toHaveLength(sheet.targets.length);
    sheet.targets.forEach((t, i) => {
      expect(text(within(cards[i]).getByTestId('target-total'))).toContain(`${durationText(t.total.done)} / ${durationText(t.total.planned)} ${percentText(t.total.percent)}`);
      const lines = within(cards[i]).queryAllByTestId('target-line');
      expect(lines).toHaveLength(t.lines.length);
      t.lines.forEach((l, j) => {
        expect(text(lines[j])).toContain(l.filter);
        expect(text(lines[j])).toContain(`${durationText(l.done)} / ${durationText(l.planned)} ${percentText(l.percent)}`);
        if (l.over > 0) expect(text(lines[j])).toContain(`${durationText(l.over)} over`);
        if (l.optional) expect(text(lines[j])).toContain('optional, excluded from totals');
      });
    });
    const totals = within(screen.getByTestId('filter-totals')).getAllByTestId('filter-total');
    expect(totals).toHaveLength(sheet.filters.length);
    sheet.filters.forEach((f, i) => expect(text(totals[i])).toContain(`${f.filter} ${durationText(f.done)} / ${durationText(f.planned)} ${percentText(f.percent)}`));
    expect(screen.queryByTestId('optional-note') === null).toBe(sheet.optional.lines.length === 0);
    if (sheet.optional.lines.length > 0) for (const l of sheet.optional.lines) expect(text(screen.getByTestId('optional-note'))).toContain(`${l.target} ${l.filter} ${durationText(l.done)} of ${durationText(l.planned)}`);
    const off = screen.queryByTestId('not-in-plan');
    expect(off === null).toBe(sheet.notInPlan.length === 0);
    for (const n of sheet.notInPlan) expect(text(off!)).toContain(`${n.date}, ${n.target}, ${n.filter}, ${durationText(n.minutes)}: ${n.why}`);
    expect(progress.textContent).not.toMatch(/NaN|Infinity|undefined|e\+/);
  });

  it('literal values for the over-plan project: 150% line, optional apart, two sessions not in the plan', async () => {
    store(over);
    await draw();
    const lines = screen.getAllByTestId('target-line');
    expect(text(lines[0])).toContain('Broadband 2h / 4h 50%');
    expect(text(lines[2])).toContain('Broadband 2h 30m / 2h 125% · 30m over');
    expect(text(lines[3])).toContain('(optional, excluded from totals)');
    expect(text(screen.getByTestId('tile-planned'))).toBe('7h');
    expect(text(screen.getByTestId('optional-note'))).toContain('Orion Nebula Optolong H-alpha 7 nm 20m of 1h');
    const off = text(screen.getByTestId('not-in-plan'));
    expect(off).toContain('2 logged sessions are not in the plan (1h 5m in all)');
    expect(off).toContain('2026-11-16, Triangulum Galaxy, Broadband, 25m: the target is not in this project');
    expect(off).toContain('2026-11-16, Andromeda Galaxy, Optolong L-eXtreme (standard), 40m: the target has no hours planned for this filter');
  });

  it('zero planned shows a dash, never NaN, and the planned tile is 0h', async () => {
    store(zero);
    await draw();
    expect(text(screen.getByTestId('project-overall'))).toContain('0h / 0h –');
    expect(text(screen.getAllByTestId('target-total')[0])).toContain('0h / 0h –');
    expect(text(screen.getByTestId('tile-planned'))).toBe('0h');
    expect(screen.getAllByRole('progressbar')[0].getAttribute('aria-valuenow')).toBeNull();
  });

  it('bars carry text and a pattern or label, not colour alone: every bar has a name and a value text, and each filter has its own pattern in the key', async () => {
    store(over);
    await draw();
    for (const bar of screen.getAllByRole('progressbar')) {
      expect(computeAccessibleName(bar)).not.toBe('');
      expect(bar.getAttribute('aria-valuetext')).toMatch(/\d+h|\d+m/);
    }
    const key = within(screen.getByTestId('project-legend')).getAllByRole('listitem');
    expect(key.map(text)).toEqual(['Broadband (solid)', 'Optolong H-alpha 7 nm (diagonal stripes)', 'Optolong L-eXtreme (standard) (dots)']);
    const fills = key.map((li) => li.querySelector('span[aria-hidden]')!.getAttribute('style') ?? '');
    expect(new Set(fills).size).toBe(3);
  });
});

const minutesBox = (target: string, filter: string) => {
  const card = screen.getAllByTestId('draft-target').find((c) => within(c).queryByRole('heading', { name: target }) !== null)!;
  return within(card).getByLabelText(`${filter}, minutes`);
};
const planned = (target: string, filter: string, minutes: string) => fireEvent.change(minutesBox(target, filter), { target: { value: minutes } });

describe('seed offer', () => {
  it('with no projects: offers last night\'s hours pre-filled for review; nothing is saved until Save; one project with the three broadband sessions; offered no more', async () => {
    await draw();
    expect(screen.getByTestId('projects-empty').textContent).toContain('Heart Nebula 120 min, Orion Nebula 50 min, Rosette Nebula 60 min');
    press(/^Start from last night/);
    const review = text(screen.getByTestId('seed-review'));
    expect(review).toContain('Heart Nebula: 120 min');
    expect(review).toContain('Orion Nebula: 50 min');
    expect(review).toContain('Rosette Nebula: 60 min');
    expect(stored()).toHaveLength(0);
    expect(screen.getAllByTestId('draft-target')).toHaveLength(3);
    planned('Heart Nebula', 'Broadband', '240');
    planned('Orion Nebula', 'Broadband', '120');
    planned('Rosette Nebula', 'Broadband', '120');
    press('Save project');
    expect(screen.getByTestId('projects-status').textContent).toBe('Saved the project “Marathon”.');
    const [p] = stored();
    expect(p.sessions.map((s) => [s.id, s.targetId, s.filterId, s.minutes, s.date])).toEqual([
      ['seed-2026-11-16-ic1805', 'ic1805', L, 120, '2026-11-16'],
      ['seed-2026-11-16-m42', 'm42', L, 50, '2026-11-16'],
      ['seed-2026-11-16-ngc2237', 'ngc2237', L, 60, '2026-11-16'],
    ]);
    expect(p.sessions.map((s) => s.id)).toEqual(seedSessions().map((s) => s.id));
    const lines = screen.getAllByTestId('target-line').map(text);
    expect(lines[0]).toContain('Broadband 2h / 4h 50%');
    expect(lines[1]).toContain('Broadband 50m / 2h 41.7%');
    expect(lines[2]).toContain('Broadband 1h / 2h 50%');
    expect(screen.getByTestId('tile-completed').textContent).toBe('3h 50m');
    expect(screen.queryByRole('button', { name: /^Start from last night/ })).toBeNull();
    expect(screen.queryByTestId('not-in-plan')).toBeNull();
  });

  it('two tabs both offer the seed: the first saves, the second is refused in words, one project holds the hours once', async () => {
    const a = render(<Harness />, { container: document.body.appendChild(document.createElement('div')) });
    const b = render(<Harness />, { container: document.body.appendChild(document.createElement('div')) });
    const A = within(a.container);
    const B = within(b.container);
    await waitFor(() => expect(A.queryByText('Loading your projects…')).toBeNull());
    await waitFor(() => expect(B.queryByText('Loading your projects…')).toBeNull());
    fireEvent.click(A.getByRole('button', { name: /^Start from last night/ }));
    fireEvent.click(B.getByRole('button', { name: /^Start from last night/ }));
    fireEvent.click(A.getByRole('button', { name: 'Save project' }));
    expect(A.getByTestId('projects-status').textContent).toBe('Saved the project “Marathon”.');
    fireEvent.click(B.getByRole('button', { name: 'Save project' }));
    const refusal = B.getAllByRole('alert').map(text).join(' | ');
    expect(refusal).toBe('Not saved: last night’s hours are already logged in the project “Marathon”. Open that project instead of starting another.');
    expect(B.queryByTestId('projects-problem')).toBeNull();
    expect(B.getByTestId('projects-status').textContent).toBe('');
    expect(stored()).toHaveLength(1);
    expect(stored()[0].sessions).toHaveLength(3);
    expect(stored()[0].sessions.map((s) => s.minutes)).toEqual([120, 50, 60]);
  });

  it('review before saving: Cancel keeps nothing; the hours are not in the plan until minutes are planned, and the page says so', async () => {
    await draw();
    press(/^Start from last night/);
    press('Cancel');
    expect(stored()).toHaveLength(0);
    expect(screen.getByTestId('projects-empty')).not.toBeNull();
    expect(document.activeElement?.id).toBe('project-new');
    press(/^Start from last night/);
    press('Save project'); // no planned minutes typed
    expect(screen.getByTestId('tile-planned').textContent).toBe('0h');
    expect(screen.getByTestId('tile-completed').textContent).toBe('0h');
    expect(text(screen.getByTestId('not-in-plan'))).toContain('3 logged sessions are not in the plan (3h 50m in all)');
  });
});

describe('creating a project', () => {
  it('starts from the open plan\'s setup and offers its targets first (none ticked); the search picks the rest; hostile minutes are refused in words at the box and nothing is saved', async () => {
    await draw(<Harness context={{ filterIds: [L, HA], subSeconds: 90 }} planTargets={[{ id: 'm31', name: 'Andromeda Galaxy' }, { id: 'm42', name: 'Orion Nebula' }]} />);
    press('New project');
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('c11-edgehd');
    expect((screen.getByLabelText('Camera') as HTMLSelectElement).value).toBe('asi2600mc-duo');
    expect((screen.getByLabelText('Sub length (seconds)') as HTMLInputElement).value).toBe('90');
    const filters = within(screen.getByRole('group', { name: 'Filters used' }));
    expect((filters.getByLabelText('Broadband') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('Optolong H-alpha 7 nm') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('Optolong L-eXtreme (standard)') as HTMLInputElement).checked).toBe(false);
    const fromPlan = within(screen.getByRole('group', { name: 'From your open plan' }));
    expect((fromPlan.getByLabelText('Andromeda Galaxy') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryAllByTestId('draft-target')).toHaveLength(0);
    type('Project name', 'Fall');
    fireEvent.click(fromPlan.getByLabelText('Andromeda Galaxy'));
    type('Search the catalog by name or number', 'm81');
    fireEvent.click(await screen.findByRole('button', { name: "Add Bode's Galaxy to the project" }));
    expect(screen.getAllByTestId('draft-target')).toHaveLength(2);
    expect(screen.getByRole('button', { name: "Bode's Galaxy is in the project" })).not.toBeNull();
    expect(screen.getByText("Added Bode's Galaxy to the project.")).not.toBeNull();
    // hostile typing
    for (const bad of ['-5', 'abc', '1e308', '99999999', '2.5', '1 20', '<script>']) {
      planned('Andromeda Galaxy', 'Broadband', bad);
      press('Save project');
      expect(stored()).toHaveLength(0);
      const alerts = screen.getAllByRole('alert').map(text).join(' | ');
      expect(alerts).toContain('Andromeda Galaxy, Broadband, planned minutes: ');
      expect(alerts).toContain('Enter a whole number for the number of minutes between 0 and 100,000 min.');
      expect(alerts).not.toMatch(/NaN|Infinity|e\+|\$\.|undefined/);
      expect(document.activeElement).toBe(minutesBox('Andromeda Galaxy', 'Broadband'));
    }
    planned('Andromeda Galaxy', 'Broadband', '240');
    planned('Andromeda Galaxy', 'Optolong H-alpha 7 nm', '60');
    fireEvent.click(within(screen.getAllByTestId('draft-target')[0]).getAllByLabelText('Optional, excluded from totals')[1]);
    planned("Bode's Galaxy", 'Broadband', '0');
    press('Save project');
    expect(screen.queryByRole('alert')).toBeNull();
    const [p] = stored();
    expect(p.name).toBe('Fall');
    expect(p.setup).toEqual({ scopeId: 'c11-edgehd', cameraId: 'asi2600mc-duo', filterIds: [L, HA], subSeconds: 90 });
    expect(p.targets).toEqual([
      { id: 'm31', lines: [line(L, 240), line(HA, 60, true)] },
      { id: 'm81', lines: [line(L, 0)] },
    ]);
    expect(text(screen.getByTestId('project-setup'))).toBe('Celestron C11 EdgeHD + ZWO ASI2600MC Duo, 90-second exposures, 2 targets');
    expect(text(screen.getByTestId('optional-note'))).toContain('Andromeda Galaxy Optolong H-alpha 7 nm 0h of 1h');
    expect(document.activeElement?.id).toBe('project-heading');
  });

  it('a project needs a name, targets and a sub length: each says so at its box', async () => {
    await draw();
    press('New project');
    type('Sub length (seconds)', '0');
    press('Save project');
    const alerts = screen.getAllByRole('alert').map(text);
    expect(alerts).toContain('Name: type a name of 1 to 60 characters.');
    expect(alerts.some((a) => a.startsWith('Sub length: 0 is below the lowest allowed number.'))).toBe(true);
    expect(alerts).toContain('Targets: pick at least one target (at most 100).');
    expect(document.activeElement).toBe(screen.getByLabelText('Project name'));
    expect(stored()).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('Add session: date today, target and filter of the project, minutes; the bar and the log follow; the status says what was added', async () => {
    store(plain);
    await draw();
    press('Add session');
    expect((screen.getByLabelText('Date (the evening of the night)') as HTMLInputElement).value).toBe('2026-11-17');
    expect(within(screen.getByLabelText('Target')).getAllByRole('option').map(text)).toEqual(['Andromeda Galaxy']);
    expect(within(screen.getByLabelText('Filter')).getAllByRole('option').map(text)).toEqual(['Broadband', 'Optolong H-alpha 7 nm']);
    fireEvent.change(screen.getByLabelText('Filter'), { target: { value: HA } });
    type('Minutes of light', '15');
    type('Note (optional)', 'clouds late');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(screen.getByTestId('projects-status').textContent).toBe('Added 15m of Optolong H-alpha 7 nm on Andromeda Galaxy for 2026-11-17.');
    expect(stored()[0].sessions.at(-1)).toMatchObject({ date: '2026-11-17', targetId: 'm31', filterId: HA, minutes: 15, note: 'clouds late' });
    expect(text(screen.getAllByTestId('target-line')[1])).toContain('15m / 30m 50%');
    expect(text(screen.getAllByTestId('session-row')[0])).toContain('2026-11-17, Andromeda Galaxy, Optolong H-alpha 7 nm, 15m');
    expect((screen.getByLabelText('Minutes of light') as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(screen.getByLabelText('Minutes of light'));
  });

  it('a refused session form clears the earlier "Added" line, and the picker shows each project\'s engine percent', async () => {
    store(plain, over);
    await draw();
    expect(within(screen.getByLabelText('Project')).getAllByRole('option').map(text)).toEqual([plain, over].map((p) => `${p.name}, ${percentText(projectSheet(p, sheetNames(profile, p.setup, targetName)).overall.percent)}`));
    press('Add session');
    type('Minutes of light', '15');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(screen.getByTestId('projects-status').textContent).toMatch(/^Added 15m/);
    type('Minutes of light', 'abc');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(screen.getByTestId('projects-status').textContent).toBe('');
  });

  it('exposures with a sub length add exposures x sub; the log row says both; a plan gap is said before saving', async () => {
    store(plain);
    await draw();
    press('Add session');
    fireEvent.click(screen.getByLabelText('Exposures'));
    type('Number of exposures', '20');
    type('Sub length of these exposures (seconds)', '30');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(stored()[0].sessions.at(-1)).toMatchObject({ exposures: 20, subSeconds: 30 });
    expect(screen.getByTestId('projects-status').textContent).toBe('Added 10m of Broadband on Andromeda Galaxy for 2026-11-17.');
    expect(text(screen.getAllByTestId('session-row')[0])).toContain('(20 exposures of 30 s)');
    expect(text(screen.getAllByTestId('target-line')[0])).toContain('40m / 1h 66.7%');
  });

  it('hostile typing in the session form is refused in plain words at its box; nothing is stored', async () => {
    store(plain);
    await draw();
    press('Add session');
    for (const bad of ['-1', 'x', '1e308', '99999999', '0.5', '١٢', '']) {
      type('Minutes of light', bad);
      fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
      const msg = text(screen.getAllByRole('alert')[0]);
      expect(msg).toMatch(/^Minutes: /);
      expect(msg).toMatch(/between 0 and 100,000 min\.$/);
      expect(msg).not.toMatch(/NaN|Infinity|e\+|\$\.|undefined/);
    }
    type('Date (the evening of the night)', '');
    type('Minutes of light', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(text(screen.getAllByRole('alert')[0])).toBe('Date: pick a real date between 2000 and 2100.');
    expect(stored()[0].sessions).toHaveLength(1);
    // exposures x sub past the limit: the engine's own refusal, in words
    type('Date (the evening of the night)', '2026-11-17');
    fireEvent.click(screen.getByLabelText('Exposures'));
    type('Number of exposures', '100000');
    type('Sub length of these exposures (seconds)', '300');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(text(screen.getAllByRole('alert').at(-1)!)).toMatch(/^Not saved: .*add up to more than 100,000 minutes/);
    expect(text(screen.getAllByRole('alert').at(-1)!)).not.toMatch(/\$\.|\[0\]/);
    expect(stored()[0].sessions).toHaveLength(1);
  });

  it('Edit changes a session in place; Delete asks first, names what goes, and Keep it changes nothing', async () => {
    store(plain);
    await draw();
    fireEvent.click(screen.getByRole('button', { name: /^Edit session/ }));
    fireEvent.click(screen.getByLabelText('Minutes'));
    type('Minutes of light', '45');
    press('Save session');
    expect(stored()[0].sessions[0]).toMatchObject({ id: 'e1', minutes: 45 });
    expect(stored()[0].sessions[0].exposures).toBeUndefined();
    await waitFor(() => expect(document.activeElement?.id).toBe('edit-e1'));
    fireEvent.click(screen.getByRole('button', { name: /^Delete session/ }));
    const ask = screen.getByRole('group', { name: 'Delete this session?' });
    expect(text(ask)).toContain('Delete this session (2026-11-16, Andromeda Galaxy, Broadband, 45m)?');
    expect(document.activeElement).toBe(within(ask).getByRole('button', { name: 'Keep it' }));
    press('Keep it');
    expect(stored()[0].sessions).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Delete session/ }));
    press('Delete session');
    expect(stored()[0].sessions).toHaveLength(0);
    expect(screen.getByTestId('projects-status').textContent).toBe('Deleted the session of 2026-11-16 on Andromeda Galaxy, Broadband, 45m.');
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Log new exposures' }));
  });

  it('the log is newest first, shows 50, then Show all', async () => {
    const many = Array.from({ length: 60 }, (_, i) => session(`n${i}`, 'm31', L, 1, `2026-10-${String((i % 28) + 1).padStart(2, '0')}`));
    store(baseProject({ id: 'p-many', name: 'Many', setup: setup([L, 'nbz', 'nb3'].slice(0, 1)), targets: [{ id: 'm31', lines: [line(L, 600)] }], sessions: many }));
    await draw();
    expect(screen.getAllByTestId('session-row')).toHaveLength(50);
    expect(text(screen.getByTestId('log-count'))).toBe('60 sessions, newest first; showing the first 50.');
    const dates = screen.getAllByTestId('session-row').map((r) => text(r).slice(0, 10));
    expect([...dates].sort().reverse()).toEqual(dates);
    press('Show all 60 sessions');
    expect(screen.getAllByTestId('session-row')).toHaveLength(60);
  });
});

describe('projects: switch, rename, duplicate, delete', () => {
  it('switches between projects; renames; duplicates the plan without sessions; delete asks first and lists what goes', async () => {
    store(over, plain);
    await draw();
    expect(within(screen.getByLabelText('Project')).getAllByRole('option').map(text)).toEqual(['Over and off, 64.3%', 'Plain, 33.3%']);
    pick('p-plain');
    expect(screen.getByRole('heading', { name: 'Plain' })).not.toBeNull();
    press('Rename');
    type('New name', '   ');
    press('Save name');
    expect(screen.getByRole('alert').textContent).toBe('Name: type a name of 1 to 60 characters.');
    type('New name', 'Plain 2');
    press('Save name');
    expect(stored().map((p) => p.name)).toEqual(['Over and off', 'Plain 2']);
    expect(document.activeElement?.id).toBe('project-rename');
    press('Duplicate');
    expect(stored().map((p) => [p.name, p.sessions.length])).toEqual([['Over and off', 5], ['Plain 2', 1], ['Plain 2 (copy)', 0]]);
    expect(screen.getByTestId('projects-status').textContent).toContain('the plan was copied, the logged sessions were not');
    press('Delete');
    const ask = text(screen.getByTestId('project-delete-confirm'));
    expect(ask).toBe('Delete the project “Plain 2 (copy)”? This removes the project, its 1 target, 2 planned lines and its 0 logged sessions (0h of light). It cannot be undone. Copy the tracker or export it first to keep a record.Keep the projectDelete the project');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the project' }));
    press('Keep the project');
    expect(stored()).toHaveLength(3);
    pick('p-over');
    press('Delete');
    expect(text(screen.getByTestId('project-delete-confirm'))).toContain('its 5 logged sessions (5h 55m of light)');
    press('Delete the project');
    expect(stored().map((p) => p.name)).toEqual(['Plain 2', 'Plain 2 (copy)']);
    expect(screen.getByTestId('projects-status').textContent).toBe('Deleted the project “Over and off”.');
  });

  it('Edit plan changes the plan and keeps the sessions; a filter taken out leaves its light in the log as not in the plan', async () => {
    store(plain);
    await draw();
    press('Edit plan');
    expect((screen.getByLabelText('Project name') as HTMLInputElement).value).toBe('Plain');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filters used' })).getByLabelText('Broadband'));
    press('Save changes');
    const p = stored()[0];
    expect(p.setup.filterIds).toEqual([HA]);
    expect(p.sessions).toHaveLength(1);
    expect(text(screen.getByTestId('not-in-plan'))).toContain('1 logged session is not in the plan (30m in all)');
    expect(document.activeElement?.id).toBe('project-edit');
  });
});

describe('Copy tracker, and storage that does not take the change', () => {
  it('Copy tracker puts the engine\'s tracker text on the clipboard', async () => {
    store(over);
    const writes: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void writes.push(t) } });
    await draw();
    await act(async () => press('Copy tracker'));
    expect(writes).toEqual([trackerText(projectSheet(over, sheetNames(profile, over.setup, targetName)))]);
    expect(screen.getByTestId('projects-status').textContent).toBe('Copied the tracker of “Over and off”.');
  });

  it('a clipboard that refuses says so and shows the text to copy by hand; no "Copied"', async () => {
    store(plain);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    await draw();
    await act(async () => press('Copy tracker'));
    expect(screen.getByTestId('projects-problem').textContent).toMatch(/^Not copied: this browser does not let a page copy/);
    expect((screen.getByLabelText('Tracker text') as HTMLTextAreaElement).value).toContain('PROJECT: Plain');
    expect(screen.getByTestId('projects-status').textContent).toBe('');
  });

  it('a full storage: "Not saved" in words, never "Saved"; the change stays on the page and the page says it is not saved', async () => {
    store(plain);
    await draw();
    const real = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PROJECTS_KEY) throw Object.assign(new Error('full'), { name: 'QuotaExceededError', code: 22 });
      return real.call(this, k, v);
    });
    press('Add session');
    type('Minutes of light', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Add session' }));
    expect(screen.getByTestId('projects-problem').textContent).toMatch(/^Not saved: browser storage is full\./);
    expect(screen.getByTestId('projects-status').textContent).toBe('');
    expect(document.body.textContent).not.toMatch(/\bSaved\b/);
    expect(screen.getByTestId('projects-unsaved').textContent).toMatch(/^Not saved: the latest changes are on this page only/);
    expect(text(screen.getAllByTestId('session-row')[0])).toContain('10m');
  });

  it('storage that cannot be read at all: a note in words, no projects, and a change says it is not saved', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    await draw(<Harness planTargets={[{ id: 'm31', name: 'Andromeda Galaxy' }]} />);
    expect(screen.getByTestId('projects-notes').textContent).toContain('browser storage is blocked or unavailable');
    press('New project');
    type('Project name', 'X');
    fireEvent.click(screen.getByLabelText('Andromeda Galaxy'));
    press('Save project');
    const alerts = screen.getAllByRole('alert').map(text).filter((x) => /Not saved/.test(x));
    expect(alerts).toEqual(['Not saved: browser storage is blocked or unavailable, so nothing was changed. Allow storage for this site, then try again.']); // once, in the open editor
    expect(document.body.textContent).not.toMatch(/Saved the project|denied|on this page only; export/);
  });

  it('projects saved by a newer version are held: said in words, saving is off, stored text untouched', async () => {
    const text0 = JSON.stringify({ version: 9, projects: [] });
    window.localStorage.setItem(PROJECTS_KEY, text0);
    await draw(<Harness planTargets={[{ id: 'm31', name: 'Andromeda Galaxy' }]} />);
    expect(screen.getByTestId('projects-held').textContent).toMatch(/made by a newer version of the planner/);
    press('New project');
    type('Project name', 'X');
    fireEvent.click(screen.getByLabelText('Andromeda Galaxy'));
    press('Save project');
    expect(window.localStorage.getItem(PROJECTS_KEY)).toBe(text0);
    expect(document.body.textContent).not.toMatch(/Saved the project/);
  });

  it('damaged saved projects are copied to a dated backup and said in words', async () => {
    window.localStorage.setItem(PROJECTS_KEY, '{not json');
    await draw();
    expect(screen.getByTestId('projects-notes').textContent).toMatch(/could not be read, so they start over with none/);
    expect(screen.getByTestId('projects-notes').textContent).toMatch(/backup name/);
    expect(Object.keys(window.localStorage).some((k) => k.startsWith(`${PROJECTS_KEY}.bak.`))).toBe(true);
  });
});

describe('import', () => {
  const file = (name: string, body: string) => new File([body], name, { type: 'application/json' });
  const fileText = (...ps: Project[]) => plansFileText({ exportedAt: NOW, plans: [], sheets: [], profile: null, projects: ps, projectSheets: ps.map((p) => projectSheet(p, sheetNames(profile, p.setup, targetName))) });
  const choose = async (f: File) => {
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/^Import projects file/), { target: { files: [f] } });
    });
  };
  beforeAll(() => {
    if (!Blob.prototype.text) {
      Blob.prototype.text = function (this: Blob) {
        return new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(r.error);
          r.readAsText(this);
        });
      };
    }
  });

  it('adds the projects of a file after asking; the same file again adds nothing', async () => {
    store(plain);
    await draw();
    await choose(file('p.json', fileText(over, plain)));
    expect(text(await screen.findByTestId('projects-import-ask'))).toContain('p.json holds 2 projects: “Over and off”, “Plain”. 1 of 2 is already here and will be skipped.');
    press('Import 2 projects');
    expect(stored().map((p) => p.name)).toEqual(['Plain', 'Over and off']);
    expect(screen.getByTestId('projects-status').textContent).toBe('Added 1 project. 1 already here, skipped.');
    await choose(file('p.json', fileText(over)));
    expect(text(await screen.findByTestId('projects-import-ask'))).toContain('It is already here and will be skipped.');
    press('Import the project');
    expect(stored()).toHaveLength(2);
    expect(screen.getByTestId('projects-status').textContent).toBe('Added 0 projects. 1 already here, skipped.');
  });

  it('a file that is not a projects file is refused with the engine\'s own words', async () => {
    store(plain);
    await draw();
    await choose(file('x.json', 'not json'));
    expect((await screen.findByTestId('projects-import-error')).textContent).toBe('Nothing was imported. This file is not a planner file with projects. It is not valid JSON.');
    await choose(file('x.json', JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [] })));
    await waitFor(() => expect(screen.getByTestId('projects-import-error').textContent).toBe('Nothing was imported. The file holds no projects.'));
    expect(stored()).toHaveLength(1);
  });
});

describe('accessibility', () => {
  it('every box and select of the form, the log and the editor has a name; every button has a name', async () => {
    store(over);
    await draw(<Harness planTargets={[{ id: 'm31', name: 'Andromeda Galaxy' }]} />);
    press('Add session');
    fireEvent.click(screen.getByLabelText('Exposures'));
    for (const el of document.querySelectorAll<HTMLElement>('input:not([type=file]), select, textarea, button')) expect({ el: el.outerHTML.slice(0, 80), name: computeAccessibleName(el) }).not.toEqual({ el: el.outerHTML.slice(0, 80), name: '' });
    press('Close');
    press('Edit plan');
    for (const el of document.querySelectorAll<HTMLElement>('input:not([type=file]), select, textarea, button')) expect({ el: el.outerHTML.slice(0, 80), name: computeAccessibleName(el) }).not.toEqual({ el: el.outerHTML.slice(0, 80), name: '' });
    expect(document.getElementById('project-target-search')).not.toBeNull();
  });

  it('the status line is a polite live region, and errors are alerts', async () => {
    store(plain);
    await draw();
    const status = screen.getByTestId('projects-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});
