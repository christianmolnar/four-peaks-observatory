/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { Warnings, splitWarnings } from './ExposurePanel';
import type { WarningCode } from '@/planner/exposure';
import { CORE_FRAME_COUNT } from '@/planner/exposure';
import { listRows, nameButton, pageProps, ready, rowName } from './testkit';

// The Exposure panel and the filter selector, driven with real events on the whole page.

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const HYPERSTAR = 'wide-c11-hyperstar-2600';
const withBortle = (bortle: number, train = HYPERSTAR) => {
  const p = withTrain(train);
  return { ...p, sites: p.sites.map((x, i) => (i === 0 ? { ...x, bortle } : x)) };
};
const app = async (profile = withTrain(HYPERSTAR)) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={profile} />);
  await ready();
  return r;
};
const panel = () => screen.getByRole('region', { name: /^EXPOSURE:/ });
const radio = (name: RegExp) => within(panel()).getByRole('radio', { name }) as HTMLInputElement;
// The text of the warnings and the closed Notes together; empty when the area is not there.
const warnings = () => (screen.queryByTestId('exposure-warnings')?.textContent ?? '');
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
  it('shows three mode cards with a range on every value, and Balanced chosen', async () => {
    await app();
    const p = panel();
    expect(within(p).getAllByRole('radio').map((r) => (r as HTMLInputElement).value)).toEqual(['quick', 'balanced', 'deep']);
    expect(radio(/Balanced/).checked).toBe(true);
    expect(radio(/Quick/).checked).toBe(false);
    for (const label of ['Sub length', 'Sub count', 'Total light', 'Overhead', 'Elapsed', 'Finish']) {
      expect(within(p).getAllByText(label)).toHaveLength(3);
    }
    expect(p.textContent).toMatch(/range \d+ to \d+ s/);
    // every numeric row of every card carries a range, Sub count included
    for (const row of ['Sub length', 'Sub count', 'Total light', 'Overhead', 'Elapsed', 'Finish']) {
      for (const dt of within(p).getAllByText(row)) expect(dt.nextElementSibling!.textContent).toMatch(/range|after lost frames/);
    }
    expect(within(p).getAllByText(/^\d+ \(range \d+ to \d+ subs\)$/)).toHaveLength(3);
    expect(p.textContent).toMatch(/setup 30, dithers/);
    expect(screen.getByTestId('exposure-estimate-line').textContent).toBe('These numbers are estimates; trust the range, not the single number.');
    expect(p.textContent).toMatch(/Worked out for Tue 15 Dec\./);
    // said once at the top, not again on every card and row
    expect(p.textContent).not.toMatch(/All values are estimates|, estimate(?!\s*\()/);
  });

  it('the marginal rows give 30, 60, 90 and 120 minutes at x1.00, x1.41, x1.73 and x2.00 of the signal-to-noise', async () => {
    await app();
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
    await app();
    const selectedWords = () => within(panel()).getAllByText('Selected').filter((n) => n.getAttribute('aria-hidden') !== 'true');
    expect(selectedWords()).toHaveLength(1);
    radio(/Balanced/).focus();
    await user.keyboard('{ArrowLeft}');
    expect(radio(/Quick/).checked).toBe(true);
    expect(radio(/Balanced/).checked).toBe(false);
        expect(warnings()).toMatch(/short-session rule|Surface brightness is not in the catalog/);
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(radio(/Deep/).checked).toBe(true);
    // Deep is not a short session: the ranking note goes; the assumption behind the stop point (no surface brightness in the catalog) stays.
    expect(warnings()).not.toMatch(/short-session rule/);
    expect(warnings()).toMatch(/the stop point assumes a medium one/);
  });

  it('a click on a card chooses it too', async () => {
    const user = userEvent.setup();
    await app();
    await user.click(within(panel()).getByText('Deep Project'));
    expect(radio(/Deep/).checked).toBe(true);
  });

  it('a different Bortle class on the site changes the sub lengths', async () => {
    // The 0.7x reducer train (f/7): on the HyperStar train every preset sits on the 15 s floor in any sky.
    const reducer = 'deep-c11-reducer-2600';
    const subs = () => within(panel()).getAllByText(/^\d+ s \(range/).map((n) => n.textContent);
    await app(withTrain(reducer));
    const before = subs();
    cleanup();
    await app(withBortle(9, reducer));
    expect(subs()).not.toEqual(before);
    cleanup();
    await app(withBortle(2, reducer));
    expect(subs()).not.toEqual(before);
  });

  it('picking another target keeps the panel and names the target', async () => {
    const user = userEvent.setup();
    await app();
    const rows = listRows();
    const second = rows[1];
    await user.click(second.querySelector('button[aria-expanded]') as HTMLElement);
    expect(panel().querySelector('h2')!.textContent).toBe(`EXPOSURE: ${rowName(second).toUpperCase()}`);
  });
});

