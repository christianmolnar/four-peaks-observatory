/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { LibraryEntry } from '@/planner/library/specs';
import { nameKey } from '@/planner/library/specs';
import { WIDE_PAIR } from '@/planner/library/wide-pair.fixture';
import { GEAR_LIMITS } from '@/planner/profile/limits';
import { PROFILE_KEY } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { openGear, pageProps, ready } from './testkit';

// The Gear tab's "Look up specs": library first, then the AI (owner only, the server decides), the form filled and editable, "Filled by AI, check it"
// until confirmed or edited, "Save correction for everyone" as one explicit tap, and own values never replaced without Apply. The routes are mocked.

const realFetch = globalThis.fetch;
const T = '2026-11-17T10:00:00.000Z';
const entryOf = (name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  cls: 'scope', nameKey: nameKey(name), name, specs: { apertureMm: 80, focalLengthMm: 480, fNumber: 6 }, source: 'model', confirmed: false, updatedAt: T, previous: null, ...over,
});
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let library: jest.Mock;
const route = (h: Partial<Record<'get' | 'fill' | 'correct', Handler>>) => {
  library = jest.fn(async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('/api/planner/library/fill')) return (h.fill ?? (() => json({ error: 'no' }, 500)))(url, init);
    if (url.startsWith('/api/planner/library/correct')) return (h.correct ?? (() => json({ error: 'no' }, 500)))(url, init);
    if (url.startsWith('/api/planner/library?')) return (h.get ?? (() => json({ entry: null })))(url, init);
    return json({});
  });
  globalThis.fetch = library as unknown as typeof fetch;
};
const calls = (part: string) => library.mock.calls.filter((c) => String(c[0]).includes(part));
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

