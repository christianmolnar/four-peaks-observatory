/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CAPTURED_KEY, MY_PLAN_KEY, PROFILE_KEY, SELECTION_KEY, sampleProfile } from '@/planner/state';
import { ITINERARY_KEY } from '@/planner/itinerary';
import PlannerApp from './PlannerApp';
import { RESET_LOSES } from './ResetAll';
import { pageProps, ready } from './testkit';

// Reset all: one confirmed button in the Profile area that returns the page to what a first visit shows.

const KEYS = [PROFILE_KEY, SELECTION_KEY, MY_PLAN_KEY, ITINERARY_KEY, CAPTURED_KEY];
const siteSelect = () => screen.getByLabelText('Site') as HTMLSelectElement;
const resetButton = () => screen.getByRole('button', { name: 'Reset all' });
const confirmBox = () => screen.queryByTestId('reset-confirm');
const itinerarySlots = () =>
  within(screen.getByRole('region', { name: 'NIGHT ITINERARY' })).queryAllByRole('listitem').filter((li) => /^slot-s\d/.test(li.getAttribute('data-testid') ?? '') && !li.getAttribute('data-testid')!.startsWith('slot-time'));
const myPlanNames = () => within(screen.getByRole('region', { name: /^MY PLAN/ })).queryAllByRole('listitem');

/** A visitor who has set everything up: their own site and a train choice, a plan, an itinerary, a tick. */
const seed = () => {
  const p = sampleProfile();
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, sites: p.sites.map((s, i) => (i === 0 ? { ...s, name: 'Backyard' } : s)) }));
  window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: p.sites[0].id, trainId: 'smart-seestar-s50' }));
  window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['ngc891'] }));
  window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 2, items: [{ id: 's1', targetId: 'm31', trainId: 'deep-c11-2600', filterId: null, mode: 'balanced', note: 'mine' }], startTime: null }));
  window.localStorage.setItem(CAPTURED_KEY, JSON.stringify(['m31']));
};
const mount = async () => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" />);
  await ready();
  return r;
};

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('Reset all', () => {
  it('opens an in-page confirmation (no browser dialog) that names what is lost and puts focus on Cancel', async () => {
    const confirm = jest.spyOn(window, 'confirm');
    seed();
    await mount();
    const u = userEvent.setup();
    expect(confirmBox()).toBeNull();
    await u.click(resetButton());
    const box = confirmBox()!;
    expect(box).toBeTruthy();
    for (const line of RESET_LOSES) expect(within(box).getByText(line)).toBeTruthy();
    expect(box.textContent).toMatch(/sites.*horizon.*Minimum altitude/);
    expect(box.textContent).toMatch(/scopes, cameras, filters, accessories and trains/);
    expect(box.textContent).toMatch(/My plan/);
    expect(box.textContent).toMatch(/night itinerary/);
    expect(box.textContent).toMatch(/remembered site and train choice/);
    expect(document.activeElement).toBe(within(box).getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(KEYS.every((k) => window.localStorage.getItem(k) !== null)).toBe(true); // opening changes nothing
  });

  it('Cancel changes nothing and returns focus to Reset all', async () => {
    seed();
    const before = KEYS.map((k) => window.localStorage.getItem(k));
    await mount();
    const u = userEvent.setup();
    await waitFor(() => expect(siteSelect().textContent).toContain('Backyard'));
    await u.click(resetButton());
    await u.click(within(confirmBox()!).getByRole('button', { name: 'Cancel' }));
    expect(confirmBox()).toBeNull();
    expect(document.activeElement).toBe(resetButton());
    expect(KEYS.map((k) => window.localStorage.getItem(k))).toEqual(before);
    expect(siteSelect().textContent).toContain('Backyard');
    expect(itinerarySlots()).toHaveLength(1);
    expect(myPlanNames().length).toBeGreaterThan(0);
  });

  it('confirming clears the stored profile, choice, plan, itinerary and ticks, and the page shows the sample again', async () => {
    seed();
    await mount();
    const u = userEvent.setup();
    await waitFor(() => expect(siteSelect().textContent).toContain('Backyard'));
    expect(itinerarySlots()).toHaveLength(1);
    expect((screen.getByLabelText('Train') as HTMLSelectElement).value).toBe('smart-seestar-s50');
    await u.click(resetButton());
    await u.click(within(confirmBox()!).getByRole('button', { name: 'Yes, reset everything' }));
    for (const k of KEYS) expect(window.localStorage.getItem(k)).toBeNull();
    expect(confirmBox()).toBeNull();
    expect(siteSelect().textContent).toContain('Fountain Hills');
    expect(siteSelect().textContent).not.toContain('Backyard');
    expect((screen.getByLabelText('Train') as HTMLSelectElement).value).toBe(sampleProfile().trains[0].id);
    expect(myPlanNames()).toHaveLength(0);
    expect(itinerarySlots()).toHaveLength(0);
    expect((screen.getByLabelText(/^Minimum altitude \(deg\)/) as HTMLInputElement).value).toBe('20');
    expect(screen.getByRole('status').textContent).toBe('Reset: the planner is back to its starting point.');
    await waitFor(() => expect(document.activeElement).toBe(resetButton()));
  });

  it('after a reload the page is still the starting point', async () => {
    seed();
    const first = await mount();
    const u = userEvent.setup();
    await u.click(resetButton());
    await u.click(within(confirmBox()!).getByRole('button', { name: 'Yes, reset everything' }));
    first.unmount();
    await mount(); // a new page over the same storage
    expect(siteSelect().textContent).toContain('Fountain Hills');
    expect(myPlanNames()).toHaveLength(0);
    expect(itinerarySlots()).toHaveLength(0);
    for (const k of KEYS) expect(window.localStorage.getItem(k)).toBeNull();
  });

  it('the empty-profile screen offers it too', async () => {
    const empty = { ...sampleProfile(), sites: [], plans: [] };
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={empty} />);
    const u = userEvent.setup();
    await u.click(resetButton());
    await u.click(screen.getByRole('button', { name: 'Yes, reset everything' }));
    await screen.findByTestId('target-list', {}, { timeout: 20000 });
  });

  it('no "Replace profile with sample" button is left anywhere on the page', async () => {
    await mount();
    expect(screen.queryByText(/Replace profile with sample/)).toBeNull();
  });
});
