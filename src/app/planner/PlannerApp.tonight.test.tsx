/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, act, fireEvent, within } from '@testing-library/react';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { SELECTION_KEY, defaultTonightDate, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { listRows, pageProps, ready } from './testkit';

// Every "tonight" on the page follows the date picked, and the date follows the clock on a page left open.

const profile = () => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === 'deep-c11-reducer-533' ? -1 : 1)) };
};
const site = () => profile().sites[0];
// Slots that cannot be placed fill the itinerary's "not clear" lines too.
const slots = [
  { id: 's1', targetId: 'm31', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' },
  { id: 's2', targetId: 'm42', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' },
];
const app = async (initialDate?: string) => {
  const r = render(<PlannerApp {...pageProps} {...(initialDate ? { initialDate } : {})} initialProfile={profile()} />);
  await ready();
  return r;
};
/** Opens the solar-system group and its first row; returns that row's solar-system detail. */
const openFirstBody = (): HTMLElement => {
  const group = screen.getByRole('button', { name: /^Solar system \(/ });
  if (group.getAttribute('aria-expanded') === 'false') fireEvent.click(group);
  const row = listRows('planet-list')[0];
  fireEvent.click(within(row).getByRole('button', { expanded: false }));
  return screen.getByTestId(/^solar-detail-/);
};
const pageText = () => document.body.textContent ?? '';

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 1, items: slots }));
});
afterEach(() => {
  cleanup();
  jest.useRealTimers();
});

describe('"tonight" in every section follows the date', () => {
  it('on 2026-12-15 no text says tonight, and the date is shown the way the date picker shows it', async () => {
    await app('2026-12-15');
    expect(pageText()).not.toMatch(/tonight/i);
    expect(pageText()).toMatch(/Tue 15 Dec/i);
    expect(screen.getByRole('heading', { name: 'TUE 15 DEC' })).toBeTruthy();
    expect(screen.getByTestId('timeline-estimate').textContent).toBe('Estimates');
    expect(openFirstBody().textContent).toMatch(/: Tue 15 Dec/);
  });

  it('on the real tonight the sections say tonight', async () => {
    const s = site();
    await app(defaultTonightDate(new Date(), s.longitude, s.timeZone));
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByTestId('timeline-estimate').textContent).toBe('Estimates');
    expect(openFirstBody().textContent).toMatch(/: tonight/);
  });
});

describe('the date follows the clock on a page left open', () => {
  const PHX = { longitude: -112, timeZone: 'America/Phoenix' };
  // Dawn at 06:00 site time is when the evening's date rolls over (defaultTonightDate); Phoenix has no daylight saving.
  const at = (iso: string) => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(iso));
  };

  it('"tonight" becomes "Sat 21 Nov" when the site clock passes 06:00, with no reload', async () => {
    at('2026-11-14T12:58:00Z'); // 05:58 MST on Nov 14: still the Nov 13 evening
    expect(defaultTonightDate(new Date(), PHX.longitude, PHX.timeZone)).toBe('2026-11-13');
    await app('2026-11-13');
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    act(() => { jest.advanceTimersByTime(30000); }); // 05:58:30, same night
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    act(() => { jest.advanceTimersByTime(90000); }); // 06:00 and a bit
    expect(screen.getByRole('heading', { name: 'FRI 13 NOV' })).toBeTruthy();
    // The plan is still for the 13th: it says that night has passed, offers Move to tonight, and changes nothing by itself.
    expect(screen.getByTestId('plan-past').textContent).toBe('Plan date passedMove to tonight');
    expect(pageText().replace('Move to tonight', '')).not.toMatch(/tonight/i);
  });

  it('local midnight does not change the night (it is still the same evening until 06:00)', async () => {
    at('2026-11-14T06:59:00Z'); // 23:59 MST Nov 13
    await app('2026-11-13');
    act(() => { jest.advanceTimersByTime(3 * 60000); }); // 00:02 Nov 14
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
  });

  it('is re-read when the tab becomes visible again, before the next minute tick', async () => {
    at('2026-11-14T12:58:00Z');
    await app('2026-11-13');
    jest.setSystemTime(new Date('2026-11-14T13:30:00Z')); // the tab slept past dawn: no timer has fired
    act(() => { fireEvent(document, new Event('visibilitychange')); });
    expect(screen.getByRole('heading', { name: 'FRI 13 NOV' })).toBeTruthy();
  });
});

describe('a damaged saved site and train choice', () => {
  it('is reported once and then removed, so a reload is quiet', async () => {
    window.localStorage.setItem(SELECTION_KEY, '{nope');
    await app('2026-12-15');
    expect((await screen.findByRole('status')).textContent).toMatch(/damaged/);
    expect(window.localStorage.getItem(SELECTION_KEY)).toBeNull();
    cleanup();
    await app('2026-12-15');
    expect(screen.queryByText(/damaged/)).toBeNull();
  });
});
