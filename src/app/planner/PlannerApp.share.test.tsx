/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import { MAX_PLANS, PLANS_KEY, listBackups } from '@/planner/state/plans';
import type { Plan } from '@/planner/state/plans';
import PlannerApp from './PlannerApp';
import { openPlanTab, pageProps, planRowItems, ready, seedPlan, storedPlans } from './testkit';

// Share and export: the sheet in the plan's More menu, every scope and format as a file and as text, Print, the ASIAir positions file, and Import plans.

const profile = sampleProfile();
const app = async (targets: readonly object[] = [{ id: 'm31', preset: 'deep' }, { id: 'ic405', preset: 'custom', base: 'balanced', custom: { subSeconds: 90, subCount: 40 }, note: 'check focus' }, { id: 'planet-jupiter', preset: 'balanced' }], extra: Plan[] = [], ownId = 'plan-1') => {
  seedPlan(targets, sampleProfile);
  if (ownId !== 'plan-1') {
    const own = JSON.parse(window.localStorage.getItem(PLANS_KEY)!);
    own.plans[0].id = ownId;
    own.openId = ownId;
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(own));
  }
  if (extra.length > 0) {
    const s = JSON.parse(window.localStorage.getItem(PLANS_KEY)!);
    s.plans.push(...extra);
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(s));
  }
  render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  openPlanTab();
};
const other = (id: string, name: string, extra: Partial<Plan> = {}): Plan => ({ id, name, createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-16', siteId: profile.sites[0].id, trainId: profile.trains[0].id, startTime: null, targets: [{ id: 'm42', preset: 'quick' }], notes: '', ...extra });

const blobs: { name: string; blob: Blob }[] = [];
let clip: string[] = [];
beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => {
  window.localStorage.clear();
  if (!Blob.prototype.text) {
    Blob.prototype.text = function (this: Blob) {
      return new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error);
        r.readAsText(this);
      });
    };
  }
  blobs.length = 0;
  clip = [];
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => (blobs.push({ name: '', blob: b }), `blob:${blobs.length}`);
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    blobs[blobs.length - 1].name = this.download;
  });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void clip.push(t) } });
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

const openSheet = () => {
  fireEvent.click(screen.getByRole('button', { name: /^More/ }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
  return screen.getByTestId('share-sheet');
};
const text = () => (screen.getByLabelText('Text to share') as HTMLTextAreaElement).value;
const choose = (what: string, format: string) => {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(`^${what}`) }));
  fireEvent.click(screen.getByRole('radio', { name: format }));
};
const read = (b: Blob) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(b);
  });
const WHATS = ['This plan', 'All plans', 'Gear', 'Everything'];
const FORMATS = ['Plain text', 'Markdown', 'JSON', 'CSV'];

