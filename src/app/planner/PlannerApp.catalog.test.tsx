/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { createTonightRanker } from '@/planner/tonight';
import { MY_PLAN_KEY, SELECTION_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, ready } from './testkit';

// The page over the whole catalog: tonight's list from the worker, the search, my plan, the itinerary that reads it.
// The catalog is the curated 25 plus the objects below; the worker is a fake that runs the real ranking and answers when told to.

const OBJECTS: CatalogObject[] = [
  { id: 'ngc891', name: 'NGC 891', type: 'galaxy', raHours: 2.37, decDeg: 42.35, majorArcmin: 13, minorArcmin: 3, mag: 10, surfaceBrightness: 24.1, constellation: 'And', aliases: ['Silver Sliver'] },
  { id: 'ngc7331', name: 'NGC 7331', type: 'galaxy', raHours: 22.62, decDeg: 34.42, majorArcmin: 10.5, minorArcmin: 3.7, mag: 9.5, surfaceBrightness: 23, constellation: 'Peg' },
  // Never above 30 degrees at 33.5 N: searchable, never listed, "not up" on any night.
  { id: 'ngc1023', name: 'NGC 1023', type: 'galaxy', raHours: 2.67, decDeg: 39.06, majorArcmin: 8.6, minorArcmin: 3.3, mag: 9.4, surfaceBrightness: 22.5, constellation: 'Per' },
  { id: 'ngc3195', name: 'Southern Test Galaxy', type: 'galaxy', raHours: 10.5, decDeg: -80, majorArcmin: 5, minorArcmin: 4, mag: 11, surfaceBrightness: 22, constellation: 'Cha' },
  // A double star: up tonight, but not an imaging target, so not in the list; the search still finds it.
  { id: 'm40', name: 'M40', type: 'double-star', raHours: 12.37, decDeg: 58.08, mag: 8, m: 40, constellation: 'UMa', aliases: ['M 40'] },
];
const DATE = '2026-12-15';
const WORD = 'that night (12/15/2026)';

const profile = (trainId = 'deep-c11-reducer-533') => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === trainId ? -1 : 1)) };
};

