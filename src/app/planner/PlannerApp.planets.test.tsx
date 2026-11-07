/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// The Planets section, driven with real key events on the whole page. The planetary train (C11 + ASI676MC) is the sample's first train.

const withTrain = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const app = (profile = sampleProfile()) => render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} />);
const section = () => screen.getByRole('region', { name: 'PLANETS' });
const radios = () => within(section()).getAllByRole('radio') as HTMLInputElement[];
const radio = (name: string) => radios().find((r) => r.value === name)!;
const panel = (name: string) => screen.getByTestId(`planet-panel-${name}`);

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('Planets section', () => {
  it('has a card for each of the eight bodies in the spec order, each labelled computed, exactly one selected', () => {
    app();
    expect(radios().map((r) => r.value)).toEqual(['Jupiter', 'Saturn', 'Mars', 'Venus', 'Mercury', 'Uranus', 'Neptune', 'Moon']);
    expect(radios().filter((r) => r.checked)).toHaveLength(1);
    expect(within(section()).getAllByText('all computed')).toHaveLength(8);
    const visibleSelected = within(section()).getAllByText('Selected').filter((n) => n.getAttribute('aria-hidden') !== 'true');
    expect(visibleSelected).toHaveLength(1);
    expect(section().textContent).toMatch(/Great Red Spot transits are not shown: there is no verified longitude model/);
  });

  it('opens on the first planet that is clear of the horizon tonight', () => {
    app();
    const first = radios().find((r) => /Clear of your horizon \d+ min/.test(r.closest('label')!.textContent ?? ''))!;
    expect(radios().find((r) => r.checked)).toBe(first);
  });

  it('arrow keys move the selection; the visible detail follows and the others are hidden from assistive tech', async () => {
    const user = userEvent.setup();
    app();
    radio('Jupiter').focus();
    await user.keyboard('{ArrowRight}');
    expect(radio('Saturn').checked).toBe(true);
    expect(panel('Saturn').getAttribute('aria-hidden')).toBeNull();
    expect(panel('Jupiter').getAttribute('aria-hidden')).toBe('true');
    expect(within(panel('Saturn')).getByText('Saturn: tonight')).toBeTruthy();
    // The hidden panels cannot be reached by role: only Saturn's chart is in the accessibility tree.
    const charts = screen.getAllByRole('img', { name: /Altitude of Saturn|Altitude of Jupiter/ });
    expect(charts.map((c) => c.querySelector('title')!.textContent)).toEqual(['Altitude of Saturn through the night']);
  });

  it('a click on a card chooses it', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(section()).getByText('Mars'));
    expect(radio('Mars').checked).toBe(true);
  });

  it('every figure of the selected planet is labelled computed (or names its basis), and the chart has a text description', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(section()).getByText('Jupiter'));
    const labels = [...panel('Jupiter').querySelectorAll('dt')].map((d) => d.textContent ?? '');
    expect(labels).toHaveLength(8);
    for (const l of labels) expect(l).toMatch(/, (computed|computed, period sourced|computed, seeing assumed)$/);
    const text = panel('Jupiter').textContent ?? '';
    expect(text).toMatch(/Apparent diameter, computed.*arcsec, about \d+ pixels across on C11 \+ ASI676MC/);
    expect(text).toMatch(/Clip length limit, computed, period sourced.*9\.925 h/);
    expect(text).toMatch(/Image scale and sampling, computed, seeing assumed.*0\.15 arcsec per pixel on C11 \+ ASI676MC \(planets\): near the limit against 0\.18\. Seeing assumed 2 arcsec \(assumption\)/);
    const desc = panel('Jupiter').querySelector('desc')!.textContent!;
    expect(desc).toMatch(/^Jupiter: (peaks at \d+ degrees|never clears)/);
    expect(text).toMatch(/Culmination, computed/);
  });

  it('Saturn shows its ring tilt, other planets say not applicable', async () => {
    const user = userEvent.setup();
    app();
    const ring = (name: string) => [...panel(name).querySelectorAll('dt')].find((d) => /Saturn ring tilt/.test(d.textContent ?? ''))!.nextElementSibling!.textContent!;
    expect(ring('Saturn')).toMatch(/^\d+\.\d° \(the size; the library does not say which face shows\)\.$/);
    expect(ring('Mars')).toMatch(/Not applicable: Saturn only/);
    await user.click(within(section()).getByText('Saturn'));
    expect(radio('Saturn').checked).toBe(true);
  });

  it('the Moon has no clip limit and gives its phase name and a mosaic', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(section()).getByText('Moon'));
    const text = panel('Moon').textContent ?? '';
    expect(text).toMatch(/None: the Moon does not rotate under the camera/);
    expect(text).toMatch(/(New|Waxing crescent|First quarter|Waxing gibbous|Full|Waning gibbous|Last quarter|Waning crescent), \d+\.\d% lit\. Terminator position: not available from the library/);
    expect(text).toMatch(/Mosaic at this field: about \d by \d panels \(computed\)/);
  });

  it('the checklist ticks with the Space key, stays ticked, and has a basis word on every line', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(section()).getByText('Jupiter'));
    const boxes = within(panel('Jupiter')).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.length).toBeGreaterThanOrEqual(18);
    boxes[0].focus();
    await user.keyboard(' ');
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    await user.keyboard('{Tab} ');
    expect(boxes[1].checked).toBe(true);
    // The tick belongs to Jupiter: Saturn's first box is still clear.
    await user.click(within(section()).getByText('Saturn'));
    expect((within(panel('Saturn')).getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(false);
    const items = [...panel('Jupiter').querySelectorAll('fieldset li')];
    expect(items.length).toBeGreaterThanOrEqual(18);
    for (const li of items) expect(li.textContent).toMatch(/(computed|sourced|assumption|practice|not verified)$/);
  });

  it('clip length and session length are separate lines, and ASIAIR is only ever "not verified"', async () => {
    const user = userEvent.setup();
    app();
    await user.click(within(section()).getByText('Jupiter'));
    const text = panel('Jupiter').textContent ?? '';
    expect(text).toMatch(/Clip length\. Up to \d+ s per clip for Jupiter/);
    expect(text).toMatch(/Session length \(not the clip length\)\. The session is the time at the telescope/);
    const asiair = [...panel('Jupiter').querySelectorAll('li')].filter((li) => /ASIAIR/.test(li.textContent ?? ''));
    expect(asiair).toHaveLength(1);
    expect(asiair[0].textContent).toMatch(/not verified/);
  });

  it('with the Powermate train selected, the scale is the nominal 0.06 and the guide offers the native train first', async () => {
    const user = userEvent.setup();
    app(withTrain('planet-c11-powermate-676'));
    await user.click(within(section()).getByText('Jupiter'));
    const text = panel('Jupiter').textContent ?? '';
    expect(text).toMatch(/0\.06 arcsec per pixel on C11 \+ 2\.5x Powermate \+ ASI676MC \(planets\): oversampled/);
    expect(text.indexOf('Start native')).toBeLessThan(text.indexOf('Add the extender only when seeing justifies it'));
    expect(text).toMatch(/no stated camera spacing/);
  });

  it('the guide names the camera of the train in use (ASI533MC, not ASI676MC) and qualifies the exposure line per planet', async () => {
    const user = userEvent.setup();
    app(withTrain('deep-c11-reducer-533'));
    await user.click(within(section()).getByText('Saturn'));
    const text = panel('Saturn').textContent ?? '';
    expect(text).toMatch(/The ZWO ASI533MC is a colour camera/);
    expect(text).toMatch(/What the ZWO ASI533MC delivers at your ROI/);
    expect(text).not.toMatch(/ASI676MC/);
    expect(text).toMatch(/Saturn is fainter than Jupiter in the source's own table/);
    expect(text).toMatch(/64 ms at gain 104 for Saturn/);
    expect(text).not.toMatch(/Start near 10 ms/);
    await user.click(within(section()).getByText('Moon'));
    expect(panel('Moon').textContent).toMatch(/No starting exposure is given for Moon/);
  });

  it('a smart scope has no scale or clip numbers and the section says why', async () => {
    const user = userEvent.setup();
    app(withTrain('smart-seestar-s50'));
    await user.click(within(section()).getByText('Jupiter'));
    expect(panel('Jupiter').textContent).toMatch(/Seestar S50 is a smart scope with fixed optics/);
    expect(within(panel('Jupiter')).queryAllByRole('checkbox')).toHaveLength(0);
  });
});
