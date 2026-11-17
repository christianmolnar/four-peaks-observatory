/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { docToCsv, docToMarkdown, docToText, durationText, plansFileText } from '@/planner/export';
import { BROADBAND_ID, PROJECTS_KEY, loadProjects, projectSheet, projectsText } from '@/planner/projects';
import type { Project } from '@/planner/projects';
import { line, project as baseProject, session } from '@/planner/projects/testkit';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { sheetNames } from './projectNames';
import { openControls, pageProps, ready, seedPlan } from './testkit';

// G4b: the Projects tab inside the page: the third tab, its defaults from the open plan, the Share sheet's Projects choice, and the plan rail.

const profile = sampleProfile();
const L = BROADBAND_ID;
const mockWidth = (wide: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: wide, media: q, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
};
const mine: Project = baseProject({
  id: 'p-1',
  name: 'Fall marathon',
  setup: { scopeId: 'c11-edgehd', cameraId: 'asi2600mc-duo', filterIds: [L, 'optolong-ha-7nm'], subSeconds: 60 },
  targets: [{ id: 'm31', lines: [line(L, 240), line('optolong-ha-7nm', 60)] }],
  sessions: [session('s1', 'm31', L, 120)],
});
const app = async (projects: Project[] = [], wide = false) => {
  mockWidth(wide);
  seedPlan([{ id: 'm31', preset: 'balanced' }, { id: 'ic405', preset: 'deep' }], sampleProfile);
  if (projects.length > 0) window.localStorage.setItem(PROJECTS_KEY, projectsText({ version: 1, projects }));
  render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
};
const openProjects = async () => {
  fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
  await screen.findByTestId('projects-tab');
  await waitFor(() => expect(screen.queryByText('Loading your projects…')).toBeNull());
};
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ');

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('the Projects tab', () => {
  it('is the third tab, with the same keyboard and aria as the others', async () => {
    await app();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(text)).toEqual(['Plan', 'Gear and site', 'Projects']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs[2].getAttribute('aria-controls')).toBe('panel-projects');
    const panel = document.getElementById('panel-projects')!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('tab-projects');
    expect(panel.hidden).toBe(true);
    fireEvent.keyDown(tabs[1], { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Projects' }).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement?.id).toBe('tab-projects');
    expect(window.location.hash).toBe('#projects');
    expect(panel.hidden).toBe(false);
    expect(document.getElementById('panel-plan')!.hidden).toBe(true);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    fireEvent.keyDown(tabs[2], { key: 'ArrowRight' });
    expect(document.activeElement?.id).toBe('tab-plan');
    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(document.activeElement?.id).toBe('tab-projects');
    fireEvent.keyDown(tabs[2], { key: 'Home' });
    expect(document.activeElement?.id).toBe('tab-plan');
  });

  it('opens from the address #projects, and the plan\'s own strip (date, site, setup) is not shown there', async () => {
    window.history.replaceState(null, '', '#projects');
    await app();
    await screen.findByTestId('projects-tab');
    expect(screen.getByRole('tab', { name: 'Projects' }).getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector<HTMLElement>('[aria-labelledby="controls-heading"]')!.hidden).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(document.querySelector<HTMLElement>('[aria-labelledby="controls-heading"]')!.hidden).toBe(false);
  });

  it('shows no plan rail on this tab (the rail is the open plan\'s summary); the rail is unchanged on the Plan tab', async () => {
    await app([], true);
    expect(screen.getByTestId('plan-rail')).not.toBeNull();
    await openProjects();
    expect(screen.queryByTestId('plan-rail')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    expect(screen.getByTestId('plan-rail')).not.toBeNull();
  });

  it('a new project starts from the open plan: its scope, camera and filter, its targets offered first and none ticked', async () => {
    await app();
    await openProjects();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('c11-edgehd');
    expect((screen.getByLabelText('Camera') as HTMLSelectElement).value).toBe('asi2600mc-duo');
    const filters = within(screen.getByRole('group', { name: 'Filters used' }));
    expect((filters.getByLabelText('Broadband') as HTMLInputElement).checked).toBe(true);
    expect(filters.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)).toHaveLength(1);
    const plan = within(screen.getByRole('group', { name: 'From your open plan' }));
    expect(plan.getAllByRole('checkbox').map((c) => c.closest('label')!.textContent)).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect(plan.getAllByRole('checkbox').some((c) => (c as HTMLInputElement).checked)).toBe(false);
    expect(screen.queryAllByTestId('draft-target')).toHaveLength(0);
    expect((screen.getByLabelText('Sub length (seconds)') as HTMLInputElement).value).toMatch(/^\d+(\.\d+)?$/);
  });

  it('the filters picked for the filter mix on the Plan tab start ticked in a new project', async () => {
    await app();
    openControls();
    fireEvent.click(screen.getByLabelText('Use Optolong H-alpha 7 nm'));
    await openProjects();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const filters = within(screen.getByRole('group', { name: 'Filters used' }));
    expect((filters.getByLabelText('Broadband') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('Optolong H-alpha 7 nm') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('Optolong L-eXtreme (standard)') as HTMLInputElement).checked).toBe(false);
  });

  it('a half-made project survives a visit to the other tabs', async () => {
    await app();
    await openProjects();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Half' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    expect((screen.getByLabelText('Project name') as HTMLInputElement).value).toBe('Half');
  });
});

describe('Share and export: Projects', () => {
  const sheetOf = (p: Project) => projectSheet(p, sheetNames(profile, p.setup, (id) => ({ m31: 'Andromeda Galaxy' })[id] ?? id));
  const choose = (what: RegExp, format: string) => {
    fireEvent.click(screen.getByRole('radio', { name: what }));
    fireEvent.click(screen.getByRole('radio', { name: format }));
  };
  const shared = () => (screen.getByLabelText('Text to share') as HTMLTextAreaElement).value;

  it('with no projects the choice is off and says why; the sheet still opens on the plan', async () => {
    await app();
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
    const radio = screen.getByRole('radio', { name: 'Projects (0)' }) as HTMLInputElement;
    expect(radio.disabled).toBe(true);
    expect(screen.getByTestId('share-sheet').textContent).toContain('You have no projects yet. Make one under Projects.');
    expect((screen.getByRole('radio', { name: /^This plan/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('opened from the Projects tab it is on Projects; text, Markdown, CSV and JSON carry the engine\'s numbers; Print is off; Close returns to the button', async () => {
    await app([mine]);
    await openProjects();
    fireEvent.click(screen.getByRole('button', { name: 'Share and export…' }));
    expect((screen.getByRole('radio', { name: 'Projects (1)' }) as HTMLInputElement).checked).toBe(true);
    const doc = { plans: [], gear: null, notes: [], projects: [sheetOf(mine)] };
    choose(/^Projects/, 'Plain text');
    expect(shared()).toBe(docToText(doc));
    expect(shared()).toContain('Progress: 2h / 5h (40%)');
    expect(shared()).toContain('Andromeda Galaxy: 2h / 5h (40%)');
    choose(/^Projects/, 'Markdown');
    expect(shared()).toBe(docToMarkdown(doc));
    choose(/^Projects/, 'CSV');
    expect(shared()).toBe(docToCsv(doc).replace(/\r\n/g, '\n'));
    choose(/^Projects/, 'JSON');
    const json = JSON.parse(shared());
    expect(json.projects).toEqual([JSON.parse(JSON.stringify(mine))]);
    expect(json.projectSheets).toEqual([JSON.parse(JSON.stringify(sheetOf(mine)))]);
    expect(shared()).toBe(plansFileText({ exportedAt: json.exportedAt, plans: [], sheets: [], profile: null, projects: [mine], projectSheets: [sheetOf(mine)] }));
    expect((screen.getByRole('button', { name: 'Print run sheet' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('print-projects-note')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('project-share'));
  });

  it('the plan\'s own Share, Print and its numbers are unchanged: the plan is the default and Projects is one more choice', async () => {
    await app([mine]);
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).name === 'share-what').map((r) => r.closest('label')!.textContent)).toEqual([
      'This plan: My plan',
      'All plans (1)',
      'Gear',
      'Everything: all plans and gear',
      'Projects (1)',
    ]);
    expect(shared()).not.toContain('PROJECT:');
    expect((screen.getByRole('button', { name: 'Print run sheet' }) as HTMLButtonElement).disabled).toBe(false);
    expect(durationText(120)).toBe('2h');
    expect(loadProjects(window.localStorage).state?.projects).toHaveLength(1);
  });
});