/** The page over the fake catalog; the worker answers at once unless `hold` is set. */
function mount(opts: { hold?: boolean; trainId?: string; props?: Partial<React.ComponentProps<typeof PlannerApp>> } = {}) {
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: opts.hold ?? false });
  const view = render(<PlannerApp initialDate={DATE} initialProfile={profile(opts.trainId)} rank={worker.rank} loadCatalogIndex={catalog.load} {...opts.props} />);
  return { ...view, catalog, worker };
}
const table = () => screen.getByTestId('target-table');
const listNames = () => [...table().querySelectorAll('th[scope="row"] button[aria-pressed]')].map((b) => (b.textContent ?? '').trim());
const myPlan = () => screen.getByRole('region', { name: 'MY PLAN' });
const planNames = () => within(myPlan()).queryAllByRole('listitem').map((li) => li.querySelector('p')?.textContent?.replace(/^\d+\.\s*/, '').trim());
const stored = () => JSON.parse(window.localStorage.getItem(MY_PLAN_KEY) ?? 'null') as { version: number; ids: string[] } | null;
const searchBox = () => screen.getByLabelText('Search the catalog by name or number') as HTMLInputElement;
const results = () => screen.getByRole('list', { name: 'Search results' });

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('tonight\'s list over the whole catalog', () => {
  it('shows a loading state until the worker answers, then the ranked catalog objects; the double star is not in it', async () => {
    const { worker } = mount({ hold: true });
    expect(await screen.findByText(/Ranking the whole catalog for that night/)).toBeTruthy();
    expect(screen.queryByTestId('target-table')).toBeNull();
    expect(screen.getByRole('heading', { name: `BEST TARGETS FOR ${WORD.toUpperCase()}` })).toBeTruthy();
    await act(async () => { await worker.release(); });
    await ready();
    expect(screen.queryByText(/Ranking the whole catalog/)).toBeNull();
    expect(listNames()).toEqual(expect.arrayContaining(['NGC 891', 'NGC 7331']));
    expect(listNames()).not.toContain('M40');
    expect(listNames()).not.toContain('Southern Test Galaxy');
    expect(listNames().length).toBeLessThanOrEqual(100);
    expect(worker.requests).toHaveLength(1);
    expect(worker.requests[0].query).toMatchObject({ date: DATE, limit: 100, minAltitude: 20, includeTooLarge: false });
  });

  it('asks again when the night, the horizon or the minimum altitude changes, and shows the loading state while it waits', async () => {
    const { worker } = mount({ hold: true });
    await act(async () => { await worker.release(); });
    await ready();
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2027-06-15' } });
    expect(await screen.findByText(/Ranking the whole catalog for that night \(6\/15\/2027\)/)).toBeTruthy();
    expect(screen.queryByTestId('target-table')).toBeNull();
    await act(async () => { await worker.release(); });
    await ready();
    expect(worker.requests.map((r) => r.query.date)).toEqual([DATE, '2027-06-15']);
  });

  it('a newer request supersedes an older one quietly: no error, and the list is the newer night\'s', async () => {
    const { worker } = mount({ hold: true });
    await screen.findByText(/Ranking the whole catalog/);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2027-01-10' } });
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2027-02-20' } });
    // The middle request is superseded before it reaches the worker; the last one is the one the worker answers.
    await waitFor(() => expect(worker.requests[worker.requests.length - 1].query.date).toBe('2027-02-20'));
    await act(async () => { await worker.release(); });
    await ready();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Superseded/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'BEST TARGETS FOR THAT NIGHT (2/20/2027)' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Targets ranked for that night (2/20/2027)' })).toBeTruthy();
  });

  it('a failure is shown plainly with Retry, and Retry asks again', async () => {
    const catalog = fakeCatalog(OBJECTS);
    const real = createTonightRanker({ createWorker: () => null, loadTargets: async () => (await catalog.load()).targets, yieldNow: async () => undefined });
    const rank = jest.fn().mockRejectedValueOnce(new Error('the worker fell over')).mockImplementation(real);
    render(<PlannerApp initialDate={DATE} initialProfile={profile()} rank={rank} loadCatalogIndex={catalog.load} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(`The list for ${WORD} could not be ranked: the worker fell over`);
    await userEvent.setup().click(within(alert).getByRole('button', { name: 'Retry' }));
    await ready();
    expect(rank).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names what the size screen left out, with a count, and "show anyway" is the do-not-fit switch', async () => {
    mount({ trainId: 'deep-c11-2600' });
    await ready();
    const note = screen.getByTestId('hidden-note');
    expect(note.textContent).toMatch(/larger than this frame \(\d+ hidden\):\s*show anyway/);
    expect(note.textContent).toMatch(/Andromeda Galaxy/);
    expect(listNames()).not.toContain('Andromeda Galaxy');
    await userEvent.setup().click(within(note).getByRole('button', { name: 'show anyway' }));
    await ready();
    expect((screen.getByRole('checkbox', { name: 'Show targets that do not fit' }) as HTMLInputElement).checked).toBe(true);
    expect(listNames()).toContain('Andromeda Galaxy');
    expect(screen.queryByTestId('hidden-note')?.textContent ?? '').not.toMatch(/larger than this frame/);
  });

  it('a catalog object has no season: the page says so, does not invent one, and its details open without a crash', async () => {
    mount();
    await ready();
    const row = [...table().querySelectorAll('tbody tr')].find((r) => r.querySelector('th[scope="row"]')?.textContent?.includes('NGC 891')) as HTMLElement;
    expect(row).toBeTruthy();
    expect(within(row).getByText('Not listed')).toBeTruthy();
    await userEvent.setup().click(within(row).getByRole('button', { name: 'NGC 891' }));
    expect(screen.getByRole('region', { name: /^EXPOSURE: NGC 891/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ALTITUDE: NGC 891' })).toBeTruthy();
  });

  it('the Type filter still narrows the list without asking the worker again', async () => {
    const { worker } = mount();
    await ready();
    await userEvent.setup().selectOptions(screen.getByLabelText('Type'), 'planets');
    expect(listNames().every((n) => /^(Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune)$/.test(n))).toBe(true);
    expect(worker.requests).toHaveLength(1);
  });
});

describe('search', () => {
  it('finds an object by name or number: name, designation, type, size, and tonight\'s verdict with its score', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await u.type(searchBox(), 'ngc 891');
    const hit = within(results()).getAllByRole('listitem')[0];
    expect(hit.textContent).toContain('NGC 891');
    expect(hit.textContent).toContain('Galaxy');
    expect(hit.textContent).toContain('13′ × 3′');
    expect(hit.textContent).toMatch(new RegExp(`Up ${WORD.replace(/[()]/g, '\\$&')}: clear [\\d.]+ h, peak \\d+° [NESW]+ at \\d\\d:\\d\\d\\. Score [\\d.]+\\.`));
    expect(hit.textContent).toMatch(/#\d+ in the list below/);
    // By alias, too.
    await u.clear(searchBox());
    await u.type(searchBox(), 'silver sliver');
    expect(within(results()).getAllByRole('listitem')[0].textContent).toContain('NGC 891');
  });

  it('says whether it is up for the chosen night even when it is not in the list: a double star that is up, and a galaxy that never rises', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await u.type(searchBox(), 'M40');
    const dbl = within(results()).getAllByRole('listitem')[0];
    expect(dbl.textContent).toContain('Double star');
    expect(dbl.textContent).toMatch(/Up that night.*Score [\d.]+/);
    expect(dbl.textContent).not.toMatch(/in the list below/);
    await u.clear(searchBox());
    await u.type(searchBox(), 'Southern Test');
    const south = within(results()).getAllByRole('listitem')[0];
    expect(south.textContent).toMatch(/Not up that night \(12\/15\/2026\): it peaks at -?\d+° [NESW]+, never clear of your horizon/);
  });

  it('an unknown name says it is not in the bundled catalog (and nothing is sent anywhere)', async () => {
    const fetchSpy = jest.fn();
    const realFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      mount();
      await ready();
      await userEvent.setup().type(searchBox(), 'Zxqvbn Nebula');
      expect(screen.getByText('“Zxqvbn Nebula” is not in the bundled catalog.')).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Search results' })).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('is labelled, reachable by keyboard, and Enter in the box does not reload the page', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    expect(screen.getByRole('search')).toBeTruthy();
    expect(searchBox().getAttribute('aria-describedby')).toBeTruthy();
    searchBox().focus();
    await u.keyboard('m31{Enter}');
    expect(within(results()).getAllByRole('listitem')[0].textContent).toContain('Andromeda Galaxy');
    await u.tab(); // the Search button
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search' }));
    await u.tab(); // the first result's Add button
    expect(document.activeElement).toBe(within(results()).getAllByRole('button', { name: /^Add .+ to my plan$/ })[0]);
  });

  it('Add to my plan puts the target in my plan, and the result says it is there', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await u.type(searchBox(), 'ngc 7331');
    await u.click(within(results()).getByRole('button', { name: 'Add NGC 7331 to my plan' }));
    expect(planNames()).toEqual(['NGC 7331']);
    expect(stored()).toEqual({ version: 1, ids: ['ngc7331'] });
    expect(within(results()).getByText('In my plan')).toBeTruthy();
  });
});

describe('my plan', () => {
  const addFromList = async (u: ReturnType<typeof userEvent.setup>, name: string) => {
    const card = within(screen.getByTestId('target-cards')).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name })) as HTMLElement;
    await u.click(within(card).getByRole('button', { name: 'Add to my plan' }));
  };

  it('starts empty with an instruction; Add to my plan on a card adds it once and the card then says In my plan', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    expect(within(myPlan()).getByText(/Nothing in your plan yet/)).toBeTruthy();
    await addFromList(u, 'NGC 891');
    expect(planNames()).toEqual(['NGC 891']);
    const card = within(screen.getByTestId('target-cards')).getAllByRole('listitem').find((li) => within(li).queryByRole('button', { name: 'NGC 891' })) as HTMLElement;
    expect(within(card).queryByRole('button', { name: 'Add to my plan' })).toBeNull();
    expect(within(card).getByText('In my plan')).toBeTruthy();
    expect(within(myPlan()).getByText(/^Up that night/)).toBeTruthy();
  });

  it('keeps the user\'s order: Up and Down move one place, the ends are disabled, the order is saved', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    for (const n of ['NGC 891', 'NGC 7331', 'NGC 1023']) await addFromList(u, n);
    expect(planNames()).toEqual(['NGC 891', 'NGC 7331', 'NGC 1023']);
    expect((within(myPlan()).getByRole('button', { name: 'Move NGC 891 up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(myPlan()).getByRole('button', { name: 'Move NGC 1023 down' }) as HTMLButtonElement).disabled).toBe(true);
    await u.click(within(myPlan()).getByRole('button', { name: 'Move NGC 1023 up' }));
    expect(planNames()).toEqual(['NGC 891', 'NGC 1023', 'NGC 7331']);
    expect(document.activeElement).toBe(within(myPlan()).getByRole('button', { name: 'Move NGC 1023 up' }));
    await u.click(within(myPlan()).getByRole('button', { name: 'Move NGC 891 down' }));
    expect(planNames()).toEqual(['NGC 1023', 'NGC 891', 'NGC 7331']);
    expect(stored()?.ids).toEqual(['ngc1023', 'ngc891', 'ngc7331']);
    // The plan's order is the user's: a re-rank (a new date) does not re-sort it.
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2027-06-15' } });
    await ready();
    expect(planNames()).toEqual(['NGC 1023', 'NGC 891', 'NGC 7331']);
  });

  it('Remove takes one out and saves; the list card offers it again', async () => {
    mount();
    await ready();
    const u = userEvent.setup();
    await addFromList(u, 'NGC 891');
    await u.click(within(myPlan()).getByRole('button', { name: 'Remove NGC 891 from my plan' }));
    expect(planNames()).toEqual([]);
    expect(stored()?.ids).toEqual([]);
    expect(within(screen.getByTestId('target-cards')).getAllByRole('button', { name: 'Add to my plan' }).length).toBeGreaterThan(0);
  });

  it('is remembered: a reload (a new page over the same storage) opens on the same plan in the same order', async () => {
    const first = mount();
    await ready();
    const u = userEvent.setup();
    await addFromList(u, 'NGC 7331');
    await addFromList(u, 'NGC 891');
    first.unmount();
    mount();
    await ready();
    await waitFor(() => expect(planNames()).toEqual(['NGC 7331', 'NGC 891']));
  });

  it('is cleared by "Replace profile with sample", like the site and train choice', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'fountain-hills', trainId: 'smart-seestar-s50' }));
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['ngc891'] }));
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    await ready();
    await waitFor(() => expect(planNames()).toEqual(['NGC 891']));
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Replace profile with sample' })[0]);
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(window.localStorage.getItem(SELECTION_KEY)).toBeNull();
    expect(planNames()).toEqual([]);
    jest.restoreAllMocks();
  });

  it('a damaged saved plan is reported once, removed, and the plan starts empty', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, '{nope');
    mount();
    await ready();
    expect((await screen.findByText(/Your saved plan is damaged, so it starts empty\./))).toBeTruthy();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(planNames()).toEqual([]);
  });

  it('shows a saved id that is no longer in the catalog as such, and it can be removed', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['gone-from-catalog'] }));
    mount();
    await ready();
    await waitFor(() => expect(within(myPlan()).getByText('Not in the bundled catalog.')).toBeTruthy());
    await userEvent.setup().click(within(myPlan()).getByRole('button', { name: 'Remove gone-from-catalog from my plan' }));
    expect(planNames()).toEqual([]);
  });
});

