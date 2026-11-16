/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { moonIllumination } from '@/planner/astro';
import { tonightsNight } from '@/planner/plan';
import { MY_PLAN_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { addDays } from './catalogText';
import { chooseMore, listRows, pageProps, planRowItems, ready } from './testkit';

// Round 3: the sticky strip, quick dates, dates in words, the Moon note, "Change or find a site", chevrons, one overflow menu,
// and the detail's score parts adding up.

const SITE = sampleProfile().sites[0];
const SITE_POINT = { latitude: SITE.latitude, longitude: SITE.longitude, elevationM: SITE.elevationM };
const midMoon = (date: string): number | null => {
  const n = tonightsNight(SITE_POINT, date, SITE.timeZone);
  return n.kind === 'normal' ? moonIllumination(new Date(((n.start as Date).getTime() + (n.end as Date).getTime()) / 2)) : null;
};
const nights = Array.from({ length: 30 }, (_, i) => addDays('2026-12-01', i));
const BRIGHT = nights.find((d) => (midMoon(d) ?? 0) > 0.85)!;
const DARK = nights.find((d) => (midMoon(d) ?? 1) < 0.4)!;

const app = async (date = '2026-12-15') => {
  const r = render(<PlannerApp {...pageProps} initialDate={date} initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const strip = () => document.querySelector<HTMLElement>('[aria-controls="controls-panel"]')!;
const panel = () => document.getElementById('controls-panel')!;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the sticky control strip', () => {
  it('is one line: date, site and train, and "edit"; it is sticky below the page header', async () => {
    render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    await screen.findByTestId('target-list', {}, { timeout: 20000 });
    expect(strip().textContent).toContain('Tue 15 Dec · Fountain Hills, AZ · C11 f/10 + ASI2600MC Duo');
    expect(strip().textContent).toMatch(/edit$/);
    expect(strip().getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('hidden')).toBe(true);
    const section = strip().closest('section')!;
    expect(section.className).toContain('sticky');
    expect(section.className).toContain('top-[var(--planner-nav,0px)]');
  });

  it('opens to the existing Evening of, Site and Train controls, with no second set of them', async () => {
    await app();
    fireEvent.click(strip()); // ready() opened it; this closes it
    expect(panel().hasAttribute('hidden')).toBe(true);
    fireEvent.click(strip());
    expect(panel().hasAttribute('hidden')).toBe(false);
    expect(strip().textContent).toMatch(/close$/);
    for (const label of ['Evening of', 'Site', 'Train']) {
      expect(screen.getAllByLabelText(label)).toHaveLength(1);
      expect(panel().contains(screen.getByLabelText(label))).toBe(true);
    }
  });

  it('follows the controls: a new train and a new date change the strip', async () => {
    await app();
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: sampleProfile().trains[6].id } });
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-12-20' } });
    expect(strip().textContent).toContain('Sun 20 Dec · Fountain Hills, AZ · Seestar S50');
  });

  it('keeps the search reachable: "Find a target" moves the focus to the one search box', async () => {
    await app();
    fireEvent.click(screen.getByRole('button', { name: 'Find a target' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Search the catalog by name or number'));
    expect(document.querySelectorAll('#target-search')).toHaveLength(1);
  });

  it('sets the offsets its neighbours use: the page header and the strip are measured into variables', async () => {
    const nav = document.createElement('nav');
    nav.className = 'fixed';
    nav.getBoundingClientRect = () => ({ height: 160 }) as DOMRect;
    document.body.appendChild(nav);
    const { container } = await app();
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--planner-nav')).toBe('160px');
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--planner-top')).toMatch(/^\d+px$/);
    nav.remove();
  });

  it('measures the whole strip section, so --planner-top has no overlap with the column titles', async () => {
    const real = HTMLElement.prototype.getBoundingClientRect;
    const spy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'SECTION' && this.getAttribute('aria-labelledby') === 'controls-heading') return { height: 46 } as DOMRect;
      if (this.tagName === 'DIV' && this.parentElement?.getAttribute('aria-labelledby') === 'controls-heading') return { height: 44 } as DOMRect;
      return real.call(this);
    });
    const nav = document.createElement('nav');
    nav.className = 'fixed';
    nav.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
    document.body.appendChild(nav);
    const { container } = await app();
    expect((container.firstElementChild as HTMLElement).style.getPropertyValue('--planner-top')).toBe('146px');
    nav.remove();
    spy.mockRestore();
  });
});

