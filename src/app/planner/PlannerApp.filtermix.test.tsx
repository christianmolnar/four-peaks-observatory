/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import type { Profile } from '@/planner/profile';
import PlannerApp from './PlannerApp';
import { openControls, openPlanTab, pageProps, planRowItems, ready, seedPlan, timelineSlots, untickNarrowband } from './testkit';

// The filter mix on each plan row: a folded part, the setup's filter as the default, plain messages instead of made-up numbers, and the plain-text export.

const NBZ = { id: 'nbz', name: 'IDAS NBZ-II', kind: 'dual-band' as const, passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3 = { id: 'nb3', name: 'IDAS NB3-PM', kind: 'dual-band' as const, passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] };
const SUMS_ONLY = { id: 'sums', name: 'Sums-only filter', kind: 'dual-band' as const, passbandWidthNm: 20, narrowestBandNm: 10 };

const profileWith = (filterId: string | undefined, filters = [NBZ, NB3, SUMS_ONLY]): Profile => {
  const p = sampleProfile();
  p.equipment.filters = [...filters];
  p.trains = p.trains.map((t, i) => (i === 0 && t.kind === 'optical' ? { ...t, ...(filterId === undefined ? {} : { filterId }) } : t));
  return p;
};
const app = async (targets: readonly object[], profile: Profile) => {
  seedPlan(targets, sampleProfile);
  render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  openPlanTab();
  // These tests are about the broadband filter mix; the narrowband ticks start live, so they are taken out here.
  untickNarrowband();
};
const ic405 = { id: 'ic405', preset: 'balanced' };
const m31 = { id: 'm31', preset: 'balanced' };
// The Leo Triplet (no knots profile): the gate. M31 has HII knots since the knots work.
const leo = { id: 'leo-triplet', preset: 'balanced' };
const jupiter = { id: 'planet-jupiter', preset: 'balanced' };
const fold = (id: string) => document.getElementById(`plan-mix-fold-${id}`) as HTMLButtonElement;
const open = (id: string) => {
  if (fold(id).getAttribute('aria-expanded') === 'false') fireEvent.click(fold(id));
};
const body = (id: string) => screen.getByTestId(`plan-mix-${id}`).textContent ?? '';
const light = (id: string) => /· (.+?) light ·/.exec(screen.getByTestId(`plan-numbers-${id}`).textContent ?? '')![1];

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the Filter mix part of a plan row', () => {
  it('is a folded part on every row, collapsed by default, a 44 px button', async () => {
    await app([ic405, m31, jupiter], profileWith('nbz'));
    expect(planRowItems()).toHaveLength(3);
    for (const id of ['ic405', 'm31', 'planet-jupiter']) {
      expect(fold(id).textContent).toContain('Filter mix');
      expect(fold(id).getAttribute('aria-expanded')).toBe('false');
      expect(fold(id).className).toMatch(/min-h-11/);
      expect(document.getElementById(`plan-mix-fold-${id}-body`)!.hasAttribute('hidden')).toBe(true);
    }
  });

  it('uses the setup’s filter, splits the row’s own light, and says how sure the numbers are', async () => {
    await app([ic405], profileWith('nbz'));
    open('ic405');
    const text = body('ic405');
    expect(text).toContain('IDAS NBZ-II');
    expect(text).toContain(`Light: ${light('ic405')}`);
    expect(text).toContain(`IDAS NBZ-II: ${light('ic405')}`);
    expect(text).toContain('Adds Ha and OIII.');
    // The confidence is said once, in the row's one fold.
    expect(screen.queryByTestId('plan-mix-confidence-ic405')).toBeNull();
    fireEvent.click(document.getElementById('plan-why-ic405') as HTMLButtonElement);
    expect(screen.getAllByTestId('plan-mix-confidence-ic405')).toHaveLength(1);
    expect(screen.getByTestId('plan-mix-confidence-ic405').textContent).toBe('Typical for this type, not measured');
    // Not every filter: the other filters are not in the mix until chosen.
    expect(text).not.toContain('IDAS NB3-PM');
    expect(text).not.toMatch(/NaN|Infinity|undefined|e\+\d/);
  });

  it('a filter chosen beside the setup’s joins the mix and the lines still add up to the row’s light', async () => {
    await app([ic405], profileWith('nbz'));
    openControls();
    fireEvent.click(within(screen.getByTestId('mix-filters')).getByRole('checkbox', { name: 'Use IDAS NB3-PM' }));
    open('ic405');
    const text = body('ic405');
    expect(text).toContain('IDAS NB3-PM');
    expect(text).toMatch(/OIII shared, SII new/);
    expect(text).toContain(`Light: ${light('ic405')}`);
  });

  it('a target that gives off no emission shows the gate message with all the light on broadband', async () => {
    await app([leo], profileWith('nbz'));
    open('leo-triplet');
    expect(screen.getByTestId('plan-mix-headline-leo-triplet').textContent).toMatch(/Almost no emission light/);
    expect(body('leo-triplet')).toContain(`Broadband (no narrowband filter): ${light('leo-triplet')}`);
  });

  it('a filter without passbands is named and skipped, and says so', async () => {
    await app([ic405], profileWith('sums'));
    open('ic405');
    expect(screen.getByTestId('plan-mix-message-ic405').textContent).toMatch(/No selected filter has known passbands/);
    expect(body('ic405')).toContain('Sums-only filter');
    expect(body('ic405')).toContain('Unknown passband, not used in the mix.');
  });

  it('no filter in the setup, a solar-system body: a plain message and no number', async () => {
    await app([ic405, jupiter], profileWith(undefined));
    open('ic405');
    open('planet-jupiter');
    expect(screen.getByTestId('plan-mix-message-ic405').textContent).toMatch(/No filter in this setup/);
    expect(screen.getByTestId('plan-mix-message-planet-jupiter').textContent).toMatch(/No filter mix for solar-system bodies/);
    expect(body('ic405')).not.toMatch(/\d+ min|\d+ h/);
  });

  it('keeps the exposure numbers as they are', async () => {
    await app([ic405], profileWith('nbz'));
    const before = screen.getByTestId('plan-numbers-ic405').textContent;
    open('ic405');
    openControls();
    fireEvent.click(within(screen.getByTestId('mix-filters')).getByRole('checkbox', { name: 'Use IDAS NB3-PM' }));
    expect(screen.getByTestId('plan-numbers-ic405').textContent).toBe(before);
  });
});

