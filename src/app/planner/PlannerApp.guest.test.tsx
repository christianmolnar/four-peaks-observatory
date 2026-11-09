/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, waitFor, within, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// A fresh visitor: no stored data, no props. The page loads the sample, edits go to localStorage, reload keeps them.

const stored = () => JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string);
const app = () => render(<PlannerApp initialDate="2026-12-15" />);
const nightSummary = () => screen.getByTestId('night-summary').textContent as string;

let blobs: Blob[] = [];
beforeEach(() => {
  window.localStorage.clear();
  blobs = [];
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => (blobs.push(b), 'blob:test');
  (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
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
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

/** Opens a disclosure by its summary text. */
async function open(u: ReturnType<typeof userEvent.setup>, name: RegExp) {
  const summary = screen.getByText(name, { selector: 'summary' });
  const details = summary.closest('details') as HTMLElement;
  if (!(details as HTMLDetailsElement).open) await u.click(summary);
  return details;
}

describe('guest start', () => {
  it('opens with a full plan from the sample and the guest intro', async () => {
    app();
    await waitFor(() => expect(screen.getByTestId('target-table')).toBeTruthy());
    const intro = document.querySelector('header p')?.textContent ?? '';
    expect(intro).toMatch(/free guest tool/i);
    expect(intro).toMatch(/estimates/i);
    expect(intro).toMatch(/stay in this browser/i);
    expect(screen.getByLabelText('Site').textContent).toContain('Fountain Hills');
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull(); // nothing written until the visitor edits
  });
});

describe('editing site and gear', () => {
  it('a new latitude changes the plan, is stored, and survives a reload', async () => {
    const u = userEvent.setup();
    const first = app();
    const before = nightSummary();
    const siteBox = await open(u, /^Site \(1\)/);
    const lat = within(siteBox).getByLabelText('Latitude (deg, north is positive)');
    await u.clear(lat);
    await u.type(lat, '-33.9');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    expect(stored().sites[0].latitude).toBe(-33.9);
    await waitFor(() => expect(nightSummary()).not.toBe(before));
    first.unmount();
    app();
    await waitFor(() => expect(nightSummary()).not.toBe(before));
    expect(stored().sites[0].latitude).toBe(-33.9);
  });

  it('a site time zone changes the times shown and the zone sentence', async () => {
    const u = userEvent.setup();
    app();
    const before = nightSummary();
    expect(before).toMatch(/site's time zone \(America\/Phoenix\)/);
    const siteBox = await open(u, /^Site \(1\)/);
    const tz = within(siteBox).getByLabelText(/^Time zone/);
    await u.clear(tz);
    await u.type(tz, 'Europe/Berlin');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(nightSummary()).toMatch(/Europe\/Berlin/));
    expect(nightSummary().match(/Astronomical night [\d:]+ to [\d:]+/)?.[0]).not.toBe(before.match(/Astronomical night [\d:]+ to [\d:]+/)?.[0]);
  });

  it('a bad value is refused with the reason and nothing is stored', async () => {
    const u = userEvent.setup();
    app();
    const siteBox = await open(u, /^Site \(1\)/);
    const lat = within(siteBox).getByLabelText('Latitude (deg, north is positive)');
    await u.clear(lat);
    await u.type(lat, '95');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    expect(within(siteBox).getByRole('alert').textContent).toMatch(/Latitude: expected a number from -90 to 90/);
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    await u.clear(within(siteBox).getByLabelText(/^Time zone/));
    await u.type(within(siteBox).getByLabelText(/^Time zone/), 'Mars/Base');
    await u.clear(lat);
    await u.type(lat, '33');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    expect(within(siteBox).getByRole('alert').textContent).toMatch(/Time zone: not a time zone name/);
  });

  it('renaming a train is stored and shows in the Train box', async () => {
    const u = userEvent.setup();
    app();
    const trainsBox = await open(u, /^Trains \(/);
    fireEvent.change(within(trainsBox).getAllByLabelText('Name')[0], { target: { value: 'My own train' } });
    await u.click(within(trainsBox).getAllByRole('button', { name: 'Save' })[0]);
    expect(stored().trains[0].name).toBe('My own train');
    expect(within(screen.getByLabelText('Train')).getByRole('option', { name: 'My own train' })).toBeTruthy();
  });

  it('editing a scope is stored', async () => {
    const u = userEvent.setup();
    app();
    const scopesBox = await open(u, /^Scopes \(/);
    fireEvent.change(within(scopesBox).getByLabelText('Focal length (mm)'), { target: { value: '2000' } });
    await u.click(within(scopesBox).getByRole('button', { name: 'Save' }));
    expect(stored().equipment.scopes[0].focalLengthMm).toBe(2000);
  });

  it('adds a filter, and refuses to remove a camera a train uses', async () => {
    const u = userEvent.setup();
    app();
    const filters = await open(u, /^Filters \(/);
    const n = within(filters).getAllByRole('button', { name: 'Save' }).length;
    await u.click(within(filters).getByRole('button', { name: 'Add filter' }));
    expect(within(filters).getAllByRole('button', { name: 'Save' })).toHaveLength(n + 1);
    expect(stored().equipment.filters).toHaveLength(n + 1);

    const cameras = await open(u, /^Cameras \(/);
    await u.click(within(cameras).getAllByRole('button', { name: 'Remove' })[0]);
    expect(within(cameras).getByRole('alert').textContent).toMatch(/Cannot remove it: .* still uses it/);
  });

  it('a changed horizon is stored and survives a reload', async () => {
    const u = userEvent.setup();
    const first = app();
    const h = await screen.findByRole('spinbutton', { name: /^Height/ });
    await u.clear(h);
    await u.type(h, '55');
    await u.click(screen.getByRole('button', { name: 'Save horizon' }));
    expect(stored().sites[0].blockedArc.heightDeg).toBe(55);
    first.unmount();
    app();
    await waitFor(() => expect(screen.getByTestId('horizon-summary').textContent).toMatch(/55° high/));
  });

  it('Replace profile with sample restores the sample', async () => {
    const u = userEvent.setup();
    app();
    const siteBox = await open(u, /^Site \(1\)/);
    const name = within(siteBox).getByLabelText('Name');
    await u.clear(name);
    await u.type(name, 'Backyard');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    expect(screen.getByLabelText('Site').textContent).toContain('Backyard');
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await u.click(screen.getByRole('button', { name: 'Replace profile with sample' }));
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(screen.getByLabelText('Site').textContent).toContain('Fountain Hills');
  });
});

describe('profile JSON', () => {
  const file = (text: string) => new File([text], 'p.json', { type: 'application/json' });

  it('export then import gives an identical profile', async () => {
    const u = userEvent.setup();
    app();
    const siteBox = await open(u, /^Site \(1\)/);
    const elev = within(siteBox).getByLabelText('Elevation (m)');
    await u.type(elev, '550');
    await u.click(within(siteBox).getByRole('button', { name: 'Save' }));
    const edited = stored();
    await u.click(screen.getByRole('button', { name: 'Export profile (JSON)' }));
    const text = await blobs[blobs.length - 1].text();
    expect(JSON.parse(text)).toEqual(edited);
    // Start over, then bring the file back.
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await u.click(screen.getByRole('button', { name: 'Replace profile with sample' }));
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    await u.upload(screen.getByLabelText('Import profile (JSON)'), file(text));
    await waitFor(() => expect(window.localStorage.getItem(PROFILE_KEY)).not.toBeNull());
    expect(stored()).toEqual(edited);
  });

  it.each([
    ['malformed JSON', '{"version": 2,', /not a planner profile.*not valid JSON/i],
    ['a wrong version', JSON.stringify({ ...sampleProfile(), version: 9 }), /version 9; this planner reads version 2/],
    ['an array', '[1,2]', /not a planner profile/i],
    ['an invalid field', JSON.stringify({ ...sampleProfile(), sites: [{ ...sampleProfile().sites[0], latitude: 123 }] }), /sites\[0\]\.latitude/],
  ])('rejects %s with a readable message and changes nothing', async (_n, text, message) => {
    const u = userEvent.setup();
    app();
    await u.upload(screen.getByLabelText('Import profile (JSON)'), file(text as string));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(message as RegExp);
    expect(alert.textContent).toMatch(/nothing was changed/);
    expect(alert.textContent).not.toMatch(/undefined|\[object|    at /);
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    expect(screen.getByTestId('target-table')).toBeTruthy(); // still alive
  });
});

describe('print', () => {
  it('has no print sheet on screen; it is built when the browser prints and removed after', async () => {
    app();
    expect(screen.queryByTestId('print-sheet')).toBeNull();
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    const sheet = screen.getByTestId('print-sheet');
    expect(sheet.textContent).toMatch(/Imaging plan for the evening of 2026-12-15/);
    expect(sheet.textContent).toMatch(/Fountain Hills, AZ/);
    expect(sheet.textContent).toMatch(/Planner estimates, not measurements/);
    expect(within(sheet).getAllByRole('row').length).toBeGreaterThan(5);
    act(() => void window.dispatchEvent(new Event('afterprint')));
    expect(screen.queryByTestId('print-sheet')).toBeNull();
  });

  it('the print sheet lists exactly the rows of the Targets table, in order', () => {
    app();
    const names = (root: HTMLElement) => within(root).getAllByRole('row').map((r) => r.querySelector('th[scope="row"] strong, th[scope="row"] button')?.textContent).filter(Boolean);
    const screenNames = names(screen.getByTestId('target-table'));
    act(() => void window.dispatchEvent(new Event('beforeprint')));
    expect(names(screen.getByTestId('print-sheet'))).toEqual(screenNames);
  });

  it('the Print button calls the browser print', async () => {
    const print = jest.fn();
    window.print = print;
    app();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Print or save as PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('CSV', () => {
  it('writes the rows on screen, with the site zone, one line per row plus the header', async () => {
    app();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Export CSV' }));
    const text = (await blobs[blobs.length - 1].text()).replace(/^\uFEFF/, '');
    const lines = text.trim().split('\r\n');
    const rowCount = within(screen.getByTestId('target-table')).getAllByRole('row').filter((r) => r.querySelector('th[scope="row"]')).length;
    expect(lines).toHaveLength(rowCount + 1);
    expect(text).toMatch(/2026-12-1[45] \d\d:\d\d MST/);
  });
});

