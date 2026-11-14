/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { MY_PLAN_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, listRows, ready, rowName, rowNames, showAll } from './testkit';

// Planets on a real night: 2026-11-13 at the sample site (Fountain Hills), minimum altitude 20. Mars, Jupiter, Saturn, Uranus and
// Neptune are up. A hundred and thirty bright galaxies fill the best 100 and outscore every planet, as the real catalog does, so
// the planets reach the page only if they are kept beside the cut. The ranking is the real one behind a fake worker.

jest.setTimeout(60000); // a hundred rows in jsdom, under a loaded machine

const DATE = '2026-11-13';
const FILLER: CatalogObject[] = Array.from({ length: 130 }, (_, i) => ({
  id: `fill${i + 100}`,
  name: `Filler Galaxy ${i + 100}`,
  type: 'galaxy' as const,
  raHours: (21 + i * 0.05) % 24,
  decDeg: 35,
  majorArcmin: 8,
  minorArcmin: 5,
  mag: 9,
  surfaceBrightness: 22,
  constellation: 'Cygnus',
}));
const OBJECTS: CatalogObject[] = [
  ...FILLER,
  { id: 'ngc3242', name: 'Ghost of Jupiter Nebula', type: 'planetary-nebula', raHours: 10.4, decDeg: -18.6, majorArcmin: 1.1, minorArcmin: 1.1, mag: 8.6, constellation: 'Hya' },
  { id: 'm40', name: 'M40', type: 'double-star', raHours: 21.3, decDeg: 58.08, mag: 8, m: 40, constellation: 'UMa', aliases: ['M 40'] },
];
const FIVE = ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

function mount(trainId?: string) {
  const p = sampleProfile();
  const profile = trainId === undefined ? p : { ...p, trains: [...p.trains].sort((a) => (a.id === trainId ? -1 : 1)) };
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  const view = render(<PlannerApp initialDate={DATE} initialProfile={profile} rank={worker.rank} loadCatalogIndex={catalog.load} />);
  return { ...view, catalog, worker };
}
const searchBox = () => screen.getByLabelText('Search the catalog by name or number') as HTMLInputElement;
const results = () => screen.getByRole('list', { name: 'Search results' });
const stored = () => JSON.parse(window.localStorage.getItem(MY_PLAN_KEY) ?? 'null') as { ids: string[] } | null;
const myPlan = () => screen.getByRole('region', { name: /^MY PLAN/ });
const planGroup = () => screen.getByRole('button', { name: /^Solar system up/ });

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('planets on 2026-11-13 at Fountain Hills', () => {
  it('the best 100 are all deep-sky and fill the cut; the planets that are up are kept beside it', async () => {
    mount();
    await ready();
    showAll();
    expect(rowNames()).toHaveLength(100);
    expect(rowNames().some((n) => FIVE.includes(n))).toBe(false);
    expect(rowNames()).not.toContain('M40'); // a double star: searchable, not ranked
    const header = planGroup();
    expect(header.getAttribute('aria-expanded')).toBe('false'); // a deep-sky train: the solar system is not its business
    fireEvent.click(header);
    expect(rowNames('planet-list')).toEqual(expect.arrayContaining(FIVE));
  });

  it('Type = Solar system shows only the solar-system group, open, with the bodies that are up', async () => {
    const { worker } = mount();
    await ready();
    const before = worker.requests.length;
    await userEvent.setup().selectOptions(screen.getByLabelText('Type'), 'solar-system');
    expect(screen.queryByTestId('target-list')).toBeNull(); // no deep-sky list
    expect(planGroup().getAttribute('aria-expanded')).toBe('true');
    expect(rowNames('planet-list')).toEqual(expect.arrayContaining(FIVE));
    expect(rowNames('planet-list').every((n) => /^(Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Moon)$/.test(n))).toBe(true);
    expect(worker.requests).toHaveLength(before); // the filter does not ask the worker again
    // Nothing deep-sky is listed or named here.
    expect(screen.queryByTestId('hidden-note')).toBeNull();
  });

  it('with a planetary train the solar-system group is open at the start; Type = Deep-sky leaves it out', async () => {
    mount('planet-c11-676');
    await ready();
    expect(planGroup().getAttribute('aria-expanded')).toBe('true');
    expect(rowNames('planet-list')).toEqual(expect.arrayContaining(FIVE));
    await userEvent.setup().selectOptions(screen.getByLabelText('Type'), 'deep-sky');
    expect(screen.queryByRole('button', { name: /^Solar system up/ })).toBeNull();
  });

  it('a planet can be added to my plan from the list', async () => {
    mount('planet-c11-676');
    await ready();
    const row = listRows('planet-list').find((r) => rowName(r) === 'Jupiter') as HTMLElement;
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Add Jupiter to my plan' }));
    expect(stored()?.ids).toEqual(['planet-jupiter']);
    expect(within(screen.getByRole('region', { name: /^MY PLAN/ })).getByText('Solar system')).toBeTruthy();
    expect(within(row).getByRole('button', { name: 'Jupiter is in my plan' })).toBeTruthy();
  });
});

