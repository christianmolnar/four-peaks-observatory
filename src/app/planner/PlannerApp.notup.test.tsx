/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { listRows, pageProps, ready } from './testkit';

// Bodies that are not up keep their detail. The real engine on 2026-11-14 at the sample site (Fountain Hills), minimum altitude 20:
// Mars, Jupiter, Saturn, Uranus and Neptune are up; Venus (a 50 arcsec crescent, peak 10 degrees before dawn), Mercury and the Moon are down.
// On 2026-11-20 the Moon is up (and Venus still down).

jest.setTimeout(60000);

const DOWN_DATE = '2026-11-14';
const MOON_UP_DATE = '2026-11-20';
const app = (date = DOWN_DATE, profile = sampleProfile()) => render(<PlannerApp {...pageProps} initialDate={date} initialProfile={profile} />);
const groupButton = () => screen.getByRole('button', { name: /^Solar system \(/ });
const notUpButton = () => screen.getByRole('button', { name: /^Not up/ });
const nameOf = (li: HTMLElement) => (li.querySelector('button[aria-expanded]')!.textContent as string).replace(/^[▸▾]\s*(\d+\.\s*)?/, '').trim();
const notUpRow = (name: string) => listRows('notup-list').find((r) => nameOf(r) === name) as HTMLElement;
async function openNotUp(user: ReturnType<typeof userEvent.setup>) {
  await ready();
  if (groupButton().getAttribute('aria-expanded') === 'false') await user.click(groupButton());
  if (notUpButton().getAttribute('aria-expanded') === 'false') await user.click(notUpButton());
}

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('solar-system bodies that are not up', () => {
  it('Venus, Mercury and the Moon are listed under "Not up", unranked and not counted as up', async () => {
    const user = userEvent.setup();
    app();
    await openNotUp(user);
    expect(groupButton().textContent).toMatch(/\(5\)/); // only the five that are up
    expect(notUpButton().textContent).toMatch(/Not up .*\(3\)/);
    expect(listRows('notup-list').map(nameOf).sort()).toEqual(['Mercury', 'Moon', 'Venus']);
    const venus = notUpRow('Venus');
    expect(venus.textContent).toMatch(/Not clear /);
    expect(venus.textContent).not.toMatch(/Score|\d\.\s*Venus/); // no score, no rank number
    expect(venus.textContent).toMatch(/\d+\.\d″ across/); // the apparent diameter in the fit column
    expect(venus.textContent?.match(/Solar system/g)).toHaveLength(1); // once per row, in the meta line
    expect(listRows('planet-list').map(nameOf)).not.toContain('Venus');
  });

  it('a down Venus opens its full detail: size, phase, elongation, clip limit, scale', async () => {
    const user = userEvent.setup();
    app();
    await openNotUp(user);
    await user.click(within(notUpRow('Venus')).getByRole('button', { expanded: false }));
    const detail = screen.getByTestId('solar-detail-Venus');
    const text = detail.textContent ?? '';
    expect(text).toMatch(/Apparent diameter\d+\.\d″/);
    expect(text).toMatch(/% lit/); // phase
    expect(text).toMatch(/Elongation\d+\.\d° /); // elongation and its event
    expect(text).toMatch(/Clip length limit/);
    expect(text).toMatch(/Image scale and sampling/);
    expect(text).toMatch(/Clear of your horizon\d+ min/);
    expect(screen.getAllByRole('img', { name: /Altitude of Venus/ })).toHaveLength(1);
  });

  it('a down Moon opens its detail (phase name, no clip limit)', async () => {
    const user = userEvent.setup();
    app();
    await openNotUp(user);
    await user.click(within(notUpRow('Moon')).getByRole('button', { expanded: false }));
    const text = screen.getByTestId('solar-detail-Moon').textContent ?? '';
    expect(text).toMatch(/Clip length limitNone/);
    expect(text).toMatch(/\d+\.\d% lit/);
  });

  it('the Moon is in the ranked group, not under Not up, on a night it is up', async () => {
    const user = userEvent.setup();
    app(MOON_UP_DATE);
    await openNotUp(user);
    expect(listRows('planet-list').map(nameOf)).toContain('Moon');
    expect(listRows('notup-list').map(nameOf)).not.toContain('Moon');
    expect(listRows('notup-list').map(nameOf)).toContain('Venus');
  });

  it('the search row for a down body opens the same detail', async () => {
    const user = userEvent.setup();
    app();
    await ready();
    await user.type(screen.getByLabelText('Search the catalog by name or number'), 'Venus');
    const item = within(screen.getByRole('list', { name: 'Search results' })).getAllByRole('listitem')[0];
    expect(item.textContent).toMatch(/Not up/);
    await user.click(within(item).getByRole('button', { name: 'Show Venus detail' }));
    expect(within(item).getByTestId('solar-detail-Venus').textContent).toMatch(/Clip length limit/);
    await user.click(within(item).getByRole('button', { name: 'Hide Venus detail' }));
    expect(screen.queryByTestId('solar-detail-Venus')).toBeNull();
  });

});

describe('the Solar system group open rule', () => {
  it('Type = Solar system opens the group for that view only; All restores the rule; a hand-made choice sticks', async () => {
    const user = userEvent.setup();
    app();
    await ready();
    expect(groupButton().getAttribute('aria-expanded')).toBe('false'); // deep-sky train
    await user.selectOptions(screen.getByLabelText('Type'), 'solar-system');
    expect(groupButton().getAttribute('aria-expanded')).toBe('true');
    await user.selectOptions(screen.getByLabelText('Type'), 'all');
    expect(groupButton().getAttribute('aria-expanded')).toBe('false');
    // Opened by hand: it stays open through the filter.
    await user.click(groupButton());
    await user.selectOptions(screen.getByLabelText('Type'), 'solar-system');
    await user.selectOptions(screen.getByLabelText('Type'), 'all');
    expect(groupButton().getAttribute('aria-expanded')).toBe('true');
  });

  it('a deep-sky type shows neither the group nor the Not up rows', async () => {
    const user = userEvent.setup();
    app();
    await ready();
    await user.selectOptions(screen.getByLabelText('Type'), 'galaxies');
    expect(screen.queryByRole('button', { name: /^Solar system \(/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Not up/ })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Type'), 'all');
    await user.click(groupButton());
    expect(notUpButton()).toBeTruthy();
  });
});
