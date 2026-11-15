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
const groupButton = () => screen.getByRole('button', { name: /^Solar system up/ });
const rowOf = (name: string) => listRows('planet-list').find((r) => rowName(r) === name) as HTMLElement;
/** Opens the group (when closed) and then the row of `name`; returns that row's solar-system detail. */
async function openBody(user: ReturnType<typeof userEvent.setup>, name: string) {
  await ready();
  if (groupButton().getAttribute('aria-expanded') === 'false') await user.click(groupButton());
  await user.click(within(rowOf(name)).getByRole('button', { expanded: false }));
  return screen.getByTestId(`solar-detail-${name}`);
}
/** The checklist sits behind its own closed fold in the detail: opens it. */
async function openList(user: ReturnType<typeof userEvent.setup>, detail: HTMLElement) {
  await user.click(within(detail).getByRole('button', { name: /^Lucky-imaging checklist/, expanded: false }));
  return detail;
}
const ringOf = (detail: HTMLElement) => [...detail.querySelectorAll('dt')].find((d) => /Saturn ring tilt/.test(d.textContent ?? ''))!.nextElementSibling!.textContent!;

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
    expect(groupButton().textContent).toMatch(/Solar system up Tue 15 Dec \(6\)/);
    await userEvent.setup().click(groupButton());
    const names = rowNames('planet-list');
    expect(names).toEqual(expect.arrayContaining(['Jupiter', 'Saturn', 'Mars', 'Moon']));
    expect(names).not.toContain('Mercury'); // below the horizon all night: not up, not listed
    expect(rowOf('Jupiter').textContent).toMatch(/Solar system.*Up /);
    expect(within(rowOf('Jupiter')).getByRole('button', { name: 'Add Jupiter to the plan' })).toBeTruthy();
    expect(screen.queryByTestId('solar-detail-Jupiter')).toBeNull(); // closed until the row is opened
  });

  it('the row opens the list detail, the altitude chart once, and the intro with the Great Red Spot note', async () => {
    const user = userEvent.setup();
    app();
    const detail = await openBody(user, 'Jupiter');
    expect(rowOf('Jupiter').textContent).toMatch(/Usable window/);
    expect(screen.getAllByRole('img', { name: /Altitude of Jupiter/ })).toHaveLength(1);
    expect(within(rowOf('Jupiter')).getByRole('checkbox', { name: 'Captured: Jupiter' })).toBeTruthy();
    expect(detail.textContent).toMatch(/Great Red Spot transits are not shown: there is no verified longitude model/);
    expect(detail.textContent).toMatch(/Jupiter: Tue 15 Dec/);
    // One open row at a time: opening Saturn closes Jupiter.
    await user.click(within(rowOf('Saturn')).getByRole('button', { expanded: false }));
    expect(screen.queryByTestId('solar-detail-Jupiter')).toBeNull();
    expect(screen.getByTestId('solar-detail-Saturn')).toBeTruthy();
  });

  it('every figure of the opened body is labelled computed (or names its basis)', async () => {
    const user = userEvent.setup();
    app(withTrain('planet-c11-676'));
    const detail = await openBody(user, 'Jupiter');
    const labels = [...detail.querySelectorAll('dt')].map((d) => d.textContent ?? '');
    expect(labels).toHaveLength(8);
    for (const l of labels) expect(l).toMatch(/, (computed|computed, period sourced|computed, seeing assumed)$/);
    const text = detail.textContent ?? '';
    expect(text).toMatch(/Apparent diameter, computed.*arcsec, about \d+ pixels across on C11 \+ ASI676MC/);
    expect(text).toMatch(/Clip length limit, computed, period sourced.*9\.925 h/);
    expect(text).toMatch(/Image scale and sampling, computed, seeing assumed.*0\.15 arcsec per pixel on C11 \+ ASI676MC \(solar system\): near the limit against 0\.18\. Seeing assumed 2 arcsec \(assumption\)/);
    expect(text).toMatch(/Culmination, computed/);
    expect(text).toMatch(/Phase, computed/);
    expect(text).toMatch(/Clear of your horizon, computed/);
    expect(screen.getByRole('img', { name: /Altitude of Jupiter/ }).parentElement!.querySelector('desc')!.textContent).toMatch(/^Jupiter: (peaks at \d+ degrees|never clears)/);
  });

  it('Saturn shows its ring tilt, other planets say not applicable', async () => {
    const user = userEvent.setup();
    app();
    expect(ringOf(await openBody(user, 'Saturn'))).toMatch(/^\d+\.\d° \(the size; the library does not say which face shows\)\.$/);
    expect(ringOf(await openBody(user, 'Mars'))).toMatch(/Not applicable: Saturn only/);
  });

  it('the Moon is in the group when it is up, has no clip limit, and gives its phase name and a mosaic', async () => {
    const user = userEvent.setup();
    app(sampleProfile(), MOON_DATE);
    const detail = await openBody(user, 'Moon');
    expect(rowOf('Moon').textContent).toContain('Solar system');
    const text = detail.textContent ?? '';
    expect(text).toMatch(/None: the Moon does not rotate under the camera/);
    expect(text).toMatch(/(New|Waxing crescent|First quarter|Waxing gibbous|Full|Waning gibbous|Last quarter|Waning crescent), \d+\.\d% lit\. Terminator position: not available from the library/);
    expect(text).toMatch(/Mosaic at this field: about \d by \d panels \(computed\)/);
  });

  it('the checklist ticks with the Space key, stays ticked when the row is closed and opened again, and has a basis word on every line', async () => {
    const user = userEvent.setup();
    app();
    const detail = await openList(user, await openBody(user, 'Jupiter'));
    const boxes = within(detail).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(18);
    boxes[0].focus();
    await user.keyboard(' ');
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    await user.keyboard('{Tab} ');
    expect(boxes[1].checked).toBe(true);
    const items = [...detail.querySelectorAll('fieldset li')];
    expect(items.length).toBeGreaterThanOrEqual(18);
    for (const li of items) expect(li.textContent).toMatch(/(computed|sourced|assumption|practice|not verified)$/);
    // The tick belongs to Jupiter: Saturn's first box is clear; Jupiter's are still ticked after Saturn and back.
    await user.click(within(rowOf('Saturn')).getByRole('button', { expanded: false }));
    await openList(user, screen.getByTestId('solar-detail-Saturn'));
    expect((within(screen.getByTestId('solar-detail-Saturn')).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
    await user.click(within(rowOf('Jupiter')).getByRole('button', { expanded: false }));
    await openList(user, screen.getByTestId('solar-detail-Jupiter'));
    const again = within(screen.getByTestId('solar-detail-Jupiter')).getAllByRole('checkbox') as HTMLInputElement[];
    expect([again[0].checked, again[1].checked, again[2].checked]).toEqual([true, true, false]);
  });

  it('clip length and session length are separate lines, and ASIAIR is only ever "not verified"', async () => {
    const user = userEvent.setup();
    app();
    const detail = await openList(user, await openBody(user, 'Jupiter'));
    const text = detail.textContent ?? '';
    expect(text).toMatch(/Clip length\. Up to \d+ s per clip for Jupiter/);
    expect(text).toMatch(/Session length \(not the clip length\)\. The session is the time at the telescope/);
    const asiair = [...detail.querySelectorAll('li')].filter((li) => /ASIAIR/.test(li.textContent ?? ''));
    expect(asiair).toHaveLength(1);
    expect(asiair[0].textContent).toMatch(/not verified/);
  });

  it('with the Powermate train selected, the scale is the nominal 0.06 and the guide offers the native train first', async () => {
    const user = userEvent.setup();
    app(withTrain('planet-c11-powermate-676'));
    const text = (await openList(user, await openBody(user, 'Jupiter'))).textContent ?? '';
    expect(text).toMatch(/0\.06 arcsec per pixel on C11 \+ 2\.5x Powermate \+ ASI676MC \(solar system\): oversampled/);
    expect(text.indexOf('Start native')).toBeLessThan(text.indexOf('Add the extender only when seeing justifies it'));
    expect(text).toMatch(/no stated camera spacing/);
  });

  it('the guide names the camera of the train in use (ASI533MC, not ASI676MC) and qualifies the exposure line per planet', async () => {
    const user = userEvent.setup();
    app(withTrain('deep-c11-reducer-533'));
    const text = (await openList(user, await openBody(user, 'Saturn'))).textContent ?? '';
    expect(text).toMatch(/The ZWO ASI533MC is a colour camera/);
    expect(text).toMatch(/What the ZWO ASI533MC delivers at your ROI/);
    expect(text).not.toMatch(/ASI676MC/);
    expect(text).toMatch(/Saturn is fainter than Jupiter in the source's own table/);
    expect(text).toMatch(/64 ms at gain 104 for Saturn/);
    expect(text).not.toMatch(/Start near 10 ms/);
  });

  it('a smart scope has no scale or clip numbers and the row says why', async () => {
    const user = userEvent.setup();
    app(withTrain('smart-seestar-s50'));
    const detail = await openBody(user, 'Jupiter');
    expect(detail.textContent).toMatch(/Seestar S50 is a smart scope with fixed optics/);
    expect(within(detail).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