describe('the Share sheet', () => {
  it('is in the plan\'s More menu, defaults to this plan as plain text, and closes on Escape and on Close with the keyboard back on More', async () => {
    await app();
    const sheet = openSheet();
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect((screen.getByRole('radio', { name: /^This plan: My plan/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('radio', { name: 'Plain text' }) as HTMLInputElement).checked).toBe(true);
    expect(within(sheet).getAllByRole('radio', { name: new RegExp(`^(${WHATS.join('|')})`) })).toHaveLength(4);
    expect(within(sheet).getByRole('button', { name: 'Print run sheet' })).toBeTruthy();
    expect(within(sheet).getByRole('heading', { name: 'Export for ASIAir (CSV)' })).toBeTruthy();
    expect(document.activeElement).toBe(document.getElementById('share-heading'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('share-sheet')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('plan-more')));
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('share-sheet')).toBeNull();
  });

  it('has nothing wider than the phone: the text box, names and notes wrap', async () => {
    await app();
    const sheet = openSheet();
    expect(sheet.className).toMatch(/overflow|fixed inset-0/);
    expect(sheet.querySelector('.overflow-x-hidden')).not.toBeNull();
    expect((screen.getByLabelText('Text to share') as HTMLTextAreaElement).getAttribute('wrap')).toBe('soft');
  });
});

describe('every scope and format downloads and copies the text on screen', () => {
  for (const what of WHATS) {
    for (const format of FORMATS) {
      it(`${what} as ${format}`, async () => {
        await app(undefined, [other('plan-2', 'Second plan')]);
        openSheet();
        choose(what, format);
        const shown = text();
        expect(shown.length).toBeGreaterThan(20);
        expect(shown).not.toMatch(/undefined|NaN|\[object/);
        if (format !== 'JSON') expect(shown).not.toMatch(/plan-1|plan-2|fountain-hills|deep-c11|ic405|planet-jupiter/);
        fireEvent.click(screen.getAllByRole('button', { name: 'Download file' })[0]);
        expect(blobs).toHaveLength(1);
        expect(blobs[0].name).toMatch(new RegExp(`^fpo-.*\\.${{ 'Plain text': 'txt', Markdown: 'md', JSON: 'json', CSV: 'csv' }[format]}$`));
        // A text box holds line breaks as \n; the CSV file has CRLF.
        const lf = (t: string) => t.replace(/\r\n/g, '\n');
        expect(lf((await read(blobs[0].blob)).replace(/^\uFEFF/, ''))).toBe(shown);
        fireEvent.click(screen.getAllByRole('button', { name: 'Copy text' })[0]);
        await waitFor(() => expect(clip.map(lf)).toEqual([shown]));
        await waitFor(() => expect(screen.getByTestId('share-status').textContent).toMatch(/^Copied /));
      });
    }
  }
});

describe('the run sheet carries the numbers the rows show', () => {
  it('sub length, count, total, preset, filter and the custom row\'s own numbers are the rows\' and the timeline\'s', async () => {
    await app();
    const subBox = (name: string) => (screen.getByLabelText(`Sub length (s) for ${name}`) as HTMLInputElement).value;
    const countBox = (name: string) => (screen.getByLabelText(`Subs for ${name}`) as HTMLInputElement).value;
    const slotTimes = [...document.querySelectorAll('[data-testid^="slot-time-"]')].map((e) => e.textContent ?? '');
    openSheet();
    const t = text();
    expect(t).toContain('PLAN: My plan');
    expect(t).toContain(`${countBox('Andromeda Galaxy')} x ${subBox('Andromeda Galaxy')} s`);
    expect(t).toContain('90 s'.replace('90 s', `40 x ${subBox('Flaming Star Nebula')} s`));
    expect(subBox('Flaming Star Nebula')).toBe('90');
    expect(t).toMatch(/RA \d\d h \d\d m \d\d s|RA \d\dh \d\dm \d\ds/);
    expect(t).toContain('Note: check focus');
    expect(t).toContain('Jupiter');
    expect(t).toContain('clips, not subs');
    expect(t).toContain('Gain is set at the camera');
    const first = /(\d\d:\d\d) to (\d\d:\d\d)/.exec(slotTimes[0]);
    expect(first).not.toBeNull();
    expect(t).toContain(`1. ${first![1]}-${first![2]}`);
    // The JSON says the same numbers.
    fireEvent.click(screen.getByRole('radio', { name: 'JSON' }));
    const json = JSON.parse(text());
    expect(json.sheets[0].rows[0]).toMatchObject({ subSeconds: Number(subBox('Andromeda Galaxy')), subCount: Number(countBox('Andromeda Galaxy')), start: first![1] });
    expect(json.sheets[0].rows[1]).toMatchObject({ subSeconds: 90, subCount: 40 });
  });

  it('a plan whose train is gone says so on the sheet', async () => {
    seedPlan([{ id: 'm31', preset: 'balanced' }], sampleProfile);
    const s = JSON.parse(window.localStorage.getItem(PLANS_KEY)!);
    s.plans[0].trainId = 'a-train-that-was-removed';
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(s));
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
    await ready();
    openPlanTab();
    openSheet();
    expect(text()).toMatch(/Warning: This plan was made with a train that is no longer in your gear/);
  });

  it('other plans are shared as they are stored, and say their numbers were not worked out', async () => {
    await app(undefined, [other('plan-2', 'Second plan', { targets: [{ id: 'm42', preset: 'custom', base: 'deep', custom: { subSeconds: 120, subCount: 30 } }] })]);
    openSheet();
    choose('All plans', 'Plain text');
    const t = text();
    expect(t).toContain('PLAN: Second plan');
    expect(t).toContain('30 x 120 s = 60 min');
    expect(t).toMatch(/open this plan and share it for them/);
  });
});

describe('Print', () => {
  it('prints the run sheet of what is chosen, and Ctrl+P prints the same', async () => {
    const print = jest.fn();
    window.print = print;
    await app();
    openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Print run sheet' }));
    expect(print).toHaveBeenCalledTimes(1);
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getByTestId('print-plan')).toBeTruthy();
    expect(within(sheet).getAllByRole('row')).toHaveLength(4);
    expect(sheet.textContent).toContain('check focus');
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(screen.queryByTestId('print-sheet')).toBeNull();
  });
  it('prints the gear when gear is chosen', async () => {
    await app();
    openSheet();
    fireEvent.click(screen.getByRole('radio', { name: 'Gear' }));
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(screen.getByTestId('print-sheet').textContent).toMatch(/Trains/);
    expect(screen.queryByTestId('print-plan')).toBeNull();
  });
});

