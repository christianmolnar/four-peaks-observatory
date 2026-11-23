/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import CatalogCredits from './CatalogCredits';
import { listRows, openControls, openDetails, openFind, openGear, pageProps, planRowItems, seedPlan } from './testkit';

// R6a: the plan comes first, type is readable, targets are 44 px, labels are plain words.

const mount = (targets?: readonly object[]) => {
  if (targets) seedPlan(targets, sampleProfile);
  return render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
};
const plan = () => screen.getByRole('region', { name: /^PLAN:/ });
const toggle = () => document.querySelector<HTMLButtonElement>('[aria-controls="find-a-target-body"]')!;
const listReady = () => screen.findByTestId('target-list', {}, { timeout: 20000 });
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const TARGETS = [{ id: 'm31', preset: 'balanced' }, { id: 'ic405', preset: 'balanced' }, { id: 'm42', preset: 'quick' }, { id: 'ngc7000', preset: 'deep' }];

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('plan first', () => {
  it('orders the plan card: heading, the plan rows, then Find a target, then the night parts', async () => {
    mount(TARGETS);
    await listReady();
    const rows = plan().querySelector('ol[aria-label="Targets in this plan, in order"]')!;
    expect(follows(plan().querySelector('h2')!, rows)).toBe(true);
    expect(follows(rows, toggle())).toBe(true);
    expect(follows(toggle(), document.getElementById('night-and-horizon')!)).toBe(true);
    // My plans sits above the plan card.
    expect(follows(screen.getByTestId('plans-bar'), plan())).toBe(true);
  });

  it('Find a target is closed with 1+ targets and its header carries the count in brackets', async () => {
    mount(TARGETS);
    await listReady();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(toggle().textContent).toMatch(/^▸Find a target \(\d+\)$/);
    const n = Number(/\((\d+)\)/.exec(toggle().textContent ?? '')![1]);
    expect(n).toBeGreaterThan(10);
    fireEvent.click(toggle());
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('search')).toBeTruthy();
  });

  it('an empty plan says so inside the plan card, above Find a target, with an Add top 3 button that adds three', async () => {
    const u = userEvent.setup();
    mount();
    await listReady();
    const empty = within(plan()).getByTestId('plan-empty');
    expect(empty.textContent).toContain('No targets yet.');
    expect(follows(plan().querySelector('h2')!, empty)).toBe(true);
    expect(follows(empty, toggle())).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    await u.click(within(empty).getByRole('button', { name: 'Add top 3' }));
    expect(planRowItems()).toHaveLength(3);
    expect(screen.queryByTestId('plan-empty')).toBeNull();
    // The pressed button is gone: the keyboard is on the first added row's Remove, not the page body.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement?.id).toMatch(/^plan-remove-/);
    expect(planRowItems()[0].contains(document.activeElement)).toBe(true);
  });

  it('the plan\'s own rows come before every ranked row, so Add never scrolls the plan away', async () => {
    mount(TARGETS);
    await listReady();
    openFind();
    expect(follows(planRowItems()[3], listRows()[0])).toBe(true);
  });
});

