/**
 * @jest-environment jsdom
 */
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY, serializeItinerary } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { MY_PLAN_KEY, defaultTonightDate, sampleProfile, saveMyPlan } from '@/planner/state';
import { EXPOSURE_NOTICE_KEY, PLANS_BACKUP_KEY, PLANS_KEY, listBackups } from '@/planner/state/plans';

const backups = () => listBackups(window.localStorage).map((b) => b.text);
import PlannerApp from './PlannerApp';
import { openGear, pageProps, planSwitch, ready, storedPlan, storedPlans } from './testkit';

// Saved work is never lost silently: what the old keys held becomes the plan in the old order, stored plans that cannot be used whole are
// kept (never removed), a plan whose night has passed says so, and two open tabs do not erase each other's plans.

const app = async (initialDate = '2026-12-15') => {
  const r = render(<PlannerApp {...pageProps} initialDate={initialDate} initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const heading = () => screen.getByRole('region', { name: /^PLAN:/ }).querySelector('h2')!.textContent;
const switchNames = () => [...planSwitch().options].map((o) => o.textContent);
// What the page says: the toast and the persistent line about the saved plans.
const status = () => [screen.queryByRole('status')?.textContent, screen.queryByTestId('plans-messages')?.textContent].filter(Boolean).join(' | ');
const tonight = () => {
  const s = sampleProfile().sites[0];
  return defaultTonightDate(new Date(), s.longitude, s.timeZone);
};
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
const slot = (n: number, targetId: string, mode: ItineraryItem['mode'], note = ''): ItineraryItem => ({ id: `s${n}`, targetId, trainId: 'deep-c11-2600', filterId: null, mode, note });
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
const planIds = () => storedPlan()!.targets.map((t) => t.id);
const bar = () => screen.getByTestId('plans-bar');

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => {
  window.localStorage.clear();
  // jsdom has no Blob.text
  if (!Blob.prototype.text) {
    Blob.prototype.text = function (this: Blob) {
      return new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(this);
      });
    };
  }
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('the old night timeline keeps its order', () => {
  it('case A: itinerary [M42, M31] over My plan [M31, NGC 7000, M42, M13]: the plan opens M42, M31, NGC 7000, M13 and the timeline is M42 then M31', async () => {
    saveMyPlan(window.localStorage, ['m31', 'ngc7000', 'm42', 'm13']);
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([slot(1, 'm42', 'deep', 'first'), slot(2, 'm31', 'quick')], '21:30'));
    await app();
    expect(planIds()).toEqual(['m42', 'm31', 'ngc7000', 'm13']);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm42', preset: 'deep', note: 'first' });
    expect(storedPlan()!.startTime).toBe('21:30');
    const slots = [...document.querySelectorAll('#night-timeline-body ol[aria-label="Night timeline, in order"] > li')];
    expect(slots.slice(0, 2).map((li) => li.textContent)).toEqual([expect.stringMatching(/Orion Nebula/), expect.stringMatching(/Andromeda/)]);
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(window.localStorage.getItem(ITINERARY_KEY)).toBeNull();
  });

  it('case B: ten in My plan and two other itinerary slots: both slots are the first two and are on the timeline', async () => {
    const mine = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'];
    saveMyPlan(window.localStorage, mine);
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([slot(1, 'm42', 'deep'), slot(2, 'ngc7000', 'quick')], null));
    await app();
    expect(planIds()).toEqual(['m42', 'ngc7000', ...mine]);
    const slots = [...document.querySelectorAll('#night-timeline-body ol[aria-label="Night timeline, in order"] > li')];
    expect(slots[0].textContent).toMatch(/Orion Nebula/);
    expect(slots[1].textContent).toMatch(/North America|7000/);
  });

  it('case C: two slots for one target merge, and the page says a repeated slot was merged', async () => {
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([slot(1, 'm42', 'deep', 'Ha pass'), slot(2, 'm42', 'quick', 'OIII pass')], null));
    await app();
    expect(storedPlan()!.targets).toEqual([{ id: 'm42', preset: 'deep', note: 'Ha pass / OIII pass' }]);
    expect(status()).toMatch(/A repeated slot in your night timeline was merged into one \(m42\)/);
  });

  it('S7: the orphan exposure notice is removed with the old keys, and by Reset all', async () => {
    saveMyPlan(window.localStorage, ['m31']);
    window.localStorage.setItem(EXPOSURE_NOTICE_KEY, '1');
    const first = await app();
    expect(window.localStorage.getItem(EXPOSURE_NOTICE_KEY)).toBeNull();
    first.unmount();
    window.localStorage.setItem(EXPOSURE_NOTICE_KEY, '1');
    window.localStorage.setItem(PLANS_BACKUP_KEY, 'old copy');
    await app();
    openGear();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Reset all' }));
    await u.click(screen.getByRole('button', { name: 'Yes, reset everything' }));
    expect(window.localStorage.getItem(EXPOSURE_NOTICE_KEY)).toBeNull();
    expect(backups()).toEqual([]);
  });

  it('S3 (J): a My plan key the browser cannot read stays in storage; the itinerary still moves', async () => {
    saveMyPlan(window.localStorage, ['m31']);
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([slot(1, 'm42', 'deep')], null));
    const get = Storage.prototype.getItem;
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === MY_PLAN_KEY) throw new Error('denied');
      return get.call(this, k);
    });
    await app();
    expect(planIds()).toEqual(['m42']);
    expect(status()).toMatch(/Your plan could not be read.*denied/);
    jest.restoreAllMocks();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(ITINERARY_KEY)).toBeNull();
  });

  it('S3 (K): an itinerary key the browser cannot read stays in storage; My plan still moves', async () => {
    saveMyPlan(window.localStorage, ['m31']);
    window.localStorage.setItem(ITINERARY_KEY, serializeItinerary([slot(1, 'm42', 'deep')], null));
    const get = Storage.prototype.getItem;
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === ITINERARY_KEY) throw new Error('denied');
      return get.call(this, k);
    });
    await app();
    expect(planIds()).toEqual(['m31']);
    jest.restoreAllMocks();
    expect(window.localStorage.getItem(ITINERARY_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
  });

  it('S2: when the plans cannot be saved, it says the old plan stays and moves again next time; the old keys are kept', async () => {
    saveMyPlan(window.localStorage, ['m31', 'm42']);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await app();
    expect(heading()).toBe('PLAN: My plan (from before) (2 targets)');
    expect(status()).toMatch(/carried over but could not be saved: quota\. Your old plan stays in this browser and is carried over again the next time the page opens\./);
    expect(status()).not.toMatch(/lost on reload/);
    jest.restoreAllMocks();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).not.toBeNull();
  });

  it('S2: when the plans were saved and only the old keys could not be removed, it says the saved plan is used from now on', async () => {
    saveMyPlan(window.localStorage, ['m31', 'm42']);
    const remove = Storage.prototype.removeItem;
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      if (k === MY_PLAN_KEY) throw new Error('denied');
      remove.call(this, k);
    });
    await app();
    expect(status()).toMatch(/Your plan was saved, but its old copy could not be removed: denied\. The saved plan is used from now on/);
    expect(status()).not.toMatch(/lost on reload|carried over again/);
    expect(storedPlans()!.plans).toHaveLength(1);
  });
});

