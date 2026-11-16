/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SELECTION_KEY, sampleProfile } from '@/planner/state';
import { FAVORITES_BACKUP_PREFIX, FAVORITES_KEY, listFavoritesBackups } from '@/planner/state/favorites';
import type { Favorite } from '@/planner/state/favorites';
import PlannerApp from './PlannerApp';
import { RESET_LOSES } from './ResetAll';
import { openGear, openPlanTab, pageProps, planRowItems, ready, resetAll, seedPlan, storedPlan } from './testkit';

// Favorites: "Save as favorite" on a deep-sky row, "Restore favorite?" when the object is added again, "Always use my saved exposure" in the
// Gear and site tab, and a store that never loses what it holds (damaged, newer, failed copy, quota, two tabs).

const NAME = 'Andromeda Galaxy';
const fav = (id: string, extra: Partial<Favorite> = {}): Favorite => ({
  id,
  preset: 'custom',
  base: 'deep',
  subSeconds: 90,
  subCount: 20,
  filterName: 'No filter',
  trainName: sampleProfile().trains[0].name,
  savedAt: '2026-12-01T00:00:00.000Z',
  ...extra,
});
const store = (...favorites: Favorite[]) => JSON.stringify({ version: 1, favorites });
const storedFavorites = (): { id: string; preset: string; subSeconds: number; subCount: number; filterName: string; trainName: string }[] =>
  (JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? '{"favorites":[]}') as { favorites: never[] }).favorites;
const m31 = { id: 'm31', preset: 'balanced' };
const ic405 = { id: 'ic405', preset: 'balanced' };

const app = async (targets?: readonly object[]) => {
  if (targets) seedPlan(targets, sampleProfile);
  const r = render(<PlannerApp {...pageProps} initialDate="2026-12-15" initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const saveBox = (id: string) => document.getElementById(`plan-fav-${id}`) as HTMLInputElement;
const tag = (li: HTMLElement) => within(li).queryByText('Favorite saved');
const numbers = (id: string) => screen.getByTestId(`plan-numbers-${id}`).textContent ?? '';
const group = (name: string) => screen.getByRole('group', { name: `Exposure preset for ${name}` });
const press = (name: string, preset: string) => fireEvent.click(within(group(name)).getByRole('button', { name: preset }));
const askLine = (id: string) => screen.queryByTestId(`plan-favorite-ask-${id}`);
const status = () => screen.queryByRole('status')?.textContent ?? '';
const messages = () => screen.queryByTestId('plans-messages')?.textContent ?? '';
const storageEvent = (key: string | null, newValue: string | null) =>
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
  });
/** Adds a target found by its name in Find a target's search box. */
const addFromList = async (name: string) => {
  const u = userEvent.setup();
  await u.clear(screen.getByLabelText('Search the catalog by name or number'));
  await u.type(screen.getByLabelText('Search the catalog by name or number'), name);
  await u.click(within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', { name: `Add ${name} to the plan` }));
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('Save as favorite', () => {
  it('saves the row\'s exposure with the filter and train names, shows "Favorite saved", and writes only a valid store', async () => {
    await app([{ id: 'm31', preset: 'deep' }, ic405]);
    const before = numbers('m31');
    expect(saveBox('m31').checked).toBe(false);
    expect(tag(planRowItems()[0])).toBeNull();
    fireEvent.click(saveBox('m31'));
    expect(saveBox('m31').checked).toBe(true);
    expect(tag(planRowItems()[0])).toBeTruthy();
    expect(tag(planRowItems()[1])).toBeNull();
    const saved = storedFavorites();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: 'm31', preset: 'deep', filterName: 'No filter', trainName: sampleProfile().trains[0].name });
    expect(before).toMatch(new RegExp(`^${saved[0].subSeconds} s × ${saved[0].subCount} subs`));
  });

  it('a Custom row saves its own numbers and the preset they came from', async () => {
    await app([{ id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90, subCount: 20 } }]);
    fireEvent.click(saveBox('m31'));
    expect(storedFavorites()[0]).toMatchObject({ id: 'm31', preset: 'custom', base: 'deep', subSeconds: 90, subCount: 20 });
  });

  it('a solar-system row has no favorite box', async () => {
    await app([{ id: 'planet-jupiter', preset: 'balanced' }]);
    expect(saveBox('planet-jupiter')).toBeNull();
  });

  it('unchecking removes nothing until "Remove favorite" is pressed (a 44 px button), and then only that favorite', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31'), fav('ic405')));
    await app([m31, ic405]);
    expect(saveBox('m31').checked).toBe(true);
    fireEvent.click(saveBox('m31'));
    expect(storedFavorites().map((f) => f.id)).toEqual(['m31', 'ic405']); // nothing is lost by the click alone
    expect(saveBox('m31').checked).toBe(true);
    const keep = screen.getByRole('button', { name: 'Keep it' });
    fireEvent.click(keep);
    expect(screen.queryByRole('button', { name: 'Remove favorite' })).toBeNull();
    expect(storedFavorites()).toHaveLength(2);
    fireEvent.click(saveBox('m31'));
    const remove = screen.getByRole('button', { name: 'Remove favorite' });
    expect(remove.className).toMatch(/min-h-11/);
    expect(remove.className).toMatch(/min-w-11/);
    fireEvent.click(remove);
    expect(storedFavorites().map((f) => f.id)).toEqual(['ic405']);
    expect(saveBox('m31').checked).toBe(false);
    expect(tag(planRowItems()[0])).toBeNull();
    expect(tag(planRowItems()[1])).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(saveBox('m31')));
  });

  it('a favorite whose row changed since can be updated to the row\'s numbers, and only then does it change', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app([m31]);
    const update = screen.getByRole('button', { name: 'Update favorite to these numbers' });
    expect(storedFavorites()[0]).toMatchObject({ subSeconds: 90, subCount: 20 });
    fireEvent.click(update);
    expect(storedFavorites()[0]).toMatchObject({ subSeconds: 90, subCount: 20 }); // it asks first
    fireEvent.click(screen.getByRole('button', { name: 'Update favorite' }));
    const n = /^(\d+(?:\.\d+)?) s × (\d+) subs/.exec(numbers('m31'))!;
    expect(storedFavorites()[0]).toMatchObject({ id: 'm31', preset: 'balanced', subSeconds: Number(n[1]), subCount: Number(n[2]) });
    expect(storedFavorites()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Update favorite to these numbers' })).toBeNull();
  });
});

