/**
 * @jest-environment jsdom
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY, serializeItinerary } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { MY_PLAN_KEY, sampleProfile, saveMyPlan } from '@/planner/state';
import { PLANS_BACKUP_KEY, PLANS_KEY } from '@/planner/state/plans';
import { RESET_LOSES } from './ResetAll';
import PlannerApp from './PlannerApp';
import { openGear, pageProps, planSwitch, ready, resetAll, storedPlan, storedPlans } from './testkit';

// Stored plans a page cannot use as they are stay held: not written over, in every tab and every failure, until the user presses
// "Replace the saved plans" (a copy first). Another tab's newer or damaged text, a copy that cannot be kept, a Reset in another tab.

const app = async () => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const savedPlan = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  createdAt: '2026-12-01T00:00:00.000Z',
  updatedAt: '2026-12-01T00:00:00.000Z',
  date: '2026-12-15',
  siteId: 'fountain-hills',
  trainId: sampleProfile().trains[0].id,
  startTime: null,
  targets: [],
  notes: '',
  ...extra,
});
const v1 = (...names: string[]) => JSON.stringify({ version: 1, openId: 'plan-1', plans: names.map((n, i) => savedPlan(`plan-${i + 1}`, n, { targets: [{ id: 'm31', preset: 'deep' }] })) });
const V2 = JSON.stringify({ version: 2, openId: 'plan-1', plans: [savedPlan('plan-1', 'Future plan')], extra: { shape: 'unknown' } });
const bar = () => screen.getByTestId('plans-bar');
const newPlan = (u: ReturnType<typeof userEvent.setup>) => u.click(within(bar()).getByRole('button', { name: 'New' }));
const storageEvent = (key: string | null, newValue: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
const messages = () => screen.queryByTestId('plans-messages')?.textContent ?? '';
const held = () => screen.queryByTestId('plans-held');

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('M1: another tab saves a newer or damaged text while this page is open', () => {
  it('the re-read before a write finds a version 2 text: it is held, said, and one edit leaves the stored bytes as they are', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    const u = userEvent.setup();
    await app();
    window.localStorage.setItem(PLANS_KEY, V2); // another tab; no storage event reaches this page
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(V2);
    expect(held()!.textContent).toMatch(/made by a newer version of the planner/);
    expect(held()!.textContent).toMatch(/not saved until you replace them/);
    expect(planSwitch().options).toHaveLength(2); // the edit shows on screen, unsaved
  });

  it('a storage event with a version 2 text holds the page at once; an edit leaves the stored bytes as they are', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    const u = userEvent.setup();
    await app();
    window.localStorage.setItem(PLANS_KEY, V2);
    storageEvent(PLANS_KEY, V2);
    expect(held()).not.toBeNull();
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(V2);
  });

  it('damaged text from another tab is held too, never written over without a copy', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    const u = userEvent.setup();
    await app();
    window.localStorage.setItem(PLANS_KEY, '{"version":1,"plans":[{broken');
    storageEvent(PLANS_KEY, '{"version":1,"plans":[{broken');
    expect(held()!.textContent).toMatch(/Another tab saved plans this page cannot use as they are/);
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{"version":1,"plans":[{broken');
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBeNull();
  });

  it('the held box shows on the Gear and site tab too, and Replace copies what is stored now, then saves this page\'s plans', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    const u = userEvent.setup();
    await app();
    window.localStorage.setItem(PLANS_KEY, V2);
    storageEvent(PLANS_KEY, V2);
    openGear();
    expect(held()).not.toBeNull();
    expect(held()!.closest('[role="tabpanel"]')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe(V2);
    expect(storedPlans()!.version).toBe(1);
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['Mine']);
    expect(held()).toBeNull();
  });
});

describe('M2: messages name buttons that exist', () => {
  it('the newer-version notice says exactly which button replaces the plans', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    await app();
    const text = messages();
    expect(text).toContain(
      'Your saved plans were made by a newer version of the planner. This version leaves them untouched and does not save over them. Use "Replace the saved plans" to save the plans on this page over them; a copy of them is kept first.',
    );
    expect(text).not.toMatch(/Start over/);
  });

  it('every button or box a notice names is on the page under that name', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    await newPlan(u);
    const spoken = [messages(), screen.getByRole('status').textContent ?? '', held()!.textContent ?? ''].join(' ');
    const named = [...spoken.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
    expect(named).toContain('Replace the saved plans');
    for (const name of named) expect(screen.getByRole('button', { name })).toBeTruthy();
    // The one other notice that names a control: the no-fit note names the box that lists them.
    expect(screen.queryAllByLabelText('Show targets that do not fit').length + screen.queryAllByText('Show targets that do not fit').length).toBeGreaterThan(0);
  });
});

describe('M3: a copy that cannot be kept holds the stored text', () => {
  const failBackup = () => {
    const set = Storage.prototype.setItem;
    return jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === PLANS_BACKUP_KEY) throw new Error('quota');
      set.call(this, k, v);
    });
  };
  const withBadPlan = () => {
    const plans = [1, 2].map((n) => savedPlan(`plan-${n}`, `Night ${n}`, { targets: [{ id: 'm31', preset: 'deep' }] })) as Record<string, unknown>[];
    plans[1].startTime = '9pm'; // cannot be repaired: left out of the loaded set
    return JSON.stringify({ version: 1, openId: 'plan-1', plans });
  };

  it('probe BF: a repaired load whose copy fails: an edit does not touch the stored bytes, and Replace is the way to save', async () => {
    const text = withBadPlan();
    window.localStorage.setItem(PLANS_KEY, text);
    const spy = failBackup();
    const u = userEvent.setup();
    await app();
    expect(held()!.textContent).toMatch(/could not be read whole, and a copy of them could not be kept first/);
    expect(messages()).toMatch(/A copy of the saved plans could not be kept \(quota\)/);
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(text);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' })); // the copy still fails: refused, nothing changes
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(text);
    expect(messages()).toMatch(/Not replaced, the saved plans are untouched: quota/);
    spy.mockRestore();
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe(text);
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['Night 1', 'Plan 2']);
    expect(held()).toBeNull();
  });

  it('damaged text whose copy fails is held the same way', async () => {
    window.localStorage.setItem(PLANS_KEY, '{nope');
    failBackup();
    const u = userEvent.setup();
    await app();
    expect(held()).not.toBeNull();
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{nope');
  });
});

describe('S1: the backup is never replaced by worse text', () => {
  it('probe W: a copy of other plans is already kept: a damaged text is held, the copy stays, and Replace is the explicit choice', async () => {
    window.localStorage.setItem(PLANS_BACKUP_KEY, V2);
    window.localStorage.setItem(PLANS_KEY, '{nope');
    const u = userEvent.setup();
    await app();
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe(V2);
    expect(messages()).toMatch(/a copy of other saved plans is already kept in this browser/);
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{nope');
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe(V2);
    expect(held()!.textContent).toMatch(/takes the place of the copy already kept/);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe('{nope');
    expect(storedPlans()!.plans).toHaveLength(2);
  });

  it('a copy that already holds the same text is simply kept; Reset all clears the backup and says so', async () => {
    window.localStorage.setItem(PLANS_BACKUP_KEY, '{nope');
    window.localStorage.setItem(PLANS_KEY, '{nope');
    const u = userEvent.setup();
    await app();
    expect(held()).toBeNull();
    expect(RESET_LOSES.join(' ')).toMatch(/backup copy/);
    openGear();
    await resetAll(u);
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBeNull();
  });
});

describe('S2: Reset all or a clear in another tab', () => {
  it('a storage event with no value reloads this page to a fresh state and says so; its next edit does not bring the old plans back', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine', 'Other'));
    const u = userEvent.setup();
    await app();
    window.localStorage.clear();
    storageEvent(PLANS_KEY, null);
    expect([...planSwitch().options].map((o) => o.textContent)).toEqual(['My plan (0)']);
    expect(messages()).toMatch(/The plans were reset in another tab/);
    await newPlan(u);
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'Plan 2']);
  });

  it('a clear of the whole storage (key null) is the same', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    await app();
    window.localStorage.clear();
    storageEvent(null, null);
    expect(messages()).toMatch(/reset in another tab/);
  });

  it('without an event, the re-read finds the key gone: the page starts fresh and the edit does not write the old plans back', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine', 'Other'));
    const u = userEvent.setup();
    await app();
    window.localStorage.clear();
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBeNull();
    expect(messages()).toMatch(/reset in another tab/);
    expect([...planSwitch().options].map((o) => o.textContent)).toEqual(['My plan (0)']);
  });
});

describe('S3: Replace carries over what the old keys held back', () => {
  it('the old My plan list becomes one more plan in the plans saved, and the old key is removed', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    saveMyPlan(window.localStorage, ['m42', 'm13']);
    const u = userEvent.setup();
    await app();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).not.toBeNull(); // held back while the newer plans are held
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'My plan']);
    expect(storedPlans()!.plans[1].targets.map((t) => t.id)).toEqual(['m42', 'm13']);
    expect(storedPlan()!.id).toBe('plan-1'); // the plan that was open stays open
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBe(V2);
    expect(messages()).toMatch(/old plan and night timeline from before plans were carried over as one more plan/);
  });
});

describe('S5 and S6: messages stay until dismissed, in the page\'s words', () => {
  it('a repair says so in a line above the tabs, on both tabs, until dismissed (not as a toast)', async () => {
    const plans = [savedPlan('plan-1', 'Night 1', { date: 'soon' })];
    window.localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 1, openId: 'plan-1', plans }));
    const u = userEvent.setup();
    await app();
    expect(screen.queryByRole('status')).toBeNull();
    // S6: the repaired date is the page's date text, not ISO.
    expect(messages()).toContain('The plan "Night 1" had no usable date, so it is set to Tue 15 Dec.');
    expect(messages()).not.toMatch(/2026-12-15/);
    openGear();
    expect(screen.getByTestId('plans-messages')).toBeTruthy();
    await u.click(within(screen.getByTestId('plans-messages')).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('plans-messages')).toBeNull();
  });

  it('plans that cannot be saved are said in the persistent line', async () => {
    const u = userEvent.setup();
    await app();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await newPlan(u);
    expect(messages()).toMatch(/Plans not saved, so they are lost on reload: quota/);
  });

  it('the 50-target cut names the targets, not catalog ids', async () => {
    const filler = Array.from({ length: 49 }, (_, i) => `zz${i}`);
    saveMyPlan(window.localStorage, [...filler, 'm31']);
    const item: ItineraryItem = { id: 's1', targetId: 'm42', trainId: 'deep-c11-2600', filterId: null, mode: 'deep', note: '' };
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([item], null)); // the itinerary's slot goes first, so the end of My plan is cut
    await app();
    await screen.findByText(/left out: Andromeda Galaxy/, { selector: '[data-testid="plans-messages"] *' });
    expect(messages()).not.toMatch(/left out: m31/);
  });
});

describe('the plans saved are still the open plan\'s', () => {
  it('Replace with nothing held back saves the plans on screen', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    await newPlan(u);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'Plan 2']);
  });
});
