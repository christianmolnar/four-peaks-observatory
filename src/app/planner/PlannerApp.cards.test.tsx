/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp, { shortWhy } from './PlannerApp';

// Below md the ranked targets are stacked cards, from the same data as the table rows.
// jsdom applies no CSS, so both layouts are in the DOM here; the real page hides one with display:none.

const app = () => render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
const cards = () => within(screen.getByTestId('target-cards')).getAllByRole('listitem');
const tableRows = () =>
  within(screen.getByTestId('target-table')).getAllByRole('row').filter((r) => r.querySelector('th[scope="row"]'));

afterEach(cleanup);

describe('target cards (phone layout)', () => {
  it('has one card per table row, in the same order, with the same collapsed description', () => {
    app();
    expect(cards().length).toBe(tableRows().length);
    const cardNames = cards().map((c) => within(c).getAllByRole('button')[0].textContent);
    const rowNames = tableRows().map((r) => within(r).getAllByRole('button')[0].textContent);
    expect(cardNames).toEqual(rowNames);
    const first = within(cards()[0]).getByRole('button', { name: /^Why (recommended|it is listed)/ });
    const line = document.getElementById(first.getAttribute('aria-controls') as string)!.textContent as string;
    expect(screen.getByTestId('target-table').textContent).toContain(line);
  });

  it('shows season, setup, peak, usable window, Moon and score as labelled terms', () => {
    app();
    const terms = within(cards()[0]).getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Season', 'Setup', 'Peak', 'Usable window', 'Moon', 'Score']);
  });

  it('selects a target and toggles Captured from the card, by keyboard', async () => {
    const u = userEvent.setup();
    app();
    const card = () => cards()[1];
    const select = within(card()).getAllByRole('button')[0];
    expect(select.getAttribute('aria-pressed')).toBe('false');
    select.focus();
    await u.keyboard('{Enter}');
    expect(within(card()).getAllByRole('button')[0].getAttribute('aria-pressed')).toBe('true');
    const box = within(card()).getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.focus();
    await u.keyboard(' ');
    expect((within(card()).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });

  it('hides the cards from lg up and the table below lg', () => {
    app();
    expect(screen.getByTestId('target-cards').className).toContain('lg:hidden');
    expect((screen.getByTestId('target-table').parentElement as HTMLElement).className).toContain('hidden lg:block');
  });

  describe('"Why recommended" toggle', () => {
    const toggles = () => within(screen.getByTestId('target-cards')).getAllByRole('button', { name: /^Why (recommended|it is listed)/ });
    const body = (b: HTMLElement) => document.getElementById(b.getAttribute('aria-controls') as string)!;

    it('starts collapsed on every target: one short line that ends cleanly, no score parts', () => {
      app();
      expect(toggles().length).toBe(cards().length);
      for (const b of toggles()) {
        expect(b.getAttribute('aria-expanded')).toBe('false');
        const line = body(b).textContent as string;
        expect(line.length).toBeLessThanOrEqual(81);
        expect(line).toMatch(/[.…]$/);
        expect(line).not.toMatch(/Score parts/);
      }
    });

    it('opens one target by mouse without touching the others, and closes it again', async () => {
      const u = userEvent.setup();
      app();
      await u.click(toggles()[1]);
      expect(toggles().map((b) => b.getAttribute('aria-expanded'))).toEqual(toggles().map((_, i) => (i === 1 ? 'true' : 'false')));
      expect(body(toggles()[1]).textContent).toContain('Score parts: usable');
      expect(body(toggles()[0]).textContent).not.toContain('Score parts');
      await u.click(toggles()[1]);
      expect(toggles()[1].getAttribute('aria-expanded')).toBe('false');
    });

    it('opens and closes by keyboard (Enter, then Space)', async () => {
      const u = userEvent.setup();
      app();
      toggles()[0].focus();
      await u.keyboard('{Enter}');
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('true');
      await u.keyboard(' ');
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
    });

    it('the table row for the same target opens with the same state, and a fresh render is collapsed again', async () => {
      const u = userEvent.setup();
      app();
      await u.click(toggles()[0]);
      const rowToggle = within(screen.getByTestId('target-table')).getAllByRole('button', { name: /^Why (recommended|it is listed)/ })[0];
      expect(rowToggle.getAttribute('aria-expanded')).toBe('true');
      cleanup();
      app();
      expect(toggles()[0].getAttribute('aria-expanded')).toBe('false');
    });
  });

  it('gives each card a visible Captured label and keeps each time range in one piece', () => {
    app();
    const first = cards()[0];
    expect(within(first).getByText('Captured')).toBeTruthy();
    const ranges = within(first).getAllByText(/^\d{1,2}:\d{2}.* to \d{1,2}:\d{2}.*$/);
    for (const r of ranges) expect(r.className).toContain('whitespace-nowrap');
  });

  describe('shortWhy', () => {
    it('keeps a short first sentence whole, drops the second sentence, and never ends mid-word', () => {
      expect(shortWhy('Clear of the horizon for 5.2 h. In season.')).toBe('Clear of the horizon for 5.2 h.');
      const long = 'Never clears the flat 20 deg minimum (horizon not set) tonight; it peaks at 12 deg in the south-east.';
      const cut = shortWhy(long);
      expect(cut.length).toBeLessThanOrEqual(81);
      expect(cut.endsWith('…')).toBe(true);
      expect(long).toContain(cut.slice(0, -1) + ' ');
    });

    it('never ends on a number, so a value keeps its unit', () => {
      const why = 'Never clears the flat 20 deg minimum (horizon not set) tonight; it peaks at -10 deg in the E.';
      expect(shortWhy(why)).not.toMatch(/-?\d…$/);
      expect(shortWhy(why)).toBe('Never clears the flat 20 deg minimum (horizon not set) tonight; it peaks at…');
    });
  });
});