describe('Restore favorite?', () => {
  it('adding a target that has a favorite shows one line with Restore and Not now; nothing is applied until Restore', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app();
    await addFromList(NAME);
    expect(askLine('m31')!.textContent).toBe('You saved an exposure for this object: Custom (from Deep), 90 s × 20 (30 min). Restore favorite?RestoreNot now');
    expect(within(askLine('m31')!).getByRole('button', { name: 'Restore' })).toBeTruthy();
    expect(within(askLine('m31')!).getByRole('button', { name: 'Not now' })).toBeTruthy();
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced', favorite: 'ask' });
    expect(numbers('m31')).not.toMatch(/^90 s × 20 subs/);
    expect(screen.getAllByText(/Restore favorite\?/)).toHaveLength(1);
  });

  it('Restore applies it as Custom with the saved numbers, says nothing more, and puts the keyboard on the favorite box', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app();
    await addFromList(NAME);
    fireEvent.click(within(askLine('m31')!).getByRole('button', { name: 'Restore' }));
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90, subCount: 20 } });
    expect(numbers('m31')).toMatch(/^90 s × 20 subs · 30 min of light/);
    expect(askLine('m31')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(saveBox('m31')));
  });

  it('a favorite that equals a preset\'s numbers comes back as that preset, not as Custom', async () => {
    await app([m31]);
    press(NAME, 'Deep');
    const deep = /^(\d+(?:\.\d+)?) s × (\d+) subs/.exec(numbers('m31'))!;
    fireEvent.click(saveBox('m31'));
    fireEvent.click(screen.getByRole('button', { name: `Remove ${NAME} from the plan` }));
    await addFromList(NAME);
    expect(storedPlan()!.targets[0].favorite).toBe('ask');
    fireEvent.click(within(askLine('m31')!).getByRole('button', { name: 'Restore' }));
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'deep' });
    expect(numbers('m31')).toMatch(new RegExp(`^${deep[1]} s × ${deep[2]} subs`));
  });

  it('"Not now" applies nothing and is remembered for that row, also after a reload', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    const first = await app();
    await addFromList(NAME);
    fireEvent.click(within(askLine('m31')!).getByRole('button', { name: 'Not now' }));
    expect(askLine('m31')).toBeNull();
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced' });
    expect(tag(planRowItems()[0])).toBeTruthy(); // the favorite is still there to use
    first.unmount();
    await app();
    expect(askLine('m31')).toBeNull();
  });

  it('the question is asked only when the target is added: a favorite saved from the row afterwards does not ask again', async () => {
    await app([m31]);
    fireEvent.click(saveBox('m31'));
    press(NAME, 'Quick');
    expect(askLine('m31')).toBeNull();
  });

  it('a target with no favorite is added plainly, and Add top 3 asks for each that has one', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('ic405')));
    await app();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add top 3 to the plan' }));
    const ids = storedPlan()!.targets.map((t) => t.id);
    expect(ids).toHaveLength(3);
    expect(storedPlan()!.targets.filter((t) => t.favorite === 'ask').map((t) => t.id)).toEqual(ids.filter((i) => i === 'ic405'));
  });
});

