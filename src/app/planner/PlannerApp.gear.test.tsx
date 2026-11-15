/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import { addItem } from '@/planner/state/edit';
import { PLANS_KEY } from '@/planner/state/plans';
import PlannerApp from './PlannerApp';
import { chooseMore, openGear, openGearItem, openPlanTab, pageProps, planRowItems, ready, seedPlan, storedPlan } from './testkit';

// The Gear tab: a class picker (Trains, Scopes with smart scopes, Cameras, Filters, Accessories, Sites); each class lists, adds, changes and
// removes, and says what uses an item before it is removed. Trains are chain cards. A plan whose site or train is gone says so.

const stored = () => JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string);
const mount = async (props: Partial<React.ComponentProps<typeof PlannerApp>> = {}) => {
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" {...props} />);
  await ready();
  return r;
};
const pickClass = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} \\(\\d+\\)$`) }));
const cards = () => [...document.querySelectorAll<HTMLElement>('#gear-heading ~ ul > li[data-testid^="gear-card-"]')];
const button = (card: HTMLElement, name: string) => within(card).getByRole('button', { name });
const status = () => document.querySelector('#gear-heading ~ p[aria-live="polite"]')!.textContent;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the class picker', () => {
  it('offers six classes with their counts, opens on Trains, and merges scopes with smart scopes', async () => {
    await mount();
    openGear();
    const p = sampleProfile();
    const group = screen.getByRole('group', { name: 'Gear class' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      `Trains (${p.trains.length})`,
      `Scopes (${p.equipment.scopes.length + p.equipment.smartScopes.length})`,
      `Cameras (${p.equipment.cameras.length})`,
      `Filters (${p.equipment.filters.length})`,
      `Accessories (${p.equipment.accessories.length})`,
      'Sites (1)',
    ]);
    expect(within(group).getByRole('button', { name: /^Trains/ }).getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toHaveLength(p.trains.length);
    pickClass('Scopes');
    expect(cards()).toHaveLength(p.equipment.scopes.length + p.equipment.smartScopes.length);
    expect(within(cards()[cards().length - 1]).getByText('Smart scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add scope' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add smart scope' })).toBeTruthy();
  });
});

describe('each class lists, adds, changes and removes', () => {
  const cases: { cls: string; add: string; field: string }[] = [
    { cls: 'Scopes', add: 'Add scope', field: 'Focal length (mm)' },
    { cls: 'Scopes', add: 'Add smart scope', field: 'Focal length (mm)' },
    { cls: 'Cameras', add: 'Add camera', field: 'Pixel size (µm)' },
    { cls: 'Filters', add: 'Add filter', field: 'Size (mm)' },
    { cls: 'Accessories', add: 'Add accessory', field: 'Focal length factor (0.7 reducer, 2.5 extender)' },
    { cls: 'Sites', add: 'Add site', field: 'Elevation (m)' },
  ];
  for (const c of cases) {
    it(`${c.add}: the new card opens its form, Save stores a change, Remove deletes it and says so`, async () => {
      await mount();
      openGear();
      pickClass(c.cls);
      const known = new Set(cards().map((x) => x.dataset.testid));
      const before = cards().length;
      fireEvent.click(screen.getByRole('button', { name: c.add }));
      expect(cards()).toHaveLength(before + 1);
      const newCard = () => cards().find((x) => !known.has(x.dataset.testid))!;
      const card = newCard();
      expect(status()).toMatch(/^Added an? .*Change it and press Save\.$/);
      expect(within(card).getByText('Not used.')).toBeTruthy();
      fireEvent.change(within(card).getByLabelText('Name'), { target: { value: 'Mine' } });
      fireEvent.change(within(card).getByLabelText(c.field), { target: { value: '5' } });
      fireEvent.click(button(card, 'Save'));
      expect(status()).toBe('Saved Mine.');
      const list = JSON.stringify(stored());
      expect(list).toContain('"name":"Mine"');
      fireEvent.click(button(newCard(), 'Remove'));
      expect(status()).toBe('Removed Mine.');
      expect(cards()).toHaveLength(before);
      expect(JSON.stringify(stored())).not.toContain('"name":"Mine"');
    });
  }

  it('a refused Save names the box and leaves the stored profile as it was', async () => {
    await mount();
    openGear();
    const card = openGearItem('Sites');
    fireEvent.change(within(card).getByLabelText('Latitude (deg, north is positive)'), { target: { value: '95' } });
    fireEvent.click(button(card, 'Save'));
    expect(within(card).getByRole('alert').textContent).toMatch(/Latitude: expected a number from -90 to 90/);
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });
});

describe('in use', () => {
  it('every card says what uses it, before anything is removed', async () => {
    await mount();
    openGear();
    for (const cls of ['Scopes', 'Cameras']) {
      pickClass(cls);
      expect(cards().filter((c) => /^Used by \d+ trains?: /.test(within(c).getAllByText(/Used by|Not used/)[0].textContent ?? '')).length).toBeGreaterThan(0);
    }
    pickClass('Trains');
    expect(within(cards().find((c) => c.textContent?.includes('Orion region') === false)!).getAllByText(/Used by|Not used/).length).toBe(1);
    pickClass('Sites');
    expect(within(cards()[0]).getByText('Used by 2 plans: "My plan", "Orion region, C11 + reducer".')).toBeTruthy(); // the open plan and the sample's example plan
  });

  it('scope, camera, filter, accessory and smart scope: Remove on a used one is refused with the trains named, nothing is stored', async () => {
    const p = sampleProfile();
    const t = p.trains.find((x) => x.kind === 'optical' && x.accessoryIds.length > 0);
    if (!t || t.kind !== 'optical') throw new Error('sample has no train with an accessory');
    const withFilter = { ...p, trains: p.trains.map((x) => (x.id === t.id ? { ...t, filterId: p.equipment.filters[0].id } : x)) };
    await mount({ initialProfile: withFilter });
    openGear();
    const check = (cls: string, name: string) => {
      pickClass(cls);
      const card = cards().find((c) => within(c).queryByText(name, { selector: 'span' }) !== null)!;
      fireEvent.click(button(card, 'Remove'));
      expect(within(card).getByRole('alert').textContent).toMatch(/^! Not removed\. Used by \d+ trains?: ".*"( and \d+ more)?\. Change or remove (that train|those trains) first\.$/);
      expect(cards().find((c) => within(c).queryByText(name, { selector: 'span' }) !== null)).toBeTruthy();
    };
    const e = withFilter.equipment;
    check('Scopes', e.scopes.find((s) => s.id === t.scopeId)!.name);
    check('Cameras', e.cameras.find((s) => s.id === t.cameraId)!.name);
    check('Accessories', e.accessories.find((s) => s.id === t.accessoryIds[0])!.name);
    check('Filters', e.filters[0].name);
    const smart = p.trains.find((x) => x.kind === 'smart');
    if (!smart || smart.kind !== 'smart') throw new Error('x');
    check('Scopes', e.smartScopes.find((s) => s.id === smart.smartScopeId)!.name);
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull();
  });

  it('a site a saved plan uses is refused, naming the plan', async () => {
    const two = addItem(sampleProfile(), 'sites');
    const site2 = two.sites[1].id;
    window.localStorage.setItem(
      PLANS_KEY,
      JSON.stringify({
        version: 1,
        openId: 'p1',
        plans: [{ id: 'p1', name: 'Camping trip', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date: '2026-12-15', siteId: site2, trainId: two.trains[0].id, startTime: null, targets: [], notes: '' }],
      }),
    );
    await mount({ initialProfile: two });
    openGear();
    pickClass('Sites');
    const card = cards()[1];
    expect(within(card).getByText('Used by 1 plan: "Camping trip".')).toBeTruthy();
    fireEvent.click(button(card, 'Remove'));
    expect(within(card).getByRole('alert').textContent).toBe('! Not removed. Used by 1 plan: "Camping trip". Open that plan and choose another site first.');
    expect(cards()).toHaveLength(2);
  });
});

describe('trains are chain cards', () => {
  it('each card shows scope, accessory, camera and filter as parts, a smart scope as one', async () => {
    await mount();
    openGear();
    const p = sampleProfile();
    const t = p.trains.find((x) => x.id === 'deep-c11-reducer-2600');
    if (!t || t.kind !== 'optical') throw new Error('x');
    const card = cards().find((c) => c.textContent?.includes(t.name))!;
    const text = card.textContent as string;
    for (const part of ['Scope', 'Accessory', 'Camera', 'Filter']) expect(text).toContain(part);
    expect(text).toContain(p.equipment.scopes.find((s) => s.id === t.scopeId)!.name);
    expect(text).toContain('No filter');
    const smart = cards().find((c) => c.textContent?.includes('Smart-scope train'))!;
    expect(smart.textContent).toContain('Smart scope');
    expect(smart.textContent).not.toContain('Camera');
  });

  it('Use in this plan selects the train for the open plan, which keeps it after a reload; the card says so', async () => {
    const first = await mount();
    openGear();
    expect(cards()[0].textContent).toContain('In this plan');
    const other = cards()[1];
    fireEvent.click(button(other, 'Use in this plan'));
    expect(storedPlan()!.trainId).toBe('deep-c11-reducer-2600');
    expect(within(cards()[1]).getByRole('button', { name: 'Used in this plan' })).toHaveProperty('disabled', true);
    expect(cards()[0].textContent).not.toContain('In this plan');
    first.unmount();
    await mount();
    openGear();
    expect(cards()[1].textContent).toContain('In this plan');
  });

  it('creates a train from the first scope and camera, changes its parts and its filter inside it, and removes it', async () => {
    await mount();
    openGear();
    const n = cards().length;
    fireEvent.click(screen.getByRole('button', { name: 'Add train' }));
    expect(cards()).toHaveLength(n + 1);
    let card = cards()[n];
    fireEvent.change(within(card).getByLabelText('Name'), { target: { value: 'Wide field' } });
    fireEvent.change(within(card).getByLabelText('Filter'), { target: { value: sampleProfile().equipment.filters[0].id } });
    fireEvent.click(button(card, 'Save'));
    expect(status()).toBe('Saved Wide field.');
    card = cards()[n];
    expect(card.textContent).toContain(sampleProfile().equipment.filters[0].name);
    expect(stored().trains[n]).toMatchObject({ name: 'Wide field', filterId: sampleProfile().equipment.filters[0].id });
    expect(within(card).getByText('Not used.')).toBeTruthy();
    fireEvent.click(button(card, 'Remove'));
    expect(status()).toBe('Removed Wide field.');
    expect(cards()).toHaveLength(n);
  });

  it('a train a saved plan uses is not removed, and the card names the plan', async () => {
    await mount();
    openGear();
    // The open plan is a saved plan once it is changed; the sample's own example plan already uses deep-c11-reducer-2600.
    const card = cards().find((c) => c.textContent?.includes('Orion region'))!;
    expect(card.textContent).toContain('Used by 1 plan: "Orion region, C11 + reducer".');
    fireEvent.click(button(card, 'Remove'));
    expect(within(card).getByRole('alert').textContent).toMatch(/Open that plan and choose another train first\.$/);
  });
});

describe('a plan whose site or train is gone', () => {
  const seedStale = (patch: { siteId?: string; trainId?: string }) => {
    seedPlan([], sampleProfile);
    const raw = JSON.parse(window.localStorage.getItem(PLANS_KEY) as string);
    Object.assign(raw.plans[0], patch);
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(raw));
  };

  it('says the train is gone and what is shown instead, changes nothing stored, and Keep makes the shown one the plan\'s', async () => {
    seedStale({ trainId: 'removed-train' });
    await mount();
    openPlanTab();
    const note = screen.getByTestId('plan-stale-train');
    expect(note.textContent).toBe('This plan was made with a train that is no longer in your gear. It shows "C11 f/10 + ASI2600MC Duo" for now.Keep C11 f/10 + ASI2600MC DuoChange train');
    expect(storedPlan()!.trainId).toBe('removed-train');
    fireEvent.click(within(note).getByRole('button', { name: /^Keep / }));
    expect(storedPlan()!.trainId).toBe('deep-c11-2600');
    expect(screen.queryByTestId('plan-stale-train')).toBeNull();
  });

  it('says the site is gone the same way', async () => {
    seedStale({ siteId: 'removed-site' });
    await mount();
    openPlanTab();
    expect(screen.getByTestId('plan-stale-site').textContent).toMatch(/^This plan was made for a site that is no longer in your gear\. It shows "Fountain Hills.*" for now\./);
    expect(storedPlan()!.siteId).toBe('removed-site');
    fireEvent.click(within(screen.getByTestId('plan-stale-site')).getByRole('button', { name: /^Keep / }));
    expect(storedPlan()!.siteId).toBe(sampleProfile().sites[0].id);
  });

  it('no note when both are there', async () => {
    seedPlan([], sampleProfile);
    await mount();
    openPlanTab();
    expect(screen.queryByTestId('plan-stale-train')).toBeNull();
    expect(screen.queryByTestId('plan-stale-site')).toBeNull();
  });
});

describe('a profile missing an optional number', () => {
  it('a camera with no pixel size: the plan, its row, the timeline and the print sheet still show, with no NaN or undefined', async () => {
    const p = sampleProfile();
    const t = p.trains[0];
    if (t.kind !== 'optical') throw new Error('x');
    const noPixel = { ...p, equipment: { ...p.equipment, cameras: p.equipment.cameras.map((c) => {
      if (c.id !== t.cameraId) return c;
      const { pixelSizeUm: _gone, ...rest } = c;
      void _gone;
      return rest;
    }) } };
    seedPlan([{ id: 'm42', preset: 'balanced' }], () => noPixel);
    await mount({ initialProfile: noPixel });
    openPlanTab();
    await waitFor(() => expect(planRowItems()).toHaveLength(1));
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
    // Print: the sheet is built while the browser prints.
    fireEvent(window, new Event('beforeprint'));
    expect(document.body.textContent).not.toMatch(/NaN|undefined|Infinity/);
    fireEvent(window, new Event('afterprint'));
    // CSV: one file, the same words.
    const blobs: Blob[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => (blobs.push(b), 'blob:test');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    chooseMore('Export CSV');
    expect(blobs).toHaveLength(1);
    const csv = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(blobs[0]);
    });
    expect(csv.length).toBeGreaterThan(0);
    expect(csv).not.toMatch(/NaN|undefined|Infinity/);
    openGear();
    pickClass('Cameras');
    const card = cards().find((c) => c.textContent?.includes('Used by'))!;
    expect(card.textContent).not.toContain('Pixel size');
  });
});
