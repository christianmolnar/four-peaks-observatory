/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { MY_PLAN_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, listRows, ready, rowName, showAll } from './testkit';

// My plan is in sight while adding: above the list, a one-line header with the count, feedback next to the Add button, a jump
// to the itinerary once it has something, and the keyboard never falls to the page after Add or Remove.

const OBJECTS: CatalogObject[] = [
  { id: 'ngc891', name: 'NGC 891', type: 'galaxy', raHours: 2.37, decDeg: 42.35, majorArcmin: 13, minorArcmin: 3, mag: 10, surfaceBrightness: 24.1, constellation: 'And' },
  { id: 'ngc7331', name: 'NGC 7331', type: 'galaxy', raHours: 22.62, decDeg: 34.42, majorArcmin: 10.5, minorArcmin: 3.7, mag: 9.5, surfaceBrightness: 23, constellation: 'Peg' },
  { id: 'ngc1023', name: 'NGC 1023', type: 'galaxy', raHours: 2.67, decDeg: 39.06, majorArcmin: 8.6, minorArcmin: 3.3, mag: 9.4, surfaceBrightness: 22.5, constellation: 'Per' },
];

const mount = () => {
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  return render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} rank={worker.rank} loadCatalogIndex={catalog.load} />);
};
const myPlan = () => screen.getByRole('region', { name: /^MY PLAN/ });
const header = () => within(myPlan()).getByRole('button', { name: /^MY PLAN/ });
const stored = () => JSON.parse(window.localStorage.getItem(MY_PLAN_KEY) ?? 'null') as { ids: string[] } | null;
const rowOf = (name: string) => (showAll(), listRows().find((r) => rowName(r) === name)) as HTMLElement;
const add = (name: string) => within(rowOf(name)).getByRole('button', { name: `Add ${name} to my plan` });

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('My plan is in sight', () => {
  it('sits above the search and the list, in the one layout every width gets', async () => {
    mount();
    await ready();
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(myPlan(), screen.getByRole('region', { name: 'FIND A TARGET' }))).toBe(true);
    expect(follows(myPlan(), screen.getByTestId('target-list'))).toBe(true);
    expect(follows(myPlan(), screen.getByRole('region', { name: /^BEST TARGETS FOR/ }))).toBe(true);
  });

  it('is a one-line header with the count when closed, and opens by itself once it has an item', async () => {
    mount();
    await ready();
    expect(header().textContent).toContain('MY PLAN (0)');
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(within(myPlan()).queryByRole('list')).toBeNull();
    expect(within(myPlan()).queryByRole('link', { name: 'Plan an itinerary' })).toBeNull();
    fireEvent.click(add('NGC 891'));
    expect(header().textContent).toContain('MY PLAN (1)');
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(within(myPlan()).getAllByRole('listitem')).toHaveLength(1);
  });

  it('the user can close it with items in it, and it stays closed while the count goes on', async () => {
    mount();
    await ready();
    fireEvent.click(add('NGC 891'));
    fireEvent.click(header());
    expect(header().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(add('NGC 7331'));
    expect(header().textContent).toContain('MY PLAN (2)');
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });

  it('offers "Plan an itinerary" once it is not empty, as a jump to the itinerary', async () => {
    mount();
    await ready();
    fireEvent.click(add('NGC 891'));
    const link = within(myPlan()).getByRole('link', { name: 'Plan an itinerary' });
    expect(link.getAttribute('href')).toBe('#itinerary-heading');
    await waitFor(() => expect(document.getElementById('itinerary-heading')).not.toBeNull());
  });
});

describe('adding says so next to the button, and keeps the keyboard in place', () => {
  it('"Added, #n in My plan" appears beside the button for a few seconds, and a screen reader hears it', async () => {
    mount();
    await ready();
    fireEvent.click(add('NGC 891'));
    fireEvent.click(add('NGC 7331'));
    const row = rowOf('NGC 7331');
    expect(within(row).getByText('Added, #2 in My plan')).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"].sr-only')!.textContent).toBe('NGC 7331 added, number 2 in My plan.');
    expect(within(rowOf('NGC 891')).queryByText(/^Added/)).toBeNull(); // only the one just added
    await waitFor(() => expect(screen.queryByText('Added, #2 in My plan')).toBeNull(), { timeout: 6000 });
  }, 15000);

  it('focus stays on the same button after Add in the list (it now says In my plan)', async () => {
    const u = userEvent.setup();
    mount();
    await ready();
    const button = add('NGC 891');
    await u.click(button);
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe('In my plan');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    await u.keyboard('{Enter}');
    expect(stored()?.ids).toEqual(['ngc891']); // pressing it again adds nothing
  });

  it('focus stays on the same button after Add in a search result', async () => {
    const u = userEvent.setup();
    mount();
    await ready();
    await u.type(screen.getByLabelText('Search the catalog by name or number'), 'ngc 1023');
    const button = within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', { name: 'Add NGC 1023 to my plan' });
    await u.click(button);
    expect(document.activeElement).toBe(button);
    expect(button.textContent).toBe('In my plan');
    expect(within(screen.getByRole('list', { name: 'Search results' })).getByText('Added, #1 in My plan')).toBeTruthy();
  });
});

describe('Remove keeps the keyboard in My plan', () => {
  const three = async () => {
    mount();
    await ready();
    for (const n of ['NGC 891', 'NGC 7331', 'NGC 1023']) fireEvent.click(add(n));
  };
  const remove = (name: string) => within(myPlan()).getByRole('button', { name: `Remove ${name} from my plan` });

  it('removing the first moves focus to the Remove button of the one that took its place', async () => {
    await three();
    await userEvent.setup().click(remove('NGC 891'));
    expect(document.activeElement).toBe(remove('NGC 7331'));
  });

  it('removing the last moves focus to the Remove button before it', async () => {
    await three();
    await userEvent.setup().click(remove('NGC 1023'));
    expect(document.activeElement).toBe(remove('NGC 7331'));
  });

  it('removing the only one moves focus to the My plan header, never to the page', async () => {
    mount();
    await ready();
    fireEvent.click(add('NGC 891'));
    await userEvent.setup().click(remove('NGC 891'));
    expect(document.activeElement).toBe(header());
    expect(document.activeElement).not.toBe(document.body);
    expect(header().textContent).toContain('MY PLAN (0)');
  });
});
