/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { PROFILE_KEY, SELECTION_KEY, defaultTonightDate, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { openGear, openGearItem, openPlanTab, pageProps, ready, resetAll, storedPlans } from './testkit';

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
const app = async (profile = base(), initialDate = '2026-12-15') => {
  const r = render(<PlannerApp {...pageProps} initialDate={initialDate} initialProfile={profile} />);
  await ready();
  return r;
};
const trainSelect = () => screen.getByLabelText('Train') as HTMLSelectElement;
const siteSelect = () => screen.getByLabelText('Site') as HTMLSelectElement;
const timeline = () => document.getElementById('night-timeline-body') as HTMLElement;
const bortleSelects = () => screen.queryAllByLabelText(/^Sky darkness, Bortle class \(1 to 9, 1 is darkest\)$/) as HTMLSelectElement[];

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
  it('is asked once, in the site editor, with 6 as a labelled assumption', async () => {
    await app();
    openGear();
    expect(document.getElementById('exposure-bortle')).toBeNull();
    expect(document.getElementById('it-bortle')).toBeNull();
    expect(bortleSelects()).toHaveLength(0); // the editor's lists are closed
    openGearItem('Sites');
    expect(bortleSelects()).toHaveLength(1);
    expect([...bortleSelects()[0].options].map((o) => o.textContent)[0]).toBe('Not set (6 assumed)');
  });

  it('changing it in the site editor changes the night timeline and is saved with the site', async () => {
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({ version: 1, items: [{ id: 's1', targetId: 'm31', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }] }),
    );
    await app();
    const timelineBefore = timeline().textContent;
    openGear();
    openGearItem('Sites');
    saveBortle('1');
    expect(timeline().textContent).not.toEqual(timelineBefore);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string).sites[0].bortle).toBe(1);
  });

  it('clearing it goes back to the labelled assumption, and the site is saved without it', async () => {
    const p = base();
    await app({ ...p, sites: p.sites.map((s, i) => (i === 0 ? { ...s, bortle: 3 } : s)) });
    openGear();
    openGearItem('Sites');
    expect(bortleSelects()[0].value).toBe('3');
    saveBortle('');
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string).sites[0].bortle).toBeUndefined();
    expect([...bortleSelects()[0].options].map((o) => o.textContent)[0]).toBe('Not set (6 assumed)');
    expect(bortleSelects()[0].value).toBe('');
  });
});

describe('the page opens on the site and train last chosen', () => {
  it('keeps the Train across a reload', async () => {
    const user = userEvent.setup();
    await app();
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
    await user.selectOptions(trainSelect(), 'smart-seestar-s50');
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY) as string).trainId).toBe('smart-seestar-s50');
    cleanup();
    await app();
    expect(trainSelect().value).toBe('smart-seestar-s50');
  });

  it('keeps the Site across a reload, and the horizon form follows it', async () => {
    const user = userEvent.setup();
    await app(twoSites());
    expect(siteSelect().value).toBe('fountain-hills');
    await user.selectOptions(siteSelect(), 'second');
    cleanup();
    await app(twoSites());
    expect(siteSelect().value).toBe('second');
    expect(trainSelect().value).toBe('deep-c11-reducer-533'); // the train was never changed, so it is what the first render chose
  });

  it('falls back to the first site and train when the remembered ones are gone', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'gone', trainId: 'gone-too' }));
    await app();
    expect(siteSelect().value).toBe('fountain-hills');
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
  });

  it('says so, and falls back, when the remembered choice is damaged', async () => {
    window.localStorage.setItem(SELECTION_KEY, '{nope');
    await app();
    expect((await screen.findByRole('status')).textContent).toMatch(/saved site and train choice is damaged/);
    expect(trainSelect().value).toBe('deep-c11-reducer-533');
  });

  it('forgets the choice on Reset all', async () => {
    const user = userEvent.setup();
    await app();
    await user.selectOptions(trainSelect(), 'smart-seestar-s50');
    expect(storedPlans()!.plans[0].trainId).toBe('smart-seestar-s50');
    openGear();
    await resetAll(user);
    expect(window.localStorage.getItem(SELECTION_KEY)).toBeNull();
    openPlanTab();
    expect(trainSelect().value).toBe(sampleProfile().trains[0].id); // the sample's first train
  });
});

describe('"tonight" only when the date is tonight', () => {
  const tonight = () => {
    const s = base().sites[0];
    return defaultTonightDate(new Date(), s.longitude, s.timeZone);
  };

  it('says tonight on the default date', async () => {
    await app(base(), tonight());
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Best targets for tonight' })).toBeTruthy();
    expect(screen.getByTestId('target-list').getAttribute('aria-label')).toBe('Targets ranked for tonight');
  });

  it('says that night, with the date, on any other date, and follows the date picker both ways', async () => {
    await app(base(), '2026-12-15');
    expect(screen.getByRole('heading', { name: 'TUE 15 DEC' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Best targets for Tue 15 Dec' })).toBeTruthy();
    expect(screen.getByTestId('target-list').getAttribute('aria-label')).toBe('Targets ranked for Tue 15 Dec');
    expect(screen.getByRole('list', { name: 'Targets ranked for Tue 15 Dec' })).toBeTruthy();
    expect(screen.queryByText(/usable tonight/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: tonight() } });
    await ready();
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Best targets for tonight' })).toBeTruthy();
  });
});
