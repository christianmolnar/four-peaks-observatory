/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import { PLANS_KEY } from '@/planner/state/plans';
import type { Plan } from '@/planner/state/plans';
import PlannerApp from './PlannerApp';
import { fakeCatalog, openPlanTab, pageProps, ready, seedPlan, timelineSlots } from './testkit';

// The run sheet, the text, Markdown, CSV and JSON files and the print sheet carry the night timeline's numbers, and a stored plan never prints a value outside the limits.

const profile = sampleProfile();
afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  window.print = jest.fn();
});

const mount = async (targets: readonly object[], extra: Partial<Plan>[] = [], props: Record<string, unknown> = {}) => {
  seedPlan(targets, sampleProfile);
  if (extra.length > 0) {
    const s = JSON.parse(window.localStorage.getItem(PLANS_KEY)!);
    s.plans.push(...extra.map((e, i) => ({ ...s.plans[0], id: `plan-x${i}`, name: `Stored ${i}`, ...e })));
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(s));
  }
  render(<PlannerApp {...pageProps} {...props} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  openPlanTab();
};
const openSheet = () => {
  fireEvent.click(screen.getByRole('button', { name: /^More/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
};
const choose = (what: string, format: string) => {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${what}`) }));
  fireEvent.click(screen.getByRole('radio', { name: format }));
};
const text = () => (screen.getByLabelText('Text to share') as HTMLTextAreaElement).value;
const print = () => {
  act(() => void window.dispatchEvent(new Event('beforeprint')));
  const t = screen.getByTestId('print-sheet').textContent ?? '';
  act(() => void window.dispatchEvent(new Event('afterprint')));
  return t;
};
const timelineLight = () => {
  const m = /^Light (?:(\d+) h)? ?(?:(\d+) min)?/.exec(screen.getByTestId('itinerary-totals').textContent!)!;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};

describe('a scheduled row carries the timeline slot\'s own numbers', () => {
  it('a slot that cuts the row\'s light: the sheet has the slot\'s sub count and light in every format, and the total is the timeline\'s Light', async () => {
    await mount([{ id: 'm42', preset: 'deep' }]);
    // The row plans 120 s x 120 subs for the whole night; the slot has less time (its window closes), so it plans 105 subs.
    expect(document.querySelector('[data-testid^="plan-numbers-"]')!.textContent).toMatch(/^120 s × 120 subs/);
    expect(timelineSlots()[0].textContent).toContain('120 s × 105 subs = 210 min');
    expect(timelineLight()).toBe(210);
    openSheet();
    expect(text()).toContain('105 x 120 s = 210 min');
    expect(text()).toContain('Total light: 210 min');
    expect(text()).not.toMatch(/120 x 120 s|240 min/);
    choose('This plan', 'Markdown');
    expect(text()).toMatch(/\| 105 x 120 s \| 210 min \|/);
    expect(text()).toContain('Total light: 210 min');
    choose('This plan', 'CSV');
    expect(text()).toMatch(/,120,105,210,/);
    choose('This plan', 'JSON');
    const json = JSON.parse(text());
    expect(json.sheets[0].rows[0]).toMatchObject({ state: 'scheduled', subSeconds: 120, subCount: 105, lightMin: 210 });
    expect(json.sheets[0].totalLightMin).toBe(210);
    fireEvent.click(screen.getByRole('button', { name: 'Print run sheet' }));
    expect(print()).toMatch(/105 × 120 s.*210 min.*Total light: 210 min/);
  });

  it('a plan whose site is gone from the gear: Deep M42 is 105 x 120 s = 210 min on the slot, as the timeline shows, with the warning', async () => {
    seedPlan([{ id: 'm42', preset: 'deep' }], sampleProfile);
    const st = JSON.parse(window.localStorage.getItem(PLANS_KEY)!);
    st.plans[0].siteId = 'a-site-that-was-removed';
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(st));
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
    await ready();
    openPlanTab();
    expect(timelineSlots()[0].textContent).toContain('120 s × 105 subs = 210 min');
    openSheet();
    expect(text()).toContain('105 x 120 s = 210 min');
    expect(text()).toContain('Warning: Site removed');
    expect(text()).toContain(`Total light: ${timelineLight()} min`);
    expect(text()).not.toMatch(/224 min/);
  });

  it('two scheduled targets: each row has its slot\'s numbers (not the row\'s) and the total is the timeline\'s Light', async () => {
    await mount([{ id: 'm31', preset: 'deep' }, { id: 'm42', preset: 'deep' }]);
    expect(timelineSlots().map((s) => s.querySelector('[data-testid^="slot-light-"]')!.textContent)).toEqual([
      '90 s × 169 subs = 253.5 min',
      '120 s × 72 subs = 144 min',
    ]);
    openSheet();
    expect(text()).toContain('169 x 90 s = 253.5 min');
    expect(text()).toContain('72 x 120 s = 144 min');
    expect(text()).toContain(`Total light: ${timelineLight()} min`);
    expect(timelineLight()).toBe(398);
  });
});

describe('a row the timeline does not schedule carries no numbers and adds no light', () => {
  const defaultFour = [{ id: 'm42', preset: 'balanced' }, { id: 'm31', preset: 'balanced' }, { id: 'ngc7000', preset: 'balanced' }, { id: 'm33', preset: 'balanced' }];

  it('the default four-target plan on the sample train: one target is scheduled, three say "not scheduled tonight", and the total is the timeline\'s', async () => {
    await mount(defaultFour);
    expect(timelineSlots().map((s) => /No time left/.test(s.textContent ?? ''))).toEqual([false, true, true, true]);
    const light = timelineLight();
    expect(light).toBe(106);
    openSheet();
    const t = text();
    expect(t).toContain('1. 22:25-00:20  Orion Nebula');
    expect(t).toContain('106 x 60 s = 106 min');
    for (const n of ['Andromeda Galaxy', 'North America Nebula', 'Triangulum Galaxy']) expect(t).toMatch(new RegExp(`not scheduled tonight {2}${n}`));
    expect(t.match(/no subs, no light/g)).toHaveLength(3);
    expect(t).not.toMatch(/143 x 60 s|\b433 min|= 0 min/);
    expect(t).toContain(`Total light: ${light} min`);
    choose('This plan', 'CSV');
    const rows = text().trim().split(/\r?\n/).slice(1);
    expect(rows).toHaveLength(4);
    for (const r of rows.slice(1)) expect(r).toMatch(/Not scheduled tonight\./);
    choose('This plan', 'JSON');
    const json = JSON.parse(text());
    expect(json.sheets[0].rows.map((r: { state: string }) => r.state)).toEqual(['scheduled', 'unscheduled', 'unscheduled', 'unscheduled']);
    for (const r of json.sheets[0].rows.slice(1)) expect(r).toMatchObject({ subSeconds: null, subCount: null, lightMin: null, start: '', end: '' });
    expect(json.sheets[0].totalLightMin).toBe(light);
    choose('This plan', 'Markdown');
    expect(text()).toMatch(/\| 2 \| not scheduled tonight \| Andromeda Galaxy \(Galaxy\) .*\| none \| {2}\|/);
    fireEvent.click(screen.getByRole('button', { name: 'Print run sheet' }));
    const printed = print();
    expect(printed).toContain('not scheduled tonight');
    expect(printed).toContain(`Total light: ${light} min`);
    expect(printed).not.toMatch(/143 × 60 s/);
  });

  it('every number in every format equals the timeline or the row for the plan (all plans too)', async () => {
    await mount(defaultFour, [{ targets: [{ id: 'm42', preset: 'quick' }] }]);
    openSheet();
    choose('All plans', 'Plain text');
    const all = text();
    expect(all).toContain('PLAN: My plan');
    expect(all).toContain('PLAN: Stored 0');
    // The open plan is worked out; the stored one has no total.
    expect(all.match(/Total light:/g)).toHaveLength(1);
    expect(all).toContain('Total light: 106 min');
  });

  it('a target that is not in the catalog says so in the open plan\'s export, not its raw id', async () => {
    await mount([{ id: 'm42', preset: 'balanced' }, { id: 'zz-not-a-target', preset: 'balanced' }]);
    openSheet();
    expect(text()).toContain('A target that is not in the bundled catalog');
    expect(text()).toContain('2. not scheduled tonight  A target that is not in the bundled catalog');
    choose('This plan', 'CSV');
    expect(text()).toMatch(/,2,,,A target that is not in the bundled catalog,/);
  });
});

describe('a custom that is not used says why, in the open plan and in the shared sheet', () => {
  it('the open plan\'s row warning is exported with the reason, and the sheet shows no 999 s number', async () => {
    await mount([{ id: 'm42', preset: 'custom', base: 'balanced', custom: { subSeconds: 999, subCount: 50 } }]);
    const onScreen = screen.getByTestId(/^plan-custom-unusable-/).textContent!;
    expect(onScreen).toBe('Custom not used');
    openSheet();
    expect(text()).toContain('Balanced (custom not used)');
    expect(text()).toContain(onScreen);
    expect(text()).not.toMatch(/999/);
  });
});

describe('a stored plan whose custom numbers are outside the limits', () => {
  const stored = (label: string, custom: object): Partial<Plan> => ({ name: label, targets: [{ id: 'm42', preset: 'custom', base: 'balanced', custom }] as Plan['targets'] });
  const BAD = [stored('S999', { subSeconds: 999, subCount: 50 }), stored('S5000', { subSeconds: 60, subCount: 5000 }), stored('S1e308', { subSeconds: 1e308, subCount: 1e308 })];
  const NUMBERS = /Infinity|NaN|e\+\d|\b999\b|\b5000\b|\b83250\b|-\d+ min/;

  it('is shown as "Custom values outside the limits (not used)" with no numbers in all-plans text, Markdown, CSV, JSON sheets and the print sheet', async () => {
    await mount([{ id: 'm42', preset: 'balanced' }], BAD);
    openSheet();
    for (const format of ['Plain text', 'Markdown', 'CSV']) {
      choose('All plans', format);
      const t = text();
      expect(t.match(/Custom values outside the limits \(not used\)/g)).toHaveLength(3);
      expect(t).toMatch(/Custom outside limits \(1 to 300 s, 1 to 500 subs\): .* used/);
      expect(t).not.toMatch(NUMBERS);
    }
    choose('Everything', 'Plain text');
    expect(text()).not.toMatch(NUMBERS);
    choose('All plans', 'JSON');
    const json = JSON.parse(text());
    expect(JSON.stringify(json.sheets)).not.toMatch(NUMBERS);
    expect(JSON.stringify(json.sheets)).toContain('Custom values outside the limits (not used)');
    // The stored plans are kept as stored, so the file can be imported again.
    expect(json.plans.find((p: Plan) => p.name === 'S999').targets[0].custom).toEqual({ subSeconds: 999, subCount: 50 });
    fireEvent.click(screen.getByRole('radio', { name: /^All plans/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Print run sheet' }));
    const printed = print();
    expect(printed).toContain('Custom values outside the limits (not used)');
    expect(printed).not.toMatch(NUMBERS);
  });
});

describe('Print', () => {
  it('prints the open plan unless another scope was picked in the sheet that is open; the choice is forgotten on close', async () => {
    await mount([{ id: 'm42', preset: 'balanced' }]);
    openSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Gear' }));
    expect(print()).toMatch(/Trains/);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    // Ctrl+P with the sheet closed: the plan, not the gear picked before.
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(screen.getByTestId('print-plan')).toBeTruthy();
    expect(screen.getByTestId('print-sheet').textContent).not.toMatch(/Trains/);
    act(() => void window.dispatchEvent(new Event('afterprint')));
    // Opened again, the sheet starts on "This plan".
    openSheet();
    expect((screen.getByRole('radio', { name: /^This plan/ }) as HTMLInputElement).checked).toBe(true);
    expect(within(screen.getByTestId('share-sheet')).getByRole('radio', { name: 'Gear' })).toBeTruthy();
  });
});

describe('ASIAir panes', () => {
  it('the Pleiades are M45 in the pane list when the catalog has it', async () => {
    const catalog = fakeCatalog([{ id: 'mel22', name: 'Pleiades', type: 'open-cluster', raHours: 3.79128, decDeg: 24.1053, majorArcmin: 150, minorArcmin: 150, mag: 1.2, m: 45, constellation: 'Tau', aliases: ['Mel 22'] }]);
    await mount([{ id: 'mel22', preset: 'balanced' }, { id: 'm42', preset: 'balanced' }], [], { loadCatalogIndex: catalog.load });
    openSheet();
    expect(screen.getByTestId('asiair-panes').textContent).toBe('Pane 1: M45Pane 2: M42');
  });
});
