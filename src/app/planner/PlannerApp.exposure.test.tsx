/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { countHiddenBelow } from './ExposurePanel';

// The Exposure panel and the filter selector, driven with real events on the whole page.

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const HYPERSTAR = 'wide-c11-hyperstar-2600';
const app = (profile = withTrain(HYPERSTAR)) => render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} />);
const panel = () => screen.getByRole('region', { name: /^EXPOSURE:/ });
const radio = (name: RegExp) => within(panel()).getByRole('radio', { name }) as HTMLInputElement;
const warnings = () => (screen.getByTestId('exposure-warnings').textContent ?? '');
const filterSelect = () => screen.getByLabelText('Filter') as HTMLSelectElement;
const trainSelect = () => screen.getByLabelText('Train') as HTMLSelectElement;

// user-event looks up a radio's group with CSS.escape, which jsdom lacks.
beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Exposure panel', () => {
  it('shows three mode cards with every value labelled estimate, a range, and Balanced chosen', () => {
    app();
    const p = panel();
    expect(within(p).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['quick', 'balanced', 'deep']);
    expect(radio(/Balanced/).checked).toBe(true);
    expect(radio(/Quick/).checked).toBe(false);
    for (const label of ['Sub length', 'Sub count', 'Total light', 'Overhead', 'Elapsed', 'Finish']) {
      expect(within(p).getAllByText(`${label}, estimate`)).toHaveLength(3);
    }
    expect(p.textContent).toMatch(/range \d+ to \d+ s/);
    // every numeric row of every card carries a range, Sub count included
    for (const row of ['Sub length', 'Sub count', 'Total light', 'Overhead', 'Elapsed', 'Finish']) {
      for (const dt of within(p).getAllByText(`${row}, estimate`)) expect(dt.nextElementSibling!.textContent).toMatch(/range|after lost frames/);
    }
    expect(within(p).getAllByText(/^\d+ \(range \d+ to \d+ subs\)$/)).toHaveLength(3);
    expect(p.textContent).toMatch(/setup 30, dithers/);
    expect(p.textContent).toMatch(/Estimates for tonight, not predictions/);
  });

  it('the marginal rows give 30, 60, 90 and 120 minutes at x1.00, x1.41, x1.73 and x2.00 of the signal-to-noise', () => {
    app();
    const rows = within(screen.getByTestId('marginal-table')).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatch(/^30 min.*x1\.00.*baseline/);
    expect(rows[1]).toMatch(/^60 min.*x1\.41/);
    expect(rows[2]).toMatch(/^90 min.*x1\.73/);
    expect(rows[3]).toMatch(/^120 min.*x2\.00.*x1\.70 to x2\.00/);
    expect(panel().textContent).toMatch(/4 times the time gives 2 times the signal-to-noise/);
    expect(panel().textContent).toMatch(/no universal best stop time/);
  });

  it('arrow keys move the choice between the cards; the word "Selected" follows and the notes change', async () => {
    const user = userEvent.setup();
    app();
    const selectedWords = () => within(panel()).getAllByText('Selected').filter((n) => n.getAttribute('aria-hidden') !== 'true');
    expect(selectedWords()).toHaveLength(1);
    radio(/Balanced/).focus();
    await user.keyboard('{ArrowLeft}');
    expect(radio(/Quick/).checked).toBe(true);
    expect(radio(/Balanced/).checked).toBe(false);
        expect(warnings()).toMatch(/short-session rule|Surface brightness is not in the catalog/);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(radio(/Deep/).checked).toBe(true);
        expect(warnings()).not.toMatch(/Surface brightness is not in the catalog/);
  });

  it('a click on a card chooses it too', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(panel()).getByText('Deep Project'));
    expect(radio(/Deep/).checked).toBe(true);
  });

  it('a different Bortle class changes the sub lengths', async () => {
    const user = userEvent.setup();
    app();
    const subs = () => within(panel()).getAllByText(/^\d+ s \(range/).map((n) => n.textContent);
    const before = subs();
    await user.selectOptions(screen.getByLabelText('Sky darkness (Bortle class)'), '9');
    expect(subs()).not.toEqual(before);
    await user.selectOptions(screen.getByLabelText('Sky darkness (Bortle class)'), '2');
    expect(subs()).not.toEqual(before);
  });

  it('picking another target keeps the panel and names the target', async () => {
    const user = userEvent.setup();
    app();
    const buttons = within(screen.getByTestId('target-table')).getAllByRole('button', { pressed: false });
    const name = buttons[0].textContent as string;
    await user.click(buttons[0]);
    expect(panel().querySelector('h2')!.textContent).toBe(`EXPOSURE: ${name.toUpperCase()}`);
  });
});