describe('stored plans that cannot be used whole are never removed', () => {
  const five = (patch: (p: Record<string, unknown>[]) => void) => {
    const plans = [1, 2, 3, 4, 5].map((n) => savedPlan(`plan-${n}`, `Night ${n}`, { targets: [{ id: 'm31', preset: 'deep' }] })) as Record<string, unknown>[];
    patch(plans);
    return JSON.stringify({ version: 1, openId: 'plan-2', plans });
  };

  it('M3: a copy made by version 2 is said to be from a newer version, is kept as it is, and is not overwritten by an edit', async () => {
    const v2 = JSON.stringify({ version: 2, openId: 'plan-1', plans: [savedPlan('plan-1', 'Future plan')], extra: { shape: 'unknown' } });
    window.localStorage.setItem(PLANS_KEY, v2);
    const u = userEvent.setup();
    await app();
    expect(status()).not.toMatch(/newer version/); // the held box says it, the line does not repeat it
    expect(screen.getByTestId('plans-held').textContent).toMatch(/newer version of the planner/);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(v2);
    await u.click(within(bar()).getByRole('button', { name: 'New' })); // an edit
    expect(switchNames()).toEqual(['My plan (0)', 'Plan 2 (0)']);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(v2); // still untouched
    expect(backups()).toEqual([]);
  });

  it('M3: a newer-version copy is replaced only when the user chooses, and a copy is kept first', async () => {
    const v2 = JSON.stringify({ version: 2, openId: 'plan-1', plans: [savedPlan('plan-1', 'Future plan')] });
    window.localStorage.setItem(PLANS_KEY, v2);
    const u = userEvent.setup();
    await app();
    await u.click(within(bar()).getByRole('button', { name: 'New' }));
    await u.click(screen.getByRole('button', { name: 'Replace the saved plans' }));
    expect(backups()).toEqual([v2]);
    expect(storedPlans()!.version).toBe(1);
    expect(storedPlans()!.plans).toHaveLength(2);
    expect(screen.queryByTestId('plans-held')).toBeNull();
  });

  it('a newer-version copy keeps the old keys waiting: nothing is carried over while it is held', async () => {
    window.localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 2, openId: 'plan-1', plans: [savedPlan('plan-1', 'Future plan')] }));
    saveMyPlan(window.localStorage, ['m31']);
    await app();
    expect(heading()).toBe('PLAN: My plan (0 targets)');
    expect(window.localStorage.getItem(MY_PLAN_KEY)).not.toBeNull();
  });

  it('M3: one plan with an unknown preset among five: all five open, the preset is Balanced, it is said, and the original text is copied to the backup', async () => {
    const text = five((p) => { p[3].targets = [{ id: 'm31', preset: 'huge' }]; });
    window.localStorage.setItem(PLANS_KEY, text);
    await app();
    expect(switchNames()).toEqual(['Night 1 (1)', 'Night 2 (1)', 'Night 3 (1)', 'Night 4 (1)', 'Night 5 (1)']);
    expect(heading()).toBe('PLAN: Night 2 (1 target)');
    expect(status()).toMatch(/In the plan "Night 4", 1 target had a preset this version does not know, so it is set to Balanced\./);
    expect(backups()).toEqual([text]);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe(text); // kept until the next save
  });

  it('M3: a plan that cannot be repaired is left out alone and named; the others open', async () => {
    const text = five((p) => { p[0].startTime = '9pm'; });
    window.localStorage.setItem(PLANS_KEY, text);
    await app();
    expect(switchNames()).toEqual(['Night 2 (1)', 'Night 3 (1)', 'Night 4 (1)', 'Night 5 (1)']);
    expect(status()).toMatch(/The plan "Night 1" could not be read and is left out/);
    expect(backups()).toEqual([text]);
  });

  it('M3: damaged text starts one empty plan, is said, is copied to the backup, and stays until the next save', async () => {
    window.localStorage.setItem(PLANS_KEY, '{nope');
    const first = await app();
    expect(status()).toMatch(/Your saved plans could not be read, so they start over with one empty plan\. A copy of the saved plans as they were is kept under the backup name/);
    expect(backups()).toEqual(['{nope']);
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{nope');
    expect(heading()).toBe('PLAN: My plan (0 targets)');
    first.unmount();
    expect(backups()).toEqual(['{nope']);
  });
});

