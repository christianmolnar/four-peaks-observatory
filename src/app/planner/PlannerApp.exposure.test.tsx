/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { openPart, pageProps, planRowItems, ready, seedPlan, storedPlan, timelineSlots } from './testkit';

// Exposure on each target: Quick, Balanced, Deep and Custom on the row, the engine's numbers for the plan's night, site, train and Moon,
// "Why these numbers", the comparison and the calculator per row, Custom in words with "Back to ...", and the timeline scheduling what was chosen.

const app = async (targets: readonly object[]) => {
  seedPlan(targets, sampleProfile);
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const m31 = { id: 'm31', preset: 'balanced' };
const ic405 = { id: 'ic405', preset: 'balanced' };
const jupiter = { id: 'planet-jupiter', preset: 'balanced' };
const row = (i: number) => planRowItems()[i];
const group = (name: string) => screen.getByRole('group', { name: `Exposure preset for ${name}` });
const press = (name: string, preset: string) => fireEvent.click(within(group(name)).getByRole('button', { name: preset }));
const pressed = (name: string) => within(group(name)).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent);
const numbers = (id: string) => screen.getByTestId(`plan-numbers-${id}`).textContent ?? '';
const subBox = (name: string) => screen.getByLabelText(`Sub (s) for ${name}`) as HTMLInputElement;
const countBox = (name: string) => screen.getByLabelText(`Subs for ${name}`) as HTMLInputElement;
const open = (id: string) => {
  const b = document.getElementById(id)!;
  if (b.getAttribute('aria-expanded') === 'false') fireEvent.click(b);
};
/** "45 s × 191 subs · 2 h 23 min light · 2 h 55 min total" as numbers. */
const parse = (text: string) => {
  const m = /^(\d+(?:\.\d+)?) s × (\d+) subs · (.+?) light · (.+?) total$/.exec(text);
  if (!m) throw new Error(`not a numbers line: ${text}`);
  return { sub: Number(m[1]), subs: Number(m[2]), light: m[3], elapsed: m[4] };
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('a preset on each target', () => {
  it('every deep-sky row has Quick, Balanced, Deep and Custom on the row, Balanced by default; a solar-system row has none', async () => {
    await app([m31, ic405, jupiter]);
    expect(planRowItems()).toHaveLength(3);
    for (const name of ['Andromeda Galaxy', 'Flaming Star Nebula']) {
      expect(within(group(name)).getAllByRole('button').map((b) => b.textContent)).toEqual(['Quick', 'Balanced', 'Deep']); // Custom shows only once a number is typed
      expect(pressed(name)).toEqual(['Balanced']);
    }
    expect(within(row(2)).queryByRole('group')).toBeNull();
    expect(within(row(2)).queryByLabelText(/^Sub/)).toBeNull();
    expect(row(2).textContent).toContain('Jupiter');
    expect(row(2).textContent).not.toMatch(/Balanced|Quick|Deep|Custom/);
  });

  it('shows what the engine computes: sub length, subs, total light and elapsed time, and no finish time (the timeline has the real times)', async () => {
    await app([m31]);
    const n = parse(numbers('m31'));
    expect(n.sub).toBeGreaterThan(0);
    expect(n.subs).toBeGreaterThan(0);
    expect(numbers('m31')).not.toMatch(/\d\d:\d\d|finish|ends/);
    expect(subBox('Andromeda Galaxy').value).toBe(String(n.sub));
    expect(countBox('Andromeda Galaxy').value).toBe(String(n.subs));
  });

  it('choosing a preset stores it, changes the numbers to that preset\'s, and the comparison table agrees with every row', async () => {
    await app([m31]);
    open('plan-compare-m31');
    const table = screen.getByTestId('plan-compare-table-m31');
    expect(within(table).getAllByRole('columnheader').map((c) => c.textContent).slice(1)).toEqual(['Quick', 'Balanced', 'Deep']);
    const col = (i: number) => within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[i].textContent);
    for (const [i, preset, id] of [[0, 'Quick', 'quick'], [1, 'Balanced', 'balanced'], [2, 'Deep', 'deep']] as const) {
      press('Andromeda Galaxy', preset);
      expect(pressed('Andromeda Galaxy')).toEqual([preset]);
      expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: id });
      const n = parse(numbers('m31'));
      const [sub, subs, light, elapsed] = col(i);
      expect([`${n.sub} s`, String(n.subs), n.light, n.elapsed]).toEqual([sub, subs, light, elapsed]);
    }
    // Quick is shorter than Deep in light.
    expect(col(0)[2]).not.toBe(col(2)[2]);
  });

  it('Details holds the figures behind the numbers, the comparison and what more time buys; the two tables are closed folds', async () => {
    await app([m31]);
    const figures = screen.getByTestId('plan-figures-m31').textContent!;
    expect(figures).toMatch(/Sub range\d+ to \d+ s/);
    expect(figures).toMatch(/Stop point.+Needs.+Surface brightness[\d.]+ (catalog|class|assumed)/);
    expect(figures).toMatch(/Read noise[\d.]+%Dither every\d+ subs/);
    expect(document.getElementById('plan-compare-m31-body')!.hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('plan-buys-m31-body')!.hasAttribute('hidden')).toBe(true);
    open('plan-buys-m31');
    expect(within(screen.getByTestId('plan-buys-table-m31')).getAllByRole('row')).toHaveLength(5); // the heading and 30, 60, 90, 120 min
    expect(screen.getByTestId('plan-inputs-m31').textContent).toMatch(/^Inputs: f\/[\d.]+, [\d.]+ um pixels, read noise class .+, Bortle \d, Moon \d+% at \d+°.+usable minutes\.$/);
  });

  it('a warning shows on the card as a few words, with no control when none changes it', async () => {
    await app([m31]);
    const chips = screen.getByTestId('plan-chips-m31');
    expect(chips.textContent).toBe('Flip +10 min');
    expect(within(chips).queryByRole('button')).toBeNull(); // the flip has no control that changes it
  });

  it('a row with no engine numbers (a smart scope) says why and still offers the choice', async () => {
    const smart = sampleProfile().trains.find((t) => t.kind === 'smart')!;
    window.localStorage.setItem('fpo-planner-selection-v1', JSON.stringify({ siteId: sampleProfile().sites[0].id, trainId: smart.id }));
    seedPlan([m31], () => ({ sites: sampleProfile().sites, trains: [smart] }));
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await ready();
    expect(numbers('m31')).toMatch(/No exposure: add optics/);
    expect(pressed('Andromeda Galaxy')).toEqual(['Balanced']);
  });
});