describe('Filter selector and its warnings', () => {
  it('lists No filter and the twelve sample filters on an optical train', async () => {
    await app();
    expect(Array.from(filterSelect().options).map((o) => o.text)).toEqual([
      'No filter',
      ...sampleProfile().equipment.filters.map((f) => `${f.name} (${f.sizeMm} mm)`),
    ]);
    expect(filterSelect().value).toBe('');
    expect(filterSelect().disabled).toBe(false);
  });

  it('L-eXtreme at the HyperStar f-ratio raises the rated-slower warning; the CLS CCD removes it and raises none', async () => {
    const user = userEvent.setup();
    await app();
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
    await app(withTrain('deep-c11-reducer-533'));
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
    await app(withTrain('deep-c11-2600'));
    await user.selectOptions(filterSelect(), 'apertura-moon-skyglow');
    expect(warnings()).toMatch(/made for visual use/);
  });

  // Two tests, not one: each page render in jsdom is slow, and one test doing both ran close to the time limit when the machine was busy.
  it('the choice is saved with the profile and survives a reload', async () => {
    const user = userEvent.setup();
    const { unmount } = await app();
    await user.selectOptions(filterSelect(), 'zwo-duo-band');
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string).trains.find((t: { id: string }) => t.id === HYPERSTAR).filterId).toBe('zwo-duo-band');
    unmount();
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" />); // reads storage, as a reload does
    await ready();
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().value).toBe('zwo-duo-band');
  });

  it('switching trains shows each train\'s own filter', async () => {
    const user = userEvent.setup();
    await app();
    await user.selectOptions(filterSelect(), 'zwo-duo-band');
    await user.selectOptions(trainSelect(), 'deep-c11-2600');
    expect(filterSelect().value).toBe('');
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().value).toBe('zwo-duo-band');
  });

  it('a smart scope has no filter slot and no exposure estimate', async () => {
    const user = userEvent.setup();
    await app(withTrain('smart-seestar-s50'));
    expect(filterSelect().disabled).toBe(true);
    expect(filterSelect().value).toBe('');
    expect(screen.getByRole('option', { name: 'Built in (smart scope)' })).toBeTruthy();
    expect(panel().textContent).toMatch(/needs an optical train/);
    await user.selectOptions(trainSelect(), HYPERSTAR);
    expect(filterSelect().disabled).toBe(false);
  });

  it('a profile without filters says so and names the action, short enough for its two-line box', async () => {
    const p = sampleProfile();
    await app({ ...p, trains: p.trains.map((t) => (t.kind === 'optical' ? { ...t, filterId: undefined } : t)), equipment: { ...p.equipment, filters: [] } });
    expect(filterSelect().options).toHaveLength(1);
    const msg = document.getElementById('plan-filter-msg')!;
    expect(msg.textContent).toBe('No filters yet. Add one in the profile editor.');
    expect(msg.querySelector('a')!.getAttribute('href')).toBe('#gear-heading');
    expect(document.getElementById('gear-heading')).toBeTruthy();
  });

  it('a train whose scope has no aperture says what is missing instead of guessing', async () => {
    const p = sampleProfile();
    await app({
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
  const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp, card = 'Quick & Beautiful', radioName = /Quick/) => {
    await user.click(nameButton(name));
    await user.click(within(panel()).getByText(card));
    return radio(radioName).closest('label')!.textContent ?? '';
  };
  it('North America Nebula already past the meridian: no flip, overhead 33 min (the peak is only the window start)', async () => {
    const user = userEvent.setup();
    await app();
    const quick = await pick(user, /North America Nebula/);
    expect(quick).toMatch(/Overhead33 min/);
    expect(quick).toMatch(/meridian flip 0$|meridian flip 0Elapsed/);
    expect(warnings()).not.toMatch(/meridian flip/i);
  });
  it('Hercules Globular Cluster, rising, window ends long before the crossing: no flip', async () => {
    const user = userEvent.setup();
    await app();
    const quick = await pick(user, /Hercules Globular Cluster/);
    expect(quick).toMatch(/meridian flip 0/);
    expect(warnings()).not.toMatch(/meridian flip/i);
  });
  it("Thor's Helmet crosses 43 minutes into its window: the flip is counted and noted", async () => {
    const user = userEvent.setup();
    await app();
    // Balanced: Quick is now 30 min of light and ends before the crossing, 43 minutes in.
    const quick = await pick(user, /Thor's Helmet/, 'Balanced', /Balanced/);
    expect(quick).toMatch(/meridian flip 10/);
    expect(warnings()).toMatch(/A meridian flip falls inside this session and adds 10 minutes/);
    expect(warnings()).not.toMatch(/highest point/);
  });
});

describe('Exposure panel for a solar-system body', () => {
  it('says planning here is for deep-sky targets', async () => {
    const user = userEvent.setup();
    await app(withTrain('deep-c11-2600'));
    await user.selectOptions(screen.getByLabelText('Type'), 'solar-system');
    await user.click(listRows('planet-list')[0].querySelector('button[aria-expanded]') as HTMLElement);
    expect(panel().textContent).toMatch(/for deep-sky targets/);
  });
});

describe('Gain column', () => {
  it('the Gain column says estimate in its heading and gives a range in each row', async () => {
    await app();
    const table = screen.getByTestId('marginal-table');
    expect(within(table).getByRole('columnheader', { name: /Gain on step before, estimate \(range\)/ })).toBeTruthy();
    const rows = within(table).getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows[0]).toMatch(/baseline/);
    expect(rows[1]).toMatch(/\+41%range \+29% to \+41%/);
    expect(rows[2]).toMatch(/\+22%range \+17% to \+22%/);
    expect(rows[3]).toMatch(/\+15%range \+12% to \+15%/);
  });

  describe('core advice', () => {
    const pick = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
      await user.click(nameButton(name));
    };

    it('a flagged target shows one line with the estimate label and a three-bullet blend fold', async () => {
      const user = userEvent.setup();
      // The native C11 (f/10): Balanced is a 60 s sub in Bortle 6, four times the 15 s core sub, the least ratio that earns a core set.
      await app(withTrain('deep-c11-2600'));
      await pick(user, /Hercules Globular Cluster/);
      const line = within(panel()).getByTestId('core-advice');
      expect(line.querySelector('p')!.textContent).toMatch(
        new RegExp(`^Hercules Globular Cluster: add ${CORE_FRAME_COUNT} x \\d+ s for the core \\(estimate\\)$`),
      );
      const fold = line.querySelector('details') as HTMLDetailsElement;
      expect(fold.open).toBe(false);
      expect(within(fold).getByText('How to blend')).toBeTruthy();
      expect(fold.querySelectorAll('li')).toHaveLength(3);
      expect(fold.textContent).toMatch(/PixInsight HDRComposition, Siril, or a Photoshop layer mask/);
    });

    it('a flagged target with no core set shows one fixed line instead (HyperStar subs are already the shortest)', async () => {
      const user = userEvent.setup();
      await app();
      await pick(user, /Hercules Globular Cluster/);
      const line = within(panel()).getByTestId('core-advice');
      expect(line.querySelector('p')!.textContent).toBe('No short set needed here.');
      expect(line.querySelector('details')).toBeNull();
    });

    // jsdom has no layout, so this checks the markup that fixes the height: same line classes, and a fold or a
    // placeholder of the same minimum height. The browser measurement is in the report.
    it.each([HYPERSTAR, 'deep-c11-reducer-2600'])('the core block has the same reserved height in every mode and sky (%s)', async (train) => {
      const user = userEvent.setup();
      await app(withTrain(train));
      await pick(user, /Hercules Globular Cluster/);
      const shape = () => {
        const block = within(panel()).getByTestId('core-advice');
        const line = block.querySelector('[data-testid="core-advice-line"]')!;
        const second = block.children[1] as HTMLElement;
        const tail = second.tagName === 'DETAILS' ? second.querySelector('summary')!.className : second.className;
        return [block.className, line.className, block.children.length, tail.match(/min-h-11/) ? 'min-h-11' : tail].join('|');
      };
      const seen = new Set<string>();
      for (const bortle of [2, 9]) {
        cleanup();
        await app({ ...withTrain(train), sites: withTrain(train).sites.map((x, i) => (i === 0 ? { ...x, bortle } : x)) });
        await pick(user, /Hercules Globular Cluster/);
        for (const mode of [/quick/i, /balanced/i, /deep/i]) {
          await user.click(radio(mode));
          seen.add(shape());
        }
      }
      expect(seen.size).toBe(1);
    });

    it('an unflagged target shows nothing', async () => {
      const user = userEvent.setup();
      await app(withTrain('deep-c11-reducer-2600'));
      await pick(user, /Bode's Galaxy/);
      expect(within(panel()).queryByTestId('core-advice')).toBeNull();
      expect(panel().textContent).not.toMatch(/for the core/);
    });
  });
});

describe('warnings: act on it, and Notes', () => {
  const fake = (code: WarningCode, severity: 'warning' | 'note' = 'note') => ({ code, severity, text: `Text of ${code}.` });
  // Every code, so a new one cannot be added without saying where it goes (the Record is checked by tsc).
  const WHERE: Record<WarningCode, 'act' | 'note'> = {
    'filter-rated-slower': 'act',
    'filter-uvir-missing': 'act',
    'filter-visual-colour': 'act',
    'moon-near': 'act',
    'no-usable-time': 'act',
    'limited-by-usable-time': 'act',
    'meridian-flip': 'act',
    'target-ou4': 'act',
    sampling: 'note',
    'sub-capped': 'note',
    'inputs-assumed': 'note',
    'below-mode-range': 'note',
    'short-session-faint': 'act',
    'short-session-unknown': 'note',
    'sb-assumed': 'note',
    'short-of-target': 'note',
    'filter-kind-unknown': 'note',
  };

  it.each(Object.entries(WHERE))('%s goes to %s', (code, where) => {
    const { act, notes } = splitWarnings([fake(code as WarningCode, where === 'act' ? 'warning' : 'note')]);
    expect(where === 'act' ? [act.length, notes.length] : [notes.length, act.length]).toEqual([1, 0]);
  });

  it('the warnings area has no fixed height, no scroll box and no overflow cue', async () => {
    const user = userEvent.setup();
    await app();
    await user.selectOptions(filterSelect(), 'optolong-lextreme');
    const area = screen.getByTestId('exposure-warnings');
    expect(area.className).not.toMatch(/\bh-\[|overflow|min-h-\[/);
    expect(area.getAttribute('tabindex')).toBeNull();
    expect(screen.queryByTestId('exposure-warnings-cue')).toBeNull();
    expect(panel().innerHTML).not.toMatch(/h-\[26rem\]|h-\[16\.5rem\]/);
  });

  it('a warning to act on shows the word Warning, what it means and what to change, with real controls', async () => {
    const user = userEvent.setup();
    await app();
    await user.selectOptions(filterSelect(), 'optolong-lextreme');
    const item = screen.getByTestId('warning-filter-rated-slower');
    expect(item.textContent).toMatch(/^Warning/);
    expect(item.textContent).toMatch(/has no published f-ratio rating/);
    expect(item.textContent).toMatch(/What to change: Pick a filter rated for this speed, or another train\./);
    expect(within(item).getAllByRole('button').map((b) => b.textContent)).toEqual(['Change the filter', 'Change the train']);
    expect(screen.queryByTestId('exposure-notes')?.contains(item) ?? false).toBe(false);
  });

  it('"Change the filter" opens the strip when it is closed and puts focus on the Filter select', async () => {
    const user = userEvent.setup();
    await app();
    await user.selectOptions(filterSelect(), 'optolong-lextreme');
    const toggle = document.querySelector('[aria-controls="controls-panel"]') as HTMLElement;
    await user.click(toggle); // close the strip
    expect(document.getElementById('controls-panel')!.hidden).toBe(true);
    await user.click(within(screen.getByTestId('warning-filter-rated-slower')).getByRole('button', { name: 'Change the filter' }));
    expect(document.getElementById('controls-panel')!.hidden).toBe(false);
    expect(document.activeElement).toBe(filterSelect());
    await user.click(toggle);
    await user.click(within(screen.getByTestId('warning-filter-rated-slower')).getByRole('button', { name: 'Change the train' }));
    expect(document.activeElement).toBe(trainSelect());
  });

  it('context-only codes fold into one closed "Notes (N)" line, with the act-on warnings outside it', async () => {
    const user = userEvent.setup();
    await app();
    await user.click(within(panel()).getByText('Quick & Beautiful')); // Quick adds the short-session note
    const notes = screen.getByTestId('exposure-notes') as HTMLDetailsElement;
    expect(notes.open).toBe(false);
    const count = notes.querySelectorAll('li').length;
    expect(count).toBeGreaterThan(0);
    expect(notes.querySelector('summary')!.textContent).toBe(`▸Notes (${count})`);
    expect(notes.querySelector('summary [data-disclosure-chevron]')).toBeTruthy();
    expect(notes.textContent).toMatch(/Note/);
  });

  it('a warning with no control (meridian flip) says what to do in a sentence only', async () => {
    const user = userEvent.setup();
    await app();
    await user.click(nameButton(/Thor's Helmet/));
    await user.click(within(panel()).getByText('Balanced'));
    const item = screen.getByTestId('warning-meridian-flip');
    expect(item.textContent).toMatch(/^Warning/);
    expect(item.textContent).toMatch(/A meridian flip falls inside this session and adds 10 minutes/);
    expect(within(item).queryAllByRole('button')).toHaveLength(0);
    expect(item.textContent).toMatch(/What to change: Plan a pause to flip/);
  });

  it('"Change the date" asks the page for the date control', () => {
    const onGo = jest.fn();
    render(<Warnings warnings={[fake('moon-near', 'warning'), fake('no-usable-time', 'warning')]} onGoToControl={onGo} />);
    for (const b of screen.getAllByRole('button', { name: 'Change the date' })) fireEvent.click(b);
    expect(onGo.mock.calls).toEqual([['plan-date'], ['plan-date']]);
  });

  it('nothing to say: the area is not there', () => {
    const { container } = render(<Warnings warnings={[]} onGoToControl={jest.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('only notes: no Warning block, just the closed Notes line', () => {
    render(<Warnings warnings={[fake('sampling'), fake('sub-capped')]} onGoToControl={jest.fn()} />);
    expect(screen.queryByText('Warning')).toBeNull();
    expect(screen.getByText('Notes (2)')).toBeTruthy();
  });
});

describe('What more time buys and the inputs used', () => {
  it('is one closed line by default, with the old heading and footnote gone from view', async () => {
    await app();
    const more = screen.getByTestId('exposure-more') as HTMLDetailsElement;
    expect(more.open).toBe(false);
    const summary = more.querySelector('summary')!;
    expect(summary.textContent).toBe('▸What more time buys and the inputs used');
    expect(summary.querySelector('[data-disclosure-chevron]')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /What more time buys/ })).toBeNull();
    // the table and the audit trail live inside it, unchanged
    expect(more.contains(screen.getByTestId('marginal-table'))).toBe(true);
    expect(more.contains(screen.getByTestId('exposure-inputs'))).toBe(true);
    expect(screen.getByTestId('exposure-inputs').textContent).toMatch(/^Inputs: f\/1\.93, .* Bortle \d, Moon \d+% lit and \d+ degrees away.* usable minutes\./);
  });

  it('opens on a click and then shows the table and the inputs', async () => {
    const user = userEvent.setup();
    await app();
    const more = screen.getByTestId('exposure-more') as HTMLDetailsElement;
    await user.click(more.querySelector('summary')!);
    expect(more.open).toBe(true);
    expect(within(screen.getByTestId('marginal-table')).getAllByRole('row')).toHaveLength(5);
  });
});