describe('Always use my saved exposure', () => {
  it('is a labelled checkbox under "Planner settings" in the Gear and site tab, off by default, kept with the site and train choice', async () => {
    await app();
    openGear();
    const heading = screen.getByRole('heading', { name: 'Planner settings' });
    const box = within(heading.closest('section')!).getByRole('checkbox', { name: 'Always use my saved exposure' }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.closest('label')!.className).toMatch(/min-h-11/);
    fireEvent.click(box);
    expect(box.checked).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY)!)).toMatchObject({ alwaysRestore: true });
  });

  it('is on after a reload when it was left on, and off again when it is turned off', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: sampleProfile().sites[0].id, trainId: sampleProfile().trains[0].id, alwaysRestore: true }));
    await app();
    openGear();
    const box = screen.getByRole('checkbox', { name: 'Always use my saved exposure' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY)!).alwaysRestore).toBeUndefined();
  });

  it('applies the favorite when the target is added, and the row line says so; a later change of the numbers takes the line away', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: sampleProfile().sites[0].id, trainId: sampleProfile().trains[0].id, alwaysRestore: true }));
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app();
    await addFromList(NAME);
    expect(askLine('m31')).toBeNull();
    expect(screen.getByTestId('plan-favorite-restored-m31').textContent).toBe('Your saved exposure for this object was restored automatically: Custom (from Deep), 90 s × 20 (30 min).');
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90, subCount: 20 }, favorite: 'restored' });
    expect(numbers('m31')).toMatch(/^90 s × 20 subs/);
    press(NAME, 'Quick');
    expect(screen.queryByTestId('plan-favorite-restored-m31')).toBeNull();
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'quick' });
  });

  it('with the setting off a favorite is only asked about', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app();
    await addFromList(NAME);
    expect(screen.queryByTestId('plan-favorite-restored-m31')).toBeNull();
    expect(askLine('m31')).toBeTruthy();
  });
});

