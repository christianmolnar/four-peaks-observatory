/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import type { Profile } from '@/planner/profile';
import PlannerApp from './PlannerApp';
import { openPlanTab, pageProps, ready, seedPlan } from './testkit';

// G4c: the narrowband panel on a plan row: every gear filter judged, ticks that feed the row's filter mix and a new project's minutes, and the broadband hours the numbers are for.

const NBZ = { id: 'nbz', name: 'IDAS NBZ-II', kind: 'dual-band' as const, passbands: [{ centreNm: 656.3, widthNm: 10 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3 = { id: 'nb3', name: 'IDAS NB3-PM', kind: 'dual-band' as const, passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] };
const MYSTERY = { id: 'mystery', name: 'Mystery filter', kind: 'dual-band' as const };
const profile = (): Profile => {
  const p = sampleProfile();
  p.equipment.filters = [NBZ, NB3, MYSTERY];
  return p;
};
const app = async (targets: readonly object[]) => {
  seedPlan(targets, sampleProfile);
  render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile()} />);
  await ready();
  openPlanTab();
};
const rosette = { id: 'ic405', preset: 'balanced' };
const galaxy = { id: 'm31', preset: 'balanced' };
const openNb = (id: string) => {
  const f = document.getElementById(`nb-fold-${id}`) as HTMLButtonElement;
  if (f.getAttribute('aria-expanded') === 'false') fireEvent.click(f);
};
const openMix = (id: string) => {
  const f = document.getElementById(`plan-mix-fold-${id}`) as HTMLButtonElement;
  if (f.getAttribute('aria-expanded') === 'false') fireEvent.click(f);
};
const tick = (id: string, filter: string) => screen.getByTestId(`nb-tick-${id}-${filter}`) as HTMLInputElement;
const row = (id: string, filter: string) => screen.getByTestId(`nb-filter-${id}-${filter}`).textContent ?? '';
const mix = (id: string) => screen.getByTestId(`plan-mix-${id}`).textContent ?? '';
const minutesIn = (s: string): number => {
  const m = /: (?:(\d+) h)? ?(?:(\d+) min)?/.exec(s);
  return Number(m?.[1] ?? 0) * 60 + Number(m?.[2] ?? 0);
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
afterEach(cleanup);

describe('the narrowband panel on a plan row', () => {
  it('is a closed part of each row, lists every filter of the gear with its minutes or its reason, and ticks the recommended ones', async () => {
    await app([rosette]);
    const fold = document.getElementById('nb-fold-ic405') as HTMLButtonElement;
    expect(fold.textContent).toContain('Filters from your gear that could help most');
    expect(fold.getAttribute('aria-expanded')).toBe('false');
    openNb('ic405');
    expect(minutesIn(row('ic405', 'nbz'))).toBeGreaterThan(0);
    expect(tick('ic405', 'nbz').checked).toBe(true);
    expect(tick('ic405', 'nbz').disabled).toBe(false);
    expect(row('ic405', 'mystery')).toMatch(/cannot judge/i);
    expect(row('ic405', 'mystery')).toMatch(/passbands unknown/i);
    expect(tick('ic405', 'mystery').disabled).toBe(true);
    expect(tick('ic405', 'mystery').checked).toBe(false);
    const panel = screen.getByTestId('nb-ic405').textContent ?? '';
    expect(panel).toContain('Counts signal-to-noise only; band widths from the vendor, centres and leakage not verified; estimated from sky and band width, not measured on your rig.');
    expect(screen.getByTestId('nb-confidence-ic405').textContent).toBe('Typical for this type, not measured');
    expect(panel).toContain('How this is worked out');
    expect(panel).not.toMatch(/NaN|Infinity|undefined|e\+\d/);
  });

  it('a galaxy: no filter gets minutes and the reason says no narrowband', async () => {
    await app([galaxy]);
    openNb('m31');
    expect(screen.getByTestId('nb-headline-m31').textContent).toMatch(/almost no emission/);
    for (const f of ['nbz', 'nb3']) {
      expect(row('m31', f)).toMatch(/no narrowband/i);
      expect(tick('m31', f).disabled).toBe(true);
    }
  });

  it('the recommended filters are in the row’s filter mix from the start; unticking removes a filter’s minutes from the mix, ticking restores them', async () => {
    await app([rosette]);
    openMix('ic405');
    openNb('ic405');
    expect(mix('ic405')).toContain('IDAS NB3-PM');
    expect(mix('ic405')).toContain('IDAS NBZ-II');
    expect(screen.getByTestId('plan-mix-light-ic405').textContent).toMatch(/^Light: broadband .* plus IDAS NBZ-II .* plus IDAS NB3-PM .* = /);
    expect(screen.getByTestId('nb-state-ic405').textContent).toMatch(/in this row’s filter mix/);

    const nbzMin = minutesIn(row('ic405', 'nbz'));
    const nb3Min = minutesIn(row('ic405', 'nb3'));
    expect(nb3Min).toBeGreaterThan(0);
    fireEvent.click(tick('ic405', 'nb3')); // untick
    expect(tick('ic405', 'nb3').checked).toBe(false);
    expect(screen.getByTestId('nb-state-ic405').textContent).toMatch(/in this row’s filter mix/);
    expect(mix('ic405')).toContain('Broadband (no narrowband filter)');
    expect(mix('ic405')).toContain('IDAS NBZ-II');
    expect(mix('ic405')).not.toContain('IDAS NB3-PM');
    expect(screen.getByTestId('nb-total-ic405').textContent).toMatch(/plus IDAS NBZ-II .* = /);
    expect(screen.getByTestId('plan-mix-light-ic405').textContent).not.toContain('NB3-PM');
    fireEvent.click(tick('ic405', 'nb3')); // tick again
    expect(tick('ic405', 'nb3').checked).toBe(true);
    expect(mix('ic405')).toContain('IDAS NB3-PM');
    expect(minutesIn(row('ic405', 'nb3'))).toBe(nb3Min);
    expect(minutesIn(row('ic405', 'nbz'))).toBe(nbzMin);
  });

  it('after unticking everything the state line says no narrowband is ticked and the mix is back to the broadband-only mix', async () => {
    await app([rosette]);
    openNb('ic405');
    fireEvent.click(tick('ic405', 'nbz'));
    fireEvent.click(tick('ic405', 'nb3'));
    const state = screen.getByTestId('nb-state-ic405').textContent ?? '';
    expect(state).toMatch(/No narrowband filter is ticked/);
    expect(state).not.toMatch(/are in this row’s filter mix/);
    expect(mix('ic405')).not.toContain('Broadband (no narrowband filter)');
  });

  it('the broadband hours start at the row’s light and updating them updates the numbers; a bad number is said, with no minutes', async () => {
    await app([rosette]);
    openNb('ic405');
    const box = screen.getByTestId('nb-hours-ic405') as HTMLInputElement;
    expect(Number(box.value)).toBeGreaterThan(0);
    const start = row('ic405', 'nb3');
    fireEvent.change(box, { target: { value: '8' } });
    expect((screen.getByTestId('nb-hours-ic405') as HTMLInputElement).value).toBe('8');
    expect(row('ic405', 'nb3')).not.toBe(start);
    fireEvent.change(screen.getByTestId('nb-hours-ic405'), { target: { value: 'lots' } });
    expect(screen.getByTestId('nb-hours-error-ic405').textContent).toMatch(/from 0.25 to 48/);
    expect(screen.queryByTestId('nb-filter-ic405-nbz')).toBeNull();
  });
});

describe('a filter that is not recommended can still be chosen', () => {
  const HA7 = { id: 'ha7', name: 'H-alpha 7 nm', kind: 'narrowband' as const, passbands: [{ centreNm: 656.3, widthNm: 7 }] };
  const withHa7 = async () => {
    seedPlan([rosette], sampleProfile);
    const p = sampleProfile();
    p.equipment.filters = [NBZ, HA7];
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={p} />);
    await ready();
    openPlanTab();
    openNb('ic405');
  };
  it('shows its gain and its stand-alone minutes, a true reason and a box that can be ticked', async () => {
    await withHa7();
    const text = row('ic405', 'ha7');
    expect(text).toMatch(/not recommended, .*on its own/);
    expect(text).toMatch(/signal-to-noise gain about/);
    expect(text).not.toMatch(/better collected/);
    expect(text).toMatch(/NBZ-II already runs for Ha/);
    expect(tick('ic405', 'ha7').disabled).toBe(false);
    expect(tick('ic405', 'ha7').checked).toBe(false);
    expect(screen.getByTestId('nb-twice-ic405').textContent).toMatch(/never counted twice/);
  });
  it('ticking it beside the recommended filter does not count Ha twice; choosing it instead of NBZ II adds its own minutes', async () => {
    await withHa7();
    const total = () => screen.getByTestId('nb-total-ic405').textContent ?? '';
    const before = total();
    fireEvent.click(tick('ic405', 'ha7'));
    expect(total()).toBe(before);
    fireEvent.click(tick('ic405', 'nbz'));
    expect(total()).toMatch(/plus H-alpha 7 nm .* = /);
  });
});