describe('Filter selector and its warnings', () => {
  it('lists No filter and the twelve sample filters on an optical train', () => {
    app();
    expect(Array.from(filterSelect().options).map((o) => o.text)).toEqual([
      'No filter',
      ...sampleProfile().equipment.filters.map((f) => `${f.name} (${f.sizeMm} mm)`),
    ]);
    expect(filterSelect().value).toBe('');
    expect(filterSelect().disabled).toBe(false);
  });

  it('L-eXtreme at the HyperStar f-ratio raises the rated-slower warning; the CLS CCD removes it and raises none', async () => {
    const user = userEvent.setup();
    app();
    expect(warnings()).not.toMatch(/rated|published/);
    await user.selectOptions(filterSelect(), 'optolong-lextreme');
    expect(warnings()).toMatch(/Optolong L-eXtreme \(standard\) has no published f-ratio rating/);
    expect(warnings()).toMatch(/Warning/);
    expect(screen.getByTestId('exposure-filter').textContent).toMatch(/Optolong L-eXtreme \(standard\): dual-band, 48 mm\. Bandpass: Ha 7 nm \+ OIII 7 nm\. Blocks UV\/IR: yes\. Rated for: not published\./);
    await user.selectOptions(filterSelect(), 'astronomik-cls-ccd');
    expect(warnings()).not.toMatch(/rated for|has no published/);
    expect(warnings()).not.toMatch(/UV\/IR/);
    expect(screen.getByTestId('exposure-filter').textContent).toMatch(/Rated for: f\/1\.8 and slower/);
  });

  it('the ASI533MC train with no filter, or one lacking UV/IR cut, raises the IR warning; a filter with it does not', async () => {
    const user = userEvent.setup();
    app(withTrain('deep-c11-reducer-533'));
    expect(warnings()).toMatch(/No filter is selected and this camera has no UV\/IR cut/);
    await user.selectOptions(filterSelect(), 'idas-lps-p2');
    expect(warnings()).toMatch(/not known that IDAS LPS-P2 blocks UV\/IR/);
    await user.selectOptions(filterSelect(), 'baader-uvir-cut');
    expect(warnings()).not.toMatch(/UV\/IR cut and/);
    await user.selectOptions(filterSelect(), 'idas-lps-p3');
    expect(warnings()).not.toMatch(/UV\/IR cut and/);
  });

  it('a visual-first filter on a colour camera is warned about', async () => {
    const user = userEvent.setup();
    app(withTrain('deep-c11-2600'));
    await user.selectOptions(filterSelect(), 'apertura-moon-skyglow');
    expect(warnings()).toMatch(/made for visual use/);
  });

  it('the choice is saved with the profile and survives a reload; switching trains shows each train\'s own filter', async () => {
    const user = userEvent.setup();
    const { unmount } = app();
    await user.selectOptions(filterSelect(), 'zwo-duo-band');
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string).trains.find((t: { id: string }) => t.id === HYPERSTAR).filterId).toBe('zwo-duo-band');
    await user.selectOptions(trainSelect(), 'deep-c11-2600');
    expect(filterSelect().value).toBe('');
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().value).toBe('zwo-duo-band');
    unmount();
    render(<PlannerApp initialDate="2026-12-15" />); // reads storage, as a reload does
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().value).toBe('zwo-duo-band');
  });

  it('a smart scope has no filter slot and no exposure estimate', async () => {
    const user = userEvent.setup();
    app(withTrain('smart-seestar-s50'));
    expect(filterSelect().disabled).toBe(true);
    expect(filterSelect().value).toBe('');
    expect(screen.getByRole('option', { name: 'Built in (smart scope)' })).toBeTruthy();
    expect(panel().textContent).toMatch(/needs an optical train/);
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().disabled).toBe(false);
  });

  it('a profile without filters says so and names the action, short enough for its two-line box', () => {
    const p = sampleProfile();
    app({ ...p, trains: p.trains.map((t) => (t.kind === 'optical' ? { ...t, filterId: undefined } : t)), equipment: { ...p.equipment, filters: [] } });
    expect(filterSelect().options).toHaveLength(1);
    expect(document.getElementById('plan-filter-msg')!.textContent).toMatch(/^No filters\. Use Replace profile with sample\.$/);
  });

  it('a train whose scope has no aperture says what is missing instead of guessing', () => {
    const p = sampleProfile();
    app({
      ...p,
      equipment: { ...p.equipment, scopes: p.equipment.scopes.map((s) => ({ ...s, apertureMm: undefined })) },
      trains: [...p.trains].sort((a) => (a.id === HYPERSTAR ? -1 : 1)),
    });
    expect(panel().textContent).toMatch(/Not enough data in the profile for an estimate\. Missing: train\.focalRatio/);
  });
});

