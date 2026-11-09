/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// Below md the ranked targets are stacked cards, from the same data as the table rows.
// jsdom applies no CSS, so both layouts are in the DOM here; the real page hides one with display:none.

const app = () => render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
const cards = () => within(screen.getByTestId('target-cards')).getAllByRole('listitem');
const tableRows = () =>
  within(screen.getByTestId('target-table')).getAllByRole('row').filter((r) => r.querySelector('th[scope="row"]'));

afterEach(cleanup);

describe('target cards (phone layout)', () => {
  it('has one card per table row, in the same order, with the same description text', () => {
    app();
    expect(cards().length).toBe(tableRows().length);
    const cardNames = cards().map((c) => within(c).getAllByRole('button')[0].textContent);
    const rowNames = tableRows().map((r) => within(r).getAllByRole('button')[0].textContent);
    expect(cardNames).toEqual(rowNames);
    const first = cards()[0].textContent as string;
    const rowsText = screen.getByTestId('target-table').textContent as string;
    for (const part of [/Why (recommended|it is listed):[^]*?(?=Score parts)/, /Score parts:[^]*?Fit: [^.]*\./]) {
      const m = first.match(part);
      expect(m).not.toBeNull();
      expect(rowsText).toContain((m as RegExpMatchArray)[0]);
    }
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

  it('hides the cards from md up and the table below md', () => {
    app();
    expect(screen.getByTestId('target-cards').className).toContain('md:hidden');
    expect((screen.getByTestId('target-table').parentElement as HTMLElement).className).toContain('hidden md:block');
  });
});
