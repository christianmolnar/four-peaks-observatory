/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { MY_PLAN_KEY, defaultTonightDate, sampleProfile } from '@/planner/state';
import { MAX_PLANS, PLANS_KEY } from '@/planner/state/plans';
import PlannerApp from './PlannerApp';
import { openControls, openGear, openPart, openPlanTab, pageProps, planSwitch, ready, storedPlan, storedPlans, timelineSlots } from './testkit';

// The plans: the My plans bar, the open plan owning the strip's date, site and train, the two tabs, the header sign-in,
// and what the page no longer has.

const twoSites = () => {
  const p = sampleProfile();
  return { ...p, sites: [...p.sites, { ...p.sites[0], id: 'second', name: 'Second site', longitude: p.sites[0].longitude + 1 }] };
};
const app = async (profile = sampleProfile(), initialDate = '2026-12-15') => {
  const r = render(<PlannerApp {...pageProps} initialDate={initialDate} initialProfile={profile} />);
  await ready();
  return r;
};
const bar = () => screen.getByTestId('plans-bar');
const heading = () => screen.getByRole('region', { name: /^PLAN:/ }).querySelector('h2')!.textContent;
const switchNames = () => [...planSwitch().options].map((o) => o.textContent);
const dateBox = () => screen.getByLabelText('Evening of') as HTMLInputElement;
const siteBox = () => screen.getByLabelText('Site') as HTMLSelectElement;
const trainBox = () => screen.getByLabelText('Train') as HTMLSelectElement;
const targetIds = () => (storedPlan()?.targets ?? []).map((t) => t.id);
const addByHand = async (user: ReturnType<typeof userEvent.setup>, query: string, name: string) => {
  await user.clear(screen.getByLabelText('Search the catalog by name or number'));
  await user.type(screen.getByLabelText('Search the catalog by name or number'), query);
  await user.click(within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', { name: `Add ${name} to the plan` }));
};
const tonight = () => {
  const s = sampleProfile().sites[0];
  return defaultTonightDate(new Date(), s.longitude, s.timeZone);
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

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('My plans', () => {
  it('starts with one empty plan named My plan on the date, the first site and the first train, not saved until it changes', async () => {
    await app();
    expect(heading()).toBe('PLAN: My plan (0 targets)');
    expect(switchNames()).toEqual(['My plan (0)']);
    expect(dateBox().value).toBe('2026-12-15');
    expect(storedPlans()).toBeNull();
  });

  it('New starts an empty plan on today at the open plan\'s site and train, and opens it', async () => {
    const user = userEvent.setup();
    await app(twoSites());
    await user.selectOptions(siteBox(), 'second');
    await user.selectOptions(trainBox(), 'smart-seestar-s50');
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    expect(heading()).toBe('PLAN: Plan 2 (0 targets)');
    expect(switchNames()).toEqual(['My plan (0)', 'Plan 2 (0)']);
    expect(dateBox().value).toBe(tonight()); // today, not the first plan's 15 Dec
    expect(siteBox().value).toBe('second');
    expect(trainBox().value).toBe('smart-seestar-s50');
    expect(storedPlans()!.plans).toHaveLength(2);
    expect(storedPlans()!.openId).toBe(storedPlans()!.plans[1].id);
  });

  it('the switcher opens another plan with its own targets, and the open plan is remembered across a reload', async () => {
    const user = userEvent.setup();
    const first = await app();
    await addByHand(user, 'm42', 'Orion Nebula');
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    await addByHand(user, 'm31', 'Andromeda Galaxy');
    expect(targetIds()).toEqual(['m31']);
    await user.selectOptions(planSwitch(), storedPlans()!.plans[0].id);
    expect(heading()).toBe('PLAN: My plan (1 target)');
    expect(within(screen.getByRole('list', { name: 'Targets in this plan, in order' })).getAllByRole('listitem')).toHaveLength(1);
    expect(targetIds()).toEqual(['m42']);
    first.unmount();
    await app(); // a new page over the same storage
    expect(heading()).toBe('PLAN: My plan (1 target)');
    expect(switchNames()).toEqual(['My plan (1)', 'Plan 2 (1)']);
    expect(storedPlans()!.openId).toBe(storedPlans()!.plans[0].id);
  });

  it('Rename changes the name in the bar, the heading and storage; empty is refused; Cancel changes nothing', async () => {
    const user = userEvent.setup();
    await app();
    await user.click(within(bar()).getByRole('button', { name: 'Rename' }));
    const box = screen.getByLabelText('Plan name') as HTMLInputElement;
    expect(document.activeElement).toBe(box);
    expect(box.value).toBe('My plan');
    await user.clear(box);
    expect((screen.getByRole('button', { name: 'Save name' }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(box, 'Camping trip');
    await user.keyboard('{Enter}');
    expect(heading()).toBe('PLAN: Camping trip (0 targets)');
    expect(switchNames()).toEqual(['Camping trip (0)']);
    expect(storedPlan()!.name).toBe('Camping trip');
    expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Rename' }));
    await user.click(within(bar()).getByRole('button', { name: 'Rename' }));
    await user.type(screen.getByLabelText('Plan name'), ' x');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storedPlan()!.name).toBe('Camping trip');
    expect(screen.queryByLabelText('Plan name')).toBeNull();
  });

  it('Duplicate makes a copy with the same targets, date, site and train, named (copy), and opens it', async () => {
    const user = userEvent.setup();
    await app();
    await addByHand(user, 'm31', 'Andromeda Galaxy');
    await user.click(within(bar()).getByRole('button', { name: 'Duplicate' }));
    expect(heading()).toBe('PLAN: My plan (copy) (1 target)');
    expect(switchNames()).toEqual(['My plan (1)', 'My plan (copy) (1)']);
    const [orig, copy] = storedPlans()!.plans;
    expect(copy).toMatchObject({ date: orig.date, siteId: orig.siteId, trainId: orig.trainId, targets: orig.targets });
    expect(copy.id).not.toBe(orig.id);
    await user.click(within(screen.getByRole('region', { name: /^PLAN:/ })).getByRole('button', { name: 'Remove Andromeda Galaxy from the plan' }));
    expect(storedPlans()!.plans[0].targets).toHaveLength(1); // the original keeps its own
  });

  it('Delete asks in the page, by the plan\'s name; Cancel keeps it, confirming removes it, and the last one is replaced by an empty plan', async () => {
    const user = userEvent.setup();
    const confirm = jest.spyOn(window, 'confirm');
    await app();
    await addByHand(user, 'm31', 'Andromeda Galaxy');
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    await user.click(within(bar()).getByRole('button', { name: 'Rename' }));
    await user.clear(screen.getByLabelText('Plan name'));
    await user.type(screen.getByLabelText('Plan name'), 'Camping trip{Enter}');
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }));
    const box = screen.getByTestId('plan-delete-confirm');
    expect(box.textContent).toContain('Delete the plan “Camping trip”?');
    expect(box.textContent).toMatch(/Its 0 targets, times and notes are removed/);
    expect(document.activeElement).toBe(within(box).getByRole('button', { name: 'Cancel' }));
    await user.click(within(box).getByRole('button', { name: 'Cancel' }));
    expect(storedPlans()!.plans).toHaveLength(2);
    expect(document.activeElement).toBe(within(bar()).getByRole('button', { name: 'Delete' }));
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete Camping trip' }));
    expect(confirm).not.toHaveBeenCalled(); // never a browser dialog
    expect(switchNames()).toEqual(['My plan (1)']);
    expect(heading()).toBe('PLAN: My plan (1 target)'); // the neighbour opened
    expect(storedPlans()!.plans).toHaveLength(1);
    // The last plan: deleting it leaves one fresh empty plan.
    await user.click(within(bar()).getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete My plan' }));
    expect(switchNames()).toEqual(['My plan (0)']);
    expect(heading()).toBe('PLAN: My plan (0 targets)');
    jest.restoreAllMocks();
  });

  it('holds at most 50 plans: New says so and adds nothing', async () => {
    const plans = Array.from({ length: MAX_PLANS }, (_, i) => savedPlan(`plan-${i + 1}`, `Plan ${i + 1}`));
    window.localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 1, openId: 'plan-1', plans }));
    await app();
    expect(planSwitch().options).toHaveLength(MAX_PLANS);
    fireEvent.click(within(bar()).getByRole('button', { name: 'New' }));
    expect((await screen.findByRole('status')).textContent).toBe('Plans hold at most 50 plans. Delete one to make another.');
    expect(planSwitch().options).toHaveLength(MAX_PLANS);
    expect(storedPlans()!.plans).toHaveLength(MAX_PLANS);
  });

  it('holds at most 50 targets in a plan: Add says so and adds nothing', async () => {
    const targets = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, preset: 'balanced' }));
    window.localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 1, openId: 'plan-1', plans: [savedPlan('plan-1', 'Full', { targets })] }));
    const user = userEvent.setup();
    await app();
    await user.type(screen.getByLabelText('Search the catalog by name or number'), 'm31');
    await user.click(within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', { name: 'Add Andromeda Galaxy to the plan' }));
    expect((await screen.findByRole('status')).textContent).toBe('The plan holds at most 50 targets. Remove one to add another.');
    expect(storedPlan()!.targets).toHaveLength(50);
  });

  it('a damaged saved set of plans is reported, copied to the backup, and one empty plan starts; the text is not removed', async () => {
    window.localStorage.setItem(PLANS_KEY, '{nope');
    await app();
    expect((await screen.findByRole('status')).textContent).toBe('Your saved plans could not be read, so they start over with one empty plan. A copy of what was stored is kept in this browser.');
    expect(window.localStorage.getItem(PLANS_KEY)).toBe('{nope');
    expect(window.localStorage.getItem('fpo-planner-plans-v1.bak')).toBe('{nope');
    expect(heading()).toBe('PLAN: My plan (0 targets)');
  });

  it('plans that cannot be saved say so, and the edit stays on screen', async () => {
    const user = userEvent.setup();
    await app();
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/Plans not saved, so they are lost on reload: quota/);
    expect(heading()).toBe('PLAN: Plan 2 (0 targets)');
    jest.restoreAllMocks();
  });
});