// The flip rule is fed the real meridian crossing (hour angle zero), not the highest point while usable.
// Dates and numbers come from the sample site on 2026-12-15 with the HyperStar train and no filter.
describe('meridian flip, through the whole page', () => {
  const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
    await user.click(within(screen.getByTestId('target-table')).getByRole('button', { name }));
    await user.click(within(panel()).getByText('Quick & Beautiful'));
    return radio(/Quick/).closest('label')!.textContent ?? '';
  };
  it('North America Nebula already past the meridian: no flip, overhead 33.7 min (the peak is only the window start)', async () => {
    const user = userEvent.setup();
    app();
    const quick = await pick(user, /North America Nebula/);
    expect(quick).toMatch(/Overhead, estimate33\.7 min/);
    expect(quick).toMatch(/meridian flip 0$|meridian flip 0Elapsed/);
    expect(warnings()).not.toMatch(/meridian flip/i);
  });
  it('Hercules Globular Cluster, rising, window ends long before the crossing: no flip', async () => {
    const user = userEvent.setup();
    app();
    const quick = await pick(user, /Hercules Globular Cluster/);
    expect(quick).toMatch(/meridian flip 0/);
    expect(warnings()).not.toMatch(/meridian flip/i);
  });
  it("Thor's Helmet crosses 43 minutes into its window: the flip is counted and noted", async () => {
    const user = userEvent.setup();
    app();
    const quick = await pick(user, /Thor's Helmet/);
    expect(quick).toMatch(/meridian flip 10/);
    expect(warnings()).toMatch(/A meridian flip falls inside this session and adds 10 minutes/);
    expect(warnings()).not.toMatch(/highest point/);
  });
});

describe('Exposure panel for a planet', () => {
  it('says planning here is for deep-sky targets', async () => {
    const user = userEvent.setup();
    app(withTrain('deep-c11-2600'));
    await user.selectOptions(screen.getByLabelText('Setup'), 'planets');
    const planetButton = within(screen.getByTestId('target-table')).getAllByRole('button')[0];
    await user.click(planetButton);
    expect(panel().textContent).toMatch(/for deep-sky targets/);
  });
});

describe('Gain column and the overflow cue', () => {
  it('the Gain column says estimate in its heading and gives a range in each row', () => {
    app();
    const table = screen.getByTestId('marginal-table');
    expect(within(table).getByRole('columnheader', { name: /Gain on the step before, estimate \(range\)/ })).toBeTruthy();
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows[0]).toMatch(/baseline/);
    expect(rows[1]).toMatch(/\+41%range \+29% to \+41%/);
    expect(rows[2]).toMatch(/\+22%range \+17% to \+22%/);
    expect(rows[3]).toMatch(/\+15%range \+12% to \+15%/);
  });

  it('the cue under the warnings box is empty when everything fits and names the hidden count when it does not', async () => {
    const user = userEvent.setup();
    const rect = (bottom: number) => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom, toJSON: () => ({}) }) as DOMRect;
    const spy = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.getAttribute('data-testid') === 'exposure-warnings') return rect(100);
      if (this.tagName === 'LI') return rect(250); // every warning ends below the box
      return rect(0);
    });
    try {
      app();
      await user.selectOptions(filterSelect(), 'optolong-lextreme'); // warns at f/1.93
      const items = screen.getByTestId('exposure-warnings').querySelectorAll('li').length;
      expect(items).toBeGreaterThan(0);
      expect(screen.getByTestId('exposure-warnings-cue').textContent).toBe(`${items} more below, scroll`);
    } finally {
      spy.mockRestore();
    }
    cleanup();
    app();
    expect(screen.getByTestId('exposure-warnings-cue').textContent).toBe('');
  });

  it('counts only the items that reach below the box edge', () => {
    expect(countHiddenBelow(100, [40, 99, 101, 103])).toBe(1);
    expect(countHiddenBelow(100, [])).toBe(0);
    expect(countHiddenBelow(100, [101])).toBe(0); // within 1 px: not hidden
  });
});