describe('the night itinerary reads my plan', () => {
  const section = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
  const select = () => screen.getByLabelText('Target to add') as HTMLSelectElement;

  it('offers my plan\'s targets first, defaults to the first of them, and adds the chosen one as a slot on the chosen train', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['ngc7331', 'ngc891'] }));
    mount();
    await ready();
    await waitFor(() => expect(select().value).toBe('ngc7331'));
    const groups = [...select().querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['My plan', 'Planets and Moon']);
    expect([...select().querySelectorAll('optgroup')[0].querySelectorAll('option')].map((o) => o.value)).toEqual(['ngc7331', 'ngc891']);
    await userEvent.setup().click(within(section()).getByRole('button', { name: 'Add to itinerary' }));
    const saved = JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string).items;
    expect(saved.map((i: { targetId: string }) => i.targetId)).toEqual(['ngc7331']);
    expect(within(section()).getByRole('heading', { name: '1. NGC 7331' })).toBeTruthy();
  });

  it('with an empty plan nothing is chosen for the user, and a search inside the itinerary finds any catalog object to add', async () => {
    mount();
    await ready();
    expect(select().value).toBe('');
    expect((within(section()).getByRole('button', { name: 'Add to itinerary' }) as HTMLButtonElement).disabled).toBe(true);
    const u = userEvent.setup();
    await u.type(within(section()).getByLabelText('Search the catalog to add'), 'ngc891');
    expect(select().value).toBe('ngc891');
    await u.click(within(section()).getByRole('button', { name: 'Add to itinerary' }));
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string).items[0].targetId).toBe('ngc891');
  });

  it('a slot saved for a catalog object that is not in my plan still finds its target', async () => {
    window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 1, items: [{ id: 's1', targetId: 'ngc891', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }] }));
    mount();
    await ready();
    await waitFor(() => expect(within(section()).getByRole('heading', { name: '1. NGC 891' })).toBeTruthy());
    expect(within(section()).queryByText(/is not in the target list/)).toBeNull();
  });
});

