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
  it('nothing is sent while typing; Find sends one request; Use fills empty boxes and the credit shows', async () => {
    const u = userEvent.setup();
    open();
    for (const l of [/^Latitude/, /^Longitude/, /^Elevation/, /^Time zone/]) await u.clear(box(l));
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

  it('the box says a city or ZIP is enough and not to enter a street address', () => {
    open();
    expect(screen.getByText(/A city or ZIP is enough; don't enter a street address\./)).toBeTruthy();
    expect(box(/Find my site/).getAttribute('aria-describedby')).toBe('site-find-hint');
  });

  it('after Use, focus is on the status message, not lost to the page body', async () => {
    const u = userEvent.setup();
    open();
    fetchMock.mockResolvedValue(reply({ candidates: [PHOENIX] }));
    await u.type(box(/Find my site/), 'Phoenix');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    await u.click(await screen.findByRole('button', { name: /^Use Phoenix/ }));
    const status = screen.getByText(/^Filled in Phoenix/);
    expect(status.getAttribute('aria-live')).toBe('polite');
    await waitFor(() => expect(document.activeElement).toBe(status));
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

  it('a saved value is never silently replaced: Use keeps it, lists what Replace would change, and Replace names what it replaced', async () => {
    const u = userEvent.setup();
    open();
    const saved = { lat: box(/^Latitude/).value, lon: box(/^Longitude/).value, elev: box(/^Elevation/).value, zone: box(/^Time zone/).value };
    expect(saved.lat).not.toBe('');
    await u.clear(box(/^Elevation/));
    fetchMock.mockResolvedValue(reply({ candidates: [PHOENIX] }));
    await u.type(box(/Find my site/), 'Phoenix');
    await u.click(screen.getByRole('button', { name: 'Find' }));
    expect((await screen.findByText(/^Would change: Latitude/)).textContent).toContain(`Latitude ${saved.lat} to 33.4484`);
    await u.click(screen.getByRole('button', { name: /^Use Phoenix/ }));
    expect(box(/^Latitude/).value).toBe(saved.lat);
    expect(box(/^Longitude/).value).toBe(saved.lon);
    expect(box(/^Elevation/).value).toBe('331');
    expect(screen.getByText(/Kept your own entries for: Latitude, Longitude/)).toBeTruthy();
    // Look again: Replace is the explicit way to overwrite the saved coordinates.
    await u.click(screen.getByRole('button', { name: 'Find' }));
    await u.click(await screen.findByRole('button', { name: /^Replace saved values with Phoenix/ }));
    expect(box(/^Latitude/).value).toBe('33.4484');
    expect(box(/^Longitude/).value).toBe('-112.074');
    expect(screen.getByText(new RegExp(`Replaced: Latitude ${saved.lat.replace('.', '\\.')} to 33\\.4484`))).toBeTruthy();
  });

  it('a box you typed in survives a later Use; a box an earlier lookup filled is replaced by the next Use', async () => {
    const u = userEvent.setup();
    open();
    for (const l of [/^Latitude/, /^Longitude/, /^Time zone/]) await u.clear(box(l));
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
    fetchMock.mockResolvedValue(reply({ candidates: [{ ...PHOENIX, latitude: 40, longitude: -75, timeZone: 'America/New_York', elevationM: 10 }] }));
    await u.click(screen.getByRole('button', { name: 'Find' }));
    await u.click(await screen.findByRole('button', { name: /^Use Phoenix/ }));
    expect(box(/^Latitude/).value).toBe('40');
    expect(box(/^Time zone/).value).toBe('America/New_York');
    expect(box(/^Elevation/).value).toBe('1500');
  });

  it('hand-entered coordinates: the zone and elevation fill empty boxes; saved ones wait for Replace', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '35.6762');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '139.6503');
    await u.clear(box(/^Elevation/));
    fetchMock.mockResolvedValue(reply({ elevationM: 40 }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await waitFor(() => expect(box(/^Elevation/).value).toBe('40'));
    expect(box(/^Latitude/).value).toBe('35.6762');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/planner/elevation?lat=35.67620&lon=139.65030');
    // The saved time zone was kept and Replace is offered.
    expect(box(/^Time zone/).value).toBe('America/Phoenix');
    expect(screen.getByText(/^Would change: Time zone America\/Phoenix to Asia\/Tokyo/)).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Replace' }));
    expect(box(/^Time zone/).value).toBe('Asia/Tokyo');
    expect(screen.getByText(/Replaced: Time zone America\/Phoenix to Asia\/Tokyo/)).toBeTruthy();
  });

  it('elevation service down: the zone is still filled, the elevation box stays as it was, no crash', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    await u.clear(box(/^Time zone/));
    await u.type(box(/^Latitude/), '{Control>}a{/Control}35.6762');
    await u.type(box(/^Longitude/), '{Control>}a{/Control}139.6503');
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

  /** A fetch that answers only when the test says so, to type while a lookup is in flight. */
  const held = () => {
    let release!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((res) => { release = res; }));
    return (r: Response) => release(r);
  };

  it('H1: elevation cleared, lookup started, 1500 typed before the reply: it stays 1500', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    const answer = held();
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await u.type(box(/^Elevation/), '1500');
    answer(reply({ elevationM: 40 }));
    await screen.findByText(/Kept your own entries for: Elevation/);
    expect(box(/^Elevation/).value).toBe('1500');
  });

  it('H2: any box edited while the lookup runs keeps its edit (name, notes, Bortle)', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    const name = box(/^Name/);
    const before = name.value;
    const answer = held();
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await u.type(name, ' edited');
    fireEvent.change(screen.getByRole('combobox', { name: /Sky darkness, Bortle class/ }), { target: { value: '3' } });
    answer(reply({ elevationM: 40 }));
    await waitFor(() => expect(box(/^Elevation/).value).toBe('40'));
    expect(box(/^Name/).value).toBe(`${before} edited`);
    expect((screen.getByRole('combobox', { name: /Sky darkness, Bortle class/ }) as HTMLSelectElement).value).toBe('3');
  });

  it('two lookups cannot race: both buttons are off while one runs, and only one request goes out', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    const answer = held();
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    expect((screen.getByRole('button', { name: /Look up elevation and time zone/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Find' }) as HTMLButtonElement).disabled).toBe(true);
    await u.type(box(/Find my site/), 'Phoenix{Enter}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    answer(reply({ elevationM: 40 }));
    await waitFor(() => expect(box(/^Elevation/).value).toBe('40'));
  });

  it('coordinates edited while the lookup runs: nothing from the old point is written', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    const answer = held();
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await u.type(box(/^Latitude/), '1');
    answer(reply({ elevationM: 40 }));
    expect(await screen.findByText(/changed while looking up, so nothing was filled in/)).toBeTruthy();
    expect(box(/^Elevation/).value).toBe('');
  });

  it('H5: look up Tokyo, change the boxes to Phoenix: the waiting Replace is gone and nothing from Tokyo is written', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '35.6762');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '139.6503');
    fetchMock.mockResolvedValue(reply({ elevationM: 40 }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await screen.findByRole('button', { name: 'Replace' });
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '33.45');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '-112.07');
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
    expect(screen.queryByText(/Would change/)).toBeNull();
    expect(box(/^Time zone/).value).toBe('America/Phoenix');
  });

  it('H6: the zone typed by hand to match the lookup leaves no empty "Would change" panel', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '35.6762');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '139.6503');
    fetchMock.mockResolvedValue(reply({ elevationM: 40 }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    await screen.findByText(/^Would change: Time zone/);
    await u.clear(box(/^Time zone/));
    await u.type(box(/^Time zone/), 'Asia/Tokyo');
    expect(screen.queryByText(/Would change/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Replace' })).toBeNull();
  });

  it('the status says only what happened: no elevation returned, zone kept, nothing contradicts', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    await u.clear(box(/^Latitude/));
    await u.type(box(/^Latitude/), '35.6762');
    await u.clear(box(/^Longitude/));
    await u.type(box(/^Longitude/), '139.6503');
    fetchMock.mockResolvedValue(reply({ elevationM: null }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    const status = await screen.findByText(/Kept your own entries for: Time zone/);
    expect(status.textContent).not.toMatch(/Filled in/);
    expect(status.textContent).not.toMatch(/elevation and/i);
    expect(status.textContent).toMatch(/No elevation is known/);
  });

  it('the status names what was filled: elevation only when the elevation box was written', async () => {
    const u = userEvent.setup();
    open();
    await u.clear(box(/^Elevation/));
    fetchMock.mockResolvedValue(reply({ elevationM: 40 }));
    await u.click(screen.getByRole('button', { name: /Look up elevation and time zone/ }));
    expect((await screen.findByText(/^Filled in the elevation for these coordinates\./)).textContent).not.toMatch(/time zone/);
  });

  it('Bortle stays the editable box, with a note that it is not looked up', () => {
    open();
    expect(screen.getByText(/Bortle class\) is not looked up/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: /Sky darkness, Bortle class/ })).toBeTruthy();
  });
});
