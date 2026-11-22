/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { addItem } from '@/planner/state/edit';
import { PLANS_KEY } from '@/planner/state/plans';
import { openGear, openGearItem, openPlanTab, pageProps, ready, seedPlan } from './testkit';

// Round 4: no stored value, bad or odd, ever lets a gear edit replace gear the page did not show. A stored profile that differs from the sample
// (the user's own camera and scope) is what these tests start from: a test on the sample itself cannot see lost gear.

const OWN = 'My own camera';
const OWN_SCOPE = 'My own scope';
const stored = () => JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string);
const mount = async ({ noSite = false } = {}) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" />);
  if (noSite) await screen.findByTestId('no-usable-site'); // no site can be used: the page has no plan to wait for
  else await ready();
  return r;
};
const pickClass = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} \\(\\d+\\)$`) }));
const status = () => document.querySelector('#gear-heading ~ p[aria-live="polite"]')!.textContent;

/** The user's own profile: the sample with one more camera and scope of their own, in use by their own train. */
const mine = () => {
  const raw = JSON.parse(JSON.stringify(sampleProfile()));
  raw.equipment.cameras.push({ id: 'own-cam', name: OWN, pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 });
  raw.equipment.scopes.push({ id: 'own-scope', name: OWN_SCOPE, focalLengthMm: 500, apertureMm: 100 });
  raw.trains.push({ kind: 'optical', id: 'own-train', name: 'My own train', scopeId: 'own-scope', accessoryIds: [], cameraId: 'own-cam' });
  return raw;
};
const keep = (raw: unknown) => window.localStorage.setItem(PROFILE_KEY, JSON.stringify(raw));
const ownCameraStored = () => stored().equipment.cameras.some((c: { name: string }) => c.name === OWN);

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('a stored site number that cannot be used keeps the profile (round 4)', () => {
  const cases: [string, string, unknown][] = [
    ['latitude', '-100', -100],
    ['latitude', 'null', null],
    ['latitude', '"abc"', 'abc'],
    ['longitude', '999', 999],
    ['longitude', 'null', null],
    ['elevationM', '"abc"', 'abc'],
    ['elevationM', '99999', 99999],
    ['latitude', '{}', {}],
    ['latitude', '[1]', [1]],
  ];
  for (const [key, label, value] of cases) {
    it(`${key} ${label}: the only site is kept and flagged, the page asks for a fix, and no gear edit loses "${OWN}"`, async () => {
      const raw = mine();
      raw.sites[0][key] = value;
      keep(raw);
      await mount({ noSite: true });
      // The profile is not set aside: no sample, no "could not be used", no validator text.
      expect(document.body.textContent).not.toMatch(/\$\.|Problem at|could not be used|\[object|outside the allowed range for/);
      expect(screen.getByTestId('no-usable-site').textContent).toMatch(/cannot be used/);
      expect(screen.getByTestId('no-usable-site').textContent).toContain(raw.sites[0].name);
      expect(screen.getByTestId('no-usable-site').textContent).toMatch(/so the planner does not use this site/);
      // The Gear section is on the page, on Sites, with the site's card saying why.
      const flag = screen.getAllByTestId('gear-flag')[0].textContent!;
      expect(flag).toMatch(/so the planner does not use this site\.( .*)? Change it and press Save\.$/);
      expect(flag).not.toMatch(/\[object/);
      // A gear edit keeps the user's gear.
      pickClass('Cameras');
      fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
      expect(status()).toMatch(/^Added a camera/);
      expect(ownCameraStored()).toBe(true);
      expect(stored().equipment.scopes.map((s: { name: string }) => s.name)).toContain(OWN_SCOPE);
      expect(stored().sites[0][key]).toEqual(value); // the bad value is kept until the user fixes it
    });
  }

  it('the site form corrects it: the page then shows the plan, and the gear is still there', async () => {
    const raw = mine();
    raw.sites[0].latitude = -100;
    keep(raw);
    await mount({ noSite: true });
    const form = openGearItem('Sites', 0);
    const lat = within(form).getByLabelText(/^Latitude/) as HTMLInputElement;
    expect(lat.value).toBe('-100');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByRole('alert').textContent).toMatch(/Latitude: .* outside the allowed range\. Enter a latitude between -90 and 90 deg\./);
    fireEvent.change(lat, { target: { value: '33.6' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByTestId('no-usable-site')).toBeNull());
    await ready();
    expect(stored().sites[0].latitude).toBe(33.6);
    expect(ownCameraStored()).toBe(true);
    expect(screen.getByLabelText('Site').textContent).toContain(raw.sites[0].name);
  });

  it('a null latitude opens an empty box that says so; text shows the text', async () => {
    const raw = mine();
    raw.sites[0].latitude = null;
    keep(raw);
    await mount({ noSite: true });
    const form = openGearItem('Sites', 0);
    expect((within(form).getByLabelText(/^Latitude/) as HTMLInputElement).value).toBe('');
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByRole('alert').textContent).toMatch(/Latitude: the box is empty\. Enter a latitude between -90 and 90 deg\./);
  });

  it('with a second, good site the plan uses it, the bad site is not offered, and the card says why', async () => {
    const raw = mine();
    raw.sites.unshift({ ...raw.sites[0], id: 'bad-site', name: 'Broken site', latitude: 'abc' });
    keep(raw);
    await mount();
    expect(screen.queryByTestId('no-usable-site')).toBeNull();
    const options = [...(document.getElementById('plan-site') as HTMLSelectElement).options].map((o) => o.text);
    expect(options).toEqual([raw.sites[1].name]);
    openGear();
    pickClass('Sites');
    const card = document.querySelector('[data-testid="gear-card-sites:bad-site"]') as HTMLElement;
    expect(within(card).getByTestId('gear-flag').textContent).toMatch(/^! Latitude is saved as "abc", which is not a number, so the planner does not use this site\./);
    expect(screen.getByTestId('gear-flagged').textContent).toContain('1 saved value is not usable');
  });
});

describe('a stored profile this page cannot load is never written over (round 4)', () => {
  /** Own gear plus a train that names a scope that is not there: the validator refuses the whole profile. */
  const unloadable = () => {
    const raw = mine();
    raw.trains[raw.trains.length - 1].scopeId = 'no-such-scope';
    return raw;
  };
  let blobs: Blob[] = [];
  beforeEach(() => {
    blobs = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => (blobs.push(b), 'blob:test');
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
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

  it('says what is wrong in words, and a gear edit is refused and leaves the stored text exactly as it was', async () => {
    const raw = unloadable();
    keep(raw);
    const before = window.localStorage.getItem(PROFILE_KEY);
    await mount();
    const box = screen.getByTestId('profile-held');
    expect(box.textContent).toMatch(/could not be used, so the sample is shown/);
    expect(box.textContent).not.toMatch(/\$\.|Problem at/);
    expect(box.textContent).toMatch(/kept as it is/);
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(status()).not.toMatch(/Added/);
    expect(status()).toMatch(/^Not saved: saved gear is held back/);
    expect(within(screen.getByRole('region', { name: 'GEAR' })).queryAllByRole('alert')).toHaveLength(0); // the page's notice is the one alert
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe(before);
    expect(ownCameraStored()).toBe(true);
  });

  it('every other write is refused too: a form Save, a Remove, and the horizon Save', async () => {
    keep(unloadable());
    const before = window.localStorage.getItem(PROFILE_KEY);
    await mount();
    openGear();
    const form = openGearItem('Cameras', 0);
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Renamed' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).queryByRole('alert')).toBeNull(); // said once, on the Gear section
    pickClass('Filters');
    fireEvent.click(within(document.querySelectorAll<HTMLElement>('#gear-heading ~ ul > li')[0]).getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add another zone' }));
    for (const [id, v] of [['arc-start', '10'], ['arc-end', '40'], ['arc-height', '15']] as const) {
      fireEvent.change(document.getElementById(`${id}-number`) as HTMLInputElement, { target: { value: v } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save horizon' }));
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe(before);
  });

  it('Export profile exports the stored text, not the sample', async () => {
    keep(unloadable());
    const before = window.localStorage.getItem(PROFILE_KEY)!;
    await mount();
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'Export profile (JSON)' }));
    expect((await blobs[blobs.length - 1].text()).replace(/^﻿/, '')).toBe(before);
  });

  it('text that is not JSON is held the same way', async () => {
    window.localStorage.setItem(PROFILE_KEY, '{"version": 3, "sites": [');
    await mount();
    expect(screen.getByTestId('profile-held').textContent).toMatch(/not valid JSON/);
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(window.localStorage.getItem(PROFILE_KEY)).toBe('{"version": 3, "sites": [');
  });

  it('Reset all is the explicit way out: editing works again, on the sample', async () => {
    keep(unloadable());
    await mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Gear and site' }));
    fireEvent.click(screen.getByRole('button', { name: /^Reset all/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Yes, reset/ }));
    await waitFor(() => expect(screen.queryByTestId('profile-held')).toBeNull());
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(status()).toMatch(/^Added a filter/);
  });
});

describe('odd stored types read in words (round 4)', () => {
  for (const [label, value] of [['{}', {}], ['[1]', [1]], ['text', 'abc'], ['null', null], ['true', true]] as const) {
    it(`a scope focal length of ${label} never shows [object Object], and does not say "outside the allowed range" for a non-number`, async () => {
      const raw = mine();
      raw.equipment.scopes.find((s: { id: string }) => s.id === 'own-scope').focalLengthMm = value;
      keep(raw);
      await mount();
      expect(document.body.textContent).not.toMatch(/\[object|NaN|undefined/);
      expect(screen.getByText(/One saved gear value is not usable \(out of range or not a number\)/)).toBeTruthy();
      openGear();
      pickClass('Scopes');
      const flag = screen.getByTestId('gear-flag').textContent!;
      expect(flag).toMatch(/^! Focal length is saved as /);
      expect(flag).not.toMatch(/outside 10 to 10,000 mm, so/);
      if (typeof value === 'object' && value !== null) expect(flag).toContain('something that is not a number');
      const form = openGearItem('Scopes', raw.equipment.scopes.length - 1);
      const box = within(form).getByLabelText(/^Focal length \(/) as HTMLInputElement;
      expect(box.value).not.toMatch(/object/);
    });
  }
});

describe('smaller round 4 fixes', () => {
  it('a plan made for a site whose numbers cannot be used says so, and the plan uses the other site', async () => {
    const raw = mine();
    raw.sites.unshift({ ...raw.sites[0], id: 'bad-site', name: 'Broken site', latitude: null });
    keep(raw);
    seedPlan([], sampleProfile);
    const plans = JSON.parse(window.localStorage.getItem(PLANS_KEY) as string);
    plans.plans[0].siteId = 'bad-site';
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
    await mount();
    openPlanTab();
    const note = screen.getByTestId('plan-stale-site').textContent!;
    expect(note).toContain('cannot be used');
    expect(note).toContain(`Showing "${raw.sites[1].name}".`);
    expect(document.body.textContent).not.toMatch(/no longer in your gear\. Showing "Broken/);
  });

  it('a refused Save clears the earlier "Saved ..." line', async () => {
    keep(mine());
    await mount();
    openGear();
    let form = openGearItem('Cameras', 0);
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(status()).toMatch(/^Saved /);
    form = openGearItem('Cameras', 0);
    fireEvent.change(within(form).getByLabelText(/^Pixel size \(/), { target: { value: '-5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(within(form).getByRole('alert').textContent).toMatch(/Pixel size/);
    expect(status()).toBe('');
  });

  it('a refusal because another tab saved first is said once in Gear, not twice', async () => {
    keep(mine());
    await mount();
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' })); // this page has written
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(addItem(stored(), 'cameras'))); // the other tab saves, no event reaches this page
    const form = openGearItem('Cameras', 0);
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Renamed here' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    const alerts = within(screen.getByRole('region', { name: 'GEAR' })).queryAllByRole('alert').map((a) => a.textContent);
    expect(alerts.filter((t) => t!.includes('Another tab changed your gear'))).toHaveLength(1);
    expect(new Set(alerts).size).toBe(alerts.length);
  });

  it('a 14 mm lens with a 0.7x reducer says it is under the floor, on its train card and in the plan, and still shows numbers', async () => {
    const raw = mine();
    raw.equipment.scopes.push({ id: 'wide', name: 'My 14 mm lens', focalLengthMm: 14, apertureMm: 5 });
    raw.equipment.accessories.push({ id: 'red', name: 'My 0.7x reducer', factor: 0.7 });
    raw.trains.push({ kind: 'optical', id: 'wide-train', name: 'Wide train', scopeId: 'wide', accessoryIds: ['red'], cameraId: 'own-cam' });
    keep(raw);
    await mount();
    openGear();
    const note = screen.getByTestId('gear-focal-note').textContent!;
    expect(note).toContain('9.8 mm');
    expect(note).toContain('under the 10 mm');
  });

  it('the "Open <plan>" button breaks inside a long name and may shrink (320 px)', async () => {
    const two = addItem(sampleProfile(), 'sites');
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(two));
    window.localStorage.setItem(
      PLANS_KEY,
      JSON.stringify({
        version: 1,
        openId: 'p1',
        plans: [{ id: 'p1', name: 'Q'.repeat(60), createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-15', siteId: two.sites[1].id, trainId: two.trains[0].id, startTime: null, targets: [], notes: '' }],
      }),
    );
    await mount();
    openGear();
    pickClass('Sites');
    const card = document.querySelector('[data-testid^="gear-card-sites:"]:nth-child(2)') as HTMLElement;
    fireEvent.click(within(card).getByRole('button', { name: 'Remove' }));
    const open = within(card).getByRole('button', { name: `Open ${'Q'.repeat(60)}` });
    expect(open.className).toMatch(/max-w-full/);
    expect(open.className).toMatch(/min-w-0/);
    expect(open.className).toMatch(/break-words/);
  });
});

const RAW = /\bexpected\b|\bgot\b|allowed:|\$\./;

describe('round 5: plain words for a held profile, no false Saved, one message', () => {
  const heldWith = (edit: (raw: Record<string, any>) => unknown) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const raw = mine();
    const out = edit(raw);
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(out === undefined ? raw : out));
  };

  it.each([
    ['a version from a newer planner', (r: Record<string, unknown>) => { r.version = 99; }, 'It is version 99; this planner reads version 3 (and upgrades versions 1 and 2).'],
    ['a read-noise class that is not one', (r: any) => { r.equipment.cameras[0].readNoiseClass = 'zzz'; }, 'read noise is saved as "zzz"; use low, medium or high.'], // eslint-disable-line @typescript-eslint/no-explicit-any
    ['a field nobody knows', (r: Record<string, unknown>) => { r.extra = 1; }, 'has a field the planner does not know: "extra"'],
    ['a profile that is a list', () => [1, 2, 3], 'not in the planner\u2019s format'],
    ['a repeated id', (r: any) => { r.equipment.cameras.push({ ...r.equipment.cameras[0] }); }, 'which another camera already uses'], // eslint-disable-line @typescript-eslint/no-explicit-any
  ])('%s: the notice, and the toast of a refused horizon Save, are plain', async (_n, edit, said) => {
    heldWith(edit as (raw: Record<string, unknown>) => unknown);
    await mount();
    const box = screen.getByTestId('profile-held').textContent!;
    expect(box).toContain(said);
    expect(box).not.toMatch(RAW);
    openGear();
    fireEvent.click(screen.getByRole('button', { name: 'Add another zone' }));
    for (const [id, v] of [['arc-start', '10'], ['arc-end', '40'], ['arc-height', '15']] as const) {
      fireEvent.change(document.getElementById(`${id}-number`) as HTMLInputElement, { target: { value: v } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save horizon' }));
    expect(document.body.textContent).not.toMatch(RAW);
  });

  it('a held profile says why once: the Gear refusal is a short pointer, not a second copy of the notice', async () => {
    heldWith((r) => { r.version = 99; });
    await mount();
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    const gear = status()!;
    expect(within(screen.getByRole('region', { name: 'GEAR' })).queryAllByRole('alert')).toHaveLength(0);
    expect(screen.getAllByRole('alert').filter((a) => a.getAttribute('data-testid') === 'profile-held')).toHaveLength(1);
    expect(gear).toMatch(/^Not saved/);
    expect(gear.length).toBeLessThan(120);
    expect(gear).not.toMatch(/Export profile|Reset all|could not be loaded/);
    expect(screen.getByTestId('profile-held').textContent).toMatch(/Export profile/);
  });

  describe.each([
    ['the disk is full', () => Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })],
    ['storage is blocked', () => Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' })],
  ])('%s', (_label, makeError) => {
    it('a gear edit is not "Saved", and the section says it was not saved', async () => {
      keep(mine());
      await mount();
      openGear();
      const before = window.localStorage.getItem(PROFILE_KEY);
      const set = Storage.prototype.setItem;
      jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
        if (k === PROFILE_KEY) throw makeError();
        return set.call(this, k, v);
      });
      const form = openGearItem('Cameras', 0);
      fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
      expect(status()).not.toMatch(/Saved/);
      expect(within(screen.getByRole('region', { name: 'GEAR' })).getByRole('alert').textContent).toMatch(/^! Not saved, so this change is lost on reload: /);
      pickClass('Filters');
      fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
      expect(status()).not.toMatch(/Added|Saved/);
      expect(window.localStorage.getItem(PROFILE_KEY)).toBe(before);
    });
  });

  it('the no-usable-site page says a plan uses the site, not "Not used."', async () => {
    const raw = mine();
    raw.sites[0].latitude = -100;
    keep(raw);
    window.localStorage.setItem(
      PLANS_KEY,
      JSON.stringify({
        version: 1,
        openId: 'p1',
        plans: [{ id: 'p1', name: 'Winter run', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-15', siteId: raw.sites[0].id, trainId: raw.trains[0].id, startTime: null, targets: [], notes: '' }],
      }),
    );
    await mount({ noSite: true });
    pickClass('Sites');
    const card = document.querySelector('[data-testid^="gear-card-sites:"]') as HTMLElement;
    expect(card.textContent).toMatch(/Used by 1 plan: "Winter run"/);
    expect(card.textContent).not.toMatch(/Not used\./);
  });

  it('a refused horizon Save says the other tab changed the gear once', async () => {
    keep(mine());
    await mount();
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(addItem(stored(), 'cameras')));
    const form = openGearItem('Cameras', 0);
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Renamed here' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' })); // refused: Gear says so
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(addItem(stored(), 'cameras'))); // the other tab saves again
    fireEvent.click(screen.getByRole('button', { name: 'Add another zone' }));
    for (const [id, v] of [['arc-start', '10'], ['arc-end', '40'], ['arc-height', '15']] as const) {
      fireEvent.change(document.getElementById(`${id}-number`) as HTMLInputElement, { target: { value: v } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save horizon' }));
    const said = document.body.textContent!.split('Another tab changed your gear, so your edit was not made').length - 1;
    expect(said).toBe(1);
  });

  it('the plan train note wraps a long name (320 px)', async () => {
    const raw = mine();
    raw.equipment.scopes.push({ id: 'wide', name: 'L'.repeat(80), focalLengthMm: 14, apertureMm: 5 });
    raw.equipment.accessories.push({ id: 'red', name: 'R'.repeat(80), factor: 0.7 });
    raw.trains.push({ kind: 'optical', id: 'wide-train', name: 'W'.repeat(80), scopeId: 'wide', accessoryIds: ['red'], cameraId: 'own-cam' });
    keep(raw);
    window.localStorage.setItem(
      PLANS_KEY,
      JSON.stringify({
        version: 1,
        openId: 'p1',
        plans: [{ id: 'p1', name: 'Wide', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-15', siteId: raw.sites[0].id, trainId: 'wide-train', startTime: null, targets: [], notes: '' }],
      }),
    );
    await mount();
    const note = screen.getByTestId('plan-train-note');
    expect(note.textContent).toMatch(/under the 10 mm/);
    const span = note.querySelector('span') as HTMLElement;
    expect(span.className).toMatch(/min-w-0/);
    expect(span.className).toMatch(/max-w-full/);
    expect(span.className).toMatch(/break-words/);
  });
});
