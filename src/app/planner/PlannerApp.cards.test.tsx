/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, listRows, ready, rowName, showAll } from './testkit';

// The ranked list is compact rows (one layout for every width), the best ten first. A row opens in place.

const OBJECTS: CatalogObject[] = [
  { id: 'ngc891', name: 'NGC 891', type: 'galaxy', raHours: 2.37, decDeg: 42.35, majorArcmin: 13, minorArcmin: 3, mag: 10, surfaceBrightness: 24.1, constellation: 'Andromeda' },
  { id: 'ngc7331', name: 'NGC 7331', type: 'galaxy', raHours: 22.62, decDeg: 34.42, majorArcmin: 10.5, minorArcmin: 3.7, mag: 9.5, surfaceBrightness: 23, constellation: 'Pegasus' },
];

const app = async () => {
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  const r = render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} rank={worker.rank} loadCatalogIndex={catalog.load} />);
  await ready();
  return r;
};

afterEach(cleanup);

describe('compact target rows', () => {
  it('shows name, type, size and constellation, the up window and peak, fit, a whole-number score and a short why, and an Add button of its own', async () => {
    await app();
    const row = listRows().find((r) => rowName(r) === 'NGC 891') as HTMLElement;
    const text = row.textContent as string;
    expect(text).toContain('Galaxy');
    expect(text).toContain('13′ × 3′');
    expect(text).toContain('Andromeda');
    expect(text).toMatch(/Up \d\d:\d\d–\d\d:\d\d/);
    expect(text).toMatch(/peak \d+° [NESW]+ at \d\d:\d\d/);
    expect(text).toMatch(/Fits|Too large|Fit unknown|Smart scope/);
    const score = row.querySelectorAll(':scope > div')[2].textContent as string;
    expect(score).toMatch(/Score \d+$/);
    expect(text).toMatch(/[\d.]+ h clear/);
    const add = within(row).getByRole('button', { name: 'Add NGC 891 to my plan' });
    expect(add.textContent).toBe('Add');
    expect(add.className).toContain('min-h-11');
    // Its own column: not inside the name cell.
    expect(row.querySelector('button[aria-expanded]')!.parentElement!.contains(add)).toBe(false);
  });

  it('has no Season column and no "Not listed", and no table', async () => {
    await app();
    showAll();
    const page = screen.getByTestId('target-list').textContent as string;
    expect(page).not.toMatch(/Season|Not listed/);
    expect(document.querySelector('table[data-testid="target-table"]')).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Season' })).toBeNull();
  });

  it('the short why differs between rows (not one sentence repeated)', async () => {
    await app();
    showAll();
    const whys = listRows().map((r) => r.querySelector(':scope > p')!.textContent as string);
    expect(whys.length).toBeGreaterThan(3);
    expect(new Set(whys).size).toBeGreaterThan(whys.length / 2);
  });

  it('shows the best ten, then "Show N more" adds ten at a time until the list ends, and then the button is gone', async () => {
    await app();
    const u = userEvent.setup();
    expect(listRows()).toHaveLength(10);
    const total = Number(/of (\d+)$/.exec(screen.getByText(/^Showing 10 of \d+$/).textContent as string)![1]);
    expect(total).toBeGreaterThan(10);
    const first = listRows().map(rowName);
    await u.click(screen.getByRole('button', { name: /^Show (\d+) more$/ }));
    expect(listRows()).toHaveLength(Math.min(20, total));
    expect(listRows().map(rowName).slice(0, 10)).toEqual(first);
    showAll();
    expect(listRows()).toHaveLength(total);
    expect(screen.queryByRole('button', { name: /^Show \d+ more$/ })).toBeNull();
  });

  it('opens a row in place (Moon, why, window, Captured, chart) by mouse and by keyboard, one at a time', async () => {
    const u = userEvent.setup();
    await app();
    const button = (i: number) => listRows()[i].querySelector('button[aria-expanded]') as HTMLElement;
    expect(button(1).getAttribute('aria-expanded')).toBe('false');
    button(1).focus();
    await u.keyboard('{Enter}');
    expect(button(1).getAttribute('aria-expanded')).toBe('true');
    const detail = document.getElementById(button(1).getAttribute('aria-controls') as string) as HTMLElement;
    expect(listRows()[1].contains(detail)).toBe(true);
    expect(detail.textContent).toMatch(/% lit, \d+° away/);
    expect(detail.textContent).toContain('Score parts: usable');
    expect(within(detail).getByRole('img')).toBeTruthy();
    const box = within(detail).getByRole('checkbox', { name: /^Captured: / }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await u.click(box);
    expect((within(detail).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    await u.click(button(2));
    expect(button(1).getAttribute('aria-expanded')).toBe('false');
    expect(button(2).getAttribute('aria-expanded')).toBe('true');
    await u.click(button(2));
    expect(button(2).getAttribute('aria-expanded')).toBe('false');
  });

  it('holds each target once: the page has one list, not a table and a set of cards', async () => {
    await app();
    showAll();
    expect(screen.getAllByRole('list', { name: /^Targets ranked for/ })).toHaveLength(1);
    const names = listRows().map(rowName);
    expect(new Set(names).size).toBe(names.length);
    expect(screen.getAllByRole('button', { name: /^Add .+ to my plan$/ }).filter((b) => listRows().some((r) => r.contains(b)))).toHaveLength(names.length);
  });

  it('the list is a grid that folds to one column: the same markup at every width', async () => {
    await app();
    const li = listRows()[0];
    expect(li.className).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(li.className).toMatch(/md:grid-cols-/);
    fireEvent.click(screen.getByRole('button', { name: /^Show \d+ more$/ }));
  });
});
