/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { listRows, pageProps, ready, rowName, rowNames } from './testkit';

// The solar-system rows of the list: what the old Planets section showed now opens from the row. The planetary train (C11 + ASI676MC)
// is picked by id where a test needs its numbers; the sample opens on a deep-sky train. 2026-12-15: Mercury is below the horizon all
// night; 2026-12-24 is a full Moon, up all night.

jest.setTimeout(60000);

const DATE = '2026-12-15';
const MOON_DATE = '2026-12-24';
const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const app = (profile = sampleProfile(), date = DATE) => render(<PlannerApp {...pageProps} initialDate={date} initialProfile={profile} />);
const groupButton = () => screen.getByRole('button', { name: /^Solar system \(/ });
const rowOf = (name: string) => listRows('planet-list').find((r) => rowName(r) === name) as HTMLElement;
/** Opens the group (when closed) and then the row of `name`; returns that row's solar-system detail. */
async function openBody(user: ReturnType<typeof userEvent.setup>, name: string) {
  await ready();
  if (groupButton().getAttribute('aria-expanded') === 'false') await user.click(groupButton());
  await user.click(within(rowOf(name)).getByRole('button', { expanded: false }));
  return screen.getByTestId(`solar-detail-${name}`);
}
const ringOf = (detail: HTMLElement) => [...detail.querySelectorAll('dt')].find((d) => /Saturn ring tilt/.test(d.textContent ?? ''))?.nextElementSibling?.textContent ?? null;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Solar system rows', () => {
  it('the old section is gone; the group lists only the bodies that are up, and its rows are compact like the deep-sky rows', async () => {
    app();
    await ready();
    expect(screen.queryByRole('region', { name: 'PLANETS' })).toBeNull();
    expect(document.querySelector('input[name="planet"]')).toBeNull(); // the eight planet cards
    expect(groupButton().textContent).toMatch(/Solar system \(6\)/);
    await userEvent.setup().click(groupButton());
    const names = rowNames('planet-list');
    expect(names).toEqual(expect.arrayContaining(['Jupiter', 'Saturn', 'Mars', 'Moon']));
    expect(names).not.toContain('Mercury'); // below the horizon all night: not up, not listed
    expect(rowOf('Jupiter').textContent).toMatch(/Solar system\d\d:\d\d–\d\d:\d\d/);
    expect(within(rowOf('Jupiter')).getByRole('button', { name: 'Add Jupiter to the plan' })).toBeTruthy();
    expect(screen.queryByTestId('solar-detail-Jupiter')).toBeNull(); // closed until the row is opened
  });

  it('the row opens the list detail and the altitude chart once', async () => {
    const user = userEvent.setup();
    app();
    const detail = await openBody(user, 'Jupiter');
    expect(rowOf('Jupiter').textContent).toMatch(/Usable window/);
    expect(screen.getAllByRole('img', { name: /Altitude of Jupiter/ })).toHaveLength(1);
    expect(within(rowOf('Jupiter')).getByRole('checkbox', { name: 'Captured: Jupiter' })).toBeTruthy();
    expect(detail.textContent).toMatch(/Jupiter: Tue 15 Dec/);
    // One open row at a time: opening Saturn closes Jupiter.
    await user.click(within(rowOf('Saturn')).getByRole('button', { expanded: false }));
    expect(screen.queryByTestId('solar-detail-Jupiter')).toBeNull();
    expect(screen.getByTestId('solar-detail-Saturn')).toBeTruthy();
  });

  it('the opened body gives its figures as numbers, its labelled rows', async () => {
    const user = userEvent.setup();
    app(withTrain('planet-c11-676'));
    const detail = await openBody(user, 'Jupiter');
    const labels = [...detail.querySelectorAll('dt')].map((d) => d.textContent ?? '');
    expect(labels).toEqual([
      'Apparent diameter', 'Phase', 'Opposition', 'Culmination', 'Clear of your horizon', 'Clip length limit', 'Rotation smear', 'Clips per session', 'Cool-down',
      'Start exposure', 'Frame rate cap', 'ROI', 'Stack best', 'Colour spread by altitude', 'Spread at peak', 'Image scale and sampling', 'Other trains, arcsec/px',
    ]);
    const text = detail.textContent ?? '';
    expect(text).toMatch(/Apparent diameter\d+\.\d″, \d+ px on C11 \+ ASI676MC/);
    expect(text).toMatch(/Clip length limit\d+ s, suggested \d+ s \(period 9\.925 h\)/);
    expect(text).toMatch(/0\.15 arcsec\/px on C11 \+ ASI676MC \(solar system\): near the limit vs 0\.18\. Seeing 2″ assumed/);
    expect(screen.getByRole('img', { name: /Altitude of Jupiter/ }).parentElement!.querySelector('desc')!.textContent).toMatch(/^Jupiter: (peaks at \d+ degrees|never clears)/);
  });

  it('the opened body keeps the guide numbers as short labelled values: exposure, frame rate, ROI, session clips, dispersion, other trains', async () => {
    const user = userEvent.setup();
    app(withTrain('planet-c11-676'));
    const jupiter = await openBody(user, 'Jupiter');
    const value = (label: string) => [...jupiter.querySelectorAll('dt')].find((d) => d.textContent === label)?.nextElementSibling?.textContent;
    expect(value('Start exposure')).toBe('10 ms (assumed)');
    expect(value('Frame rate cap')).toBe('100/s at 10 ms');
    expect(value('ROI')).toBe('432 px square');
    expect(value('Clips per session')).toBe('20 of 58 s in 30 min, 30 s apart');
    expect(value('Rotation smear')).toBe('0.22″/min at the centre, resolution 0.42″');
    expect(value('Cool-down')).toBe('45 min');
    expect(value('Stack best')).toBe('25%');
    expect(value('Colour spread by altitude')).toBe('80° 0.15″, 70° 0.32″, 60° 0.50″, 45° 0.87″, 30° 1.50″');
    expect(value('Spread at peak')).toBe('0.32″ at 70°, resolution 0.42″');
    expect(value('Other trains, arcsec/px')).toBe('C11 + 2.5x Powermate + ASI676MC (solar system) 0.06 nominal');
    // A sourced exposure shows its gain and says sourced.
    const saturn = await openBody(user, 'Saturn');
    const sv = (label: string) => [...saturn.querySelectorAll('dt')].find((d) => d.textContent === label)?.nextElementSibling?.textContent;
    expect(sv('Start exposure')).toBe('64 ms, gain 104 (sourced)');
    expect(sv('Frame rate cap')).toBe('15/s at 64 ms');
    expect(sv('ROI')).toMatch(/^\d+ px square$/);
  });

  it('Saturn shows its ring tilt; other planets have no such row', async () => {
    const user = userEvent.setup();
    app();
    expect(ringOf(await openBody(user, 'Saturn'))).toMatch(/^\d+\.\d°$/);
    expect(ringOf(await openBody(user, 'Mars'))).toBeNull();
  });

  it('the Moon is in the group when it is up, has no clip limit, and gives its phase name and a mosaic', async () => {
    const user = userEvent.setup();
    app(sampleProfile(), MOON_DATE);
    const detail = await openBody(user, 'Moon');
    expect(rowOf('Moon').textContent).toContain('Solar system');
    const text = detail.textContent ?? '';
    expect(text).toMatch(/Clip length limitNone, 60 s clips/);
    expect(text).toMatch(/Start exposureNone/);
    expect(text).toMatch(/ROIFull frame/);
    expect(text).toMatch(/Clips per session\d+ of 60 s in 30 min/);
    expect(text).toMatch(/(New|Waxing crescent|First quarter|Waxing gibbous|Full|Waning gibbous|Last quarter|Waning crescent), \d+\.\d% lit/);
    expect(text).toMatch(/Mosaic \d × \d panels, 20% overlap/);
  });

  it('a smart scope has no scale or clip numbers and the row says why', async () => {
    const user = userEvent.setup();
    app(withTrain('smart-seestar-s50'));
    const detail = await openBody(user, 'Jupiter');
    expect(detail.textContent).toMatch(/Seestar S50: smart scope, no optics numbers\./);
  });
});