describe('the light comes from the timeline, and a target it leaves out has none', () => {
  const four = ['m42', 'm31', 'ngc7000', 'm33'].map((id) => ({ id, preset: 'balanced' }));
  const fmt = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`);
  const slotMinutes = (i: number) => Math.round(Number(/= ([\d.]+) min/.exec(timelineSlots()[i].textContent ?? '')![1]));

  it('earlier slots push North America out: its row says "not scheduled tonight" and shows no hours; the others split their slot’s light', async () => {
    await app(four, profileWith('nbz'));
    expect(timelineSlots().map((s) => /no time/.test(s.textContent ?? ''))).toEqual([false, false, true, false]);
    for (const [id, i] of [['m42', 0], ['m31', 1], ['m33', 3]] as const) {
      open(id);
      expect(body(id)).toContain(`Light: ${fmt(slotMinutes(i))}`);
    }
    // The row's own stand-alone light is longer than the slot's for Andromeda (the window closes): the mix follows the slot.
    open('ngc7000');
    expect(screen.getByTestId('plan-mix-message-ngc7000').textContent).toMatch(/Not up tonight/);
    expect(body('ngc7000')).not.toMatch(/\d+ min|\d+ h|Light:/);
  });

  it('the text export gives the same: slot light for scheduled targets, a plain line for the one left out', async () => {
    await app(four, profileWith('nbz'));
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
    const text = (screen.getByLabelText('Text to share') as HTMLTextAreaElement).value;
    expect(text).toContain(`- Orion Nebula (${fmt(slotMinutes(0))} of light): IDAS NBZ-II ${fmt(slotMinutes(0))}`);
    expect(text).toContain(`- Andromeda Galaxy (${fmt(slotMinutes(1))} of light)`);
    expect(text).toContain('- North America Nebula: not scheduled tonight, no filter mix.');
    expect(text.slice(text.indexOf('Filter mix'))).not.toMatch(/North America Nebula \(/);
  });
});

describe('every selected filter is in the row', () => {
  const LUM = { id: 'lum', name: 'Plain Lum', kind: 'dual-band' as const, passbands: [{ centreNm: 550, widthNm: 300 }] };
  it('a broadband filter beside a narrowband one has its own line, in the row and in the export', async () => {
    await app([{ id: 'm42', preset: 'balanced' }], profileWith('lum', [LUM, NBZ]));
    openControls();
    fireEvent.click(within(screen.getByTestId('mix-filters')).getByRole('checkbox', { name: 'Use IDAS NBZ-II' }));
    open('m42');
    expect(body('m42')).toContain('Broadband (Plain Lum)');
    expect(body('m42')).toContain('IDAS NBZ-II');
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
    expect((screen.getByLabelText('Text to share') as HTMLTextAreaElement).value).toContain('Broadband (Plain Lum) 0 min (earns no hours here)');
  });
});

describe('the plain-text export', () => {
  const share = async () => {
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Share and export…' }));
    return (screen.getByLabelText('Text to share') as HTMLTextAreaElement).value;
  };

  it('carries a short filter mix section whose numbers equal the row’s', async () => {
    await app([ic405], profileWith('nbz'));
    const rowLight = light('ic405');
    const text = await share();
    expect(text).toContain('Filter mix (each target’s planned light split between the selected filters):');
    expect(text).toContain(`- Flaming Star Nebula (${rowLight} of light): IDAS NBZ-II ${rowLight} (adds Ha and OIII). Typical for this type, not measured.`);
  });

  it('is left out of Markdown, JSON and CSV even when the row has a mix, and of a plan with no filter', async () => {
    await app([ic405], profileWith('nbz'));
    expect(await share()).toContain('Filter mix');
    for (const format of ['Markdown', 'JSON', 'CSV']) {
      fireEvent.click(screen.getByRole('radio', { name: format }));
      await waitFor(() => expect((screen.getByLabelText('Text to share') as HTMLTextAreaElement).value).not.toBe(''));
      expect((screen.getByLabelText('Text to share') as HTMLTextAreaElement).value).not.toMatch(/Filter mix|planned light split|Typical for this type|adds Ha/);
    }
  });

  it('has no section for a plan with no filter in the setup', async () => {
    await app([ic405], profileWith(undefined));
    expect(await share()).not.toContain('Filter mix');
  });
});
