/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CAPTURED_KEY, MY_PLAN_KEY, PROFILE_KEY, SELECTION_KEY, sampleProfile } from '@/planner/state';
import { PLANS_KEY } from '@/planner/state/plans';
import { ITINERARY_KEY } from '@/planner/itinerary';
import PlannerApp from './PlannerApp';
import { RESET_LOSES } from './ResetAll';
import { openGear, openPlanTab, pageProps, planRowItems, planSwitch, ready, storedPlans, timelineSlots } from './testkit';

// Reset all: one confirmed button in the Profile area that returns the page to what a first visit shows.

const SEEDED = [PROFILE_KEY, SELECTION_KEY, PLANS_KEY, CAPTURED_KEY];
const KEYS = [...SEEDED, MY_PLAN_KEY, ITINERARY_KEY]; // the last two are the old plan and itinerary: gone once moved into plans
const siteSelect = () => screen.getByLabelText('Site') as HTMLSelectElement;
const resetButton = () => screen.getByRole('button', { name: 'Reset all' });
const confirmBox = () => screen.queryByTestId('reset-confirm');
const myPlanNames = () => planRowItems();

/** A visitor who has set everything up: their own site and a train choice, two saved plans, a tick. */
const seed = () => {
  const p = sampleProfile();
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, sites: p.sites.map((s, i) => (i === 0 ? { ...s, name: 'Backyard' } : s)) }));
  window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: p.sites[0].id, trainId: 'smart-seestar-s50' }));
  const plan = (id: string, name: string, targets: object[]) => ({ id, name, createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-15', siteId: p.sites[0].id, trainId: 'smart-seestar-s50', startTime: null, targets, notes: '' });
  window.localStorage.setItem(
    PLANS_KEY,
    JSON.stringify({ version: 1, openId: 'plan-1', plans: [plan('plan-1', 'Backyard night', [{ id: 'ngc891', preset: 'balanced' }, { id: 'm31', preset: 'deep', note: 'mine' }]), plan('plan-2', 'Camping trip', [{ id: 'm42', preset: 'quick' }])] }),
  );
  window.localStorage.setItem(CAPTURED_KEY, JSON.stringify(['m31']));
};
const mount = async () => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" />);
  await ready();
  openGear(); // Reset all is in the Gear and site tab
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
    expect(box.textContent).toMatch(/Your plans: every saved plan/);
    expect(box.textContent).not.toMatch(/itinerary/i);
    expect(box.textContent).toMatch(/remembered site and train choice/);
    expect(document.activeElement).toBe(within(box).getByRole('button', { name: 'Cancel' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(SEEDED.every((k) => window.localStorage.getItem(k) !== null)).toBe(true); // opening changes nothing
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
    expect(timelineSlots()).toHaveLength(2);
    openPlanTab();
    expect(myPlanNames().length).toBeGreaterThan(0);
    expect(planSwitch().textContent).toContain('Backyard night');
  });

  it('confirming clears the stored profile, choice, every plan and the ticks, and the page shows the sample and one empty plan again', async () => {
    seed();
    await mount();
    const u = userEvent.setup();
    await waitFor(() => expect(siteSelect().textContent).toContain('Backyard'));
    expect(timelineSlots()).toHaveLength(2);
    expect((screen.getByLabelText('Train') as HTMLSelectElement).value).toBe('smart-seestar-s50');
    await u.click(resetButton());
    await u.click(within(confirmBox()!).getByRole('button', { name: 'Yes, reset everything' }));
    for (const k of KEYS) expect(window.localStorage.getItem(k)).toBeNull();
    expect(confirmBox()).toBeNull();
    expect(siteSelect().textContent).toContain('Fountain Hills');
    expect(siteSelect().textContent).not.toContain('Backyard');
    expect((screen.getByLabelText('Train') as HTMLSelectElement).value).toBe(sampleProfile().trains[0].id);
    expect(timelineSlots()).toHaveLength(0);
    openPlanTab();
    expect(myPlanNames()).toHaveLength(0);
    expect(screen.getByRole('heading', { name: 'PLAN: My plan (0 targets)' })).toBeTruthy();
    expect(planSwitch().options).toHaveLength(1); // the two saved plans are gone
    expect((screen.getByLabelText(/^Minimum altitude \(deg\)/) as HTMLInputElement).value).toBe('20');
    expect(screen.getByRole('status').textContent).toBe('Reset: the planner is back to its starting point.');
    openGear();
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
    expect(timelineSlots()).toHaveLength(0);
    openPlanTab();
    expect(myPlanNames()).toHaveLength(0);
    expect(storedPlans()).toBeNull();
    for (const k of KEYS) expect(window.localStorage.getItem(k)).toBeNull();
  });

  it('the empty-profile screen offers it too', async () => {
    const empty = { ...sampleProfile(), sites: [], plans: [] };
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={empty} />);
    const u = userEvent.setup();
    await u.click(resetButton());
    await u.click(screen.getByRole('button', { name: 'Yes, reset everything' }));
    await screen.findByTestId('target-list', {}, { timeout: 20000 });
    expect(storedPlans()).toBeNull();
  });

  it('no "Replace profile with sample" button is left anywhere on the page', async () => {
    await mount();
    expect(screen.queryByText(/Replace profile with sample/)).toBeNull();
  });
});
