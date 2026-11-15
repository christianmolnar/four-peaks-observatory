/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { MY_PLAN_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { openPart, pageProps, ready, storedPlan, timelineSlots } from './testkit';

// The Night timeline, the open plan's closed-by-default part: its slots are the plan's targets in the plan's order
// (C11 + 0.7x reducer + ASI533MC, the evening of 2026-12-15). Old saved itineraries reach it by moving into a plan.

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
/** The page with the Night timeline opened (it is closed by default), unless `closed`. */
const app = async (profile = withTrain('deep-c11-reducer-533'), closed = false) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  if (!closed) openPart('Night timeline');
  return r;
};
const part = () => document.getElementById('night-timeline-body') as HTMLElement;
const slots = timelineSlots;
const names = () => slots().map((li) => li.querySelector('h3')!.textContent!.replace(/^\d+\. /, ''));
const times = () => slots().map((li) => /(\d\d:\d\d) to (\d\d:\d\d)/.exec(li.textContent ?? '')?.slice(1, 3) ?? null);
/** The chips a slot shows; the invisible copies kept to reserve room are not in this element. */
const chips = (li: HTMLElement) => within(li).getByTestId(/^slot-chips-/).textContent ?? '';
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/** Puts targets into the old saved itinerary, which the page moves into the first plan; a test starts from them without a whole-page add per slot. */
function seed(...targetIds: string[]) {
  const items = targetIds.map((targetId, i) => ({ id: `s${i + 1}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }));
  window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 1, items }));
}
/** Changes the preset of the seeded slots, by position. */
const seedModes = (...modes: string[]) => {
  const saved = JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!);
  modes.forEach((m, i) => {
    saved.items[i].mode = m;
  });
  window.localStorage.setItem(ITINERARY_KEY, JSON.stringify(saved));
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Night timeline', () => {
  it('is a closed part of the open plan, headed "Night timeline", and says what to do when the plan is empty', async () => {
    await app(undefined, true);
    const toggle = screen.getByRole('button', { name: 'Night timeline' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.closest('section')!.querySelector('h2')!.textContent).toMatch(/^PLAN: /);
    expect(part().hasAttribute('hidden')).toBe(true);
    expect(within(part()).getByText('No targets in the plan yet. Add one from Find a target.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'NIGHT ITINERARY' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(part().hasAttribute('hidden')).toBe(false);
  });

  it('a target added to the plan becomes a slot, with times labelled estimate', async () => {
    const user = userEvent.setup();
    await app();
    await user.type(screen.getByLabelText('Search the catalog by name or number'), 'm31');
    await user.click(within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('button', { name: /^Add .+ to the plan$/ })[0]);
    expect(names()).toEqual(['Andromeda Galaxy']);
    const li = slots()[0];
    expect(li.textContent).toMatch(/\d\d:\d\d to \d\d:\d\d \(estimate\)/);
    expect(li.textContent).toMatch(/Light: \d+ s x \d+ subs = [\d.]+ min \(estimate\)\./);
    expect(screen.getByTestId('itinerary-totals').textContent).toMatch(/^Light \d+ min, changeover 0 min, waiting 0 min; 0 filter changes, 0 train changes; ends \d\d:\d\d\. All estimates\.$/);
    expect(screen.getByTestId('itinerary-why').textContent).toMatch(/Why this order: One slot to place\./);
  });

  it('has no Up or Down and no add box: the order is the plan\'s own', async () => {
    seed('m31', 'ic405');
    await app();
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect(within(part()).queryByRole('button', { name: /^Move / })).toBeNull();
    expect(within(part()).queryByRole('button', { name: /^(Up|Down)$/ })).toBeNull();
    expect(screen.queryByLabelText('Target to add')).toBeNull();
    expect(screen.queryByLabelText('Train for Andromeda Galaxy')).toBeNull(); // one train for the plan: the strip's
    expect(screen.queryByLabelText('Filter for Andromeda Galaxy')).toBeNull();
    expect(part().textContent).not.toMatch(/itinerary/i);
  });

  it('a slot that starts late in a short window gives a visible overlap warning, in the slot and in the details', async () => {
    const user = userEvent.setup();
    // California Nebula in Deep (249 min, ends 06:34), then Triangulum Galaxy in Balanced, whose only window closes 07:11.
    seed('ngc1499', 'm33');
    seedModes('deep');
    await app();
    const second = slots()[1];
    expect(chips(second)).toMatch(/Warning: overlaps window/);
    expect(chips(second)).toMatch(/Note: cut short/);
    await user.click(within(second).getByRole('button', { name: 'Details for Triangulum Galaxy' }));
    const detail = screen.getByTestId('slot-detail');
    expect(within(detail).getAllByText(/^Overlaps its usable window: the slot before ends \d\d:\d\d, \d+ min after Triangulum Galaxy's window opened \(\d\d:\d\d\), and the window closes \d\d:\d\d\.$/).length).toBeGreaterThan(0);
    expect(detail.textContent).toMatch(/Warning/);
  });

  it('a short first window is skipped for a longer later one, and the slot says so (Andromeda, then Orion)', async () => {
    const user = userEvent.setup();
    // Andromeda in Quick (36 min, ends 02:28): Orion's first window, 03:17 to 04:06, gives 45 min of the Balanced aim 53 to 106. (Andromeda in Balanced is 142 min and ends after that window.)
    seed('m31', 'm42');
    seedModes('quick');
    await app();
    const second = slots()[1];
    expect(chips(second)).toMatch(/Note: waits/);
    expect(chips(second)).not.toMatch(/overlaps window/);
    await user.click(within(second).getByRole('button', { name: 'Details for Orion Nebula' }));
    expect(within(screen.getByTestId('slot-detail')).getAllByText(/^Skips its short first window \(\d\d:\d\d to \d\d:\d\d, 45 min of light\)/).length).toBeGreaterThan(0);
  });

  it('a slot that never runs shows "No imaging is planned" and no "Before it" line', async () => {
    seed('m31', 'ic405', 'planet-saturn'); // Saturn's window has closed before its turn when IC 405 is deep
    seedModes('balanced', 'deep');
    await app();
    const dead = slots()[2];
    expect(dead.textContent).toMatch(/No imaging is planned for this slot\./);
    expect(dead.textContent).not.toMatch(/Before it/);
    expect(slots()[1].textContent).toMatch(/Before it: 3 min/);
  });

  it('a preset chosen on the target\'s row shows in its slot; a note written in the slot changes the plan, which is saved with it, and both are still there after a reload', async () => {
    seed('m31', 'ic405');
    const { unmount } = await app();
    expect(within(slots()[0]).queryByRole('combobox')).toBeNull(); // the preset is chosen on the row only
    fireEvent.click(within(screen.getByRole('group', { name: 'Exposure preset for Andromeda Galaxy' })).getByRole('button', { name: 'Deep' }));
    expect(slots()[0].textContent).toContain('Exposure for Andromeda Galaxy: Deep. Change it on this target\'s row in the plan.');
    fireEvent.change(within(slots()[0]).getByLabelText('Note for Andromeda Galaxy'), { target: { value: 'frame wide' } });
    const plan = storedPlan()!;
    expect(plan.targets).toEqual([
      { id: 'm31', preset: 'deep', note: 'frame wide' },
      { id: 'ic405', preset: 'balanced' },
    ]);
    expect(screen.getByTestId('plan-row-preset-m31').textContent).toBe('Deep Project');
    unmount();
    await app();
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect((within(slots()[0]).getByLabelText('Note for Andromeda Galaxy') as HTMLInputElement).value).toBe('frame wide');
    expect(slots()[0].textContent).toContain('Exposure for Andromeda Galaxy: Deep.');
  });

  it('the start time is the plan\'s: it is saved in the plan and survives a reload', async () => {
    const user = userEvent.setup();
    seed('m31');
    const { unmount } = await app();
    const box = within(part()).getByLabelText('Imaging can start at');
    await user.clear(box);
    await user.type(box, '2130');
    await user.tab();
    expect(storedPlan()!.startTime).toBe('21:30');
    unmount();
    await app();
    expect((within(part()).getByLabelText('Imaging can start at') as HTMLInputElement).value).toBe('21:30');
  });

  it('a damaged old itinerary is reported once in plain words, the readable part of the old data still moves, and the damaged copy is removed', async () => {
    const bad = JSON.stringify({ version: 1, items: [{ id: 'a', targetId: 'm31', trainId: 'x', filterId: null, mode: 'fast', note: '' }] });
    window.localStorage.setItem(ITINERARY_KEY, bad);
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['ic405'] }));
    const first = await app();
    const status = await screen.findByTestId('plans-messages');
    expect(status.textContent).toBe('Your saved night timeline could not be read, so it was not carried over.Dismiss');
    expect(status.textContent).not.toMatch(/\$|items\[|must be|JSON|itinerary/);
    expect(names()).toEqual(['Flaming Star Nebula']);
    expect(window.localStorage.getItem(ITINERARY_KEY)).toBeNull();
    expect(window.localStorage.getItem(MY_PLAN_KEY)).toBeNull();
    first.unmount();
    await app();
    expect(screen.queryByTestId('plans-messages')).toBeNull(); // said once
    expect(names()).toEqual(['Flaming Star Nebula']);
  });

  it('a saved slot that points at something gone shows a problem on that slot only', async () => {
    // The old slot's own filter is not carried over (one filter for the plan: the train\'s), so a missing target is the problem that remains.
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({ version: 1, items: [{ id: 'a', targetId: 'gone-from-catalog', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }, { id: 'b', targetId: 'ic405', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'quick', note: '' }] }),
    );
    await app();
    expect(chips(slots()[0])).toMatch(/Warning: problem/);
    expect(slots()[1].textContent).toMatch(/Light: \d+ s x \d+ subs/);
  });

  it('the timeline has no Remove: a target is removed on its row in the plan, and its slot goes with it', async () => {
    const user = userEvent.setup();
    seed('m31', 'ic405');
    await app();
    expect(within(part()).queryByRole('button', { name: /^Remove / })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove Andromeda Galaxy from the plan' }));
    expect(names()).toEqual(['Flaming Star Nebula']);
    expect(storedPlan()!.targets.map((t) => t.id)).toEqual(['ic405']);
  });

  it('on a smart scope train the timeline still lists the plan\'s targets, with no subs of its own to count', async () => {
    seed('m31');
    await app(withTrain('smart-seestar-s50'));
    expect(names()).toEqual(['Andromeda Galaxy']);
    expect(slots()[0].textContent).not.toMatch(/Light: \d+ s x/);
  });

  it('schedules the first eight targets of the plan and says how many are not scheduled; all stay in the plan', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['m31', 'm42', 'm13', 'm45', 'ngc7000', 'ic405', 'ngc1499', 'm33', 'm51', 'm81'] }));
    await app();
    expect(names()).toHaveLength(8);
    expect(screen.getByTestId('timeline-unscheduled').textContent).toBe('The timeline schedules the first 8 targets of the plan; 2 more are not scheduled.');
    expect(storedPlan()!.targets).toHaveLength(10);
  });

  it('a planet slot that crosses the meridian shows the flip note and takes the flip minutes (Neptune)', async () => {
    const user = userEvent.setup();
    seed('planet-neptune');
    await app();
    const li = slots()[0];
    expect(chips(li)).toMatch(/Note: meridian flip/);
    const [start, end] = times()[0]!;
    expect(toMin(end) - toMin(start)).toBe(30); // 20 min of clips and the 10 min flip
    expect(li.textContent).toMatch(/Solar system: short video clips, about 20 min/);
    await user.click(within(li).getByRole('button', { name: 'Details for Neptune' }));
    expect(within(screen.getByTestId('slot-detail')).getAllByText('Neptune crosses the meridian during this slot: a flip adds 10 min.').length).toBeGreaterThan(0);
  });

  it('the Moon is a slot like any body, and has no flip', async () => {
    seed('planet-moon');
    await app();
    expect(names()).toEqual(['Moon']);
    expect(slots()[0].textContent).toMatch(/Moon: short video clips, about 20 min/);
    expect(chips(slots()[0])).not.toMatch(/flip/);
  });

  it('a planet slot is a short block with no subs', async () => {
    seed('planet-saturn');
    await app();
    expect(slots()[0].textContent).toMatch(/Solar system: short video clips, about 20 min \(estimate\)\. See the checklist in the Solar system row of the list\./);
  });
});
