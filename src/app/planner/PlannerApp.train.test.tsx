/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { SELECTION_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, ready } from './testkit';

// The first screen is the user's context: the sample opens on a deep-sky train, a remembered choice wins, and a train set up
// for planets says so above the list, with a control that changes the one Train select.

const OBJECTS: CatalogObject[] = [
  { id: 'ngc891', name: 'NGC 891', type: 'galaxy', raHours: 2.37, decDeg: 42.35, majorArcmin: 13, minorArcmin: 3, mag: 10, surfaceBrightness: 24.1, constellation: 'And' },
  { id: 'ngc7331', name: 'NGC 7331', type: 'galaxy', raHours: 22.62, decDeg: 34.42, majorArcmin: 10.5, minorArcmin: 3.7, mag: 9.5, surfaceBrightness: 23, constellation: 'Peg' },
];

const mount = (props: Partial<React.ComponentProps<typeof PlannerApp>> = {}) => {
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  return { catalog, ...render(<PlannerApp initialDate="2026-12-15" rank={worker.rank} loadCatalogIndex={catalog.load} {...props} />) };
};
const train = () => screen.getByLabelText('Setup') as HTMLSelectElement;
const trainName = () => train().selectedOptions[0].textContent;

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('default train', () => {
  it('the sample profile opens on the deep-sky train, with no planetary note', async () => {
    mount();
    await ready();
    expect(train().value).toBe('deep-c11-2600');
    expect(screen.queryByTestId('planetary-note')).toBeNull();
  });

  it('a remembered choice still wins, and a planetary one brings the note', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'fountain-hills', trainId: 'planet-c11-676' }));
    mount({ initialProfile: sampleProfile() });
    await ready();
    expect(train().value).toBe('planet-c11-676');
    expect(screen.getByTestId('planetary-note').textContent).toMatch(/^Solar-system setup/);
  });
});

describe('the planetary note', () => {
  const planetary = async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'fountain-hills', trainId: 'planet-c11-676' }));
    mount({ initialProfile: sampleProfile() });
    await ready();
  };

  it('is one line above the list with a control that changes the existing Train select (no second selector)', async () => {
    await planetary();
    const note = screen.getByTestId('planetary-note');
    expect(screen.getAllByLabelText('Setup')).toHaveLength(1);
    const list = screen.getByTestId('target-list');
    expect(Boolean(note.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const button = within(note).getByRole('button', { name: 'Use C11 f/10 + ASI2600MC Duo' });
    await userEvent.setup().click(button);
    await ready();
    expect(train().value).toBe('deep-c11-2600');
    expect(trainName()).toBe('C11 f/10 + ASI2600MC Duo');
    expect(screen.queryByTestId('planetary-note')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY) as string).trainId).toBe('deep-c11-2600'); // remembered like a pick in the select
  });

  it('picking another train in the select removes it too; picking the planetary train brings it back', async () => {
    await planetary();
    fireEvent.change(train(), { target: { value: 'smart-seestar-s50' } });
    await ready();
    expect(screen.queryByTestId('planetary-note')).toBeNull();
    fireEvent.change(train(), { target: { value: 'planet-c11-powermate-676' } });
    await ready();
    expect(screen.getByTestId('planetary-note')).toBeTruthy();
  });
});

describe('what the list says about itself', () => {
  it('one line above the list says what 100 means, and the score is a whole number labelled Score', async () => {
    mount();
    await ready();
    const note = screen.getByTestId('score-note').textContent as string;
    expect(note).toMatch(/Score is out of 100/);
    const rows = [...screen.getByTestId('target-list').querySelectorAll(':scope > li')];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.querySelector('[data-testid="row-fit-score"]')!.textContent).toMatch(/Score \d+$/);
  });

  it('shows no season anywhere in the list or its note', async () => {
    mount();
    await ready();
    expect(screen.getByRole('region', { name: /^Best targets for/ }).textContent).not.toMatch(/Season|in season|Not listed/);
  });
});

describe('search says what it did', () => {
  const box = () => screen.getByLabelText('Search the catalog by name or number');

  it('the hint counts what the catalog holds (the curated 25 plus the objects, from the index), not a fixed number', async () => {
    const { catalog } = mount();
    await ready();
    const size = (await catalog.load()).size;
    expect(screen.getByText(new RegExp(`^Searches the bundled catalog of ${size} objects, the solar system \\(Moon and planets\\) on this device`))).toBeTruthy();
    expect(document.body.textContent).not.toContain('14,000');
  });

  it('a name that is not there is said inside the live region, so a screen reader hears it', async () => {
    mount();
    await ready();
    await userEvent.setup().type(box(), 'Zxqvbn');
    const live = [...document.querySelectorAll('[aria-live="polite"]')].find((n) => (n.textContent ?? '').includes('is not in the bundled catalog'));
    expect(live).toBeTruthy();
    expect(live!.textContent).toBe('“Zxqvbn” is not in the bundled catalog.');
  });
});