describe('a plan whose night has passed says so', () => {
  const withPlan = async (date: string) => {
    window.localStorage.setItem(
      PLANS_KEY,
      JSON.stringify({
        version: 1,
        openId: 'plan-1',
        plans: [savedPlan('plan-1', 'Orion night', { date, trainId: 'smart-seestar-s50', targets: [{ id: 'm42', preset: 'deep', note: 'first' }, { id: 'm31', preset: 'quick' }], startTime: '21:30' })],
      }),
    );
    return app();
  };

  it('the first day after it was saved: one line with the date, and nothing is changed until Move to tonight', async () => {
    const yesterday = dayBefore(tonight());
    await withPlan(yesterday);
    const line = screen.getByTestId('plan-past');
    expect(line.textContent).toMatch(/^This plan is for (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} \w{3}, which has passed\.Move to tonight$/);
    expect(storedPlan()!.date).toBe(yesterday); // no silent change
    expect(screen.getByLabelText('Evening of')).toBeTruthy();
  });

  it('Move to tonight sets the date and keeps targets, presets, notes, site, train and start time', async () => {
    const u = userEvent.setup();
    await withPlan(dayBefore(tonight()));
    await u.click(within(screen.getByTestId('plan-past')).getByRole('button', { name: 'Move to tonight' }));
    const plan = storedPlan()!;
    expect(plan.date).toBe(tonight());
    expect(plan.targets).toEqual([{ id: 'm42', preset: 'deep', note: 'first' }, { id: 'm31', preset: 'quick' }]);
    expect(plan.siteId).toBe('fountain-hills');
    expect(plan.trainId).toBe('smart-seestar-s50');
    expect(plan.startTime).toBe('21:30');
    expect(screen.queryByTestId('plan-past')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: /^PLAN:/ }));
  });

  it('tonight and a later night say nothing', async () => {
    const first = await withPlan(tonight());
    expect(screen.queryByTestId('plan-past')).toBeNull();
    first.unmount();
    await withPlan('2099-01-01');
    expect(screen.queryByTestId('plan-past')).toBeNull();
  });

  it('the line is per plan: another plan on tonight shows none', async () => {
    const u = userEvent.setup();
    await withPlan(dayBefore(tonight()));
    await u.click(within(bar()).getByRole('button', { name: 'New' }));
    expect(screen.queryByTestId('plan-past')).toBeNull();
    await u.selectOptions(planSwitch(), 'plan-1');
    expect(screen.getByTestId('plan-past')).toBeTruthy();
  });
});