describe('Export for ASIAir', () => {
  it('is positions only, one row per fixed target with a position, ASCII, with the solar-system body left out and said', async () => {
    await app();
    openSheet();
    const note = screen.getByTestId('asiair-note').textContent!;
    expect(note).toMatch(/Positions only/);
    expect(note).toMatch(/2 targets/);
    expect(note).toMatch(/1 solar-system body is left out/);
    const section = screen.getByRole('heading', { name: 'Export for ASIAir (CSV)' }).closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: 'Download file' }));
    expect(blobs[0].name).toMatch(/^fpo-asiair-positions-my-plan-2026-12-15\.csv$/);
    const csv = await read(blobs[0].blob);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Pane, RA, DEC, Position Angle (East), Pane width (arcmins), Pane height (arcmins), Overlap, Row, Column');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^M31, \d\dhr \d\d' \d\d", \+\d\d\u00ba \d\d' \d\d", 0\.00, [\d.]+, [\d.]+, 20%, 1, 1$/);
    fireEvent.click(within(section).getByRole('checkbox'));
    fireEvent.click(within(section).getByRole('button', { name: 'Copy text' }));
    await waitFor(() => expect(clip).toHaveLength(1));
    expect(clip[0]).toMatch(/^[\x00-\x7f]*$/);
    expect(clip[0]).toContain("+41d 16' ");
  });
});