describe('Custom', () => {
  it('editing the sub length stores overrides over the preset, says so in words, and Back returns to the preset', async () => {
    await app([m31]);
    const before = parse(numbers('m31'));
    const box = subBox('Andromeda Galaxy');
    fireEvent.change(box, { target: { value: '20' } });
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced' }); // not stored until it is applied
    fireEvent.blur(box);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 20 } });
    expect(pressed('Andromeda Galaxy')).toEqual(['Custom']);
    expect(screen.getByTestId('plan-custom-m31').textContent).toMatch(/^Custom/);
    expect(parse(numbers('m31')).sub).toBe(20);
    expect(parse(numbers('m31')).subs).toBeGreaterThan(before.subs); // the same light in shorter subs
    fireEvent.click(screen.getByRole('button', { name: 'Back to Balanced' }));
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced' });
    expect(parse(numbers('m31'))).toEqual(before);
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('plan-preset-m31-balanced')));
  });

  it('editing the count says so too, and both together; Custom keeps the preset it came from (Deep)', async () => {
    await app([{ id: 'm31', preset: 'deep' }]);
    const u = userEvent.setup();
    await u.clear(countBox('Andromeda Galaxy'));
    await u.type(countBox('Andromeda Galaxy'), '12{Enter}');
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: { subCount: 12 } });
    expect(screen.getByTestId('plan-custom-m31').textContent).toMatch(/^Custom/);
    await u.clear(subBox('Andromeda Galaxy'));
    await u.type(subBox('Andromeda Galaxy'), '50{Enter}');
    expect(storedPlan()!.targets[0].custom).toEqual({ subCount: 12, subSeconds: 50 });
    expect(screen.getByTestId('plan-custom-m31').textContent).toMatch(/^Custom/);
    expect(numbers('m31')).toMatch(/^50 s × 12 subs · 10 min light/);
    expect(screen.getByRole('button', { name: 'Back to Deep' })).toBeTruthy();
  });

  it('invalid input (0, negative, text, absurd, empty) is rejected with a plain message and never stored', async () => {
    await app([m31]);
    const original = JSON.stringify(storedPlan());
    const before = numbers('m31');
    const box = subBox('Andromeda Galaxy');
    for (const [text, message] of [
      ['0', /^Above 0$/],
      ['-30', /^Above 0$/],
      ['abc', /^Seconds, a number$/],
      ['999999', /^Sub: 1 to 300 s$/],
      ['', /^Enter a sub length$/],
    ] as const) {
      fireEvent.change(box, { target: { value: text } });
      fireEvent.blur(box);
      expect(screen.getByRole('alert').textContent).toMatch(message);
      expect(box.getAttribute('aria-invalid')).toBe('true');
      expect(JSON.stringify(storedPlan())).toBe(original);
      expect(window.localStorage.getItem('fpo-planner-plans-v1')).toContain('"preset":"balanced"');
    }
    const count = countBox('Andromeda Galaxy');
    for (const text of ['0', '-1', '2.5', 'x', '100000']) {
      fireEvent.change(count, { target: { value: text } });
      fireEvent.blur(count);
      expect(screen.getByRole('alert')).toBeTruthy();
      expect(JSON.stringify(storedPlan())).toBe(original);
    }
    // A count above MAX_SUBS is refused (above); a long sub is judged by the engine's own count and light, see PlannerApp.subinput.test.tsx.
    expect(numbers('m31')).toBe(before);
  });

  it('a corrected number is accepted after a rejected one, and the message goes', async () => {
    await app([m31]);
    const box = subBox('Andromeda Galaxy');
    fireEvent.change(box, { target: { value: 'oops' } });
    fireEvent.blur(box);
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(box, { target: { value: '40' } });
    fireEvent.blur(box);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(storedPlan()!.targets[0].custom).toEqual({ subSeconds: 40 });
  });
});