describe('two open tabs do not erase each other', () => {
  const tabB = (plans: object[], openId = 'plan-1') => JSON.stringify({ version: 1, openId, plans });

  it('S1: a storage event for the plans reloads them, and this tab\'s open plan stays open', async () => {
    const u = userEvent.setup();
    await app();
    await u.click(within(bar()).getByRole('button', { name: 'New' })); // plan-2 open, saved
    const ours = storedPlans()!;
    const other = tabB([...ours.plans, savedPlan('plan-3', 'Made in tab B')], 'plan-3');
    window.localStorage.setItem(PLANS_KEY, other);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PLANS_KEY, newValue: other, storageArea: window.localStorage }));
    });
    expect(switchNames()).toEqual(['My plan (0)', 'Plan 2 (0)', 'Made in tab B (0)']);
    expect(heading()).toBe('PLAN: Plan 2 (0 targets)');
  });

  it('S1: before it writes, a tab takes up what another tab saved, so the other tab\'s plan is not erased', async () => {
    const u = userEvent.setup();
    await app();
    await u.click(within(bar()).getByRole('button', { name: 'New' }));
    const ours = storedPlans()!;
    window.localStorage.setItem(PLANS_KEY, tabB([...ours.plans, savedPlan('plan-3', 'Made in tab B')], ours.openId)); // no event delivered
    await u.click(within(bar()).getByRole('button', { name: 'Rename' }));
    await u.clear(screen.getByLabelText('Plan name'));
    await u.type(screen.getByLabelText('Plan name'), 'Renamed{Enter}');
    expect(storedPlans()!.plans.map((p) => p.name)).toEqual(['My plan', 'Renamed', 'Made in tab B']);
    expect(switchNames()).toEqual(['My plan (0)', 'Renamed (0)', 'Made in tab B (0)']);
  });

  it('an event for another key, or text that is not a whole set of plans, changes nothing', async () => {
    await app();
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: tabB([savedPlan('plan-9', 'Nope')]) }));
      window.dispatchEvent(new StorageEvent('storage', { key: PLANS_KEY, newValue: '{nope' }));
    });
    expect(switchNames()).toEqual(['My plan (0)']);
  });
});