describe('the ticked filters in a new project', () => {
  it('a new project from a plan row gets the recommended filters with no tick touched', async () => {
    await app([rosette]);
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    await screen.findByTestId('projects-tab');
    await waitFor(() => expect(screen.queryByText('Loading your projects…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const filters = within(screen.getByRole('group', { name: 'Filters used' }));
    expect((filters.getByLabelText('IDAS NBZ-II') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('IDAS NB3-PM') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(screen.getByRole('group', { name: 'From your open plan' })).getAllByRole('checkbox')[0]);
    const card = screen.getAllByTestId('draft-target')[0];
    expect(Number((within(card).getByLabelText('IDAS NBZ-II, minutes') as HTMLInputElement).value)).toBeGreaterThan(0);
    expect(Number((within(card).getByLabelText('IDAS NB3-PM, minutes') as HTMLInputElement).value)).toBeGreaterThan(0);
  });

  it('a plan target added to a new project starts from the broadband time and the ticked filters; unticking a filter leaves it out', async () => {
    await app([rosette]);
    openNb('ic405');
    fireEvent.click(tick('ic405', 'nb3')); // untick: now the plan holds broadband and NBZ II only
    const nbz = minutesIn(row('ic405', 'nbz'));
    fireEvent.click(screen.getByRole('tab', { name: 'Projects' }));
    await screen.findByTestId('projects-tab');
    await waitFor(() => expect(screen.queryByText('Loading your projects…')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const filters = within(screen.getByRole('group', { name: 'Filters used' }));
    expect((filters.getByLabelText('IDAS NBZ-II') as HTMLInputElement).checked).toBe(true);
    expect((filters.getByLabelText('IDAS NB3-PM') as HTMLInputElement).checked).toBe(false);
    const fromPlan = within(screen.getByRole('group', { name: 'From your open plan' }));
    const name = fromPlan.getAllByRole('checkbox')[0].parentElement?.textContent ?? '';
    fireEvent.click(fromPlan.getAllByRole('checkbox')[0]);
    const card = screen.getAllByTestId('draft-target')[0];
    expect(name.length).toBeGreaterThan(0);
    const box = (label: string) => (within(card).getByLabelText(`${label}, minutes`) as HTMLInputElement).value;
    expect(Number(box('IDAS NBZ-II'))).toBe(nbz);
    expect(Number(box('Broadband'))).toBeGreaterThan(0);
  });
});
