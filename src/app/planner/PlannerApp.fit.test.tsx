/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { listRows, pageProps, ready, rowName, showAll } from './testkit';

// Targets that do not fit the chosen train: left out of the list, counted in a note, and listed in a closed group of their
// own below it (with how they miss, in numbers) when "Show targets that do not fit" is ticked. One control for that state.

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

const toggle = () => screen.getByRole('checkbox', { name: 'Show targets that do not fit' }) as HTMLInputElement;
const group = () => screen.getByRole('button', { name: /^Does not fit this camera view \(\d+\)/ });

afterEach(cleanup);

describe('targets that do not fit the chosen train', () => {
  it('are left out by default, with no note and no second control', async () => {
    await app();
    expect(toggle().checked).toBe(false);
    expect(screen.queryByRole('button', { name: /^Does not fit this camera view/ })).toBeNull();
    expect(screen.queryByTestId('hidden-note')).toBeNull(); // no note; the box and the group heading say it
    expect(screen.queryByRole('button', { name: /show anyway/i })).toBeNull();
  });

  it('ticking the box adds a closed group below the list, with the count', async () => {
    await app();
    fireEvent.click(toggle());
    await ready();
    const header = group();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    const count = Number(/\((\d+)\)/.exec(header.textContent as string)![1]);
    expect(count).toBeGreaterThan(0);
    // The group follows the list in the page, and the list itself did not change.
    expect(screen.getByTestId('target-list').compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opened, each row says how it misses: its size against your frame', async () => {
    await app();
    fireEvent.click(toggle());
    await ready();
    const mainNames = (showAll(), listRows().map(rowName));
    fireEvent.click(group());
    const rows = listRows('nofit-list');
    expect(rows.length).toBeGreaterThan(0);
    const large = rows.filter((r) => /Too big/.test(r.textContent as string));
    expect(large.length).toBeGreaterThan(0);
    for (const r of large) expect(r.textContent).toMatch(/Too big/);
    for (const r of rows) expect(mainNames).not.toContain(rowName(r)); // never in both
    expect(screen.getByTestId('target-list').textContent).not.toContain('Too large');
  });

  it('the group is paged, ten at a time', async () => {
    await app();
    fireEvent.click(toggle());
    await ready();
    fireEvent.click(group());
    const total = Number(/\((\d+)\)/.exec(group().textContent as string)![1]);
    expect(listRows('nofit-list')).toHaveLength(Math.min(10, total));
    if (total > 10) {
      const more = within(document.getElementById('nofit-group') as HTMLElement).getByRole('button', { name: /^Show \d+ more$/ });
      fireEvent.click(more);
      expect(listRows('nofit-list')).toHaveLength(Math.min(20, total));
    }
  });

  it('a train where everything fits shows no such group and no note', async () => {
    await app(withTrain('smart-seestar-s50'));
    expect(screen.queryByTestId('hidden-note')).toBeNull();
    fireEvent.click(toggle());
    await ready();
    expect(screen.queryByRole('button', { name: /^Does not fit this camera view/ })).toBeNull();
  });

  it('under Type = Solar system the note and the group are not shown (nothing deep-sky listed there)', async () => {
    await app();
    fireEvent.click(toggle());
    await ready();
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'solar-system' } });
    expect(screen.queryByTestId('hidden-note')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Does not fit this camera view/ })).toBeNull();
  });
});