describe('search finds the planets and the Moon', () => {
  it('"Jupiter" finds Jupiter first, then the Ghost of Jupiter Nebula; it is up, scored and can be added', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await u.type(searchBox(), 'Jupiter');
    const hits = within(results()).getAllByRole('listitem');
    expect(hits[0].textContent).toContain('Jupiter');
    expect(hits[0].textContent).toContain('Solar system');
    expect(hits[0].textContent).toMatch(/Up (tonight|[A-Z][a-z]{2} \d+ [A-Z][a-z]{2}).*Score \d+/);
    expect(hits[1].textContent).toContain('Ghost of Jupiter Nebula');
    await u.click(within(hits[0]).getByRole('button', { name: 'Add Jupiter to my plan' }));
    expect(stored()?.ids).toEqual(['planet-jupiter']);
    expect(within(results()).getAllByRole('listitem')[0].textContent).toContain('In my plan');
  });

  it.each(['Saturn', 'Mars', 'Moon'])('"%s" is found', async (name) => {
    mount();
    await ready();
    await userEvent.setup().type(searchBox(), name);
    const first = within(results()).getAllByRole('listitem')[0];
    expect(first.querySelector('p')!.textContent).toBe(name);
    expect(within(first).getByRole('button', { name: `Add ${name} to my plan` })).toBeTruthy();
  });

  it('the planet answers to the start of its name, but not to one or two letters', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await u.type(searchBox(), 'sat');
    expect(within(results()).getAllByRole('listitem')[0].querySelector('p')!.textContent).toBe('Saturn');
  });
});

describe('a search result outside the list says why', () => {
  it('a double star: not ranked', async () => {
    mount();
    await ready();
    await userEvent.setup().type(searchBox(), 'M40');
    const hit = within(results()).getAllByRole('listitem')[0];
    expect(hit.textContent).toContain('Double stars are not ranked, so it is not in the list.');
  });

  it('an object below the best 100: says so, and a listed one says its place', async () => {
    mount();
    await ready();
    showAll();
    const listed = new Set(rowNames());
    const out = FILLER.find((o) => !listed.has(o.name)) as CatalogObject;
    const inList = FILLER.find((o) => listed.has(o.name)) as CatalogObject;
    const u = userEvent.setup();
    await u.type(searchBox(), out.name);
    await waitFor(() => expect(within(results()).getAllByRole('listitem')[0].textContent).toContain(out.name));
    expect(within(results()).getAllByRole('listitem')[0].textContent).toContain('Below the best 100, so it is not in the list.');
    await u.clear(searchBox());
    await u.type(searchBox(), inList.name);
    expect(within(results()).getAllByRole('listitem')[0].textContent).toMatch(/#\d+ in the list below\./);
    expect(within(results()).getAllByRole('listitem')[0].textContent).not.toContain('Below the best 100');
  });
});

describe('the train line in My plan', () => {
  const note = () => screen.queryByTestId('plan-train-note');

  it('a deep-sky train with a solar-system body in My plan says so; Add is not blocked and the train does not change; Change train focuses the Train select', async () => {
    mount();
    await ready();
    expect(note()).toBeNull();
    const u = userEvent.setup();
    await u.click(planGroup());
    const row = listRows('planet-list').find((r) => rowName(r) === 'Jupiter') as HTMLElement;
    await u.click(within(row).getByRole('button', { name: 'Add Jupiter to my plan' }));
    expect(stored()?.ids).toEqual(['planet-jupiter']);
    expect(note()!.textContent).toContain('My plan mixes a deep-sky train and solar-system bodies.');
    expect((screen.getByLabelText('Train') as HTMLSelectElement).value).not.toMatch(/^planet-/); // not auto-switched
    await u.click(within(myPlan()).getByRole('button', { name: 'Change train' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Train'));
    // Removing the body clears the line.
    await u.click(within(myPlan()).getByRole('button', { name: 'Remove Jupiter from my plan' }));
    expect(note()).toBeNull();
  });

  it('a planetary train with a deep-sky target in My plan says so; only solar-system bodies on it say nothing', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['planet-jupiter'] }));
    mount('planet-c11-676');
    await ready();
    expect(note()).toBeNull();
    cleanup();
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['planet-jupiter', 'm31'] }));
    mount('planet-c11-676');
    await ready();
    expect(note()!.textContent).toContain('My plan mixes a solar-system train and deep-sky targets.');
    expect(within(myPlan()).getByRole('button', { name: 'Change train' })).toBeTruthy();
  });

  it('a deep-sky train with only deep-sky targets says nothing', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['m31'] }));
    mount();
    await ready();
    expect(note()).toBeNull();
  });
});

describe('the label', () => {
  it('no visible text names the set "Planets": the type, the group, the row, My plan, the itinerary choice and the search say Solar system', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['planet-jupiter'] }));
    mount();
    await ready();
    const u = userEvent.setup();
    expect([...(screen.getByLabelText('Type') as HTMLSelectElement).options].map((o) => o.textContent)).toContain('Solar system');
    expect(planGroup().textContent).toContain('Solar system up');
    expect(within(myPlan()).getByText('Solar system')).toBeTruthy();
    expect([...document.querySelectorAll('optgroup')].map((g) => g.label)).toContain('Solar system');
    await u.type(searchBox(), 'Jupiter');
    expect(within(results()).getAllByRole('listitem')[0].textContent).toContain('Solar system');
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bPlanets\b/);
    expect(text).not.toMatch(/\bplanet\b/);
  });
});
