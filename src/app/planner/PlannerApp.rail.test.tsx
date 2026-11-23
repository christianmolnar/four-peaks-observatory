/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { pageProps, planRowItems, ready, seedPlan } from './testkit';

// R6d: the read-only plan rail from 1024 px, and the slim header's slot for the Night mode toggle and Sign in.

const mockWidth = (wide: boolean) => {
  window.matchMedia = ((q: string) => ({
    matches: wide,
    media: q,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
};
const m31 = { id: 'm31', preset: 'balanced' };
const ic405 = { id: 'ic405', preset: 'deep' };

const app = async (targets: readonly object[], wide = true) => {
  mockWidth(wide);
  seedPlan(targets, sampleProfile);
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const rail = () => screen.getByTestId('plan-rail');

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  window.localStorage.clear();
  (window.HTMLElement.prototype.scrollIntoView as jest.Mock).mockClear();
});
afterEach(cleanup);

describe('the plan rail', () => {
  it('caps its height to the room the panel leaves above the page bottom (the real geometry is checked in a browser)', async () => {
    await app([m31]);
    expect(rail().style.getPropertyValue('--rail-below')).toMatch(/^\d+px$/);
    expect(rail().className).toContain('var(--rail-below');
  });

  it('is not in the page below 1024 px (no second copy of its buttons)', async () => {
    await app([m31], false);
    expect(screen.queryByTestId('plan-rail')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Plan my night with AI' })).toHaveLength(1);
  });

  it('shows the plan name, the target count and the targets in order with their mode, equal to the plan rows', async () => {
    await app([m31, ic405]);
    expect(within(rail()).getByTestId('rail-title').textContent).toBe('My plan2 targets');
    const items = within(rail()).getAllByRole('listitem');
    const rows = planRowItems();
    expect(items).toHaveLength(2);
    rows.forEach((li, i) => {
      const name = li.querySelector('h3')!.textContent!.replace(/^\d+\.\s*/, '').replace(/×$/, '');
      expect(items[i].textContent).toContain(name);
      expect(items[i].textContent).toContain(i === 0 ? 'Balanced' : 'Deep');
      expect(items[i].textContent).toMatch(/^\d+\./);
    });
  });

  it('shows each target\'s time window from the timeline once there is one', async () => {
    await app([m31]);
    const slot = screen.getByTestId('card-m31-times').textContent!;
    expect(within(rail()).getAllByRole('listitem')[0].textContent).toContain(slot.replace(' to ', ' to '));
  });

  it('says Light and the night from the timeline\'s own numbers', async () => {
    await app([m31, ic405]);
    const min = [...screen.getByTestId('itinerary-totals').textContent!.matchAll(/Light (?:(\d+) h)? ?(?:(\d+) min)?/g)].map((m) => Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0))[0];
    const night = /\((\d+\.\d) h\)/.exec(screen.getByTestId('night-summary').textContent!)![1];
    const h = Math.floor(min / 60);
    const m = min % 60;
    const light = h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
    expect(within(rail()).getByTestId('rail-light').textContent).toBe(`Light ${light}, night ${night} h`);
  });

  it('follows the plan: a removed target leaves the rail and the Light changes with it', async () => {
    await app([m31, ic405]);
    const before = within(rail()).getByTestId('rail-light').textContent;
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove .* from the plan$/ })[0]);
    expect(within(rail()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(rail()).getByTestId('rail-title').textContent).toContain('1 target');
    expect(within(rail()).getByTestId('rail-light').textContent).not.toBe(before);
  });

  it('says so when the plan is empty, with no list', async () => {
    await app([]);
    expect(within(rail()).getByTestId('rail-empty').textContent).toBe('No targets yet.');
    expect(within(rail()).queryByRole('list')).toBeNull();
    expect(within(rail()).getByTestId('rail-title').textContent).toBe('My plan0 targets');
  });

  it('a click on a target scrolls to its row and moves focus to it', async () => {
    await app([m31, ic405]);
    const rows = planRowItems();
    fireEvent.click(within(rail()).getAllByRole('button')[1]);
    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1].id).toBe(`plan-row-${ic405.id}`);
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect((window.HTMLElement.prototype.scrollIntoView as jest.Mock).mock.contexts.at(-1)).toBe(rows[1]);
    expect(rows[1].className).toContain('scroll-mt-4');
  });

  it('is read-only: no Remove and no exposure control inside it', async () => {
    await app([m31]);
    expect(within(rail()).queryByRole('button', { name: /Remove/ })).toBeNull();
    expect(within(rail()).queryByRole('textbox')).toBeNull();
    expect(within(rail()).queryByRole('spinbutton')).toBeNull();
    expect(within(rail()).getAllByRole('button').map((b) => b.textContent)).toEqual(
      expect.arrayContaining(['Plan my night with AI', 'Share and export']),
    );
  });

  it('Tab reaches its items in order, the plan rows first', async () => {
    await app([m31, ic405]);
    const names = within(rail()).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names.slice(0, 2)).toEqual([expect.stringMatching(/^Go to .* in the plan$/), expect.stringMatching(/^Go to .* in the plan$/)]);
    expect(names.slice(-2)).toEqual(['Plan my night with AI', 'Share and export']);
  });

  it('"Plan my night with AI" opens the flyout, "Share and export" the Share sheet', async () => {
    await app([m31]);
    fireEvent.click(within(rail()).getByRole('button', { name: 'Plan my night with AI' }));
    expect(screen.getByTestId('ai-inputs')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('dialog', { name: /./ })).getByRole('button', { name: /Close/ }));
    fireEvent.click(within(rail()).getByRole('button', { name: 'Share and export' }));
    expect(screen.getAllByRole('dialog').length).toBeGreaterThan(0);
  });

  it('the warnings count is the timeline\'s warnings and links to the first card that has chips', async () => {
    // Several targets that cannot all be timed on the night, so some slots carry a warning chip.
    await app(['m31', 'm42', 'm45', 'm81', 'm51', 'ic405', 'ngc7000', 'm13', 'planet-jupiter', 'planet-saturn', 'planet-mars', 'm1', 'm27', 'm101'].map((id) => ({ id, preset: 'balanced' })));
    expect(document.querySelectorAll('[data-testid^="plan-chips-"]').length).toBeGreaterThan(0);
    const text = within(rail()).getByTestId('rail-warnings').textContent!;
    expect(text).toMatch(/^\d+ warnings?$/);
    fireEvent.click(within(rail()).getByRole('button', { name: /warning/ }));
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement!.closest('li')!.querySelector('[data-testid^="plan-chips-"]')).not.toBeNull();
  });

  it('says "No warnings" and has no link when no slot has one', async () => {
    await app([]);
    expect(within(rail()).getByTestId('rail-warnings').textContent).toBe('No warnings');
    expect(within(rail()).queryByRole('button', { name: /warning/ })).toBeNull();
  });
});

describe('the header row without the site header', () => {
  it('keeps the Night mode toggle and Sign in in the page header when the page has no slim header slot', async () => {
    await app([m31], false);
    const header = document.querySelector('header')!;
    expect(within(header).getByTestId('theme-toggle')).toBeTruthy();
    expect(within(header).getByTestId('auth-control')).toBeTruthy();
  });

  it('puts them in the slim header slot when the page has one, and not in the page header', async () => {
    mockWidth(false);
    const slot = document.createElement('div');
    slot.id = 'planner-nav-actions';
    document.body.appendChild(slot);
    seedPlan([m31], sampleProfile);
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await ready();
    expect(within(slot).getByTestId('theme-toggle')).toBeTruthy();
    expect(within(slot).getByTestId('auth-control')).toBeTruthy();
    const header = document.querySelector('header')!;
    expect(within(header).queryByTestId('theme-toggle')).toBeNull();
    expect(header.textContent).toBe('IMAGING PLANNER');
    cleanup();
    slot.remove();
  });
});