describe('Import plans', () => {
  const upload = (json: string, name = 'plans.json') => fireEvent.change(screen.getByLabelText('Plans file (JSON)'), { target: { files: [new File([json], name, { type: 'application/json' })] } });
  const plansOf = () => storedPlans()!.plans;

  it('a plans file exported here round-trips: export all, delete nothing, import into a fresh browser, same plans', async () => {
    await app(undefined, [other('plan-2', 'Second plan')]);
    openSheet();
    choose('All plans', 'JSON');
    const exported = text();
    const before = plansOf();
    cleanup();
    window.localStorage.clear();
    // A fresh browser: its own plan has another id, so nothing in the file is already here.
    await app([], [], 'mine');
    openSheet();
    upload(exported);
    await screen.findByTestId('import-ask');
    expect(screen.getByTestId('import-ask').textContent).toMatch(/holds 2 plans: "My plan", "Second plan"/);
    fireEvent.click(screen.getByRole('button', { name: 'Import 2 plans' }));
    await waitFor(() => expect(plansOf()).toHaveLength(3));
    const after = plansOf();
    expect(after.slice(1)).toEqual(before);
    expect(after[0].id).toBe('mine');
    expect(screen.getByTestId('import-done').textContent).toMatch(/^Imported 2 plans\./);
  });

  it('never overwrites: the same plans again are skipped, a changed one is a copy or skipped on request, and a backup of the saved plans is kept first', async () => {
    await app(undefined, [other('plan-2', 'Second plan')]);
    openSheet();
    choose('All plans', 'JSON');
    const exported = JSON.parse(text());
    // identical file: nothing new
    upload(JSON.stringify(exported));
    await screen.findByTestId('import-ask');
    expect(screen.getByTestId('import-ask').textContent).toMatch(/2 of them are already here/);
    fireEvent.click(screen.getByRole('button', { name: 'Import, repeats as copies' }));
    await waitFor(() => expect(screen.getByTestId('import-done').textContent).toMatch(/No plan was added\. 2 were already here and were skipped/));
    expect(plansOf()).toHaveLength(2);
    // a changed plan with the same id
    exported.plans[1].notes = 'changed elsewhere';
    upload(JSON.stringify(exported));
    await screen.findByTestId('import-ask');
    fireEvent.click(screen.getByRole('button', { name: 'Import new plans only' }));
    await waitFor(() => expect(screen.getByTestId('import-done').textContent).toMatch(/No plan was added\. 2 were already here/));
    expect(plansOf().find((p) => p.id === 'plan-2')!.notes).toBe('');
    upload(JSON.stringify(exported));
    await screen.findByTestId('import-ask');
    const stored = window.localStorage.getItem(PLANS_KEY);
    fireEvent.click(screen.getByRole('button', { name: 'Import, repeats as copies' }));
    await waitFor(() => expect(plansOf()).toHaveLength(3));
    expect(plansOf().map((p) => p.name)).toEqual(['My plan', 'Second plan', 'Second plan (imported)']);
    expect(plansOf().find((p) => p.id === 'plan-2')!.notes).toBe('');
    expect(listBackups(window.localStorage).some((b) => b.text === stored)).toBe(true);
    // Cancel changes nothing.
    upload(JSON.stringify(exported));
    await screen.findByTestId('import-ask');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('import-ask')).toBeNull();
    expect(plansOf()).toHaveLength(3);
  });

  const hostile: [string, () => string, RegExp][] = [
    ['not JSON', () => '{nope', /not valid JSON/],
    ['an array', () => '[1,2,3]', /should be an object/],
    ['a gear profile', () => JSON.stringify(profile), /gear profile, not plans/],
    ['a newer version', () => JSON.stringify({ format: 'four-peaks-planner', version: 7, plans: [] }), /newer version of the planner \(version 7\)/],
    ['no plans', () => JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [] }), /holds no plans/],
    ['too many plans for the size limit', () => JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: Array.from({ length: 10_000 }, (_, i) => other(`p${i}`, 'P')) }), /too large/],
    ['3,000-character names only', () => JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [other('x', 'n'.repeat(3000))] }), /None of the plans in the file could be read.*holds at most 60 characters/],
  ];
  for (const [name, make, expected] of hostile) {
    it(`refuses ${name} in plain words and changes nothing`, async () => {
      await app();
      const before = window.localStorage.getItem(PLANS_KEY);
      openSheet();
      upload(make());
      const err = await screen.findByTestId('import-error');
      expect(err.textContent).toMatch(/^Nothing was imported\. /);
      expect(err.textContent).toMatch(expected);
      expect(err.textContent).not.toMatch(/\$\.|expected|must be|undefined|\[object/);
      expect(window.localStorage.getItem(PLANS_KEY)).toBe(before);
    });
  }

  it('reads the good plans of a mixed file, says what it left out, and keeps duplicates inside the file out', async () => {
    await app();
    openSheet();
    upload(JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [other('a', 'Good one'), other('b', 'x'.repeat(3000)), other('a', 'Same id twice'), { nope: 1 }] }));
    const ask = await screen.findByTestId('import-ask');
    expect(ask.textContent).toMatch(/holds 1 plan: "Good one"/);
    expect(ask.textContent).toMatch(/a name holds at most 60 characters/);
    expect(ask.textContent).toMatch(/repeats the id of an earlier plan/);
    expect(ask.textContent).toMatch(/The plan number 4 could not be read/);
    expect(ask.textContent).not.toMatch(/x{41,}/);
    fireEvent.click(screen.getByRole('button', { name: 'Import the plan' }));
    await waitFor(() => expect(plansOf()).toHaveLength(2));
  });

  it('adds only as many as fit under the plan limit and says how many were left out', async () => {
    const many = Array.from({ length: MAX_PLANS - 2 }, (_, i) => other(`m${i}`, `Filler ${i}`));
    await app(undefined, many);
    expect(plansOf()).toHaveLength(MAX_PLANS - 1);
    openSheet();
    upload(JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [other('n1', 'New one'), other('n2', 'New two'), other('n3', 'New three')] }));
    await screen.findByTestId('import-ask');
    fireEvent.click(screen.getByRole('button', { name: 'Import 3 plans' }));
    await waitFor(() => expect(plansOf()).toHaveLength(MAX_PLANS));
    expect(screen.getByTestId('import-done').textContent).toMatch(/Imported 1 plan\. Plans hold at most 50 plans, so 2 were left out/);
  });

  it('an imported plan that uses a site or train not in the gear says so', async () => {
    await app();
    openSheet();
    upload(JSON.stringify({ format: 'four-peaks-planner', version: 1, plans: [other('far', 'Far away', { trainId: 'removed-train' })] }));
    await screen.findByTestId('import-ask');
    fireEvent.click(screen.getByRole('button', { name: 'Import the plan' }));
    await waitFor(() => expect(screen.getByTestId('import-done').textContent).toMatch(/1 uses a site or train that is not in your gear/));
  });

  it('an "everything" file offers its gear to Import profile, and Import profile reads it', async () => {
    await app();
    openSheet();
    choose('Everything', 'JSON');
    const file = text();
    upload(file);
    await screen.findByTestId('import-ask');
    expect(screen.getByTestId('import-ask').textContent).toMatch(/also holds gear/);
  });

  it('Import profile reads the gear out of an "everything" file', async () => {
    await app();
    openSheet();
    choose('Everything', 'JSON');
    const file = text();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Gear and site' }));
    fireEvent.change(screen.getByLabelText('Import profile (JSON)'), { target: { files: [new File([file], 'everything.json', { type: 'application/json' })] } });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/^Imported everything\.json\./));
  });

  it('the plan still has its rows after all this', async () => {
    await app();
    expect(planRowItems()).toHaveLength(3);
  });
});
