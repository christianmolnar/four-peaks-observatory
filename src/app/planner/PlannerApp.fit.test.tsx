/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { pageProps, ready } from './testkit';

// Targets that do not fit the chosen train: below everything that fits, hidden until asked for,
// and never described as "recommended".

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const narrow = () => withTrain('deep-c11-2600'); // C11 at f/10: a small field, so the big nebulae do not fit
const app = async (profile = narrow()) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  return r;
};

/** The "Setup" column of each ranked row, top to bottom. */
const fits = (): string[] => {
  const table = screen.queryByTestId('target-table');
  if (!table) return [];
  return within(table).getAllByRole('row').filter((r) => r.querySelector('th[scope="row"]')).map((r) => r.querySelectorAll('td')[3].textContent as string);
};

afterEach(cleanup);

describe('targets that do not fit the chosen train', () => {
  it('are hidden by default behind "Show targets that do not fit"', async () => {
    await app();
    const toggle = screen.getByRole('checkbox', { name: 'Show targets that do not fit' }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(fits().length).toBeGreaterThan(0);
    expect(fits()).not.toContain('Too large');
    expect(screen.queryByText(/Does not fit this setup/)).toBeNull();
  });

  it('with the toggle on they appear, all below every row that fits', async () => {
    await app();
    const hidden = fits().length;
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }));
    await ready();
    const col = fits();
    expect(col.length).toBeGreaterThan(hidden);
    const firstMiss = col.indexOf('Too large');
    expect(firstMiss).toBeGreaterThan(-1);
    expect(col.slice(firstMiss).every((c) => c === 'Too large')).toBe(true);
    expect(col.slice(0, firstMiss).every((c) => c !== 'Too large')).toBe(true);
  });

  it('the why for such a row says it does not fit instead of recommending it', async () => {
    await app();
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }));
    await ready();
    const why = screen.getAllByText(/^Does not fit this setup/);
    expect(why.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Why it is listed').length).toBe(why.length);
    for (const w of why) expect(w.textContent).not.toMatch(/too large for the frame/);
  });

  it('a train where everything fits shows no such rows and the toggle changes nothing', async () => {
    await app(withTrain('smart-seestar-s50'));
    const before = fits();
    expect(before.length).toBeGreaterThan(0);
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }));
    await ready();
    expect(fits()).toEqual(before);
  });
});
