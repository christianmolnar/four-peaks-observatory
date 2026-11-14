/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { PROFILE_KEY, SELECTION_KEY, defaultTonightDate, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// Nothing is asked twice: the sky darkness belongs to the site, the page opens on the gear last chosen,
// and the wording follows the date picked.

const base = () => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === 'deep-c11-reducer-533' ? -1 : 1)) };
};
const twoSites = () => {
  const p = base();
  return { ...p, sites: [...p.sites, { ...p.sites[0], id: 'second', name: 'Second site', longitude: p.sites[0].longitude + 1 }] };
};
const app = (profile = base(), initialDate = '2026-12-15') => render(<PlannerApp initialDate={initialDate} initialProfile={profile} />);
const trainSelect = () => screen.getByLabelText('Train') as HTMLSelectElement;
const siteSelect = () => screen.getByLabelText('Site') as HTMLSelectElement;
const exposure = () => screen.getByRole('region', { name: /^EXPOSURE:/ });
const itinerary = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
const bortleSelects = () => screen.queryAllByLabelText(/^Sky darkness, Bortle class \(1 to 9, 1 is darkest\)$/) as HTMLSelectElement[];

/** jsdom does not toggle a <details> on a click, so open it the way the browser would. */
const openList = (summary: string) => {
  const d = screen.getByText(summary).closest('details') as HTMLDetailsElement;
  d.open = true;
  fireEvent(d, new Event('toggle'));
  return d;
};

/** Picks a class in the site editor and presses that form's Save (fireEvent: a whole-page userEvent step is slow in jsdom). */
const saveBortle = (value: string) => {
  const form = bortleSelects()[0].closest('form') as HTMLElement;
  fireEvent.change(bortleSelects()[0], { target: { value } });
  fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Bortle class belongs to the site', () => {
  it('is asked once, in the site editor, with 6 as a labelled assumption; the panels only say it', () => {
    app();
    expect(document.getElementById('exposure-bortle')).toBeNull();
    expect(document.getElementById('it-bortle')).toBeNull();
    expect(bortleSelects()).toHaveLength(0); // the editor's lists are closed
    openList('Site (1)');
    expect(bortleSelects()).toHaveLength(1);
    expect([...bortleSelects()[0].options].map((o) => o.textContent)[0]).toBe('Not set (6 assumed)');
    expect(within(exposure()).getByTestId('exposure-sky').textContent).toBe('Sky darkness: Bortle 6');
    expect(exposure().textContent).toMatch(/Assumed, the site has none/);
    expect(screen.getByTestId('itinerary-add-note').textContent).toMatch(/Bortle 6 assumed, the site has none/);
  });

  it('changing it in the site editor changes both plans and is saved with the site', () => {
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({ version: 1, items: [{ id: 's1', targetId: 'm31', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }] }),
    );
    app();
    const subs = () => within(exposure()).getAllByText(/^\d+ s \(range/).map((n) => n.textContent);
    const itineraryText = () => itinerary().textContent;
    const subsBefore = subs();
    const itineraryBefore = itineraryText();
    openList('Site (1)');
    saveBortle('9');
    expect(within(exposure()).getByTestId('exposure-sky').textContent).toBe('Sky darkness: Bortle 9');
    expect(screen.getByTestId('itinerary-add-note').textContent).toMatch(/Bortle 9 from the site/);
    expect(subs()).not.toEqual(subsBefore);
    expect(itineraryText()).not.toEqual(itineraryBefore);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string).sites[0].bortle).toBe(9);
  });

  it('clearing it goes back to the labelled assumption', () => {
    const p = base();
    app({ ...p, sites: p.sites.map((s, i) => (i === 0 ? { ...s, bortle: 3 } : s)) });
    expect(within(exposure()).getByTestId('exposure-sky').textContent).toBe('Sky darkness: Bortle 3');
    openList('Site (1)');
    expect(bortleSelects()[0].value).toBe('3');
    saveBortle('');
    expect(within(exposure()).getByTestId('exposure-sky').textContent).toBe('Sky darkness: Bortle 6');
  });
});

describe('the page opens on the site and train last chosen', () => {
  it('keeps the Train across a reload', async () => {
    const user = userEvent.setup();
    app();
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
    await user.selectOptions(trainSelect(), 'smart-seestar-s50');
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY) as string).trainId).toBe('smart-seestar-s50');
    cleanup();
    app();
    expect(trainSelect().value).toBe('smart-seestar-s50');
  });

  it('keeps the Site across a reload, and the horizon form follows it', async () => {
    const user = userEvent.setup();
    app(twoSites());
    expect(siteSelect().value).toBe('fountain-hills');
    await user.selectOptions(siteSelect(), 'second');
    cleanup();
    app(twoSites());
    expect(siteSelect().value).toBe('second');
    expect(trainSelect().value).toBe('deep-c11-reducer-533'); // the train was never changed, so it is what the first render chose
  });

  it('falls back to the first site and train when the remembered ones are gone', () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'gone', trainId: 'gone-too' }));
    app();
    expect(siteSelect().value).toBe('fountain-hills');
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
  });

  it('says so, and falls back, when the remembered choice is damaged', async () => {
    window.localStorage.setItem(SELECTION_KEY, '{nope');
    app();
    expect((await screen.findByRole('status')).textContent).toMatch(/saved site and train choice is damaged/);
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
  });

  it('forgets the choice when the profile is replaced with the sample', async () => {
    const user = userEvent.setup();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    app();
    await user.selectOptions(trainSelect(), 'smart-seestar-s50');
    await user.click(screen.getByRole('button', { name: 'Replace profile with sample' }));
    expect(window.localStorage.getItem(SELECTION_KEY)).toBeNull();
    jest.restoreAllMocks();
  });
});

describe('"tonight" only when the date is tonight', () => {
  const tonight = () => {
    const s = base().sites[0];
    return defaultTonightDate(new Date(), s.longitude, s.timeZone);
  };

  it('says tonight on the default date', () => {
    app(base(), tonight());
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByLabelText('Only targets usable tonight')).toBeTruthy();
    expect(screen.getByTestId('target-cards').getAttribute('aria-label')).toBe('Targets ranked for tonight');
  });

  it('says that night, with the date, on any other date, and follows the date picker both ways', () => {
    app(base(), '2026-12-15');
    expect(screen.getByRole('heading', { name: 'THAT NIGHT (12/15/2026)' })).toBeTruthy();
    expect(screen.getByLabelText('Only targets usable that night (12/15/2026)')).toBeTruthy();
    expect(screen.getByTestId('target-cards').getAttribute('aria-label')).toBe('Targets ranked for that night (12/15/2026)');
    expect(screen.getByRole('table', { name: 'Targets ranked for that night (12/15/2026)' })).toBeTruthy();
    expect(screen.queryByText(/usable tonight/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: tonight() } });
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByLabelText('Only targets usable tonight')).toBeTruthy();
  });
});