describe('the timeline schedules what was chosen', () => {
  it('a Custom target takes its own sub length and count in the night timeline, not Balanced', async () => {
    await app([m31]);
    openPart('Night timeline');
    const balanced = /(\d+) s × (\d+) subs = ([\d.]+) min/.exec((timelineSlots()[0].querySelector('[data-testid^="slot-light-"]')?.textContent ?? ''))!;
    expect(Number(balanced[1])).toBe(parse(numbers('m31')).sub);
    fireEvent.change(subBox('Andromeda Galaxy'), { target: { value: '60' } });
    fireEvent.blur(subBox('Andromeda Galaxy'));
    fireEvent.change(countBox('Andromeda Galaxy'), { target: { value: '20' } });
    fireEvent.blur(countBox('Andromeda Galaxy'));
    expect(timelineSlots()[0].querySelector('[data-testid^="slot-light-"]')?.textContent).toMatch(/60 s × 20 subs = 20 min/);
    expect(timelineSlots()[0].textContent).not.toContain(balanced[0]);
    // Back to the preset: the preset's own light again.
    fireEvent.click(screen.getByRole('button', { name: 'Back to Balanced' }));
    expect(timelineSlots()[0].textContent).toContain(balanced[0]);
  });

  it('a preset chosen on the row is the preset the timeline plans, for each target', async () => {
    await app([m31, ic405]);
    openPart('Night timeline');
    press('Flaming Star Nebula', 'Deep');
    const slot = (i: number) => /(\d+) s × (\d+) subs/.exec((timelineSlots()[i].querySelector('[data-testid^="slot-light-"]')?.textContent ?? ''))!;
    expect(`${slot(1)[1]} s × ${slot(1)[2]}`).toBe(`${parse(numbers('ic405')).sub} s × ${parse(numbers('ic405')).subs}`);
    expect(storedPlan()!.targets.map((t) => t.preset)).toEqual(['balanced', 'deep']);
  });
});

describe('print and the plan CSV carry the rows with their exposure', () => {
  it('the print sheet has a run table with subs, total light and preset for each row', async () => {
    await app([{ id: 'm31', preset: 'deep' }, jupiter]);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const table = screen.getByTestId('print-plan');
    const rows = within(table).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    const n = parse(numbers('m31'));
    expect(rows[0][2]).toMatch(/^Andromeda Galaxy/);
    expect(rows[0][3]).toMatch(new RegExp(`^${n.subs} × ${n.sub} s\\d+(\\.\\d+)? min$`));
    expect(rows[0][6]).toMatch(/^Deep/);
    expect(rows[1][2]).toMatch(/^Jupiter/);
    expect(rows[1][3]).toMatch(/^clips, not subs(about \d+ min)?$/);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });
});