describe('phone layout', () => {
  it('stacks the list as cards below lg and the table from lg up; every control in the new sections is a 44 px target and wraps', async () => {
    mount();
    await ready();
    expect(screen.getByTestId('target-cards').className).toContain('lg:hidden');
    expect((table().parentElement as HTMLElement).className).toContain('hidden lg:block');
    const u = userEvent.setup();
    await u.type(searchBox(), 'm31');
    const hit = within(results()).getAllByRole('listitem')[0];
    expect(hit.className).toMatch(/flex-wrap/);
    expect(hit.querySelector('.min-w-0')).toBeTruthy();
    expect(hit.querySelector('.break-words')).toBeTruthy();
    for (const b of [...within(results()).getAllByRole('button'), screen.getByRole('button', { name: 'Search' }), searchBox()]) expect(b.className).toContain('min-h-11');
    await u.click(within(results()).getAllByRole('button', { name: /^Add .+ to my plan$/ })[0]);
    const item = within(myPlan()).getAllByRole('listitem')[0];
    expect(item.className).toMatch(/flex-wrap/);
    for (const b of within(item).getAllByRole('button')) expect(b.className).toMatch(/min-h-11/);
    for (const b of within(screen.getByTestId('target-cards')).getAllByRole('button', { name: /Add to my plan|Why/ })) expect(b.className).toContain('min-h-11');
  });

  it('no wide element: the search, my plan and list panels use the page width only (no fixed widths, overflow handled by wrapping)', async () => {
    mount();
    await ready();
    for (const el of [screen.getByRole('search'), myPlan(), screen.getByRole('region', { name: 'FIND A TARGET' })]) {
      expect(el.outerHTML).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]|\bw-(96|80|72|64)\b/);
    }
  });
});