describe('the favorites store never loses what it holds', () => {
  it('damaged text is copied to a dated key first, said once, and saving then works', async () => {
    const damaged = '{"version":1,"favorites":[{"id":"m31","subSeconds":-4';
    window.localStorage.setItem(FAVORITES_KEY, damaged);
    await app([m31]);
    const copies = listFavoritesBackups(window.localStorage);
    expect(copies).toHaveLength(1);
    expect(copies[0].text).toBe(damaged);
    expect(copies[0].key.startsWith(FAVORITES_BACKUP_PREFIX)).toBe(true);
    expect(messages()).toMatch(/Your saved favorite exposures could not be read \(it is not valid JSON\), so they start over\. A copy of them as they were is kept under the backup name "fpo-planner-favorites-v1\.bak\.\d+"; 1 copy is kept/);
    expect(saveBox('m31').disabled).toBe(false);
    fireEvent.click(saveBox('m31'));
    expect(storedFavorites()).toHaveLength(1);
    expect(listFavoritesBackups(window.localStorage)[0].text).toBe(damaged); // the copy stays
  });

  it('a field that fails the check counts as damaged too, and names the field', async () => {
    const text = store(fav('m31', { subCount: 0 }));
    window.localStorage.setItem(FAVORITES_KEY, text);
    await app([m31]);
    expect(listFavoritesBackups(window.localStorage)[0].text).toBe(text);
    expect(messages()).toMatch(/\$\.favorites\[0\]\.subCount/);
  });

  it('a newer version is held: saving is off with a plain message, and the stored text is never written over', async () => {
    const newer = JSON.stringify({ version: 2, favorites: [{ id: 'm31', future: true }] });
    window.localStorage.setItem(FAVORITES_KEY, newer);
    await app([m31]);
    expect(saveBox('m31').disabled).toBe(true);
    expect(screen.getByTestId('plan-favorite-blocked-m31').textContent).toMatch(/made by a newer version of the planner, so saving favorites is off here and nothing stored is changed/);
    fireEvent.click(saveBox('m31'));
    press(NAME, 'Deep'); // other edits are fine
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(newer);
    expect(listFavoritesBackups(window.localStorage)).toHaveLength(0);
    openGear();
    expect(screen.getByTestId('favorites-blocked').textContent).toMatch(/newer version/);
  });

  it('when the copy of damaged text cannot be made the text is held, not written over', async () => {
    const damaged = '{"version":1,"favorites":[{';
    window.localStorage.setItem(FAVORITES_KEY, damaged);
    const set = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith(FAVORITES_BACKUP_PREFIX)) throw new Error('quota');
      return set.call(this, k, v);
    });
    await app([m31]);
    expect(saveBox('m31').disabled).toBe(true);
    expect(screen.getByTestId('plan-favorite-blocked-m31').textContent).toMatch(/could not be read whole, and a copy of them could not be kept first/);
    expect(messages()).toMatch(/The copy of your damaged favorites failed: quota/);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(damaged);
  });

  it('a write that fails (quota) is said, nothing is shown as saved, and what was stored stays', async () => {
    const before = store(fav('ic405'));
    window.localStorage.setItem(FAVORITES_KEY, before);
    await app([m31, ic405]);
    const set = Storage.prototype.setItem;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === FAVORITES_KEY) throw new Error('quota');
      return set.call(this, k, v);
    });
    fireEvent.click(saveBox('m31'));
    expect(status()).toMatch(/Favorite not saved: quota/);
    expect(saveBox('m31').checked).toBe(false);
    expect(tag(planRowItems()[0])).toBeNull();
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(before);
    expect(tag(planRowItems()[1])).toBeTruthy(); // the one that was saved is still there
  });

  it('another tab\'s favorites appear here at once, and a save from here starts from them, not from what this page read', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app([m31, ic405]);
    const other = store(fav('m31'), fav('ic405', { subCount: 40 }));
    window.localStorage.setItem(FAVORITES_KEY, other);
    storageEvent(FAVORITES_KEY, other);
    expect(tag(planRowItems()[1])).toBeTruthy();
    // A save made from this tab while the other tab saved once more (no event reaches this one): both are kept.
    const third = store(fav('m31'), fav('ic405', { subCount: 40 }), fav('m42'));
    window.localStorage.setItem(FAVORITES_KEY, third);
    fireEvent.click(within(planRowItems()[1]).getByRole('button', { name: 'Update favorite to these numbers' }));
    fireEvent.click(within(planRowItems()[1]).getByRole('button', { name: 'Update favorite' }));
    expect(storedFavorites().map((f) => f.id).sort()).toEqual(['ic405', 'm31', 'm42']);
  });

  it('another tab\'s newer or unreadable text holds this page at once; nothing is written over it', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app([m31, ic405]);
    const newer = JSON.stringify({ version: 3, favorites: [] });
    window.localStorage.setItem(FAVORITES_KEY, newer);
    storageEvent(FAVORITES_KEY, newer);
    expect(saveBox('ic405').disabled).toBe(true);
    expect(screen.getAllByTestId(/^plan-favorite-blocked-/)[0].textContent).toMatch(/newer version/);
    fireEvent.click(saveBox('ic405'));
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(newer);
    // Readable favorites from the other tab release the hold.
    const fixed = store(fav('ic405'));
    window.localStorage.setItem(FAVORITES_KEY, fixed);
    storageEvent(FAVORITES_KEY, fixed);
    expect(saveBox('ic405').disabled).toBe(false);
    expect(saveBox('ic405').checked).toBe(true);
    expect(saveBox('m31').checked).toBe(false);
  });

  it('text that turns unreadable between this page\'s reads is held on the next save, with the stored bytes untouched', async () => {
    await app([m31]);
    window.localStorage.setItem(FAVORITES_KEY, 'not json at all'); // another tab; no event reaches this page
    fireEvent.click(saveBox('m31'));
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe('not json at all');
    expect(saveBox('m31').disabled).toBe(true);
    expect(screen.getByTestId('plan-favorite-blocked-m31').textContent).toMatch(/Another tab saved favorite exposures this page cannot use/);
  });

  it('the favorites cleared in another tab are cleared here too', async () => {
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    await app([m31]);
    expect(saveBox('m31').checked).toBe(true);
    window.localStorage.removeItem(FAVORITES_KEY);
    storageEvent(FAVORITES_KEY, null);
    expect(saveBox('m31').checked).toBe(false);
  });

  it('Reset all names the favorites it clears, and clears them with their copies', async () => {
    expect(RESET_LOSES.some((l) => /favorite exposures/.test(l))).toBe(true);
    window.localStorage.setItem(FAVORITES_KEY, store(fav('m31')));
    window.localStorage.setItem(`${FAVORITES_BACKUP_PREFIX}123`, 'old copy');
    await app([m31]);
    openGear();
    await resetAll(userEvent.setup());
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(window.localStorage.getItem(`${FAVORITES_BACKUP_PREFIX}123`)).toBeNull();
    openPlanTab();
    expect(planRowItems()).toHaveLength(0);
  });
});
