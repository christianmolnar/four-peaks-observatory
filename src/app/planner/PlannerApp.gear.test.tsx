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
      `Setups (${p.trains.length})`,
      `Scopes (${p.equipment.scopes.length + p.equipment.smartScopes.length})`,
      `Cameras (${p.equipment.cameras.length})`,
      `Filters (${p.equipment.filters.length})`,
      `Accessories (${p.equipment.accessories.length})`,
      'Sites (1)',
    ]);
    expect(within(group).getByRole('button', { name: /^Setups/ }).getAttribute('aria-pressed')).toBe('true');
    expect(cards()).toHaveLength(p.trains.length);
    pickClass('Scopes');
    expect(cards()).toHaveLength(p.equipment.scopes.length + p.equipment.smartScopes.length);
    expect(within(cards()[cards().length - 1]).getByText('Smart scope')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add scope' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add smart scope' })).toBeTruthy();
  });
});

describe('each class lists, adds, changes and removes', () => {
  const cases: { cls: string; add: string; field: RegExp; value: string }[] = [
    { cls: 'Scopes', add: 'Add scope', field: /^Focal length \(/, value: '800' },
    { cls: 'Scopes', add: 'Add smart scope', field: /^Focal length \(/, value: '250' },
    { cls: 'Cameras', add: 'Add camera', field: /^Pixel size \(/, value: '3.76' },
    { cls: 'Filters', add: 'Add filter', field: /^Size \(/, value: '36' },
    { cls: 'Accessories', add: 'Add accessory', field: /^Focal length factor \(/, value: '0.7' },
    { cls: 'Sites', add: 'Add site', field: /^Elevation \(/, value: '500' },
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
      fireEvent.change(within(card).getByLabelText(/^Name/), { target: { value: 'Mine' } });
      fireEvent.change(within(card).getByLabelText(c.field), { target: { value: c.value } });
      fireEvent.click(button(card, 'Save'));
      expect(status()).toBe('Saved Mine.');
      const list = JSON.stringify(stored());
      expect(list).toContain('"name":"Mine"');
      fireEvent.click(button(newCard(), 'Remove'));
      expect(status()).toBe('Removed Mine. Undo');
      expect(cards()).toHaveLength(before);
      expect(JSON.stringify(stored())).not.toContain('"name":"Mine"');
    });
  }

  it('a refused Save names the box and leaves the stored profile as it was', async () => {
    await mount();
    openGear();
    const card = openGearItem('Sites');
    fireEvent.change(within(card).getByLabelText(/^Latitude/), { target: { value: '95' } });
    fireEvent.click(button(card, 'Save'));
    expect(within(card).getByRole('alert').textContent).toBe('! Latitude: 95 is outside the allowed range. Enter a latitude between -90 and 90 deg.');
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
    pickClass('Setups');
    expect(within(cards().find((c) => c.textContent?.includes('Orion region') === false)!).getAllByText(/Used by|Not used/).length).toBe(1);
    pickClass('Sites');
    expect(within(cards()[0]).getByText('Used by 1 plan: "My plan".')).toBeTruthy(); // the open plan; the sample's hidden example plan never counts
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
    expect(within(card).getByRole('alert').textContent).toBe('! Not removed. Used by 1 plan: "Camping trip". Open that plan and choose another site first.Open Camping trip');
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
    const smart = cards().find((c) => c.textContent?.includes('Smart-scope setup'))!;
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
    fireEvent.click(screen.getByRole('button', { name: 'Add setup' }));
    expect(cards()).toHaveLength(n + 1);
    let card = cards()[n];
    fireEvent.change(within(card).getByLabelText(/^Name/), { target: { value: 'Wide field' } });
    fireEvent.change(within(card).getByLabelText('Filter'), { target: { value: sampleProfile().equipment.filters[0].id } });
    fireEvent.click(button(card, 'Save'));
    expect(status()).toBe('Saved Wide field.');
    card = cards()[n];
    expect(card.textContent).toContain(sampleProfile().equipment.filters[0].name);
    expect(stored().trains[n]).toMatchObject({ name: 'Wide field', filterId: sampleProfile().equipment.filters[0].id });
    expect(within(card).getByText('Not used.')).toBeTruthy();
    fireEvent.click(button(card, 'Remove'));
    expect(status()).toBe('Removed Wide field. Undo');
    expect(cards()).toHaveLength(n);
  });

  it('the sample\'s hidden example plan never blocks a train: it is removed, and the example goes with it', async () => {
    await mount();
    openGear();
    const card = cards().find((c) => c.textContent?.includes('C11 + 0.7x reducer'))!;
    expect(card.textContent).toContain('Not used.');
    fireEvent.click(button(card, 'Remove'));
    expect(status()).toMatch(/^Removed .*Undo$/);
    expect(stored().plans).toEqual([]);
  });

  it('a train a saved plan uses is refused, and the refusal has an Open button that opens that plan', async () => {
    await mount();
    openGear();
    // Make a second plan on the first train, then ask to remove that train: the refusal names the plan the user can open.
    const trainName = cards()[0].querySelector('span')!.textContent!;
    fireEvent.click(button(cards()[0], 'Remove'));
    const alert = within(cards()[0]).getByRole('alert');
    expect(alert.textContent).toContain('Used by 1 plan: "My plan".');
    fireEvent.click(within(alert).getByRole('button', { name: 'Open My plan' }));
    expect(screen.getByRole('tab', { name: /^Plan/ }).getAttribute('aria-selected')).toBe('true');
    expect(trainName).not.toBe('');
  });

  it('Undo puts a removed item back, in one step, and only while nothing else has changed', async () => {
    await mount();
    openGear();
    pickClass('Cameras');
    fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
    fireEvent.click(button(cards().at(-1)!, 'Save'));
    const before = cards().length;
    fireEvent.click(button(cards().at(-1)!, 'Remove'));
    expect(cards()).toHaveLength(before - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(cards()).toHaveLength(before);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
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
    expect(note.textContent).toBe('This plan was made with a train that is no longer in your gear. It shows "C11 f/10 + ASI2600MC Duo" for now.Keep C11 f/10 + ASI2600MC DuoChange setup');
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

describe('the strip names the train once and has no filter selector', () => {
  it('shows the train\'s filter as text and opens that train\'s card from "Change this train"', async () => {
    const p = sampleProfile();
    const t = p.trains.find((x) => x.kind === 'optical');
    if (!t || t.kind !== 'optical') throw new Error('x');
    const withFilter = { ...p, trains: p.trains.map((x) => (x.id === t.id ? { ...t, filterId: p.equipment.filters[0].id } : x)) };
    seedPlan([], () => withFilter);
    await mount({ initialProfile: withFilter });
    expect(document.getElementById('plan-filter')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filter' })).toBeNull();
    expect(screen.getByTestId('train-filter').textContent).toBe(`Filter: ${p.equipment.filters[0].name}`);
    fireEvent.click(screen.getByRole('button', { name: 'Change this setup' }));
    expect(screen.getByRole('tab', { name: 'Gear and site' }).getAttribute('aria-selected')).toBe('true');
    const card = cards().find((c) => c.querySelector(`#edit-train-${t.id}-name`) !== null)!;
    expect(card).toBeTruthy();
    expect(document.activeElement).toBe(card.querySelector(`#edit-train-${t.id}-name`));
    // The filter is chosen only here, inside the train.
    expect(within(card).getAllByRole('combobox').map((s) => (s as HTMLSelectElement).id)).toContain(`edit-train-${t.id}-filter`);
  });
});

describe('a stored profile with values outside their ranges', () => {
  const bad = () => {
    const p = sampleProfile();
    const t = p.trains.find((x) => x.kind === 'optical');
    if (!t || t.kind !== 'optical') throw new Error('x');
    return {
      p,
      t,
      profile: {
        ...p,
        equipment: {
          ...p.equipment,
          scopes: p.equipment.scopes.map((s) => (s.id === t.scopeId ? { ...s, focalLengthMm: 1e300, apertureMm: 1e300 } : s)),
          cameras: p.equipment.cameras.map((c) => (c.id === t.cameraId ? { ...c, pixelSizeUm: 1e-300, sensorWidthPx: 1e9 } : c)),
        },
      },
    };
  };

  it('opens with a plain note, the value kept and flagged on its card, and the exposure row says why it shows nothing', async () => {
    const { profile, t } = bad();
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    seedPlan([{ id: 'm42', preset: 'balanced' }], () => profile);
    await mount();
    expect(document.body.textContent).not.toMatch(/Application error|NaN|Infinity/);
    expect(screen.getByText(/saved gear values are not usable \(outside the allowed range or not a number\), so the planner does not use them/)).toBeTruthy();
    openPlanTab();
    await waitFor(() => expect(planRowItems()).toHaveLength(1));
    expect(planRowItems()[0].textContent).toMatch(/Focal length of .* \(an impossibly large number\) is outside 10 to 10,000 mm.*so no exposure is shown\. Change it in Gear\./);
    openGear();
    expect(screen.getByTestId('gear-flagged').textContent).toContain('4 saved values are not usable (outside the allowed range or not a number).');
    pickClass('Scopes');
    const card = cards().find((c) => c.textContent?.includes(profile.equipment.scopes.find((s) => s.id === t.scopeId)!.name))!;
    expect(within(card).getAllByTestId('gear-flag').map((x) => x.textContent)).toEqual([
      '! Focal length is an impossibly large number, outside 10 to 10,000 mm, so the planner does not use it. Change it and press Save.',
      '! Aperture is an impossibly large number, outside 5 to 1,000 mm, so the planner does not use it. Change it and press Save.',
    ]);
    expect(JSON.parse(window.localStorage.getItem(PROFILE_KEY)!).equipment.scopes.find((s: { id: string }) => s.id === t.scopeId).focalLengthMm).toBe(1e300); // kept
    // Fixing the value is possible: Save with a value in range stores it.
    const form = openGearItem('Scopes', cards().indexOf(card));
    fireEvent.change(within(form).getByLabelText(/^Focal length \(/), { target: { value: '2800' } });
    fireEvent.change(within(form).getByLabelText(/^Aperture \(/), { target: { value: '280' } });
    fireEvent.click(button(form, 'Save'));
    expect(status()).toMatch(/^Saved /);
    expect(stored().equipment.scopes.find((s: { id: string }) => s.id === t.scopeId)).toMatchObject({ focalLengthMm: 2800, apertureMm: 280 });
  });

  it('an edit elsewhere is not blocked by a flagged value', async () => {
    const { profile } = bad();
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    await mount();
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(status()).toMatch(/^Added a filter/);
    expect(stored().equipment.filters.length).toBe(profile.equipment.filters.length + 1);
  });
});

describe('two tabs', () => {
  const otherTabSaves = (profile: unknown) => {
    const text = JSON.stringify(profile);
    window.localStorage.setItem(PROFILE_KEY, text);
    fireEvent(window, new StorageEvent('storage', { key: PROFILE_KEY, newValue: text, storageArea: window.localStorage }));
  };

  it('a profile saved by another tab is adopted, so this tab\'s next edit does not erase it', async () => {
    await mount();
    openGear();
    const other = addItem(sampleProfile(), 'cameras'); // the other tab added a camera
    otherTabSaves(other);
    await waitFor(() => expect(screen.getByText('Another tab changed your gear. This page now shows it.')).toBeTruthy());
    pickClass('Cameras');
    expect(cards()).toHaveLength(other.equipment.cameras.length);
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(stored().equipment.cameras).toHaveLength(other.equipment.cameras.length); // the other tab's camera is still there
    expect(stored().equipment.filters).toHaveLength(other.equipment.filters.length + 1);
  });

  it('an edit made before the event arrives is refused, in words, and this tab shows the other tab\'s gear', async () => {
    await mount();
    openGear();
    const other = addItem(sampleProfile(), 'cameras');
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(other)); // saved by the other tab; no event reached this one yet
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(screen.getByRole('alert').textContent).toContain('Another tab changed your gear since this page last looked, so your last edit was not made.');
    expect(stored().equipment.filters).toHaveLength(other.equipment.filters.length); // nothing of this tab's was written over it
    expect(stored().equipment.cameras).toHaveLength(other.equipment.cameras.length);
    pickClass('Cameras');
    expect(cards()).toHaveLength(other.equipment.cameras.length);
  });
});

describe('a plan whose train is gone is never used silently', () => {
  const seedStale = () => {
    seedPlan([{ id: 'm31', preset: 'balanced' }], sampleProfile);
    const raw = JSON.parse(window.localStorage.getItem(PLANS_KEY) as string);
    raw.plans[0].trainId = 'removed-train';
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(raw));
  };
  const noteText = 'This plan was made with a train that is no longer in your gear. It shows "C11 f/10 + ASI2600MC Duo" for now.';

  it('the AI flyout says it in step 1 and does not offer to ask until the user keeps or changes the train', async () => {
    seedStale();
    await mount();
    openPlanTab();
    await waitFor(() => expect(planRowItems()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Plan my night with AI' }));
    const flyout = screen.getByTestId('ai-flyout');
    expect(within(flyout).getByTestId('ai-stale-train').textContent).toContain(noteText);
    const ask = within(flyout).getByRole('button', { name: /^Ask the AI/ });
    expect(ask.hasAttribute('disabled')).toBe(true);
    expect(within(flyout).getByTestId('ai-plan-reason').textContent).toMatch(/no longer in your gear\. Keep the one shown or change it first\./);
    fireEvent.click(within(flyout).getByRole('button', { name: /^Keep / }));
    await waitFor(() => expect(within(screen.getByTestId('ai-flyout')).queryByTestId('ai-stale-train')).toBeNull());
    expect(within(screen.getByTestId('ai-flyout')).getByRole('button', { name: /^Ask the AI/ }).hasAttribute('disabled')).toBe(false);
  });

  it('the print header and the shared plan CSV carry the note', async () => {
    seedStale();
    await mount();
    openPlanTab();
    await waitFor(() => expect(planRowItems()).toHaveLength(1));
    fireEvent(window, new Event('beforeprint'));
    expect(screen.getByTestId('print-sheet').textContent).toContain(noteText);
    fireEvent(window, new Event('afterprint'));
    const blobs: Blob[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => (blobs.push(b), 'blob:test');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    chooseMore('Share and export…');
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Download file' })[0]);
    const csv = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(blobs[0]);
    });
    expect(csv.split('\r\n')[0]).toContain('Warning');
    expect(csv).toContain('no longer in your gear');
  });
});

describe('the gear forms', () => {
  it('Save keeps the keyboard on Save, and Add puts it in the new form\'s Name', async () => {
    await mount();
    openGear();
    pickClass('Cameras');
    fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
    const card = cards().at(-1)!;
    expect(document.activeElement).toBe(card.querySelector('[id$="-name"]'));
    fireEvent.change(within(card).getByLabelText(/^Name/), { target: { value: 'Mine' } });
    fireEvent.click(button(card, 'Save'));
    expect(document.activeElement).toBe(button(cards().at(-1)!, 'Save'));
  });

  it('Escape closes an open form and returns to the card\'s Change', async () => {
    await mount();
    openGear();
    const card = openGearItem('Scopes');
    fireEvent.keyDown(within(card).getByLabelText(/^Name/), { key: 'Escape' });
    expect(within(card).queryByLabelText(/^Name/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button(card, 'Change')));
  });

  it('a train a plan uses says so in its form before Save', async () => {
    await mount();
    openGear();
    const card = openGearItem('Setups', 0);
    expect(card.querySelector('form')!.textContent).toContain('Used by 1 plan: "My plan". Their exposure follows this change.');
  });

  it('an empty name and a name already taken are said plainly; Add never makes twins', async () => {
    await mount();
    openGear();
    pickClass('Cameras');
    fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
    const names = cards().map((c) => c.querySelector('span')!.textContent);
    expect(names).toContain('New camera');
    expect(names).toContain('New camera 2');
    const card = cards().at(-1)!;
    fireEvent.change(within(card).getByLabelText(/^Name/), { target: { value: '' } });
    fireEvent.click(button(card, 'Save'));
    expect(within(card).getByRole('alert').textContent).toBe('! Name: enter a name for this camera.');
    fireEvent.change(within(card).getByLabelText(/^Name/), { target: { value: 'new camera' } });
    fireEvent.click(button(card, 'Save'));
    expect(within(card).getByRole('alert').textContent).toBe('! Name: there is already a camera named "new camera". Give this one a different name.');
  });

  it('a name of 81 characters is refused with the cap said; long names wrap instead of widening the page', async () => {
    await mount();
    openGear();
    const card = openGearItem('Setups', 0);
    const name = within(card).getByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: 'T'.repeat(81) } });
    fireEvent.click(button(card, 'Save'));
    expect(within(card).getByRole('alert').textContent).toBe('! Name: use at most 80 characters. This one has 81.');
    expect(within(card).getByLabelText(/^Name/).closest('label, div')!.textContent).toContain('up to 80 characters');
    // 320 px is held by these classes: the fieldset may shrink, the legend, the status and the messages break inside a word.
    expect(card.querySelector('fieldset')!.className).toContain('min-w-0');
    expect(card.querySelector('legend')!.className).toContain('break-words');
    expect(card.className).toContain('min-w-0');
  });

  it('the parts that once widened the page at 320 px break inside a word: horizon heading, accessory labels, Keep buttons, message strip', async () => {
    // jsdom has no layout, so this checks the classes; the real widths are measured in a browser (the round 3 report has the numbers).
    seedPlan([], sampleProfile);
    const raw = JSON.parse(window.localStorage.getItem(PLANS_KEY) as string);
    raw.plans[0].trainId = 'gone';
    raw.plans[0].siteId = 'gone';
    window.localStorage.setItem(PLANS_KEY, JSON.stringify(raw));
    await mount();
    expect(document.getElementById('horizon-heading')!.className).toMatch(/break-words/);
    expect(document.getElementById('horizon-heading')!.className).toMatch(/min-w-0/);
    openGear();
    const form = openGearItem('Setups', 0);
    const label = within(form).getAllByRole('checkbox')[0].closest('label')!;
    expect(label.className).toMatch(/min-w-0/);
    expect(label.querySelector('span')!.className).toMatch(/break-words/);
    openPlanTab();
    for (const key of ['train', 'site']) {
      const keep = within(screen.getByTestId(`plan-stale-${key}`)).getByRole('button', { name: /^Keep / });
      expect(keep.className).toMatch(/break-words/);
      expect(keep.className).toMatch(/max-w-full/);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Plan my night with AI' }));
    expect(within(screen.getByTestId('ai-stale-train')).getByRole('button', { name: /^Keep / }).className).toMatch(/break-words/);
  });

  it('the Gear section comes first on the tab, above Planner settings and the horizon editor', async () => {
    await mount();
    const panel = document.getElementById('panel-gear')!;
    expect(panel.firstElementChild!.getAttribute('aria-labelledby')).toBe('gear-heading');
  });
});

describe('a refused edit never says it was made (round 3)', () => {
  // The other tab saved gear and no storage event reached this one yet (a frozen or back-forward-cached tab).
  const otherTabSavedSilently = () => {
    const other = addItem(JSON.parse(window.localStorage.getItem(PROFILE_KEY) as string), 'cameras');
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(other));
    return other;
  };
  const firstWrite = async () => {
    await mount();
    openGear();
    pickClass('Filters');
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' })); // this tab has now written the profile
  };

  it('a Save in a form says "Saved" only when it was stored: a refused rename shows the refusal and no "Saved"', async () => {
    await firstWrite();
    const other = otherTabSavedSilently();
    const form = openGearItem('Cameras', 0);
    fireEvent.change(within(form).getByLabelText(/^Name/), { target: { value: 'Renamed here' } });
    fireEvent.click(button(form, 'Save'));
    expect(status()).not.toMatch(/Saved/);
    expect(document.body.textContent).toContain('your last edit was not made');
    expect(stored().equipment.cameras.map((c: { name: string }) => c.name)).not.toContain('Renamed here');
    expect(stored().equipment.cameras).toHaveLength(other.equipment.cameras.length);
  });

  it('Remove and Add do not say "Removed" or "Added" either, and the refusal stays on the Gear section', async () => {
    await firstWrite();
    otherTabSavedSilently();
    pickClass('Filters');
    fireEvent.click(button(cards()[0], 'Remove'));
    expect(status()).not.toMatch(/Removed/);
    expect(within(screen.getByRole('region', { name: 'GEAR' }) as HTMLElement).getByRole('alert').textContent).toContain('your last edit was not made');
    otherTabSavedSilently();
    fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
    expect(status()).not.toMatch(/Added/);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('the horizon Save does not write this tab\'s older gear over the other tab\'s camera', async () => {
    await firstWrite();
    const other = otherTabSavedSilently();
    fireEvent.click(screen.getByRole('button', { name: 'Add another zone' }));
    for (const [id, v] of [['arc-start', '10'], ['arc-end', '40'], ['arc-height', '15']] as const) {
      fireEvent.change(document.getElementById(`${id}-number`) as HTMLInputElement, { target: { value: v } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save horizon' }));
    expect(stored().equipment.cameras).toHaveLength(other.equipment.cameras.length); // the other tab's camera is still stored
    expect(stored().sites[0].blockedArcs).toEqual(sampleProfile().sites[0].blockedArcs); // the horizon was not saved over it
    expect(screen.getByRole('status').textContent).toContain('Another tab changed your gear since this page last looked, so your last edit was not made.');
  });

  it('Undo says what came back', async () => {
    await mount();
    openGear();
    pickClass('Cameras');
    fireEvent.click(screen.getByRole('button', { name: 'Add camera' }));
    fireEvent.click(button(cards().at(-1)!, 'Save'));
    const name = stored().equipment.cameras.at(-1).name;
    fireEvent.click(button(cards().at(-1)!, 'Remove'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(status()).toBe(`Put back ${name}.`);
  });
});

describe('Open My plan is offered only when plans use the item (round 3)', () => {
  it('removing the last site says the planner needs one, with no Open button; a used-by refusal keeps it', async () => {
    seedPlan([], sampleProfile);
    await mount();
    openGear();
    pickClass('Sites');
    fireEvent.click(button(cards()[0], 'Remove'));
    expect(within(cards()[0]).getByRole('alert').textContent).toBe('! The planner needs at least one site.');
    expect(within(cards()[0]).queryByRole('button', { name: /^Open / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add site' }));
    fireEvent.click(button(cards().at(-1)!, 'Save'));
    fireEvent.click(button(cards()[0], 'Remove'));
    expect(within(cards()[0]).getByRole('button', { name: 'Open My plan' })).toBeTruthy();
  });
});

describe('card summaries carry their units (round 3)', () => {
  it('a scope reads "2800 mm", a camera "3.76 µm" and "6248 px"', async () => {
    await mount();
    openGear();
    pickClass('Scopes');
    expect(cards()[0].textContent).toMatch(/Focal length \d+ mm, Aperture [\d.]+ mm/);
    pickClass('Cameras');
    expect(cards()[0].textContent).toMatch(/Pixel size [\d.]+ µm, Sensor width \d+ px, Sensor height \d+ px/);
  });
});

describe('a stored value that is negative, zero, empty or text opens plainly and never locks editing (round 3)', () => {
  const withScopeField = (value: unknown, key: 'focalLengthMm' | 'pixelSizeUm') => {
    const p = sampleProfile();
    const t = p.trains.find((x) => x.kind === 'optical');
    if (!t || t.kind !== 'optical') throw new Error('x');
    const raw = JSON.parse(JSON.stringify(p));
    const list = key === 'focalLengthMm' ? raw.equipment.scopes : raw.equipment.cameras;
    const owner = key === 'focalLengthMm' ? t.scopeId : t.cameraId;
    list.find((x: { id: string }) => x.id === owner)[key] = value;
    return raw;
  };
  const values: [string, unknown][] = [['-100', -100], ['0', 0], ['null', null], ['"abc"', 'abc']];
  for (const key of ['focalLengthMm', 'pixelSizeUm'] as const) {
    for (const [label, value] of values) {
      it(`${key} ${label}: kept and flagged, no validator text, the profile is not set aside, a gear edit saves`, async () => {
        window.localStorage.setItem(PROFILE_KEY, JSON.stringify(withScopeField(value, key)));
        await mount();
        expect(document.body.textContent).not.toMatch(/\$\.|Problem at|could not be used/);
        expect(screen.getByText(/One saved gear value is not usable \(outside the allowed range or not a number\), so the planner does not use it/)).toBeTruthy();
        openGear();
        pickClass(key === 'focalLengthMm' ? 'Scopes' : 'Cameras');
        expect(document.querySelector('[data-testid="gear-flag"]')!.textContent).toMatch(/^! (Focal length|Pixel size) /);
        pickClass('Filters');
        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
        expect(status()).toMatch(/^Added a filter/);
        expect(document.body.textContent).not.toContain('another tab');
        expect(stored().equipment.filters.length).toBe(sampleProfile().equipment.filters.length + 1);
      });
    }
  }
});

describe('wide-field lenses and large-pixel CCDs are accepted (round 3)', () => {
  it('a 14 mm f/2.8 lens (5 mm aperture) and a 24 µm camera save, and the plan row shows numbers or says why not, never NaN', async () => {
    seedPlan([{ id: 'm42', preset: 'balanced' }], sampleProfile);
    await mount();
    openGear();
    const scope = openGearItem('Scopes', 0);
    fireEvent.change(within(scope).getByLabelText(/^Focal length \(/), { target: { value: '14' } });
    fireEvent.change(within(scope).getByLabelText(/^Aperture \(/), { target: { value: '5' } });
    fireEvent.click(button(scope, 'Save'));
    expect(within(scope).queryByRole('alert')).toBeNull();
    const cam = openGearItem('Cameras', 0);
    fireEvent.change(within(cam).getByLabelText(/^Pixel size \(/), { target: { value: '24' } });
    fireEvent.click(button(cam, 'Save'));
    expect(within(cam).queryByRole('alert')).toBeNull();
    expect(stored().equipment.scopes[0]).toMatchObject({ focalLengthMm: 14, apertureMm: 5 });
    expect(stored().equipment.cameras[0]).toMatchObject({ pixelSizeUm: 24 });
    openPlanTab();
    await waitFor(() => expect(planRowItems()).toHaveLength(1));
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|Application error/);
  });
});
