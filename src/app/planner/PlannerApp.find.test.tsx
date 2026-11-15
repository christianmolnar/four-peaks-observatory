/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { listRows, pageProps, planRowItems, rowName, seedPlan, showAll, storedPlan } from './testkit';

// Find a target is the first section of the open plan's card: open while the plan has no targets, one line with a count once it has some.
// Search, Best [type] tonight, the ranked list, paging, Add top 3 and the groups all live inside it and keep their behaviour.

const mount = (targets?: readonly object[]) => {
  if (targets) seedPlan(targets, sampleProfile);
  return render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
};
const plan = () => screen.getByRole('region', { name: /^PLAN:/ });
const toggle = () => document.querySelector<HTMLButtonElement>('[aria-controls="find-a-target-body"]')!;
const body = () => document.getElementById('find-a-target-body')!;
const listReady = () => screen.findByTestId('target-list', {}, { timeout: 20000 });

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Find a target in the plan', () => {
  it('is the first section of the open plan\'s card, open while the plan has no targets, with no separate module or heading', async () => {
    mount();
    await listReady();
    expect(plan().contains(toggle())).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(body().hasAttribute('hidden')).toBe(false);
    expect(screen.queryByRole('heading', { name: 'FIND A TARGET' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'FIND A TARGET' })).toBeNull();
    // Search, the Type selector, the ranked list: all inside the plan's card, inside Find a target.
    for (const el of [screen.getByRole('search'), screen.getByRole('combobox', { name: 'Type' }), screen.getByTestId('target-list')]) expect(body().contains(el)).toBe(true);
    // Find a target comes before the plan's own rows and before its parts.
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(toggle(), document.getElementById('night-timeline')!)).toBe(true);
    expect(follows(plan().querySelector('h2')!, toggle())).toBe(true);
  });

  it('collapses to one line with a count of results once the plan has targets, and one tap opens it', async () => {
    mount([{ id: 'm31', preset: 'balanced' }]);
    await listReady();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(body().hasAttribute('hidden')).toBe(true);
    expect(toggle().textContent).toMatch(/^▸Find a target\d+ results? available$/);
    expect(screen.queryByRole('search')).toBeNull(); // not reachable while closed
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Type' })).toBeTruthy();
    fireEvent.click(toggle());
    expect(body().hasAttribute('hidden')).toBe(true);
  });

  it('adding a target keeps it open, says "Added, #N in the plan", and focus stays on the button', async () => {
    const u = userEvent.setup();
    mount();
    await listReady();
    showAll();
    const first = listRows()[0];
    const name = rowName(first);
    const add = within(first).getByRole('button', { name: `Add ${name} to the plan` });
    add.focus();
    await u.keyboard('{Enter}');
    expect(planRowItems()).toHaveLength(1);
    expect(toggle().getAttribute('aria-expanded')).toBe('true'); // the plan now has a target, and Find a target stays as it was
    expect(within(first).getByText('Added, #1 in the plan')).toBeTruthy();
    expect(document.querySelector('p[aria-live="polite"].sr-only')!.textContent).toBe(`${name} added, number 1 in the plan.`);
    expect(document.activeElement).toBe(within(first).getByRole('button', { name: `${name} is in the plan` }));
    // The second add is the same.
    const second = listRows()[1];
    await u.click(within(second).getByRole('button', { name: /^Add .+ to the plan$/ }));
    expect(within(second).getByText('Added, #2 in the plan')).toBeTruthy();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('a closed Find a target stays closed when a target is added from elsewhere (the plan is the same)', async () => {
    mount([{ id: 'm31', preset: 'balanced' }]);
    await listReady();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('the sticky strip\'s Search opens a closed Find a target and puts the keyboard in the search box', async () => {
    mount([{ id: 'm31', preset: 'balanced' }]);
    await listReady();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Find a target' })); // the strip's button; the section's own is named with its count
    await waitFor(() => expect(toggle().getAttribute('aria-expanded')).toBe('true'));
    expect(document.activeElement).toBe(document.getElementById('target-search'));
  });

  it('opening another plan starts from its own rule: open when it is empty, one line when it has targets', async () => {
    const u = userEvent.setup();
    mount([{ id: 'm31', preset: 'balanced' }]);
    await listReady();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    await u.click(within(screen.getByTestId('plans-bar')).getByRole('button', { name: 'New' }));
    await waitFor(() => expect(toggle().getAttribute('aria-expanded')).toBe('true'));
    expect(storedPlan()!.targets).toEqual([]);
  });

  it('Add top 3, the type counts, paging and the do-not-fit group are inside it and still work', async () => {
    const u = userEvent.setup();
    mount();
    await listReady();
    await u.click(screen.getByRole('button', { name: 'Add top 3 to the plan' }));
    expect(planRowItems()).toHaveLength(3);
    expect(body().contains(screen.getByTestId('top-three'))).toBe(true);
    const options = [...(screen.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options.some((t) => /· \d+ (up|fit) /.test(t ?? ''))).toBe(true);
    expect(screen.getByRole('button', { name: /^Show \d+ more$/ }).closest('#find-a-target-body')).not.toBeNull();
    await u.click(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }));
    expect(body().contains(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }))).toBe(true);
  });

  it('the plan\'s own list is separate from the lists in Find a target: one row per target, no second Add path in the plan', async () => {
    mount([{ id: 'm31', preset: 'balanced' }, { id: 'ic405', preset: 'balanced' }]);
    await listReady();
    expect(planRowItems()).toHaveLength(2);
    for (const li of planRowItems()) expect(within(li).queryByRole('button', { name: /^Add / })).toBeNull();
    expect(within(plan()).getByText(/2 targets/)).toBeTruthy();
  });
});