describe('readable type', () => {
  it('the planner has its own root class, set by the planner and not by the site pages', async () => {
    const { container } = mount(TARGETS);
    await listReady();
    expect(container.querySelector('.planner-root')).not.toBeNull();
    expect(container.querySelector('.planner-root')!.contains(plan())).toBe(true);
    expect(container.querySelector('.planner-root')!.contains(screen.getByTestId('plans-bar'))).toBe(true);
  });

  // The weight cascade itself is proved in a real browser (computed weights per tab), not by matching CSS text; jsdom does not resolve it.
  it('the Share sheet and the AI flyout, which render outside the page root, carry the planner root class', () => {
    for (const f of ['ShareSheet.tsx', 'AiPlanFlyout.tsx']) {
      expect(readFileSync(`src/app/planner/${f}`, 'utf8')).toMatch(/data-testid="(share-sheet|ai-flyout)"\s+className="planner-root /);
    }
  });

  it('the print sheet cells print normal weight and black', async () => {
    const src = readFileSync('src/app/planner/PrintSheet.tsx', 'utf8');
    const cells = src.match(/<(td|th scope="row")[^>]*>/g) ?? [];
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(c).toMatch(/print:font-normal print:text-black/);
    expect(src).toMatch(/<table className="mt-3 print:font-normal print:text-black"/);
    // The site's !important weight sits in the base layer, so the sheet's own override lives there too.
    expect(readFileSync('src/app/globals.css', 'utf8')).toMatch(/@media print \{\s*\.planner-print-sheet :is\(p, span\) \{\s*font-weight: 400 !important;/);
  });

  it('no text smaller than 14 px in the planner (text-xs) once the plan, Find a target and a row detail are open', async () => {
    mount(TARGETS);
    await listReady();
    openFind();
    openControls();
    fireEvent.click(listRows()[0].querySelector('button[aria-expanded]')!);
    const small = [...document.querySelectorAll('.planner-root [class]')].filter((el) => /(^|\s)(text-xs|text-\[(1[0-3]|[0-9])px\])(\s|$)/.test(el.getAttribute('class') ?? ''));
    expect(small.map((e) => e.outerHTML.slice(0, 120))).toEqual([]);
    openGear();
    const smallGear = [...document.querySelectorAll('.planner-root [class]')].filter((el) => /(^|\s)text-xs(\s|$)/.test(el.getAttribute('class') ?? ''));
    expect(smallGear.map((e) => e.outerHTML.slice(0, 120))).toEqual([]);
  });

  it('only the footer keeps 12 px, and its links are padded to 44 px', () => {
    const { container } = render(<CatalogCredits />);
    expect(container.querySelector('footer')!.className).toContain('text-xs');
    for (const a of container.querySelectorAll('a')) expect(a.className).toContain('min-h-11');
  });
});

describe('touch targets', () => {
  it('a ranked row\'s expander, its Add button, the do-not-fit checkbox label and Save as favorite are at least 44 px (min-h-11)', async () => {
    mount(TARGETS);
    await listReady();
    openFind();
    openDetails();
    expect(listRows()[0].querySelector('button[aria-expanded]')!.className).toContain('min-h-11');
    const noFit = screen.getByRole('checkbox', { name: 'Show non-fitting' });
    expect(noFit.closest('label')!.className).toContain('min-h-11');
    const fav = screen.getAllByRole('checkbox', { name: 'Save as favorite' })[0];
    expect(fav.closest('label')!.className).toContain('min-h-11');
  });
});

describe('plain labels', () => {
  it('the strip says Setup, not Train, and "Change site", not "Search"', async () => {
    mount(TARGETS);
    await listReady();
    openControls();
    expect(screen.getAllByLabelText('Setup')).toHaveLength(1);
    expect(screen.queryByLabelText('Train')).toBeNull();
    expect(screen.getByRole('button', { name: 'Change this setup' })).toBeTruthy();
    const strip = document.getElementById('controls-heading')!.closest('section')!;
    expect(within(strip).getByRole('button', { name: 'Change site' })).toBeTruthy();
    expect(within(strip).queryByRole('button', { name: 'Search' })).toBeNull();
  });

  it('the Gear class is Setups, and one help line still says what a train is', async () => {
    mount(TARGETS);
    await listReady();
    openGear();
    expect(screen.getByRole('button', { name: /^Setups \(\d+\)$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Trains \(/ })).toBeNull();
  });

  it('a ranked row prints nothing about a fit, and the columns say Score and Clear', async () => {
    mount(TARGETS);
    await listReady();
    openFind();
    expect(screen.getAllByTestId('row-fit-score').every((r) => !/Fits/.test(r.textContent ?? ''))).toBe(true);
    expect(document.body.textContent).toContain('Score');
    expect(document.body.textContent).not.toContain('Score (max 100)');
  });

  it('a row\'s exposure boxes say "Exposure per shot (seconds)" and "Number of shots"', async () => {
    mount(TARGETS);
    await listReady();
    expect(screen.getAllByLabelText(/^Sub \(s\) for /)).toHaveLength(4);
    expect(screen.getAllByLabelText(/^Subs for /)).toHaveLength(4);
    expect(screen.queryByLabelText(/^Sub length \(s\) for /)).toBeNull();
  });

  it('the setting says "Always use my favorite exposure"', async () => {
    mount(TARGETS);
    await listReady();
    openGear();
    expect(screen.getByRole('checkbox', { name: 'Always use my favorite exposure' })).toBeTruthy();
  });

  it('the horizon boxes say what they block, in compass degrees', async () => {
    mount(TARGETS);
    await listReady();
    openGear();
    expect(screen.getAllByRole('spinbutton', { name: /^Blocked from \(compass degrees\)/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('spinbutton', { name: /^Blocked to \(compass degrees\)/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('spinbutton', { name: /^Blocked up to this height \(degrees\)/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('spinbutton', { name: /^Start azimuth/ })).toBeNull();
  });

  it('Reset all lists what it deletes: sites and horizons, gear, plans, favorites', async () => {
    mount(TARGETS);
    await listReady();
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
    const text = screen.getByTestId('reset-confirm').textContent ?? '';
    for (const w of [/horizon/, /gear/, /plans/, /favorite/]) expect(text).toMatch(w);
  });
});

describe('mode chips and the row figure', () => {
  it('the four chips wrap in a row and are 44 px tall', async () => {
    mount(TARGETS);
    await listReady();
    const group = screen.getAllByRole('group', { name: /^Exposure preset for / })[0];
    expect(group.className).toContain('flex-wrap');
    for (const b of within(group).getAllByRole('button')) expect(b.className).toContain('min-h-11');
  });

  it('"N s × M subs" is its own line before the long sentence, and the sentence keeps every number', async () => {
    mount(TARGETS);
    await listReady();
    const numbers = screen.getAllByTestId(/^plan-numbers-/)[0];
    const figure = numbers.querySelector('[data-testid="plan-figure"]')!;
    expect(figure.textContent).toMatch(/^\d+ s × \d+ subs?$/);
    expect(figure.className).toContain('block');
    expect(numbers.firstElementChild).toBe(figure);
    expect(numbers.textContent).toMatch(/ light · .* total$/);
  });
});