const mount = async () => {
  render(<PlannerApp {...pageProps} initialDate="2026-12-15" />);
  await ready();
  openGear();
};
const gearForm = () => document.querySelector<HTMLElement>('#gear-heading ~ ul form')!;
const openScope = () => {
  fireEvent.click(screen.getByRole('button', { name: /^Scopes \(\d+\)$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add scope' }));
  return gearForm();
};
const typeIn = (form: HTMLElement, label: RegExp, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } });
const lookup = async (form: HTMLElement, name: string) => {
  typeIn(form, /^Name/, name);
  fireEvent.click(within(form).getByRole('button', { name: 'Look up specs' }));
  await waitFor(() => expect(within(form).queryByText('Looking up…')).toBeNull());
};
const value = (form: HTMLElement, label: RegExp) => (within(form).getByLabelText(label) as HTMLInputElement).value;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

describe('Look up specs', () => {
  it('is offered for scopes, cameras and filters, not for accessories, smart scopes or sites', async () => {
    route({});
    await mount();
    const scope = openScope();
    expect(within(scope).getByRole('button', { name: 'Look up specs' })).toBeTruthy();
    cleanup();
    route({});
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /^Scopes \(\d+\)$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add smart scope' }));
    expect(screen.queryByRole('button', { name: 'Look up specs' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Accessories/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add accessory' }));
    expect(screen.queryByRole('button', { name: 'Look up specs' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Sites/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    expect(screen.queryByRole('button', { name: 'Look up specs' })).toBeNull();
  });

  it('a name is needed first: no request, a plain message', async () => {
    route({});
    await mount();
    const form = openScope();
    typeIn(form, /^Name/, '   ');
    fireEvent.click(within(form).getByRole('button', { name: 'Look up specs' }));
    expect(within(form).getByText('Enter a name first.')).toBeTruthy();
    expect(library).not.toHaveBeenCalled();
  });

  it('library first, then the AI: a miss reads, then asks once; the form is filled, editable, and marked "Filled by AI, check it"', async () => {
    route({ get: () => json({ entry: null }), fill: () => json({ entry: entryOf('Mini Refractor'), from: 'model' }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    expect(library.mock.calls.map((c) => String(c[0]).split('?')[0])).toEqual(['/api/planner/library', '/api/planner/library/fill']);
    expect(value(form, /^Focal length/)).toBe('480');
    expect(value(form, /^Aperture/)).toBe('80');
    expect(within(form).getByText(/Filled by AI, check it/)).toBeTruthy();
    expect(window.localStorage.getItem(PROFILE_KEY) ?? '').not.toContain('"apertureMm":80'); // nothing saved until the user presses Save
    typeIn(form, /^Focal length/, '500');
    expect(value(form, /^Focal length/)).toBe('500');
  });

  it('a library hit makes no AI request', async () => {
    route({ get: () => json({ entry: entryOf('Known', { source: 'user', confirmed: true }) }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Known');
    expect(calls('/fill')).toHaveLength(0);
    expect(value(form, /^Aperture/)).toBe('80');
    expect(within(form).queryByText(/Filled by AI/)).toBeNull();
    expect(within(form).getByText(/From the library, confirmed/)).toBeTruthy();
  });

  it('a seed entry says it is not yet checked against the maker', async () => {
    route({ get: () => json({ entry: entryOf('Seeded', { source: 'seed' }) }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Seeded');
    expect(within(form).getByText(/not yet checked against the maker/i)).toBeTruthy();
    expect(within(form).queryByText(/Filled by AI/)).toBeNull();
  });

  it('editing a filled box ends the AI label and offers "Save correction for everyone"; one tap sends the boxes and shows it saved', async () => {
    const saved = entryOf('Mini Refractor', { source: 'user', confirmed: true, specs: { apertureMm: 82, focalLengthMm: 480, fNumber: 5.85 }, previous: { specs: { apertureMm: 80, focalLengthMm: 480, fNumber: 6 }, source: 'model', confirmed: false, updatedAt: T } });
    route({ get: () => json({ entry: entryOf('Mini Refractor') }), correct: () => json({ entry: saved }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    expect(within(form).queryByRole('button', { name: 'Save correction for everyone' })).toBeNull();
    typeIn(form, /^Aperture/, '82');
    expect(within(form).queryByText(/Filled by AI/)).toBeNull();
    fireEvent.click(within(form).getByRole('button', { name: 'Save correction for everyone' }));
    await waitFor(() => expect(within(form).getByText('Saved for everyone.')).toBeTruthy());
    const [call] = calls('/correct');
    expect(bodyOf(call)).toEqual({ cls: 'scope', name: 'Mini Refractor', specs: { apertureMm: 82, focalLengthMm: 480, fNumber: 5.85 } });
    expect(within(form).queryByRole('button', { name: 'Save correction for everyone' })).toBeNull();
    expect(within(form).getByText(/From the library, confirmed/)).toBeTruthy();
  });

  it('"These values are right" confirms for everyone with no new numbers, and the AI label goes', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }), correct: () => json({ entry: entryOf('Mini Refractor', { source: 'user', confirmed: true }) }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    fireEvent.click(within(form).getByRole('button', { name: 'These values are right' }));
    await waitFor(() => expect(within(form).queryByText(/Filled by AI/)).toBeNull());
    expect(bodyOf(calls('/correct')[0])).toEqual({ cls: 'scope', name: 'Mini Refractor' });
  });

  it('a box that is not a number in range is a plain problem and nothing is sent', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    typeIn(form, /^Aperture/, '999999');
    fireEvent.click(within(form).getByRole('button', { name: 'Save correction for everyone' }));
    expect(within(form).getAllByRole('alert').map((a) => a.textContent).join(' ')).toMatch(/Aperture: 999999 is outside the allowed range\. Enter an aperture between 5 and 1,000 mm\./);
    expect(calls('/correct')).toHaveLength(0);
  });

  it('a correction the server refuses shows its reason; the boxes stay as typed', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }), correct: () => json({ error: 'Too many corrections saved this hour (20 per hour), try again later' }, 429) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    typeIn(form, /^Aperture/, '82');
    fireEvent.click(within(form).getByRole('button', { name: 'Save correction for everyone' }));
    await waitFor(() => expect(within(form).getByText(/Too many corrections/)).toBeTruthy());
    expect(value(form, /^Aperture/)).toBe('82');
  });

  it('own values are never replaced without Apply: they are kept and named, and Apply puts the library values in', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }) });
    await mount();
    const form = openScope();
    typeIn(form, /^Aperture/, '100');
    await lookup(form, 'Mini Refractor');
    expect(value(form, /^Aperture/)).toBe('100');
    expect(value(form, /^Focal length/)).toBe('480');
    expect(within(form).getByText(/Kept your Aperture 100/)).toBeTruthy();
    fireEvent.click(within(form).getByRole('button', { name: 'Apply library values' }));
    expect(value(form, /^Aperture/)).toBe('80');
    expect(within(form).queryByRole('button', { name: 'Apply library values' })).toBeNull();
  });

  it('a guest on a miss: the server says no in plain words, the boxes are untouched', async () => {
    route({ fill: () => json({ error: 'This item is not in the library yet. Only the site owner can look up new items with AI. Enter the values yourself.' }, 403) });
    await mount();
    const form = openScope();
    typeIn(form, /^Aperture/, '100');
    await lookup(form, 'Unknown Scope');
    expect(within(form).getByText(/Only the site owner can look up new items/)).toBeTruthy();
    expect(value(form, /^Aperture/)).toBe('100');
    expect(within(form).queryByText(/Filled by AI/)).toBeNull();
  });

  it('AI unavailable and a network failure are plain messages; the form keeps working', async () => {
    route({ fill: () => json({ error: 'AI is unavailable right now. Enter the values yourself.' }, 503) });
    await mount();
    const form = openScope();
    await lookup(form, 'Unknown Scope');
    expect(within(form).getByText('AI is unavailable right now. Enter the values yourself.')).toBeTruthy();
    globalThis.fetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    fireEvent.click(within(form).getByRole('button', { name: 'Look up specs' }));
    await waitFor(() => expect(within(form).getByText(/Could not reach the spec library/)).toBeTruthy());
    typeIn(form, /^Aperture/, '90');
    expect(value(form, /^Aperture/)).toBe('90');
  });

  it('an entry with an out-of-range value is never shown as a number: nothing is filled', async () => {
    route({ get: () => json({ entry: { ...entryOf('Bad'), specs: { apertureMm: 99999 } } }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Bad');
    expect(within(form).getByText(/cannot be used/)).toBeTruthy();
    expect(value(form, /^Aperture/)).toBe('');
    expect(form.textContent).not.toContain('99999');
  });

  it('changing the name after a lookup hides its result (a correction is for the name that was looked up)', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    expect(within(form).getByText(/Filled by AI/)).toBeTruthy();
    typeIn(form, /^Name/, 'Something else');
    expect(within(form).queryByText(/Filled by AI/)).toBeNull();
  });

  it('filter: kind and size fill, the passbands go into their own boxes, the glass and notes into the notes box', async () => {
    const nbz = entryOf('IDAS NBZ-II', { cls: 'filter', source: 'seed', specs: { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], glassMm: 2, notes: 'f/2 optimized' } });
    route({ get: () => json({ entry: nbz }) });
    await mount();
    fireEvent.click(screen.getByRole('button', { name: /^Filters \(\d+\)$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    const form = gearForm();
    await lookup(form, 'IDAS NBZ-II');
    expect(value(form, /^Kind/)).toBe('dual-band');
    expect(value(form, /^Total passband width/)).toBe('17.5');
    expect(value(form, /^Narrowest band/)).toBe('8');
    expect(value(form, /^Bandpass notes/)).toBe('glass 2 mm. f/2 optimized');
    const centres = within(form).getAllByLabelText('Passband centre (nm)') as HTMLInputElement[];
    const widths = within(form).getAllByLabelText('Passband width (nm)') as HTMLInputElement[];
    expect(centres.map((b) => b.value)).toEqual(['656.3', '500.7']);
    expect(widths.map((b) => b.value)).toEqual(['9.5', '8']);
  });

  it('the result stays on the card after Save, so the AI label is not lost by saving the gear form', async () => {
    route({ get: () => json({ entry: entryOf('Mini Refractor') }) });
    await mount();
    const form = openScope();
    await lookup(form, 'Mini Refractor');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    const again = await waitFor(() => {
      const f = document.querySelector<HTMLElement>('#gear-heading ~ ul form');
      if (!f) throw new Error('form closed');
      return f;
    });
    expect(within(again).getByText(/Filled by AI, check it/)).toBeTruthy();
    expect(JSON.stringify(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!))).toContain('"apertureMm":80');
  });
  // The Gear form's number boxes hold only what the Gear ranges allow, whatever the library says.
  const openFilter = () => {
    fireEvent.click(screen.getByRole('button', { name: /^Filters \(\d+\)$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    return gearForm();
  };
  const filterEntry = (name: string, specs: unknown, over: Partial<LibraryEntry> = {}) => entryOf(name, { cls: 'filter', specs: specs as LibraryEntry['specs'], ...over });

  it.each([
    ['the shared library (GET)', (e: LibraryEntry) => ({ get: () => json({ entry: e }) })],
    ['the AI fill (POST)', (e: LibraryEntry) => ({ get: () => json({ entry: null }), fill: () => json({ entry: e, from: 'model' }) })],
  ])('the Wide Pair (two 600 nm bands, 1,200 nm in total) from %s fills no box and shows no number out of range', async (_n, make) => {
    route(make(filterEntry('Wide Pair', WIDE_PAIR, { source: 'user', confirmed: true })));
    await mount();
    const form = openFilter();
    await lookup(form, 'Wide Pair');
    expect(within(form).getByText(/cannot be used/)).toBeTruthy();
    for (const label of [/^Total passband width/, /^Narrowest band/, /^Size/, /^Bandpass notes/]) expect(value(form, label)).toBe('');
    expect(within(form).queryByLabelText('Passband centre (nm)')).toBeNull();
    expect(form.textContent).not.toContain('1200');
  });

  it('a lookup never puts a number outside its box range into any box: the largest allowed filter fills 1,000 nm total, inside both ranges', async () => {
    const big = filterEntry('Big Pair', { type: 'narrowband', passbands: [{ centreNm: 350, widthNm: 300 }, { centreNm: 650, widthNm: 300 }, { centreNm: 1000, widthNm: 400 }] });
    route({ get: () => json({ entry: big }) });
    await mount();
    const form = openFilter();
    await lookup(form, 'Big Pair');
    const total = Number(value(form, /^Total passband width/));
    const narrow = Number(value(form, /^Narrowest band/));
    expect(total).toBe(1000);
    expect(total).toBeGreaterThanOrEqual(GEAR_LIMITS.passbandWidthNm.min);
    expect(total).toBeLessThanOrEqual(GEAR_LIMITS.passbandWidthNm.max);
    expect(narrow).toBeGreaterThanOrEqual(GEAR_LIMITS.narrowestBandNm.min);
    expect(narrow).toBeLessThanOrEqual(GEAR_LIMITS.narrowestBandNm.max);
  });

  describe('the "Filled by AI, check it" mark is saved with the gear item', () => {
    const card = (name: string) => {
      const found = [...document.querySelectorAll<HTMLElement>('[data-testid^="gear-card-"]')].find((li) => li.querySelector('span')?.textContent === name);
      if (!found) throw new Error(`no card named ${name}`);
      return found;
    };
    const reopen = async (name: string) => {
      cleanup();
      await mount();
      fireEvent.click(screen.getByRole('button', { name: /^Scopes \(\d+\)$/ }));
      fireEvent.click(within(card(name)).getByRole('button', { name: 'Change' }));
      return gearForm();
    };
    const fillAndSave = async () => {
      route({ get: () => json({ entry: entryOf('Mini Refractor') }) });
      await mount();
      const form = openScope();
      await lookup(form, 'Mini Refractor');
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes.some((x: { aiFilled?: boolean }) => x.aiFilled === true)).toBe(true));
    };

    it('survives a reload: the card and the form say it, and nothing else about the saved item changed', async () => {
      await fillAndSave();
      const saved = JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes.find((x: { name: string }) => x.name === 'Mini Refractor');
      expect(saved).toMatchObject({ focalLengthMm: 480, apertureMm: 80, aiFilled: true });
      route({});
      const form = await reopen('Mini Refractor');
      expect(within(card('Mini Refractor')).getByTestId('gear-ai-mark').textContent).toMatch(/Filled by AI, check it/);
      expect(within(form).getByText(/Filled by AI, check it/)).toBeTruthy();
      expect(value(form, /^Aperture/)).toBe('80');
    });

    it('is cleared by editing a spec box, and stays cleared after the next reload', async () => {
      await fillAndSave();
      route({});
      const form = await reopen('Mini Refractor');
      typeIn(form, /^Aperture/, '82');
      expect(within(form).queryByText(/Filled by AI/)).toBeNull();
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes.find((x: { name: string }) => x.name === 'Mini Refractor').apertureMm).toBe(82));
      expect(JSON.stringify(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes)).not.toContain('aiFilled');
      route({});
      await reopen('Mini Refractor');
      expect(within(card('Mini Refractor')).queryByTestId('gear-ai-mark')).toBeNull();
    });

    it('is cleared when the library entry is confirmed', async () => {
      await fillAndSave();
      route({ get: () => json({ entry: entryOf('Mini Refractor') }), correct: () => json({ entry: entryOf('Mini Refractor', { source: 'user', confirmed: true }) }) });
      const form = await reopen('Mini Refractor');
      fireEvent.click(within(form).getByRole('button', { name: 'Look up specs' }));
      await waitFor(() => within(form).getByRole('button', { name: 'These values are right' }));
      fireEvent.click(within(form).getByRole('button', { name: 'These values are right' }));
      await waitFor(() => expect(within(form).queryByText(/Filled by AI/)).toBeNull());
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(JSON.stringify(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes)).not.toContain('aiFilled'));
    });

    it('a lookup that fills nothing from the AI leaves gear without the mark (own values kept, library entry confirmed)', async () => {
      route({ get: () => json({ entry: entryOf('Known', { source: 'user', confirmed: true }) }) });
      await mount();
      const form = openScope();
      await lookup(form, 'Known');
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(window.localStorage.getItem(PROFILE_KEY) ?? '').toContain('"apertureMm":80'));
      expect(window.localStorage.getItem(PROFILE_KEY)).not.toContain('aiFilled');
    });
  });

  describe('filter passbands on the Gear tab', () => {
    const NBZ = [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }];
    const nbz = () => entryOf('IDAS NBZ-II', { cls: 'filter', source: 'seed', specs: { type: 'dual-band', passbands: NBZ, glassMm: 2 } });
    const openNewFilter = async () => {
      await mount();
      fireEvent.click(screen.getByRole('button', { name: /^Filters \(\d+\)$/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
      return gearForm();
    };
    const centres = (form: HTMLElement) => (within(form).queryAllByLabelText('Passband centre (nm)') as HTMLInputElement[]).map((b) => b.value);
    const widths = (form: HTMLElement) => (within(form).queryAllByLabelText('Passband width (nm)') as HTMLInputElement[]).map((b) => b.value);
    const savedFilter = (name: string) => JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.filters.find((f: { name: string }) => f.name === name);

    it('a new filter has no band rows; "Add a passband" adds one, up to six, and Remove takes one away', async () => {
      route({});
      const form = await openNewFilter();
      expect(centres(form)).toEqual([]);
      const add = () => fireEvent.click(within(form).getByRole('button', { name: 'Add a passband' }));
      add();
      expect(centres(form)).toEqual(['']);
      for (let i = 0; i < 5; i++) add();
      expect(centres(form)).toHaveLength(6);
      expect(within(form).queryByRole('button', { name: 'Add a passband' })).toBeNull();
      fireEvent.click(within(form).getByRole('button', { name: 'Remove passband 6' }));
      expect(centres(form)).toHaveLength(5);
      expect(within(form).getByRole('button', { name: 'Add a passband' })).toBeTruthy();
    });

    it('a lookup fills the bands and the two totals follow them (read-only); Save stores them, and the card reads them in words', async () => {
      route({ get: () => json({ entry: nbz() }) });
      const form = await openNewFilter();
      await lookup(form, 'IDAS NBZ-II');
      expect(centres(form)).toEqual(['656.3', '500.7']);
      expect(widths(form)).toEqual(['9.5', '8']);
      const total = within(form).getByLabelText(/^Total passband width/) as HTMLInputElement;
      expect(total.value).toBe('17.5');
      expect(total.readOnly).toBe(true);
      expect((within(form).getByLabelText(/^Narrowest band/) as HTMLInputElement).value).toBe('8');
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(savedFilter('IDAS NBZ-II')).toMatchObject({ passbands: NBZ, passbandWidthNm: 17.5, narrowestBandNm: 8 }));
      const bands = await screen.findByTestId('gear-bands');
      expect(within(bands).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ha 656.3 nm, 9.5 nm wide', 'OIII 500.7 nm, 8 nm wide']);
      expect(bands.textContent).toContain('Centred near Ha (hydrogen-alpha, 656.3 nm) and OIII (doubly ionised oxygen, 500.7 nm).');
    });

    it('editing a band width recomputes the totals; an edit to a band is the user\'s own, not the AI\'s', async () => {
      route({ get: () => json({ entry: nbz() }) });
      const form = await openNewFilter();
      await lookup(form, 'IDAS NBZ-II');
      fireEvent.change(within(form).getAllByLabelText('Passband width (nm)')[1], { target: { value: '12' } });
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).value).toBe('21.5');
      expect((within(form).getByLabelText(/^Narrowest band/) as HTMLInputElement).value).toBe('9.5');
      fireEvent.click(within(form).getByRole('button', { name: 'Remove passband 1' }));
      expect(centres(form)).toEqual(['500.7']);
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).value).toBe('12');
      expect(within(form).getByText('You changed these values. They are not saved for others yet.')).toBeTruthy();
    });

    it('bands the user typed are kept by a lookup, named, and replaced only by Apply library values', async () => {
      route({ get: () => json({ entry: nbz() }) });
      const form = await openNewFilter();
      fireEvent.click(within(form).getByRole('button', { name: 'Add a passband' }));
      fireEvent.change(within(form).getByLabelText('Passband centre (nm)'), { target: { value: '640' } });
      fireEvent.change(within(form).getByLabelText('Passband width (nm)'), { target: { value: '30' } });
      await lookup(form, 'IDAS NBZ-II');
      expect(centres(form)).toEqual(['640']);
      expect(widths(form)).toEqual(['30']);
      expect(within(form).getByText(/Kept your Passbands\./)).toBeTruthy();
      fireEvent.click(within(form).getByRole('button', { name: 'Apply library values' }));
      expect(centres(form)).toEqual(['656.3', '500.7']);
      expect(widths(form)).toEqual(['9.5', '8']);
    });

    it('sums the user typed are theirs: a lookup that brings bands keeps the bands and the sums, names them, and only Apply library values replaces them', async () => {
      route({ get: () => json({ entry: entryOf('Duo', { cls: 'filter', source: 'seed', specs: { type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 7 }, { centreNm: 500.7, widthNm: 7 }] } }) }) });
      const form = await openNewFilter();
      fireEvent.change(within(form).getByLabelText(/^Total passband width/), { target: { value: '50' } });
      fireEvent.change(within(form).getByLabelText(/^Narrowest band/), { target: { value: '15' } });
      await lookup(form, 'Duo');
      expect(centres(form)).toEqual([]);
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).value).toBe('50');
      expect((within(form).getByLabelText(/^Narrowest band/) as HTMLInputElement).value).toBe('15');
      expect(within(form).getByText(/Kept your .*Passbands.*Total passband width 50.*Narrowest band 15/)).toBeTruthy();
      fireEvent.click(within(form).getByRole('button', { name: 'Apply library values' }));
      expect(centres(form)).toEqual(['656.3', '500.7']);
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).value).toBe('14');
      expect((within(form).getByLabelText(/^Narrowest band/) as HTMLInputElement).value).toBe('7');
    });

    it('removing every band row through the form and saving stores no passbands and no leftover sums', async () => {
      route({ get: () => json({ entry: nbz() }) });
      const form = await openNewFilter();
      await lookup(form, 'IDAS NBZ-II');
      fireEvent.click(within(form).getByRole('button', { name: 'Remove passband 1' }));
      fireEvent.click(within(form).getByRole('button', { name: 'Remove passband 1' }));
      expect(centres(form)).toEqual([]);
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).value).toBe('');
      expect((within(form).getByLabelText(/^Narrowest band/) as HTMLInputElement).value).toBe('');
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(savedFilter('IDAS NBZ-II')).toBeTruthy());
      const f = savedFilter('IDAS NBZ-II');
      expect(f.passbands).toBeUndefined();
      expect(f.passbandWidthNm).toBeUndefined();
      expect(f.narrowestBandNm).toBeUndefined();
    });

    it.each([['NaN'], ['abc'], ['1e308'], ['-4'], ['0'], ['Infinity']])('%s in a band width is refused on Save in plain words and nothing is stored', async (bad) => {
      route({});
      const form = await openNewFilter();
      fireEvent.click(within(form).getByRole('button', { name: 'Add a passband' }));
      typeIn(form, /^Name/, 'Hostile');
      fireEvent.change(within(form).getByLabelText('Passband centre (nm)'), { target: { value: '656' } });
      fireEvent.change(within(form).getByLabelText('Passband width (nm)'), { target: { value: bad } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      const alert = await within(form).findByRole('alert');
      expect(alert.textContent).toMatch(/Passband 1 width/);
      expect(alert.textContent).not.toMatch(/e\+\d/);
      expect(window.localStorage.getItem(PROFILE_KEY) ?? '').not.toContain('Hostile');
    });

    it('overlapping bands and a half-filled row are refused in plain words', async () => {
      route({});
      const form = await openNewFilter();
      typeIn(form, /^Name/, 'Overlap');
      for (let i = 0; i < 2; i++) fireEvent.click(within(form).getByRole('button', { name: 'Add a passband' }));
      const c = within(form).getAllByLabelText('Passband centre (nm)');
      const w = within(form).getAllByLabelText('Passband width (nm)');
      fireEvent.change(c[0], { target: { value: '656' } });
      fireEvent.change(w[0], { target: { value: '20' } });
      fireEvent.change(c[1], { target: { value: '660' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      expect((await within(form).findByRole('alert')).textContent).toBe('! Passband 2: enter both the centre and the width, or remove the row.');
      fireEvent.change(w[1], { target: { value: '20' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      expect((await within(form).findByRole('alert')).textContent).toMatch(/overlap/);
      expect(window.localStorage.getItem(PROFILE_KEY) ?? '').not.toContain('Overlap');
    });

    it('a filter with no bands is as before: the totals are typed, nothing is read-only, the card shows no band lines', async () => {
      route({});
      const form = await openNewFilter();
      typeIn(form, /^Name/, 'Plain');
      typeIn(form, /^Total passband width/, '120');
      expect((within(form).getByLabelText(/^Total passband width/) as HTMLInputElement).readOnly).toBe(false);
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(savedFilter('Plain')).toEqual({ id: expect.any(String), name: 'Plain', passbandWidthNm: 120 }));
      expect(screen.queryByTestId('gear-bands')).toBeNull();
    });

    it('a stored bands list that is corrupt holds the profile (the standard message) and is never shown as bands', async () => {
      route({});
      const p = JSON.parse(JSON.stringify((await import('@/planner/state')).sampleProfile()));
      p.equipment.filters = [{ id: 'f1', name: 'Bad', passbands: [{ centreNm: 656, widthNm: 1e308 }] }];
      p.trains = p.trains.map((t: { kind: string }) => (t.kind === 'optical' ? { ...t, filterId: 'f1' } : t));
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
      await mount();
      expect(document.body.textContent).toMatch(/could not be used/i);
      expect(document.body.textContent).not.toMatch(/e\+\d/);
    });
  });
});