describe('Delete, Import and Reset say what they do', () => {
  it('S4: after Delete, focus is on the plans switcher', async () => {
    const u = userEvent.setup();
    await app();
    await u.click(within(bar()).getByRole('button', { name: 'New' }));
    await u.click(within(bar()).getByRole('button', { name: 'Delete' }));
    await u.click(screen.getByRole('button', { name: 'Yes, delete Plan 2' }));
    expect(switchNames()).toEqual(['My plan (0)']);
    expect(document.activeElement).toBe(planSwitch());
  });

  it('S4: deleting the last plan also leaves focus on the switcher', async () => {
    const u = userEvent.setup();
    await app();
    await u.click(within(bar()).getByRole('button', { name: 'Delete' }));
    await u.click(screen.getByRole('button', { name: 'Yes, delete My plan' }));
    expect(document.activeElement).toBe(planSwitch());
  });

  it('S5: Import says the open plan moved to the imported profile\'s first site, train and evening', async () => {
    const u = userEvent.setup();
    await app();
    const p = sampleProfile();
    const imported = { ...p, sites: [{ ...p.sites[0], id: 'sydney', name: 'Sydney yard', latitude: -33.9, longitude: 151.2, timeZone: 'Australia/Sydney' }], plans: p.plans.map((pl) => ({ ...pl, siteId: 'sydney' })) };
    await u.upload(screen.getByLabelText('Import profile (JSON)'), new File([JSON.stringify(imported)], 'sydney.json', { type: 'application/json' }));
    await waitFor(() => expect(status()).toMatch(/^Imported sydney\.json\./));
    expect(status()).toMatch(new RegExp(`The open plan "My plan" moved to Sydney yard, ${p.trains[0].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}, \\w{3} \\d{1,2} \\w{3}\\.`));
    expect(storedPlan()!.siteId).toBe('sydney');
  });

  it('M5: Reset all says plans are not part of the profile export and cannot be recovered unless shared first, and no longer promises a copy of them', async () => {
    const u = userEvent.setup();
    await app();
    openGear();
    await u.click(screen.getByRole('button', { name: 'Reset all' }));
    const text = screen.getByTestId('reset-confirm').textContent!;
    expect(text).toMatch(/Plans are not part of the profile export: share them first .*or they cannot be recovered\./);
    expect(text).not.toMatch(/Export your profile first to keep a copy\./);
    expect(document.getElementById('profile-heading')!.closest('section')!.textContent).toMatch(/plans are shared and imported from the plan.s More menu, Share and export/);
  });
});

describe('the header at a phone width', () => {
  it('S8: the sign-in control is a 44 px button named for a screen reader, beside the title in one row that does not wrap', async () => {
    await app();
    const header = document.querySelector('header')!;
    expect(header.className).not.toContain('flex-wrap');
    const button = within(header).getByRole('button', { name: 'Sign in with Google' });
    expect(button.className).toMatch(/min-h-\[44px\]/);
    expect(button.className).toMatch(/min-w-\[44px\]/);
    expect(button.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(button.querySelector('.sr-only')!.textContent).toBe('Sign in with Google');
  });
});