describe('the strip edits the open plan', () => {
  it('date, site and train belong to the plan: changing them changes that plan, and opening another plan restores its own', async () => {
    const user = userEvent.setup();
    await app(twoSites(), '2026-12-15');
    const firstTrain = trainBox().value;
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    fireEvent.change(dateBox(), { target: { value: '2027-01-20' } });
    await user.selectOptions(siteBox(), 'second');
    await user.selectOptions(trainBox(), 'smart-seestar-s50');
    expect(storedPlan()).toMatchObject({ name: 'Plan 2', date: '2027-01-20', siteId: 'second', trainId: 'smart-seestar-s50' });
    const [firstPlan] = storedPlans()!.plans;
    expect(firstPlan).toMatchObject({ date: '2026-12-15', siteId: 'fountain-hills' }); // the first plan was not touched
    await user.selectOptions(planSwitch(), firstPlan.id);
    expect(dateBox().value).toBe('2026-12-15');
    expect(siteBox().value).toBe('fountain-hills');
    expect(trainBox().value).toBe(firstTrain);
    await user.selectOptions(planSwitch(), storedPlans()!.plans[1].id);
    expect(dateBox().value).toBe('2027-01-20');
    expect(siteBox().value).toBe('second');
    expect(trainBox().value).toBe('smart-seestar-s50');
  });

  it('the train is sticky per plan across a reload', async () => {
    const user = userEvent.setup();
    const first = await app();
    await user.selectOptions(trainBox(), 'smart-seestar-s50');
    first.unmount();
    await app();
    expect(trainBox().value).toBe('smart-seestar-s50');
  });

  it('the horizon editor follows the open plan\'s site when another plan is opened', async () => {
    const user = userEvent.setup();
    const profile = twoSites();
    profile.sites[1] = { ...profile.sites[1], blockedArcs: [{ startAz: 10, endAz: 40, heightDeg: 15 }] };
    await app(profile);
    await user.selectOptions(siteBox(), 'second');
    await user.click(within(bar()).getByRole('button', { name: 'New' })); // Plan 2 on the same site
    await user.selectOptions(planSwitch(), storedPlans()!.plans[0].id); // My plan: now on second too
    await user.selectOptions(siteBox(), 'fountain-hills');
    await user.selectOptions(planSwitch(), storedPlans()!.plans[1].id); // Plan 2: second
    openGear();
    expect((screen.getByRole('spinbutton', { name: /^Start azimuth/ }) as HTMLInputElement).value).toBe('10');
  });

  it('the wording follows the open plan\'s date: tonight on today, the date on any other', async () => {
    const user = userEvent.setup();
    await app(sampleProfile(), '2026-12-15');
    expect(screen.getByRole('heading', { name: 'TUE 15 DEC' })).toBeTruthy();
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    expect(screen.getByRole('heading', { name: 'TONIGHT' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Best targets for tonight' })).toBeTruthy();
  });

  it('the AI panel and the night timeline read the open plan: its targets, its date', async () => {
    const user = userEvent.setup();
    await app();
    await addByHand(user, 'm31', 'Andromeda Galaxy');
    expect(screen.getByTestId('ai-inputs').textContent).toMatch(/^Will plan Tue 15 Dec at .*, for 1 target from the plan\.$/);
    expect(timelineSlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. Andromeda Galaxy']);
    await user.click(within(bar()).getByRole('button', { name: 'New' }));
    expect(screen.getByTestId('ai-plan-reason').textContent).toBe('Add at least one target to the plan first.');
    expect(timelineSlots()).toHaveLength(0);
    await user.selectOptions(planSwitch(), storedPlans()!.plans[0].id);
    expect(screen.getByTestId('ai-inputs').textContent).toMatch(/^Will plan Tue 15 Dec .*1 target from the plan\.$/);
    expect(timelineSlots()).toHaveLength(1);
  });
});

describe('what was there before plans moves into the first plan', () => {
  it('the My plan list and the saved itinerary become one plan named My plan; the old copies are removed', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['ngc7000', 'm31', 'planet-jupiter'] }));
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({
        version: 2,
        startTime: '21:30',
        items: [
          { id: 's1', targetId: 'm31', trainId: 'deep-c11-2600', filterId: null, mode: 'deep', note: 'long one' },
          { id: 's2', targetId: 'm42', trainId: 'deep-c11-2600', filterId: null, mode: 'quick', note: '' },
        ],
      }),
    );
    await app();
    expect(heading()).toBe('PLAN: My plan (4 targets)');
    const plan = storedPlan()!;
    expect(plan.name).toBe('My plan');
    expect(plan.date).toBe('2026-12-15');
    expect(plan.startTime).toBe('21:30');
    // The itinerary's slots first, in slot order; then the rest of My plan in its order.
    expect(plan.targets).toEqual([
      { id: 'm31', preset: 'deep', note: 'long one' },
      { id: 'm42', preset: 'quick' },
      { id: 'ngc7000', preset: 'balanced' },
      { id: 'planet-jupiter', preset: 'balanced' },
    ]);
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    expect(window.localStorage.getItem(ITINERARY_KEY)).toBeNull();
    expect(screen.getByTestId('plan-row-preset-m31').textContent).toBe('Deep Project');
    expect((within(document.getElementById('night-timeline-body')!).getByLabelText('Imaging can start at') as HTMLInputElement).value).toBe('21:30');
  });

  it('is done once: a plan already saved is not replaced by an old key that turns up', async () => {
    window.localStorage.setItem(PLANS_KEY, JSON.stringify({ version: 1, openId: 'plan-1', plans: [savedPlan('plan-1', 'Mine')] }));
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['m31'] }));
    await app();
    expect(switchNames()).toEqual(['Mine (0)']);
  });
});

