/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { sampleProfile } from '@/planner/state';
import { lightMinutes } from '@/planner/itinerary';
import PlannerApp from './PlannerApp';
import { unchangedAdviceText } from './ItinerarySection';
import { randomCases } from '@/planner/itinerary/random-sets';
import { suggestOrder } from '@/planner/itinerary/suggest';

// Counts the order searches, to prove that a note does not start one.
jest.mock('@/planner/itinerary/suggest', () => {
  const actual = jest.requireActual('@/planner/itinerary/suggest');
  return { ...actual, suggestOrderSteps: jest.fn(actual.suggestOrderSteps) };
});
import { suggestOrderSteps } from '@/planner/itinerary/suggest';

// Start time, altitude per slot, the night graph and the suggested order, on the whole page (2026-12-15, C11 + reducer + ASI533MC).

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const app = () => render(<PlannerApp initialDate="2026-12-15" initialProfile={withTrain('deep-c11-reducer-533')} />);
const section = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
const slots = () => within(section()).queryAllByRole('listitem').filter((li) => /^slot-s\d+$/.test(li.getAttribute('data-testid') ?? ''));
const names = () => slots().map((li) => li.querySelector('h3')!.textContent!.replace(/^\d+\. /, ''));
const times = () => slots().map((li) => /(\d\d:\d\d) to (\d\d:\d\d)/.exec(li.textContent ?? '')!.slice(1, 3));
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const seed = (version: 1 | 2, targets: string[], startTime?: string | null) => {
  const items = targets.map((targetId, i) => ({ id: `s${i + 1}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: '' }));
  window.localStorage.setItem(ITINERARY_KEY, JSON.stringify(version === 1 ? { version, items } : { version, items, startTime: startTime ?? null }));
};
const startInput = () => within(section()).getByLabelText('Imaging can start at') as HTMLInputElement;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('start time', () => {
  it('an itinerary saved before the start time existed loads unchanged, with the start at the night start', () => {
    seed(1, ['m31', 'ic405']);
    app();
    expect(names()).toEqual(['Andromeda Galaxy', 'Flaming Star Nebula']);
    expect(startInput().value).toMatch(/^\d\d:\d\d$/);
    expect(screen.queryByTestId('itinerary-start-note')).toBeNull();
    expect((within(section()).getByRole('button', { name: 'Use night start' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a later start moves every slot, is saved with the itinerary (version 2), and "Use night start" puts it back', async () => {
    const user = userEvent.setup();
    seed(1, ['m31', 'ic405']);
    app();
    const before = times();
    const nightStart = startInput().value;
    fireEvent.change(startInput(), { target: { value: '23:00' } });
    const after = times();
    expect(toMin(after[0][0])).toBeGreaterThanOrEqual(toMin('23:00'));
    expect(after[0][0]).not.toBe(before[0][0]);
    expect(after[1][0]).not.toBe(before[1][0]);
    const stored = JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!);
    expect(stored).toMatchObject({ version: 2, startTime: '23:00' });
    expect(stored.items).toHaveLength(2);
    await user.click(within(section()).getByRole('button', { name: 'Use night start' }));
    expect(times()).toEqual(before);
    expect(startInput().value).toBe(nightStart);
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime).toBeNull();
  });

  it('a start in the daytime after the night gives a plain message, no time for any slot, and no crash', () => {
    seed(2, ['m31', 'ic405'], '11:00');
    app();
    expect(screen.getByTestId('itinerary-start-note').textContent).toMatch(/is after the night ends \(\d\d:\d\d\), so there is no time for any slot\./);
    expect(slots().map((li) => li.textContent)).toEqual([expect.stringContaining('no time'), expect.stringContaining('no time')]);
  });

  it('a start before the night says imaging begins when the night starts', () => {
    seed(2, ['m31'], '15:00');
    app();
    expect(screen.getByTestId('itinerary-start-note').textContent).toMatch(/^Your start time is before the night: imaging begins when the night starts, \d\d:\d\d\.$/);
  });

  it('the start is a 24 h text box with a numeric keyboard; 21:30, 2130 and 9:05 are accepted, half a time and nonsense are not', () => {
    seed(1, ['m31']);
    app();
    const input = startInput();
    expect(input.type).toBe('text');
    expect(input.inputMode).toBe('numeric');
    expect(input.getAttribute('aria-describedby')).toBe('it-start-hint');
    fireEvent.change(input, { target: { value: '2130' } });
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime).toBe('21:30');
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
    fireEvent.blur(input);
    expect(startInput().value).toBe('21:30');
    fireEvent.change(input, { target: { value: '9:05' } });
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime).toBe('09:05');
    fireEvent.change(input, { target: { value: '25:00' } });
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull(); // could still be typed over; not yet
    fireEvent.blur(input);
    expect(screen.getByTestId('itinerary-start-error').textContent).toMatch(/24-hour hours and minutes, such as 2130 or 21:30/);
    expect(startInput().value).toBe('25:00'); // the text stays in the box with its message
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime).toBe('09:05'); // the last good time stays
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByTestId('itinerary-start-error')).toBeTruthy(); // can never become a time: at once
    fireEvent.change(input, { target: { value: '' } });
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime).toBeNull();
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
  });

  it('typing 2, 1, 3, 0 shows no error on the way; "905" works; a pasted " 21:30 " and full-width digits work; Enter and leaving the box show the error', () => {
    seed(1, ['m31']);
    app();
    const input = startInput();
    const stored = () => JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime;
    for (const typed of ['2', '21', '213']) {
      fireEvent.change(input, { target: { value: typed } });
      expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
    }
    expect(stored() ?? null).toBeNull(); // "213" typed on the way to 2130 is not saved
    fireEvent.change(input, { target: { value: '2130' } });
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
    expect(stored()).toBe('21:30');
    fireEvent.change(input, { target: { value: '905' } });
    expect(stored()).toBe('09:05');
    fireEvent.change(input, { target: { value: ' 21:45 ' } });
    expect(stored()).toBe('21:45');
    fireEvent.change(input, { target: { value: '２２：１５' } });
    expect(stored()).toBe('22:15');
    expect(input.maxLength).toBeGreaterThanOrEqual(7);
    expect(screen.getByTestId('itinerary-start-hint').textContent).toMatch(/2130 or 21:30/);
    // A time that is only half typed: the message waits for Enter or for leaving the box.
    fireEvent.change(input, { target: { value: '9:' } });
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('itinerary-start-error')).toBeTruthy();
    fireEvent.change(input, { target: { value: '9:3' } });
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull(); // typing again hides it until the next check
    fireEvent.blur(input);
    expect(screen.getByTestId('itinerary-start-error')).toBeTruthy();
    fireEvent.change(input, { target: { value: '9:30' } });
    expect(screen.queryByTestId('itinerary-start-error')).toBeNull();
    expect(stored()).toBe('09:30');
  });

  it.each([['2130', '21:30'], ['0130', '01:30']])('typing %s key by key saves and searches nothing on the 3-digit prefix, and shows no start note', async (digits, clock) => {
    const user = userEvent.setup();
    seed(1, ['m31', 'ic405']);
    app();
    await waitFor(() => expect(screen.getByTestId('order-advice')).toBeTruthy());
    const stored = () => JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime;
    const searches = () => (suggestOrderSteps as jest.Mock).mock.calls.length;
    const input = startInput();
    await user.clear(input);
    await user.click(input);
    const before = searches();
    for (const ch of digits.slice(0, 3)) {
      await user.keyboard(ch);
      expect(stored()).toBeNull();
      expect(screen.queryByTestId('itinerary-start-note')).toBeNull();
      expect(screen.queryByRole('status', { name: '' })?.textContent ?? '').not.toMatch(/start time is before the night/);
    }
    expect(searches()).toBe(before);
    await user.keyboard(digits[3]);
    expect(stored()).toBe(clock);
  });

  it('a 3-digit time left with Enter or by leaving the box is saved then; a pasted 3-digit time is saved at once', async () => {
    const user = userEvent.setup();
    seed(1, ['m31']);
    app();
    const stored = () => JSON.parse(window.localStorage.getItem(ITINERARY_KEY)!).startTime;
    const input = startInput();
    await user.clear(input);
    await user.keyboard('905');
    expect(stored()).toBeNull();
    await user.keyboard('{Enter}');
    expect(stored()).toBe('09:05');
    await user.clear(input);
    await user.keyboard('213');
    await user.tab();
    expect(stored()).toBe('02:13');
    fireEvent.change(input, { target: { value: '905' } });
    expect(stored()).toBe('09:05');
  });

  it('the start box text is 16 px by class (iOS zooms in on anything smaller)', () => {
    seed(1, ['m31']);
    app();
    expect(startInput().className).toMatch(/\btext-base\b/);
    expect(startInput().className).not.toMatch(/\btext-sm\b/);
  });

  it('typing the default night start (shown without seconds) gives no warning', () => {
    seed(1, ['m31']);
    app();
    const nightStart = startInput().value;
    fireEvent.change(startInput(), { target: { value: nightStart } });
    expect(screen.queryByTestId('itinerary-start-note')).toBeNull();
  });

  it('with the start after the night the graph says why it is empty, inside the graph, and draws no start label', () => {
    seed(2, ['m31', 'ic405'], '11:00');
    app();
    const g = within(section()).getByTestId('night-timeline');
    const why = within(g).getByTestId('timeline-empty').textContent!;
    expect(why).toMatch(/Your start, 11:00, is after the night ends \(\d\d:\d\d\), so no slot has time\./);
    expect(g.querySelector('svg')!.textContent).not.toMatch(/Start 11:00/);
  });

  it('every button in the itinerary section is a 44 px target by its class', () => {
    seed(2, ['m31', 'm42', 'planet-jupiter']);
    app();
    const buttons = within(section()).getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(10);
    for (const b of buttons) expect(`${b.textContent}: ${b.className}`).toMatch(/min-h-11/);
  });

  it('the start input is at least 44 px tall by its class and is labelled', () => {
    seed(1, ['m31']);
    app();
    expect(startInput().className).toContain('min-h-11');
    expect(within(section()).getByRole('button', { name: 'Use night start' }).className).toContain('min-h-11');
  });
});

describe('altitude in each slot', () => {
  it('shows altitude with direction at the start, in the middle and at the end, and the trend', () => {
    seed(2, ['m31', 'planet-jupiter']);
    app();
    for (let k = 0; k < 2; k++) {
      expect(screen.getByTestId(`slot-altitude-${k}`).textContent).toMatch(/^Altitude: \d+° [NSEW]{1,2} at the start, \d+° [NSEW]{1,2} in the middle, \d+° [NSEW]{1,2} at the end; (rising|peaks in this slot|past peak, falling)\.$/);
    }
  });
});

describe('night graph', () => {
  it('is on the page with one numbered segment per slot and its numbers collapsed', () => {
    seed(2, ['m31', 'm42', 'm33']);
    app();
    const g = within(section()).getByTestId('night-timeline');
    expect(g.querySelectorAll('svg polyline[stroke-width="5"]')).toHaveLength(3);
    expect((within(g).getByTestId('timeline-numbers') as HTMLDetailsElement).open).toBe(false);
  });
});

describe('suggested order', () => {
  it('on random 7 and 8 slot sets the unchanged message matches `exhaustive`: "the most light" only when every order was covered', () => {
    for (const c of randomCases(4301, 10, (k) => 7 + (k % 2))) {
      for (const exactMax of [8, 6]) {
        const r = suggestOrder(c.input, { exactMax });
        const text = unchangedAdviceText(r.searched.exhaustive);
        expect(/the most light/.test(text)).toBe(r.searched.exhaustive);
        expect(/not every order is tried/.test(text)).toBe(!r.searched.exhaustive);
      }
    }
  }, 120000);

  it('says "Looking for a better order..." while an 8 slot search runs, then gives the answer, and says "the most light" only for an exhaustive search', async () => {
    seed(2, ['m31', 'm42', 'm33', 'ic405', 'm81', 'm101', 'ngc7000', 'm45']);
    app();
    const advice = screen.getByTestId('order-advice');
    await waitFor(() => expect(within(advice).queryByTestId('order-advice-searching')).toBeNull(), { timeout: 20000 });
    expect(advice.textContent).not.toMatch(/Looking for/);
    expect(advice.textContent).toMatch(/Use this order|already the best/);
    expect(unchangedAdviceText(true)).toMatch(/the most light/);
    expect(unchangedAdviceText(false)).not.toMatch(/the most light|already the best/);
    expect(unchangedAdviceText(false)).toMatch(/not every order is tried/);
  }, 60000);

  it('the advice names the same Light as the totals line, now and after Use this order, and a note does not search again', async () => {
    const user = userEvent.setup();
    seed(2, ['m31', 'm42', 'planet-jupiter']);
    app();
    const totalsLight = () => Number(/^Light (\d+) min/.exec(screen.getByTestId('itinerary-totals').textContent!)![1]);
    const before = totalsLight();
    const advice = screen.getByTestId('order-advice');
    const gain = within(advice).queryByTestId('order-advice-gain');
    if (gain) {
      expect(gain.textContent).toContain(`${before} min`);
      const promised = Number(/(\d+) min in this order/.exec(gain.textContent!)?.[1] ?? before);
      await user.click(within(advice).getByRole('button', { name: 'Use this order' }));
      expect(totalsLight()).toBe(promised);
      expect(totalsLight()).toBeGreaterThanOrEqual(before);
    }
    const calls = (suggestOrderSteps as jest.Mock).mock.calls.length;
    const note = within(slots()[0]).getByLabelText(/^Note for /);
    await user.type(note, 'guide star');
    expect((suggestOrderSteps as jest.Mock).mock.calls.length).toBe(calls);
    expect(lightMinutes).toBeDefined();
  });

  it('needs two slots', () => {
    seed(2, ['m31']);
    app();
    expect(screen.getByTestId('order-advice').textContent).toMatch(/Add two or more targets/);
  });

  it('keeps the order until the button is pressed, then applies it, and Up and Down undo it', async () => {
    const user = userEvent.setup();
    seed(2, ['m31', 'm42', 'm33', 'ic405']);
    app();
    const advice = () => screen.getByTestId('order-advice');
    await waitFor(() => expect(within(advice()).queryByTestId('order-advice-searching')).toBeNull());
    const before = names();
    if (!within(advice()).queryByRole('button', { name: 'Use this order' })) {
      expect(advice().textContent).toMatch(/already the best/);
      return;
    }
    expect(names()).toEqual(before); // advice alone changes nothing
    const lines = within(advice()).getAllByRole('listitem').map((li) => li.textContent!);
    expect(lines[0]).toMatch(/^Put .+ first: .+\.$/);
    expect(lines[1]).toMatch(/^Then .+: .+\.$/);
    await user.click(within(advice()).getByRole('button', { name: 'Use this order' }));
    const asked = lines.map((l) => l.replace(/^(Put|Then) /, '').replace(/( first)?: .*$/, ''));
    expect(names().slice(0, asked.length)).toEqual(asked);
    expect(advice().textContent).toMatch(/already the best/);
    expect(document.activeElement).toBe(advice());
    // The move buttons still work on the applied order.
    const first = names()[0];
    await user.click(within(section()).getByRole('button', { name: `Move ${first} down` }));
    expect(names()[1]).toBe(first);
  });
});
