/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

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
    const before = names();
    if (!within(advice()).queryByRole('button', { name: 'Use this order' })) {
      expect(advice().textContent).toMatch(/already the best found/);
      return;
    }
    expect(names()).toEqual(before); // advice alone changes nothing
    const lines = within(advice()).getAllByRole('listitem').map((li) => li.textContent!);
    expect(lines[0]).toMatch(/^Put .+ first: .+\.$/);
    expect(lines[1]).toMatch(/^Then .+: .+\.$/);
    await user.click(within(advice()).getByRole('button', { name: 'Use this order' }));
    const asked = lines.map((l) => l.replace(/^(Put|Then) /, '').replace(/( first)?: .*$/, ''));
    expect(names().slice(0, asked.length)).toEqual(asked);
    expect(advice().textContent).toMatch(/already the best found/);
    expect(document.activeElement).toBe(advice());
    // The move buttons still work on the applied order.
    const first = names()[0];
    await user.click(within(section()).getByRole('button', { name: `Move ${first} down` }));
    expect(names()[1]).toBe(first);
  });
});
