/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { MY_PLAN_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { openDetails, pageProps, ready, storedPlan, timelineSlots } from './testkit';

// The night, on the open plan's cards: each card is one slot, the plan's targets in the plan's order
// (C11 + 0.7x reducer + ASI533MC, the evening of 2026-12-15). Old saved itineraries reach it by moving into a plan.

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
/** The page, with the Details of every card opened unless `closed`. */
const app = async (profile = withTrain('deep-c11-reducer-533'), closed = false) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  if (!closed) openDetails();
  return r;
};
const part = () => document.querySelector('section[aria-labelledby="open-plan-heading"]') as HTMLElement;
const slots = timelineSlots;
const names = () => slots().map((li) => li.querySelector('h3')!.textContent!.replace(/^\d+\. /, ''));
const times = () => slots().map((li) => /(\d\d:\d\d) to (\d\d:\d\d)/.exec(li.querySelector('[data-testid$="-times"]')?.textContent ?? '')?.slice(1, 3) ?? null);
/** The chips a card shows. */
const chips = (li: HTMLElement) => li.querySelector('[data-testid^="plan-chips-"]')?.textContent ?? '';
const light = (li: HTMLElement) => li.querySelector('[data-testid^="slot-light-"]')?.textContent ?? '';
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

describe('Plan cards', () => {
  it('an empty plan says so; the Night graph is the one closed part, and no part is called Night timeline', async () => {
    await app(undefined, true);
    expect(screen.queryByRole('button', { name: 'Night timeline' })).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Night graph' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.closest('section')!.querySelector('h2')!.textContent).toMatch(/^PLAN: /);
    expect(within(part()).getByTestId('plan-empty').textContent).toMatch(/^No targets yet\./);
    expect(screen.queryByRole('heading', { name: 'NIGHT ITINERARY' })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('a target added to the plan becomes a card with its start and finish, its length and its light; the header says Estimates', async () => {
    const user = userEvent.setup();
    await app();
    await user.type(screen.getByLabelText('Search the catalog by name or number'), 'm31');
    await user.click(within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('button', { name: /^Add .+ to the plan$/ })[0]);
    expect(names()).toEqual(['Andromeda Galaxy']);
    openDetails();
    const li = slots()[0];
    expect(times()[0]).not.toBeNull();
    expect(li.querySelector('[data-testid^="plan-length-"]')!.textContent).toMatch(/^\d+ (h|min)/);
    expect(li.textContent).not.toMatch(/estimate/i);
    expect(light(li)).toMatch(/^\d+ s × \d+ subs = [\d.]+ min$/);
    expect(screen.getByTestId('timeline-estimate').textContent).toBe('Estimates');
    expect(screen.getByTestId('itinerary-totals').textContent).toMatch(/^Light .+Changeover 0 minWaiting 0 minEnds \d\d:\d\dEstimates$/);
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

  it('a slot that starts late in a short window is cut short', async () => {
    // California Nebula in Deep (249 min, ends 06:34), then Triangulum Galaxy in Balanced, whose only window closes 07:11.
    seed('ngc1499', 'm33');
    seedModes('deep');
    await app();
    expect(chips(slots()[1])).toMatch(/Cut short/);
  });

  it('a slot that never runs says No time left and has no light line; the one before it shows its changeover', async () => {
    seed('m31', 'ic405', 'planet-saturn'); // Saturn's window has closed before its turn when IC 405 is deep
    seedModes('balanced', 'deep');
    await app();
    const dead = slots()[2];
    expect(chips(dead)).toBe('No time left');
    expect(light(dead)).toBe('');
    expect(dead.querySelector('[data-testid^="plan-length-"]')).toBeNull();
    expect(within(slots()[1]).getByTestId(/^slot-before-/).textContent).toMatch(/^slew and centre 3 min/);
  });

  it('a preset chosen on the target\'s row shows on its card; a note written in the card changes the plan, which is saved with it, and both are still there after a reload', async () => {
    seed('m31', 'ic405');
    const { unmount } = await app();
    expect(within(slots()[0]).queryByRole('combobox')).toBeNull(); // the preset is chosen with the chips only
    fireEvent.click(within(screen.getByRole('group', { name: 'Exposure preset for Andromeda Galaxy' })).getByRole('button', { name: 'Deep' }));
    fireEvent.change(within(slots()[0]).getByLabelText('Note for Andromeda Galaxy'), { target: { value: 'frame wide' } });
    const plan = storedPlan()!;
    expect(plan.targets).toEqual([
      { id: 'm31', preset: 'deep', note: 'frame wide' },
      { id: 'ic405', preset: 'balanced' },
    ]);
    expect(within(slots()[0]).getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Deep']);
    unmount();
    await app();
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect((within(slots()[0]).getByLabelText('Note for Andromeda Galaxy') as HTMLInputElement).value).toBe('frame wide');
    expect(within(slots()[0]).getAllByRole('button', { pressed: true }).map((b) => b.textContent)).toEqual(['Deep']);
  });

  it('the start time is the plan\'s: it is saved in the plan and survives a reload', async () => {
    const user = userEvent.setup();
    seed('m31');
    const { unmount } = await app();
    const box = within(part()).getByLabelText('Start');
    await user.clear(box);
    await user.type(box, '2130');
    await user.tab();
    expect(storedPlan()!.startTime).toBe('21:30');
    unmount();
    await app();
    expect((within(part()).getByLabelText('Start') as HTMLInputElement).value).toBe('21:30');
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

  it('a saved slot that points at something gone shows a short warning on that card only', async () => {
    // The old slot's own filter is not carried over (one filter for the plan: the train\'s), so a missing target is the problem that remains.
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({ version: 1, items: [{ id: 'a', targetId: 'gone-from-catalog', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }, { id: 'b', targetId: 'ic405', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'quick', note: '' }] }),
    );
    await app();
    expect(chips(slots()[0])).toBe('Target not found');
    expect(light(slots()[1])).toMatch(/\d+ s × \d+ subs/);
  });

  it('a card has one Remove, and its slot goes with it', async () => {
    const user = userEvent.setup();
    seed('m31', 'ic405');
    await app();
    expect(within(part()).getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Remove Andromeda Galaxy from the plan' }));
    expect(names()).toEqual(['Flaming Star Nebula']);
    expect(storedPlan()!.targets.map((t) => t.id)).toEqual(['ic405']);
  });

  it('on a smart scope train the cards still list the plan\'s targets, with no subs of their own to count', async () => {
    seed('m31');
    await app(withTrain('smart-seestar-s50'));
    expect(names()).toEqual(['Andromeda Galaxy']);
    expect(light(slots()[0])).not.toMatch(/\d+ s × \d+ subs/);
  });

  it('schedules the first eight targets of the plan and says how many are not scheduled; all stay in the plan', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['m31', 'm42', 'm13', 'm45', 'ngc7000', 'ic405', 'ngc1499', 'm33', 'm51', 'm81'] }));
    await app();
    expect(names()).toHaveLength(10);
    expect(slots().filter((li) => li.querySelector('[data-testid="slot-altitude"]') !== null)).toHaveLength(8); // the slot's own figures: only the scheduled cards have them
    expect(screen.getByTestId('timeline-unscheduled').textContent).toBe('2 targets not scheduled');
    expect(storedPlan()!.targets).toHaveLength(10);
  });

  it('a planet slot that crosses the meridian shows the flip chip and takes the flip minutes (Neptune)', async () => {
    seed('planet-neptune');
    await app();
    const li = slots()[0];
    expect(chips(li)).toMatch(/Flip \+10 min/);
    const [start, end] = times()[0]!;
    expect(toMin(end) - toMin(start)).toBe(30); // 20 min of clips and the 10 min flip
    expect(light(li)).toBe('20 min');
  });

  it('the Moon is a slot like any body, and has no flip', async () => {
    seed('planet-moon');
    await app();
    expect(names()).toEqual(['Moon']);
    expect(light(slots()[0])).toBe('20 min');
    expect(chips(slots()[0])).not.toMatch(/flip/i);
  });

  it('a planet slot is a short block with no subs', async () => {
    seed('planet-saturn');
    await app();
    expect(light(slots()[0])).toBe('20 min');
  });
});