describe('dates in words and quick dates', () => {
  it('headings say "Tue 15 Dec" for another night and "tonight" for today', async () => {
    await app('2026-12-15');
    expect(screen.getByRole('heading', { name: 'Best targets for Tue 15 Dec' })).toBeTruthy();
    expect(screen.queryByText(/\d+\/\d+\/\d{4}/)).toBeNull();
  });

  it('Today, Tomorrow and +1 week set the date beside it; the pressed one says so', async () => {
    await app('2026-12-15');
    const input = screen.getByLabelText('Evening of') as HTMLInputElement;
    const group = within(screen.getByRole('group', { name: 'Quick dates' }));
    fireEvent.click(group.getByRole('button', { name: 'Today' }));
    const today = input.value;
    expect(group.getByRole('button', { name: 'Today' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Best targets for tonight' })).toBeTruthy();
    fireEvent.click(group.getByRole('button', { name: 'Tomorrow' }));
    expect(input.value).toBe(addDays(today, 1));
    expect(group.getByRole('button', { name: 'Tomorrow' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(group.getByRole('button', { name: '+1 week' }));
    expect(input.value).toBe(addDays(today, 7));
    expect(strip().textContent).not.toContain('Tonight');
  });
});

describe('a bright Moon is said in words', () => {
  it('above 80 percent: one line above the list, with the percent, advice and "estimate"', async () => {
    await app(BRIGHT);
    const note = screen.getByTestId('bright-moon-note');
    expect(note.textContent).toMatch(/Bright Moon \(\d+% lit at mid-night\)/);
    expect(note.textContent).toMatch(/faint nebulae and galaxies will wash out; clusters and bright objects hold up best/);
    expect(note.textContent).toMatch(/estimate/);
    expect(note.compareDocumentPosition(screen.getByTestId('target-list')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('at 80 percent or below there is no such line', async () => {
    await app(DARK);
    expect(screen.queryByTestId('bright-moon-note')).toBeNull();
  });
});

describe('Change or find a site', () => {
  it('opens the Sites class on the site, focuses its Find box, and closes the strip', async () => {
    await app();
    const sites = () => screen.getByRole('button', { name: /^Sites \(1\)$/ });
    fireEvent.click(screen.getByRole('button', { name: 'Change or find a site' }));
    expect(sites().getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(document.getElementById(`site-find-${SITE.id}`));
    expect(strip().getAttribute('aria-expanded')).toBe('false');
    // Pressed again, it does the same (the box is already there).
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(strip());
    fireEvent.click(screen.getByRole('button', { name: 'Change or find a site' }));
    expect(document.activeElement).toBe(document.getElementById(`site-find-${SITE.id}`));
  });

  it('picking the Sites class by hand does not take the focus', async () => {
    await app();
    fireEvent.click(screen.getByRole('tab', { name: 'Gear and site' }));
    fireEvent.click(screen.getByRole('button', { name: /^Sites \(1\)$/ }));
    expect(document.activeElement).not.toBe(document.getElementById(`site-find-${SITE.id}`));
  });
});

describe('the disclosures inside a row', () => {
  it('Altitude as a table and the others carry a chevron that turns with the open state', async () => {
    await app();
    fireEvent.click(listRows()[0].querySelector('button[aria-expanded]')!);
    const summaries = [...document.querySelectorAll('details > summary')].filter((s) => /^(Altitude as a table|Altitude numbers as a table|How to blend)$/.test(s.textContent?.replace('▸', '').trim() ?? ''));
    expect(summaries.length).toBeGreaterThanOrEqual(2);
    for (const s of summaries) {
      const chev = s.querySelector('[data-disclosure-chevron]')!;
      expect(chev.textContent).toBe('▸');
      expect(chev.className).toContain('group-open:rotate-90');
      expect(s.parentElement!.className.split(' ')).toContain('group');
    }
  });
});

describe('Print and Export CSV in one menu', () => {
  it('are not buttons of their own any more; the More menu holds both', async () => {
    await app();
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Print or save as PDF' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^More/ }));
    expect(within(screen.getByRole('menu')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Share and export…', 'Export CSV', 'Print or save as PDF']);
  });

  it('Print from the menu calls the browser print', async () => {
    const print = jest.fn();
    window.print = print;
    await app();
    chooseMore('Print or save as PDF');
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('reachable by keyboard alone: focus the button, Enter, Down, Enter', async () => {
    const print = jest.fn();
    window.print = print;
    await app();
    const u = userEvent.setup();
    screen.getByRole('button', { name: /^More/ }).focus();
    await u.keyboard('{Enter}{ArrowDown}{ArrowDown}{Enter}');
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('the detail: score parts add up to the score', () => {
  it('names brightness and framing, and the parts sum to the row score (capped at 100)', async () => {
    await app();
    const row = listRows()[0];
    const score = Number(row.querySelector('[data-testid="row-fit-score"]')!.textContent!.match(/Score (\d+)/)![1]);
    fireEvent.click(row.querySelector('button[aria-expanded]')!);
    const text = screen.getByText(/^Score parts:/).textContent!;
    const [terms, result] = text.replace(/^Score parts: /, '').split(' = ');
    const sum = [...terms.matchAll(/(-?\d+)(?:,|$)/g)].reduce((a, m) => a + Number(m[1]), 0);
    expect(terms).toMatch(/usable .*altitude .*Moon .*fit /);
    expect(Math.max(0, Math.min(100, sum))).toBe(score);
    expect(result).toMatch(new RegExp(`^(${sum}, (capped at|raised to) ${score}|${score})`));
  });
});

describe('the small should-fixes', () => {
  it('the score note says the list mixes types', async () => {
    await app();
    expect(screen.getByTestId('score-note').textContent).toMatch(/mixes types, so it is not strictly in score order/);
  });

  it('The plan calls the Moon and planets "Solar system"', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['planet-moon', 'planet-jupiter'] }));
    await app();
    const items = planRowItems();
    expect(items[0].textContent).toMatch(/Moon[\s\S]*Solar system/);
    expect(items[0].textContent).toMatch(/Solar system/);
    expect(items[1].textContent).toMatch(/Solar system/);
    for (const li of planRowItems()) expect(li.textContent).not.toMatch(/Planet/);
  });
});
