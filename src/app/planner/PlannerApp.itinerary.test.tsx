/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// The Night itinerary, driven with real key events on the whole page (C11 + 0.7x reducer + ASI533MC, the evening of 2026-12-15).

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const app = (profile = withTrain('deep-c11-reducer-533')) => render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} />);
const section = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
const slots = () => within(section()).queryAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('slot-') && !li.getAttribute('data-testid')!.startsWith('slot-time'));
const names = () => slots().map((li) => li.querySelector('h3')!.textContent!.replace(/^\d+\. /, ''));
const times = () => slots().map((li) => /(\d\d:\d\d) to (\d\d:\d\d)/.exec(li.textContent ?? '')?.slice(1, 3) ?? null);
/** The chips a slot shows; the invisible copies kept to reserve room are not in this element. */
const chips = (li: HTMLElement) => within(li).getByTestId(/^slot-chips-/).textContent ?? '';
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

async function add(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.selectOptions(screen.getByLabelText('Target to add'), id);
  const button = within(section()).getByRole('button', { name: 'Add to itinerary' });
  button.focus();
  await user.keyboard('{Enter}');
}

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Night itinerary', () => {
  it('starts empty with an instruction, and adds a slot from the keyboard with times labelled estimate', async () => {
    const user = userEvent.setup();
    app();
    expect(within(section()).getByText(/Choose a target above and add it\. Reorder with the Up and Down buttons\./)).toBeTruthy();
    await add(user, 'm31');
    expect(names()).toEqual(['Andromeda Galaxy']);
    const li = slots()[0];
    expect(li.textContent).toMatch(/\d\d:\d\d to \d\d:\d\d \(estimate\)/);
    expect(li.textContent).toMatch(/Light: \d+ s x \d+ subs = [\d.]+ min \(estimate\)\./);
    expect(screen.getByTestId('itinerary-totals').textContent).toMatch(/^Light \d+ min, changeover 0 min, waiting 0 min; 0 filter changes, 0 train changes; ends \d\d:\d\d\. All estimates\.$/);
    expect(screen.getByTestId('itinerary-why').textContent).toMatch(/Why this order: One slot to place\./);
  });

  it('Down and Up reorder with the keyboard, start times follow, and focus stays on the button that was pressed', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'm31');
    await add(user, 'ic405');
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    const before = times();
    const down = within(section()).getByRole('button', { name: 'Move Andromeda Galaxy down' });
    down.focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['Flaming Star Nebula', 'Andromeda Galaxy']);
    const after = times();
    // The first slot starts when its target clears the horizon (both are up from dusk): the same moment; the second moves.
    expect(after[0]![0]).toBe(before[0]![0]);
    expect(after[1]![0]).not.toBe(before[1]![0]);
    expect(toMin(after[1]![0])).toBe(toMin(after[0]![1]) + 3); // end of the first plus the 3 minute slew and centre
    // Focus followed the slot: it is on that slot's Down button, now second in the list.
    expect(document.activeElement).toBe(within(section()).getByRole('button', { name: 'Move Andromeda Galaxy down' }));
    await user.keyboard('{Space}'); // Down on the last slot does nothing
    expect(names()).toEqual(['Flaming Star Nebula', 'Andromeda Galaxy']);
    const up = within(section()).getByRole('button', { name: 'Move Andromeda Galaxy up' });
    up.focus();
    await user.keyboard(' ');
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect(times()).toEqual(before);
    expect(document.activeElement).toBe(within(section()).getByRole('button', { name: 'Move Andromeda Galaxy up' }));
  });

  it('Up on the first slot and Down on the last stay focusable but are marked disabled, and do nothing', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'm31');
    await add(user, 'ic405');
    const up = within(section()).getByRole('button', { name: 'Move Andromeda Galaxy up' });
    expect(up.getAttribute('aria-disabled')).toBe('true');
    up.focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect(document.activeElement).toBe(up);
    expect(within(section()).getByRole('button', { name: 'Move Flaming Star Nebula down' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(section()).getByRole('button', { name: 'Move Flaming Star Nebula up' }).getAttribute('aria-disabled')).toBe('false');
  });

  it('a long slot before a short window gives a visible overlap warning, in the slot and in the details', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'm31');
    await add(user, 'm42');
    const second = slots()[1];
    expect(chips(second)).toMatch(/Warning: overlaps window/);
    expect(chips(second)).toMatch(/Note: cut short/);
    await user.click(within(second).getByRole('button', { name: 'Details for Orion Nebula' }));
    const detail = screen.getByTestId('slot-detail');
    expect(within(detail).getAllByText(/^Overlaps its usable window: the slot before ends \d\d:\d\d, \d+ min after Orion Nebula's window opened \(\d\d:\d\d\), and the window closes \d\d:\d\d\.$/).length).toBeGreaterThan(0);
    expect(detail.textContent).toMatch(/Warning/);
    // Reorder so the Orion Nebula goes first: the overlap is gone.
    const up = within(second).getByRole('button', { name: 'Move Orion Nebula up' });
    up.focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['Orion Nebula', 'Andromeda Galaxy']);
    expect(chips(slots()[0])).not.toMatch(/overlaps window/);
    expect(chips(slots()[0])).toMatch(/Note: waits/);
  });

  it('a different filter on the second slot adds the swap and a refocus to the gap and says so', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'm31');
    await add(user, 'ic405');
    const gap = () => toMin(times()[1]![0]) - toMin(times()[0]![1]);
    expect(gap()).toBe(3);
    await user.selectOptions(within(slots()[1]).getByLabelText('Filter for Flaming Star Nebula'), 'zwo-duo-band');
    expect(gap()).toBe(8); // slew and centre 3, filter change 2, refocus 3
    expect(slots()[1].textContent).toMatch(/Before it: 8 min \(estimate\)\./);
    expect(screen.getByTestId('itinerary-totals').textContent).toMatch(/1 filter change, 0 train changes/);
    await user.selectOptions(within(slots()[1]).getByLabelText('Train for Flaming Star Nebula'), 'deep-c11-2600');
    expect(gap()).toBe(23);
    expect(screen.getByTestId('itinerary-totals').textContent).toMatch(/1 filter change, 1 train change/);
  });

  it('is saved with a version and comes back after a reload, notes and filter included', async () => {
    const user = userEvent.setup();
    const { unmount } = app();
    await add(user, 'm31');
    await user.selectOptions(within(slots()[0]).getByLabelText('Filter for Andromeda Galaxy'), 'zwo-duo-band');
    await user.type(within(slots()[0]).getByLabelText('Note for Andromeda Galaxy'), 'frame wide');
    const stored = JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!);
    expect(stored.version).toBe(1);
    expect(stored.items).toHaveLength(1);
    expect(stored.items[0]).toMatchObject({ targetId: 'm31', filterId: 'zwo-duo-band', note: 'frame wide', mode: 'balanced' });
    unmount();
    app();
    expect(names()).toEqual(['Andromeda Galaxy']);
    expect((within(slots()[0]).getByLabelText('Note for Andromeda Galaxy') as HTMLInputElement).value).toBe('frame wide');
    expect((within(slots()[0]).getByLabelText('Filter for Andromeda Galaxy') as HTMLSelectElement).value).toBe('zwo-duo-band');
  });

  it('a corrupt saved itinerary is reported with its field path, the page still works, and the stored text stays until a change', async () => {
    const user = userEvent.setup();
    const bad = JSON.stringify({ version: 1, items: [{ id: 'a', targetId: 'm31', trainId: 'x', filterId: null, mode: 'fast', note: '' }] });
    window.localStorage.setItem(ITINERARY_KEY, bad);
    app();
    const alert = within(section()).getByRole('alert');
    expect(alert.textContent).toMatch(/Saved itinerary rejected, \$\.items\[0\]\.mode: must be one of quick, balanced, deep/);
    expect(window.localStorage.getItem(ITINERARY_KEY)).toBe(bad);
    expect(names()).toEqual([]);
    await add(user, 'm31');
    expect(names()).toEqual(['Andromeda Galaxy']);
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).items).toHaveLength(1);
    expect(within(section()).queryByRole('alert')).toBeNull();
  });

  it('a saved slot that points at something gone shows a problem on that slot only', async () => {
    window.localStorage.setItem(
      ITINERARY_KEY,
      JSON.stringify({ version: 1, items: [{ id: 'a', targetId: 'm31', trainId: 'deep-c11-reducer-533', filterId: 'removed-filter', mode: 'balanced', note: '' }, { id: 'b', targetId: 'ic405', trainId: 'deep-c11-reducer-533', filterId: null, mode: 'quick', note: '' }] }),
    );
    app();
    expect(chips(slots()[0])).toMatch(/Warning: problem/);
    expect((within(slots()[0]).getByLabelText('Filter for Andromeda Galaxy') as HTMLSelectElement).value).toBe('removed-filter');
    expect(slots()[1].textContent).toMatch(/Light: \d+ s x \d+ subs/);
  });

  it('Remove drops the slot and puts focus back on the Add box', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'm31');
    await add(user, 'ic405');
    const remove = within(section()).getByRole('button', { name: 'Remove Andromeda Galaxy' });
    remove.focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['Flaming Star Nebula']);
    expect(document.activeElement).toBe(screen.getByLabelText('Target to add'));
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).items.map((i: { targetId: string }) => i.targetId)).toEqual(['ic405']);
  });

  it('on a smart scope train the Add button is off and the reason is given', () => {
    app(withTrain('smart-seestar-s50'));
    expect(within(section()).getByRole('button', { name: 'Add to itinerary' })).toHaveProperty('disabled', true);
    expect(screen.getByTestId('itinerary-add-note').textContent).toMatch(/Pick an optical train at the top of the page/);
  });

  it('holds at most eight slots and says so', async () => {
    const user = userEvent.setup();
    app();
    for (let i = 0; i < 8; i++) await add(user, 'm31');
    expect(names()).toHaveLength(8);
    expect(within(section()).getByRole('button', { name: 'Add to itinerary' })).toHaveProperty('disabled', true);
    expect(screen.getByTestId('itinerary-add-note').textContent).toMatch(/at most 8 slots/);
  });

  it('a planet slot is a short block with no subs', async () => {
    const user = userEvent.setup();
    app();
    await add(user, 'planet-saturn');
    expect(slots()[0].textContent).toMatch(/Planet: short video clips, about 20 min \(estimate\)\. See the Planets checklist\./);
  });
});