describe('the two tabs', () => {
  const tabs = () => screen.getAllByRole('tab');

  it('is a tablist of Plan and Gear and site, Plan selected, each tab controlling its own labelled panel', async () => {
    await app();
    expect(screen.getByRole('tablist', { name: 'Planner' })).toBeTruthy();
    expect(tabs().map((t) => t.textContent)).toEqual(['Plan', 'Gear and site']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false']);
    expect(tabs().map((t) => t.tabIndex)).toEqual([0, -1]);
    const panel = screen.getByRole('tabpanel', { name: 'Plan' });
    expect(panel.id).toBe(tabs()[0].getAttribute('aria-controls'));
    expect(document.getElementById('panel-gear')!.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('panel-gear')!.getAttribute('aria-labelledby')).toBe('tab-gear');
    expect(within(panel).getByTestId('plans-bar')).toBeTruthy();
    expect(within(panel).getByTestId('target-list')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /^SITE AND GEAR$/ })).toBeNull(); // in the other, hidden, tab
  });

  it('Gear and site holds the horizon editor, the site and gear editor, trains, export, import and Reset all; Plan holds none of them', async () => {
    await app();
    openGear();
    const panel = screen.getByRole('tabpanel', { name: 'Gear and site' });
    for (const name of [/^HORIZON/, 'SITE AND GEAR', 'PROFILE']) expect(within(panel).getByRole('heading', { name })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Reset all' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Export profile (JSON)' })).toBeTruthy();
    expect(within(panel).getByLabelText('Import profile (JSON)')).toBeTruthy();
    expect(within(panel).getByText(/^Trains \(\d+\)$/)).toBeTruthy();
    expect(document.getElementById('horizon')!.closest('[role="tabpanel"]')).toBe(panel);
    expect(document.getElementById('gear-heading')!.closest('[role="tabpanel"]')).toBe(panel);
    const plan = document.getElementById('panel-plan')!;
    expect(plan.hasAttribute('hidden')).toBe(true);
    expect(within(plan).queryByRole('button', { name: 'Reset all' })).toBeNull();
  });

  it('is operated from the keyboard: arrows, Home and End move and select, with the focus', async () => {
    const user = userEvent.setup();
    await app();
    tabs()[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.tabIndex)).toEqual([-1, 0]);
    await user.keyboard('{ArrowRight}'); // wraps
    expect(document.activeElement).toBe(tabs()[0]);
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(tabs()[1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(tabs()[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(screen.getByRole('tabpanel', { name: 'Gear and site' })).toBeTruthy();
    await user.tab(); // Tab leaves the tablist, into the panel's content
    expect(tabs().some((t) => t === document.activeElement)).toBe(false);
  });

  it('follows the address: a tab sets #plan or #gear, a shared #gear opens on Gear, and Back returns', async () => {
    const user = userEvent.setup();
    const first = await app();
    await user.click(tabs()[1]);
    expect(window.location.hash).toBe('#gear');
    await user.click(tabs()[0]);
    expect(window.location.hash).toBe('#plan');
    first.unmount();
    window.history.replaceState(null, '', '/#gear');
    await app();
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Gear and site' })).toBeTruthy();
    await act(async () => {
      window.location.hash = '#plan';
    });
    await waitFor(() => expect(tabs()[0].getAttribute('aria-selected')).toBe('true'));
  });

  it('a link to something inside Gear and site opens that tab first: #horizon, #gear-heading and a shared #profile-heading', async () => {
    await app();
    for (const hash of ['#horizon', '#gear-heading', '#profile-heading']) {
      openPlanTab();
      expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
      await act(async () => {
        window.location.hash = hash;
      });
      await waitFor(() => expect(tabs()[1].getAttribute('aria-selected')).toBe('true'));
      expect(document.getElementById('panel-gear')!.hasAttribute('hidden')).toBe(false);
    }
  });

  it('"Change or find a site" opens Gear and site with the site list open and its Find box focused', async () => {
    const user = userEvent.setup();
    await app();
    openControls();
    await user.click(screen.getByRole('button', { name: 'Change or find a site' }));
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).toBe('#gear');
    await waitFor(() => expect(document.activeElement?.closest('[role="tabpanel"]')?.id).toBe('panel-gear'));
  });

  it('the strip\'s Search button, pressed on Gear and site, goes to the Plan tab and focuses the search box', async () => {
    const user = userEvent.setup();
    await app();
    await user.click(tabs()[1]);
    await user.click(screen.getByRole('button', { name: 'Find a target' }));
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
    expect(window.location.hash).toBe('#plan');
    expect(document.activeElement).toBe(document.getElementById('target-search'));
  });

  it('"Change train" (the plan mixes a deep-sky train and a planet) focuses the Train select in the strip, on the Plan tab', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['planet-jupiter'] }));
    const user = userEvent.setup();
    await app();
    await user.click(within(screen.getByTestId('plan-train-note')).getByRole('button', { name: 'Change train' }));
    expect(document.activeElement).toBe(trainBox());
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('the top of the page', () => {
  it('has sign-in in the header row beside the title, one line, and none in the page footer', async () => {
    await app();
    const header = document.querySelector('header')!;
    expect(header.querySelector('h1')!.textContent).toBe('IMAGING PLANNER');
    const auth = within(header).getByTestId('auth-control');
    expect(within(auth).getByRole('button', { name: 'Sign in with Google' })).toBeTruthy();
    expect(document.querySelectorAll('[data-testid="auth-control"]')).toHaveLength(1);
    expect(auth.className).toContain('h-[44px]');
  });

  it('shows who is signed in, from the one read of the session', async () => {
    render(<PlannerApp {...pageProps} loadAuth={async () => ({ kind: 'signedIn', login: 'octo', owner: false })} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await ready();
    expect(await screen.findByText('Signed in as octo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });

  it('no developer messages in the header, and none of the removed intro', async () => {
    await app();
    const header = document.querySelector('header')!;
    expect(header.textContent).toBe('IMAGING PLANNERSign in with Google');
    expect(document.body.textContent).not.toMatch(/free guest tool|Signing in is optional|never sent anywhere/);
    expect(header.querySelector('details, summary')).toBeNull();
  });

  it('the night and horizon facts are the plan\'s own closed part, and nothing true is lost', async () => {
    const user = userEvent.setup();
    await app();
    const toggle = screen.getByRole('button', { name: 'Night and horizon' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.closest('section')!.querySelector('h2')!.textContent).toMatch(/^PLAN: /);
    openPart('Night and horizon');
    const body = document.getElementById('night-and-horizon-body')!;
    expect(within(body).getByTestId('night-summary').textContent).toMatch(/^Astronomical night \d\d:\d\d to \d\d:\d\d \(.* h\), Moon \d+% lit at mid-night\. Times are in the site's time zone \(America\/Phoenix\)\.$/);
    expect(within(body).getByTestId('horizon-summary').textContent).toMatch(/^Horizon: blocked 120° \(SE\) to 320° \(NW\), 42° high\. Edit horizon$/);
    expect(within(body).getByRole('link', { name: 'Edit horizon' }).getAttribute('href')).toBe('#horizon');
    // Not loose under the strip any more.
    expect(document.querySelectorAll('[data-testid="night-summary"]')).toHaveLength(1);
    expect(body.closest('section')).toBe(toggle.closest('section'));
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('what is no longer on the page', () => {
  it('has no several-nights panel, no global Exposure module with comparison cards, no intro and More fold, no Up and Down, and no itinerary', async () => {
    const user = userEvent.setup();
    await app();
    await addByHand(user, 'm31', 'Andromeda Galaxy');
    const text = document.body.textContent ?? '';
    expect(screen.queryByRole('region', { name: /several nights|SEVERAL/i })).toBeNull();
    expect(document.getElementById('campaign-heading')).toBeNull();
    expect(text).not.toMatch(/Plan several nights/i);
    expect(screen.queryByRole('region', { name: /^EXPOSURE:/ })).toBeNull();
    expect(screen.queryByText(/Compare modes|What more time buys/i)).toBeNull();
    expect(text).not.toMatch(/itinerary/i);
    expect(screen.queryByRole('button', { name: /^(Up|Down)$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Move / })).toBeNull();
    expect(screen.queryByRole('link', { name: /Plan an itinerary|Plan my night with AI/ })).toBeNull();
    expect(screen.queryByText(/MY PLAN/)).toBeNull();
    expect(document.querySelector('header details')).toBeNull();
  });

  it('keeps, in this order on the Plan tab: the plans bar, the open plan, Find a target and its list, then the AI panel', async () => {
    await app();
    const order = [
      screen.getByTestId('plans-bar'),
      screen.getByRole('region', { name: /^PLAN:/ }),
      screen.getByRole('region', { name: 'FIND A TARGET' }),
      screen.getByRole('region', { name: /^Best targets for/ }),
      screen.getByRole('region', { name: 'PLAN MY NIGHT WITH AI' }),
    ];
    for (let i = 1; i < order.length; i++) expect(Boolean(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    const open = screen.getByRole('region', { name: /^PLAN:/ });
    expect(within(open).getByRole('button', { name: 'Night and horizon' })).toBeTruthy();
    expect(within(open).getByRole('button', { name: 'Night timeline' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: /^Best targets for/ })).getByRole('combobox', { name: 'Type' })).toBeTruthy();
  });
});
