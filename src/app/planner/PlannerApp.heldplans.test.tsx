/**
 * @jest-environment jsdom
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY, serializeItinerary } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { MY_PLAN_KEY, sampleProfile, saveMyPlan } from '@/planner/state';
import { PLANS_BACKUP_KEY, PLANS_BACKUP_PREFIX, PLANS_KEY, listBackups } from '@/planner/state/plans';
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
const backups = () => listBackups(window.localStorage).map((b) => b.text);

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
    expect(held()!.textContent).toMatch(/from a newer planner/);
    expect(held()!.textContent).toMatch(/Replace the saved plans/);
    expect(held()!.textContent).toMatch(/Replace the saved plans/);
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
    expect(held()!.textContent).toMatch(/Another tab saved plans this page cannot use/);
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{"version":1,"plans":[{broken');
    expect(backups()).toEqual([]);
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
    expect(backups()).toEqual([V2]);
    expect(storedPlans()!.version).toBe(1);
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['Mine']);
    expect(held()).toBeNull();
  });
});

describe('M2: messages name buttons that exist', () => {
  it('the newer-version notice says exactly which button replaces the plans', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    await app();
    // The held box says it; the persistent line does not say it again.
    expect(held()!.textContent).toContain('Saved plans are from a newer planner.');
    expect(messages()).toBe('');
    expect(held()!.textContent).not.toMatch(/Start over/);
    expect(within(held()!).getByRole('button', { name: 'Replace the saved plans' })).toBeTruthy();
  });

  it('every button or box a notice names is on the page under that name', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    await newPlan(u);
    const spoken = [messages(), screen.getByRole('status').textContent ?? '', held()!.textContent ?? ''].join(' ');
    const named = [...spoken.matchAll(/["“]([^"”]+)["”]/g)].map((m) => m[1]);
    expect(held()!.textContent).not.toBe(messages());
    for (const name of named) expect(screen.getByRole('button', { name })).toBeTruthy();
    // The one other notice that names a control: the no-fit note names the box that lists them.
    expect(screen.queryAllByLabelText('Show non-fitting').length + screen.queryAllByText('Show non-fitting').length).toBeGreaterThan(0);
  });
});

describe('M3: a copy that cannot be kept holds the stored text', () => {
  const failBackup = () => {
    const set = Storage.prototype.setItem;
    return jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith(PLANS_BACKUP_PREFIX)) throw new Error('quota');
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
    expect(held()!.textContent).toMatch(/could not be read or copied/);
    expect(held()!.textContent).toMatch(/Copy failed: quota/);
    expect(messages()).not.toMatch(/could not be kept/); // the box says it; the line does not repeat it
    await newPlan(u);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(text);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' })); // the copy still fails: refused, nothing changes
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(text);
    expect(messages()).toMatch(/Not replaced, the saved plans are untouched: quota/);
    spy.mockRestore();
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(backups()).toEqual([text]);
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

describe('S1: a backup is never overwritten', () => {
  it('probe W: a copy of other plans is already kept: a damaged text gets its own copy, the earlier one stays, and nothing is held', async () => {
    window.localStorage.setItem(PLANS_BACKUP_KEY, V2);
    window.localStorage.setItem(PLANS_KEY, '{nope');
    const u = userEvent.setup();
    await app();
    expect(backups()).toEqual([V2, '{nope']); // the single old key is the oldest
    expect(held()).toBeNull();
    expect(messages()).toMatch(/A copy of the saved plans is kept as "fpo-planner-plans-v1\.bak\.\d+" \(2 backups\)/);
    await newPlan(u);
    expect(storedPlans()!.plans).toHaveLength(2);
    expect(backups()).toEqual([V2, '{nope']);
  });

  it('a copy that already holds the same text is not written again; Reset all clears every backup and says so', async () => {
    window.localStorage.setItem(PLANS_BACKUP_KEY, '{nope');
    window.localStorage.setItem(`${PLANS_BACKUP_PREFIX}5`, 'other');
    window.localStorage.setItem(PLANS_KEY, '{nope');
    const u = userEvent.setup();
    await app();
    expect(held()).toBeNull();
    expect(backups()).toEqual(['{nope', 'other']);
    expect(RESET_LOSES.join(' ')).toMatch(/every backup copy/);
    openGear();
    await resetAll(u);
    expect(backups()).toEqual([]);
    expect(window.localStorage.getItem(PLANS_BACKUP_KEY)).toBeNull();
  });

  it('Replace never overwrites a backup: it adds a copy of what is stored now; only the oldest beyond 5 goes', async () => {
    [1, 2, 3, 4, 5].forEach((n) => window.localStorage.setItem(`${PLANS_BACKUP_PREFIX}${n}`, `old ${n}`));
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(backups()).toEqual(['old 2', 'old 3', 'old 4', 'old 5', V2]);
    expect(messages()).toMatch(/The saved plans were replaced\. A copy of what was stored is kept as "fpo-planner-plans-v1\.bak\.\d+" \(5 backups\)/);
    expect(messages()).not.toMatch(/does not save over|leaves them untouched/);
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
    expect(messages()).toMatch(/lans were reset in another tab/);
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
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'My plan (from before)']);
    expect(storedPlans()!.plans[1].targets.map((t) => t.id)).toEqual(['m42', 'm13']);
    expect(storedPlan()!.id).toBe('plan-1'); // the plan that was open stays open
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(backups()).toEqual([V2]);
    expect(messages()).toMatch(/old plan and night timeline are now one more plan/);
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
    expect(messages()).toContain('Plan "Night 1": no usable date, set to Tue 15 Dec.');
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

// Two pages of one browser: they share one storage. The window sends no storage event to the page that wrote, so a test sends it by hand to the pages that did not.
describe('R4: a backup is never overwritten and a held page follows the other tab', () => {
  const two = async () => {
    const a = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const b = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await ready();
    return { a: within(a.container), b: within(b.container) };
  };
  const replace = (u: ReturnType<typeof userEvent.setup>, page: ReturnType<typeof within>) => u.click(page.getByRole('button', { name: 'Replace the saved plans' }));
  /** Every text kept under any plans key (the plans and each backup). */
  const kept = () => [...Array(window.localStorage.length).keys()].map((i) => window.localStorage.key(i)!).filter((k) => k.startsWith(PLANS_KEY)).map((k) => window.localStorage.getItem(k)!);

  it('two pages held on version 2 both press Replace (no event reached either): the version 2 text and the first page\'s plans are both in a backup', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    const { a, b } = await two();
    expect(a.getByTestId('plans-held')).toBeTruthy();
    await replace(u, a);
    const afterA = window.localStorage.getItem(PLANS_KEY)!;
    expect(backups()).toEqual([V2]);
    await replace(u, b); // page b still showed its box; what is stored now is page a's plans
    expect(backups()).toEqual([V2, afterA]);
    expect(kept()).toEqual(expect.arrayContaining([V2, afterA]));
    expect(storedPlans()!.version).toBe(1);
  });

  it('with the event delivered, an untouched held page takes the other tab\'s plans up, leaves the held state and says so', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    const { a, b } = await two();
    await replace(u, a);
    storageEvent(PLANS_KEY, window.localStorage.getItem(PLANS_KEY));
    expect(b.queryByTestId('plans-held')).toBeNull();
    expect(b.getByTestId('plans-messages').textContent).toMatch(/Another tab saved plans\. This page shows them/);
    expect(backups()).toEqual([V2]);
  });

  it('with the event delivered, a held page with changes of its own stays held on the new text; its Replace keeps both earlier texts', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    const { a, b } = await two();
    await u.click(within(b.getByTestId('plans-bar')).getByRole('button', { name: 'New' })); // b's edit is on screen only
    await replace(u, a);
    const afterA = window.localStorage.getItem(PLANS_KEY)!;
    storageEvent(PLANS_KEY, afterA);
    expect(b.getByTestId('plans-held').textContent).toMatch(/Your change is not saved/);
    await replace(u, b);
    expect(backups()).toEqual([V2, afterA]);
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'Plan 2']);
  });

  it('a held page follows damaged or newer text from another tab: the held text is the latest, so Replace keeps that one', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    const V3 = V2.replace('"version":2', '"version":3');
    window.localStorage.setItem(PLANS_KEY, V3);
    storageEvent(PLANS_KEY, V3);
    expect(held()!.textContent).toMatch(/newer planner/);
    window.localStorage.setItem(PLANS_KEY, '{nope');
    storageEvent(PLANS_KEY, '{nope');
    expect(held()!.textContent).toMatch(/Another tab saved plans this page cannot use/);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(backups()).toEqual(['{nope']); // the version 3 text was never stored by Replace's reading; it was overwritten by the other tab itself
  });

  it('focus re-checks a held page that missed the event: readable plans are taken up; other text updates the held text', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    await app();
    const V3 = V2.replace('"version":2', '"version":3');
    window.localStorage.setItem(PLANS_KEY, V3);
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(held()).not.toBeNull();
    window.localStorage.setItem(PLANS_KEY, v1('Theirs'));
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(held()).toBeNull();
    expect([...planSwitch().options].map((o) => o.textContent)).toEqual(['Theirs (1)']);
    expect(messages()).toMatch(/Another tab saved plans\. This page shows/);
  });

  it('Replace is described before the press and reported once after, with where the copy is', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    const u = userEvent.setup();
    await app();
    expect(held()!.textContent).toMatch(/Replace the saved plans/);
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(messages().match(/The saved plans were replaced/g)).toHaveLength(1);
    expect(held()).toBeNull();
  });

  it('Reset all removes the plans key last and a failed clear is reported, not called a reset', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    saveMyPlan(window.localStorage, ['m42']);
    window.localStorage.setItem(`${PLANS_BACKUP_PREFIX}7`, 'old');
    const u = userEvent.setup();
    await app();
    openGear();
    const order: string[] = [];
    const real = Storage.prototype.removeItem;
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      order.push(k);
      real.call(this, k);
    });
    await resetAll(u);
    expect(order[order.length - 1]).toBe(PLANS_KEY);
    expect(order).toEqual(expect.arrayContaining([MY_PLAN_KEY, `${PLANS_BACKUP_PREFIX}7`]));
    expect(backups()).toEqual([]);
  });

  it('a failed clear during Reset all is said as a failure, and the success toast is not shown', async () => {
    window.localStorage.setItem(PLANS_KEY, v1('Mine'));
    const u = userEvent.setup();
    await app();
    openGear();
    const real = Storage.prototype.removeItem;
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      if (k === PLANS_KEY) throw new Error('locked');
      real.call(this, k);
    });
    await resetAll(u);
    expect(messages()).toMatch(/Reset did not finish: could not clear the plans \(locked\)/);
    expect(screen.queryByText(/Reset: the planner is back/)).toBeNull();
  });

  it('Reset all in another tab: the other page finds nothing left to carry over, so it does not save a new plans key', async () => {
    window.localStorage.setItem(PLANS_KEY, V2);
    saveMyPlan(window.localStorage, ['m42', 'm13']);
    await app(); // held on V2; the old My plan list waits
    window.localStorage.clear(); // what the other tab's Reset all leaves, the plans key last
    storageEvent(PLANS_KEY, null);
    expect(window.localStorage.getItem(PLANS_KEY)).toBeNull();
    expect(held()).toBeNull();
    expect(messages()).toMatch(/reset in another tab/);
  });
});
