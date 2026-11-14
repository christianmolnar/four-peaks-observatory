/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import ProfileEditor from './ProfileEditor';

const PHOENIX = { name: 'Phoenix', admin: 'Arizona', country: 'United States', latitude: 33.44838, longitude: -112.07404, elevationM: 331, timeZone: 'America/Phoenix', source: 'open-meteo' };
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(cleanup);

/** The editor with the Site list open and the first site's form in view. */
function open() {
  const onChange = jest.fn();
  render(<ProfileEditor profile={sampleProfile()} onChange={onChange} />);
  fireEvent.click(screen.getByText(/^Site \(\d+\)/));
  const details = screen.getByText(/^Site \(\d+\)/).closest('details') as HTMLDetailsElement;
  fireEvent(details, new Event('toggle'));
  return { onChange, form: () => within(details) };
}
const box = (label: RegExp) => screen.getByRole('textbox', { name: label }) as HTMLTextAreaElement | HTMLInputElement;

describe('Find my site', () => {
  it('nothing is sent while typing; Find sends one request, and Use fills the four boxes and the credit shows', async () => {
    const u = userEvent.setup();
    open();
    fetchMock.mockResolvedValue(reply({ candidates: [PHOENIX] }));
    await u.type(box(/Find my site/), 'Phoenix, AZ');
    expect(fetchMock).not.toHaveBeenCalled();
    await u.click(screen.getByRole('button', { name: 'Find' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/planner/geocode?q=Phoenix%2C%20AZ');
    await u.click(await screen.findByRole('button', { name: /^Use Phoenix, Arizona, United States/ }));
    expect(box(/^Latitude/).value).toBe('33.4484');
    expect(box(/^Longitude/).value).toBe('-112.074');
    expect(box(/^Elevation/).value).toBe('331');
    expect(box(/^Time zone/).value).toBe('America/Phoenix');
    expect(screen.getByText(/Open-Meteo\.com \(CC BY 4\.0\)/)).toBeTruthy();
    expect(screen.queryByText(/OpenStreetMap contributors/)).toBeNull();
  });

  it('Enter in the search box searches (it does not Save the site)', async () => {
    const u = userEvent.setup();
    const { onChange } = open();
    fetchMock.mockResolvedValue(reply({ candidates: [PHOENIX] }));
    await u.type(box(/Find my site/), '85001{Enter}');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a result from Nominatim shows the OpenStreetMap credit', async () => {
    const u = userEvent.setup();
    open();
    fetchMock.mockResolvedValue(reply({ candidates: [{ ...PHOENIX, source: 'nominatim' }] }));
    await u.type(box(/Find my site/), 'Phoenix Arizona');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText(/OpenStreetMap contributors/)).toBeTruthy();
  });

  it('edit-never-overwritten: a box you typed in survives a later lookup, and the message says so', async () => {
    const u = userEvent.setup();
    open();
    const elevation = box(/^Elevation/);
    await u.clear(elevation);
    await u.type(elevation, '1500');
    fetchMock.mockResolvedValue(reply({ candidates: [PHOENIX] }));
    await u.type(box(/Find my site/), 'Phoenix');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    await u.click(await screen.findByRole('button', { name: /^Use Phoenix/ }));
    expect(box(/^Elevation/).value).toBe('1500');
    expect(box(/^Latitude/).value).toBe('33.4484');
    expect(screen.getByText(/Kept your own entries for: Elevation/)).toBeTruthy();
    // And again: a second lookup replaces what the first lookup filled, but still not the typed box.
    fetchMock.mockResolvedValue(reply({ candidates: [{ ...PHOENIX, latitude: 40, longitude: -75, timeZone: 'America/New_York', elevationM: 10 }] }));
    await u.click(screen.getByRole('button', { name: 'Find' }));
    await u.click(await screen.findByRole('button', { name: /^Use Phoenix/ }));
    expect(box(/^Latitude/).value).toBe('40');
    expect(box(/^Time zone/).value).toBe('America/New_York');
    expect(box(/^Elevation/).value).toBe('1500');
  });

  it('hand-entered coordinates: the time zone comes from the coordinates and elevation from the route', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '35.6762');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '139.6503');
    fetchMock.mockResolvedValue(reply({ elevationM: 40 }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await waitFor(() => expect(box(/^Time zone/).value).toBe('Asia/Tokyo'));
    expect(box(/^Elevation/).value).toBe('40');
    expect(box(/^Latitude/).value).toBe('35.6762');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/planner/elevation?lat=35.6762&lon=139.6503');
  });

  it('elevation service down: the zone is still filled, the elevation box stays as it was, no crash', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    await u.type(box(/^Latitude/), '{Control>}a{/Control}35.6762');
    await u.type(box(/^Longitude/), '{Control>}a{/Control}139.6503');
    // Elevation was typed in above only to be cleared; clear it so "stays as it was" means empty.
    fetchMock.mockResolvedValue(reply({ error: 'Elevation is not available right now. Enter it by hand or try again later.' }, 502));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await waitFor(() => expect(box(/^Time zone/).value).toBe('Asia/Tokyo'));
    expect(box(/^Elevation/).value).toBe('');
    expect(screen.getByText(/Elevation was not filled in: Elevation is not available/)).toBeTruthy();
  });

  it('a refused search (cap, outage) shows the message in an alert and changes nothing', async () => {
    const u = userEvent.setup();
    open();
    const lat = box(/^Latitude/).value;
    fetchMock.mockResolvedValue(reply({ error: 'Hourly place-search limit reached (30 per hour), try again later' }, 429));
    await u.type(box(/Find my site/), 'Phoenix');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Hourly place-search limit/);
    expect(box(/^Latitude/).value).toBe(lat);
  });

  it('nothing found says so', async () => {
    const u = userEvent.setup();
    open();
    fetchMock.mockResolvedValue(reply({ candidates: [] }));
    await u.type(box(/Find my site/), 'Zzzzqx');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    expect(await screen.findByText(/Nothing found/)).toBeTruthy();
  });

  it('Bortle stays the editable box, with a note that it is not looked up', () => {
    open();
    expect(screen.getByText(/Bortle class\) is not looked up/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Sky darkness, Bortle class/ })).toBeTruthy();
  });
});
