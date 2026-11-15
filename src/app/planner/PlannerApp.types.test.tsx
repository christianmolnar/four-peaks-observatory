/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { arcToHorizonPoints } from '@/planner/profile';
import { planTonight, planTrainFor } from '@/planner/plan';
import type { PlanTarget } from '@/planner/plan';
import { DEFAULT_MIN_ALTITUDE, MAX_MY_PLAN, MY_PLAN_KEY, SELECTION_KEY, sampleProfile } from '@/planner/state';
import { inSizeBand } from '@/planner/plan/rank';
import { TYPE_GROUPS } from '@/planner/plan/type-groups';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, listRows, openGear, openPlanTab, ready, resetAll, rowNames, showAll, storedPlan } from './testkit';

// "Best [type] tonight": the Type selector over the catalog's real types, each ranked over the whole catalog.

const DATE = '2026-12-15';
const WORD = 'Tue 15 Dec';
const profile = (trainId = 'deep-c11-reducer-533') => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === trainId ? -1 : 1)) };
};

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));

// A small catalog: five open clusters up in December evenings, one globular that never rises here, one up, a planetary nebula, and a
// supernova remnant far larger than the train's frame.
const obj = (id: string, name: string, type: CatalogObject['type'], raHours: number, decDeg: number, size: number, mag: number): CatalogObject =>
  ({ id, name, type, raHours, decDeg, majorArcmin: size, minorArcmin: size, mag, constellation: 'Tst' }) as CatalogObject;
const SMALL: CatalogObject[] = [
  obj('tc1', 'Test Cluster 1', 'open-cluster', 5.9, 32, 9, 5.2),
  obj('tc2', 'Test Cluster 2', 'open-cluster', 6.1, 24, 8, 6.2),
  obj('tc3', 'Test Cluster 3', 'open-cluster', 2.7, 42, 9, 7.2),
  obj('tc4', 'Test Cluster 4', 'open-cluster', 5.6, 34, 8, 8.2),
  obj('tc5', 'Test Cluster 5', 'open-cluster', 1.3, 58, 7, 9.2),
  obj('tg-south', 'Southern Globular', 'globular-cluster', 13.4, -80, 9, 6),
  obj('tg-up', 'Evening Globular', 'globular-cluster', 21.5, 12, 8, 6.4),
  obj('tpn', 'Test Planetary', 'planetary-nebula', 5.5, 28, 6, 7.4),
  obj('tsnr', 'Big Remnant', 'supernova-remnant', 20.76, 30.7, 180, 7),
];

function mount(opts: { objects?: CatalogObject[]; hold?: boolean; trainId?: string } = {}) {
  const catalog = fakeCatalog(opts.objects ?? SMALL);
  const worker = fakeWorkerRanker(catalog.load, { hold: opts.hold ?? false });
  const view = render(<PlannerApp initialDate={DATE} initialProfile={profile(opts.trainId)} rank={worker.rank} loadCatalogIndex={catalog.load} loadAuth={async () => ({ kind: 'signedOut' })} />);
  return { ...view, catalog, worker };
}
const typeSelect = () => screen.getByLabelText('Type') as HTMLSelectElement;
const optionText = (id: string) => (typeSelect().querySelector(`option[value="${id}"]`) as HTMLOptionElement).textContent ?? '';
const optionCount = (id: string): number => Number(/· (\d+) (?:up|fit)/.exec(optionText(id))?.[1] ?? 'NaN');
const heading = () => screen.getByRole('heading', { level: 2, name: /^Best / }).textContent;
const stored = () => {
  const p = storedPlan();
  return p === null ? null : { ids: p.targets.map((t) => t.id) };
};
/** The whole-number score in a row's fit-and-score cell. */
const scoreOf = (row: HTMLElement): number => Number(/Score (\d+)/.exec(within(row).getByTestId('row-fit-score').textContent ?? '')?.[1]);
const live = () => document.querySelector('p[aria-live="polite"].sr-only')?.textContent ?? '';
const choose = async (id: string) => {
  await userEvent.setup().selectOptions(typeSelect(), id);
};
/** Waits for the list of the chosen type to be on the page. */
const listed = async () => {
  await screen.findByTestId('target-list', {}, { timeout: 20000 });
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the Type selector', () => {
  it('is the one control for the list: All, the catalog types by their plain names, Solar system; none for double stars or asterisms', async () => {
    mount();
    await ready();
    expect(screen.getAllByLabelText('Type')).toHaveLength(1);
    expect([...typeSelect().options].map((o) => (o.textContent ?? '').split(' · ')[0])).toEqual(TYPE_GROUPS.map((g) => g.label));
    expect(typeSelect().value).toBe('all');
    expect(screen.queryByRole('option', { name: /double|asterism/i })).toBeNull();
  });

  it('counts each choice for the night and train: how many are up and fit, none up is shown and not pickable', async () => {
    mount();
    await ready();
    expect(optionCount('open-clusters')).toBe(5);
    expect(optionCount('planetary-nebulae')).toBe(1);
    expect(optionText('open-clusters')).toBe(`Open clusters · 5 fit ${WORD}`);
    // Up but larger than this frame: said so, and still pickable (the list below explains it).
    expect(optionText('supernova-remnants')).toBe('Supernova remnants · 1 up, none fit this frame');
    expect((screen.getByRole('option', { name: /^Supernova remnants/ }) as HTMLOptionElement).disabled).toBe(false);
    // Nothing up at all: said so, not pickable, and the reason is in the option's title.
    expect(optionText('galaxy-groups')).toBe(`Galaxy groups and pairs · none up ${WORD}`);
    const none = screen.getByRole('option', { name: /^Galaxy groups and pairs/ }) as HTMLOptionElement;
    expect(none.disabled).toBe(true);
    expect(none.title).toMatch(/nothing of this kind is up long enough/i);
    expect((screen.getByRole('option', { name: /^Open clusters/ }) as HTMLOptionElement).disabled).toBe(false);
    expect(optionCount('all')).toBeGreaterThanOrEqual(optionCount('open-clusters') + optionCount('planetary-nebulae'));
  });

  it('a type that is up but all larger than the frame is selectable, says so, and honours the do-not-fit toggle', async () => {
    mount();
    await ready();
    await choose('supernova-remnants');
    await screen.findByTestId('list-empty');
    expect(screen.getByTestId('list-empty').textContent).toBe(`No supernova remnants that fit this frame are up ${WORD}: 1 larger than this frame.`);
    expect(typeSelect().value).toBe('supernova-remnants');
    fireEvent.click(screen.getByLabelText(/show targets that do not fit/i));
    await screen.findByRole('button', { name: /^Does not fit this frame \(1\)/ });
    expect(screen.getByTestId('list-empty').textContent).toMatch(/They are listed below\.$/);
  });

  it('the counts follow the night: another date counts again, and none is shown stale while it is worked out', async () => {
    const { worker } = mount({ hold: true });
    await act(async () => { await worker.release(); });
    await ready();
    expect(optionCount('open-clusters')).toBe(5);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-06-15' } });
    expect(optionText('open-clusters')).toBe('Open clusters'); // no count until the new night is ranked
    await act(async () => { await worker.release(); });
    await screen.findByTestId('target-list');
    expect(optionText('open-clusters')).toMatch(/· (\d+ fit|none up) Mon 15 Jun/);
    expect(optionCount('open-clusters')).toBeLessThan(5);
  });
});

describe('the list for a type', () => {
  it('heading follows the choice, with the night word: "Best open clusters for tonight" on the real tonight, the date otherwise', async () => {
    mount();
    await ready();
    expect(heading()).toBe(`Best targets for ${WORD}`);
    await choose('open-clusters');
    await listed();
    expect(heading()).toBe(`Best open clusters for ${WORD}`);
    await choose('solar-system');
    expect(heading()).toBe(`Best Moon and planets for ${WORD}`);
    await choose('nebulae');
    expect(screen.getByTestId('type-note').textContent).toMatch(/emission, reflection, HII and dark nebulae, and clusters with nebulae/i);
  });

  it('ranks the type best to worst with the same score, why line and fit as the mixed list, and nothing of another type', async () => {
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    expect(rowNames()).toEqual(['Test Cluster 1', 'Test Cluster 2', 'Test Cluster 3', 'Test Cluster 4', 'Test Cluster 5']);
    const scores = listRows().map(scoreOf);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    for (const r of listRows()) expect(r.textContent).toMatch(/Open cluster/);
    expect(screen.getByTestId('score-note').textContent).not.toMatch(/not strictly in score order/);
    expect(screen.getByTestId('score-note').textContent).toMatch(/best first/);
    // The same rows in the mixed list carry the same score text.
    await choose('all');
    await listed();
    showAll();
    const mixed = listRows().find((r) => /Test Cluster 1/.test(r.textContent ?? '')) as HTMLElement;
    const one = within(mixed).getByTestId('row-fit-score').textContent;
    await choose('open-clusters');
    await listed();
    expect(within(listRows()[0]).getByTestId('row-fit-score').textContent).toBe(one);
  });

  it('shows no Solar system group under a deep-sky type, and the Solar system choice shows only that group', async () => {
    mount();
    await ready();
    await choose('globular-clusters');
    await listed();
    expect(screen.queryByRole('button', { name: /^Solar system up/ })).toBeNull();
    expect(rowNames()).toContain('Evening Globular'); // with the curated Hercules cluster, which the catalog always holds
    expect(rowNames()).not.toContain('Test Cluster 1');
    await choose('solar-system');
    expect(screen.getByRole('button', { name: /^Solar system up/ })).toBeTruthy();
    expect(screen.queryByTestId('target-list')).toBeNull();
  });

  it('says why a type is empty: nothing up long enough, or everything up is larger than this frame, and the do-not-fit toggle lists it', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'fountain-hills', trainId: 'deep-c11-reducer-533', typeId: 'supernova-remnants' }));
    mount();
    const empty = await screen.findByTestId('list-empty', {}, { timeout: 20000 });
    expect(empty.textContent).toBe(`No supernova remnants that fit this frame are up ${WORD}: 1 larger than this frame.`);
    expect(screen.getByTestId('hidden-note').textContent).toMatch(/Big Remnant does not fit this frame/);
    fireEvent.click(screen.getByRole('checkbox', { name: /Show targets that do not fit/ }));
    await screen.findByRole('button', { name: /^Does not fit this frame \(1\)/ });
    expect(screen.getByTestId('list-empty').textContent).toMatch(/They are listed below\.$/);
    expect(screen.getByTestId('hidden-note').textContent).toMatch(/Showing 1 targets that do not fit/);
  });

  it('a type with nothing up at all says so in plain words', async () => {
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: 'fountain-hills', trainId: 'deep-c11-reducer-533', typeId: 'galaxy-groups' }));
    mount();
    const empty = await screen.findByTestId('list-empty', {}, { timeout: 20000 });
    expect(empty.textContent).toBe(`No galaxy groups and pairs are up long enough ${WORD}, above your horizon and minimum altitude.`);
    expect(typeSelect().value).toBe('galaxy-groups'); // the chosen one stays pickable and chosen
  });
});

describe('adding from a type list', () => {
  it('Add puts the row in the plan, the row says In plan, and the choice is stored', async () => {
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    const u = userEvent.setup();
    await u.click(within(listRows()[0]).getByRole('button', { name: 'Add Test Cluster 1 to the plan' }));
    expect(stored()?.ids).toEqual(['tc1']);
    expect(within(listRows()[0]).getByRole('button', { name: 'Test Cluster 1 is in the plan' }).textContent).toBe('In plan');
    expect(live()).toBe('Test Cluster 1 added, number 1 in the plan.');
  });

  it('Add top 3 adds the first three not already in the plan, in list order, and says what it added', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['tc1'] }));
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Add top 3 to the plan' }));
    expect(stored()?.ids).toEqual(['tc1', 'tc2', 'tc3', 'tc4']);
    expect(live()).toBe('Added 3 to the plan, #2 to #4: Test Cluster 2, Test Cluster 3 and Test Cluster 4.');
    expect(screen.getByTestId('top-three').textContent).toMatch(/Added 3, #2 to #4 in the plan\./);
    expect(within(listRows()[3]).getByRole('button', { name: 'Test Cluster 4 is in the plan' })).toBeTruthy();
    expect(within(listRows()[4]).getByRole('button', { name: 'Add Test Cluster 5 to the plan' })).toBeTruthy();
  });

  it('Add top 3 is a button: Enter on the focused button adds, and the live region announces it', async () => {
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    const u = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Add top 3 to the plan' });
    button.focus();
    await u.keyboard('{Enter}');
    expect(stored()?.ids).toEqual(['tc1', 'tc2', 'tc3']);
    expect(live()).toMatch(/^Added 3 to the plan, #1 to #3: /);
    expect(document.querySelector('p[aria-live="polite"].sr-only')?.getAttribute('aria-live')).toBe('polite');
  });

  it('Add top 3 is disabled, and says why, when the plan is full; with room for one it adds one and says the rest were not added', async () => {
    const full = Array.from({ length: MAX_MY_PLAN }, (_, i) => `x${i}`);
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: full }));
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    const button = screen.getByRole('button', { name: 'Add top 3 to the plan' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByTestId('top-three').textContent).toMatch(/The plan is full \(50 targets\)\. Remove one to add more\./);
    cleanup();
    window.localStorage.clear(); // the first visit moved the old list into a saved plan; start over for the second
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: full.slice(0, MAX_MY_PLAN - 1) }));
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add top 3 to the plan' }));
    expect(stored()?.ids).toHaveLength(MAX_MY_PLAN);
    expect(stored()?.ids[MAX_MY_PLAN - 1]).toBe('tc1');
    expect(live()).toMatch(/The plan is full: 2 not added\.$/);
  });

  it('Add top 3 is disabled when everything in the list is already in the plan', async () => {
    window.localStorage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids: ['tc1', 'tc2', 'tc3', 'tc4', 'tc5'] }));
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    expect((screen.getByRole('button', { name: 'Add top 3 to the plan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('top-three').textContent).toMatch(/already in the plan/);
  });
});

describe('the choice is remembered with the train', () => {
  it('is stored with the site and train, restored on the next visit, and a type that no longer exists is All', async () => {
    const first = mount();
    await ready();
    await choose('planetary-nebulae');
    await listed();
    const saved = JSON.parse(window.localStorage.getItem(SELECTION_KEY) as string);
    expect(saved).toMatchObject({ trainId: 'deep-c11-reducer-533', typeId: 'planetary-nebulae' });
    first.unmount();
    mount();
    await listed();
    expect(typeSelect().value).toBe('planetary-nebulae');
    expect(heading()).toBe(`Best planetary nebulae for ${WORD}`);
    cleanup();
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ ...saved, typeId: 'deep-sky' }));
    mount();
    await ready();
    expect(typeSelect().value).toBe('all');
  });

  it('a pick of another train keeps the type, and Reset all puts it back to All', async () => {
    mount();
    await ready();
    await choose('open-clusters');
    await listed();
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'wide-c11-hyperstar-2600' } });
    expect(JSON.parse(window.localStorage.getItem(SELECTION_KEY) as string)).toMatchObject({ trainId: 'wide-c11-hyperstar-2600', typeId: 'open-clusters' });
    openGear();
    await resetAll(userEvent.setup());
    openPlanTab();
    expect(typeSelect().value).toBe('all');
    expect(window.localStorage.getItem(SELECTION_KEY)).toBeNull();
  });
});

describe('fast changes', () => {
  it('ranks by type in the worker (the type is in the request), and shows no list of the old type while the new one is worked out', async () => {
    const { worker } = mount({ hold: true });
    await act(async () => { await worker.release(); });
    await ready();
    expect(worker.requests.at(-1)?.query.types).toBeUndefined();
    await choose('open-clusters');
    expect(worker.requests.at(-1)?.query.types).toEqual(['open-cluster']);
    expect(screen.queryByTestId('target-list')).toBeNull();
    expect(screen.getByText(/Ranking the whole catalog for/)).toBeTruthy();
    await act(async () => { await worker.release(); });
    await listed();
    expect(rowNames()).toEqual(['Test Cluster 1', 'Test Cluster 2', 'Test Cluster 3', 'Test Cluster 4', 'Test Cluster 5']);
  });

  it('changing the type three times before any answer leaves the last choice on screen, whatever order the answers come in', async () => {
    const { worker } = mount({ hold: true });
    await act(async () => { await worker.release(); });
    await ready();
    const u = userEvent.setup();
    await u.selectOptions(typeSelect(), 'open-clusters');
    await u.selectOptions(typeSelect(), 'globular-clusters');
    await u.selectOptions(typeSelect(), 'planetary-nebulae');
    expect(worker.requests.slice(-3).map((r) => r.query.types)).toEqual([['open-cluster'], ['globular-cluster'], ['planetary-nebula']]);
    await act(async () => { await worker.release(); });
    await listed();
    expect(rowNames()).toEqual(['Test Planetary']);
    expect(heading()).toBe(`Best planetary nebulae for ${WORD}`);
    expect(typeSelect().value).toBe('planetary-nebulae');
  });

  it('All and Solar system share one ranking: moving between them asks the worker nothing', async () => {
    const { worker } = mount();
    await ready();
    const n = worker.requests.length;
    await choose('solar-system');
    await choose('all');
    expect(worker.requests).toHaveLength(n);
  });
});

describe('over the real catalog', () => {
  // Every night here is worked out by the real engine, so the counts are checked against a count made straight from the catalog:
  // each type's objects planned alone by `planTonight` and kept when they are up and in the frame's size band.
  const direct = (targets: readonly PlanTarget[], types: readonly string[], trainId?: string, sized = true) => {
    const p = profile(trainId);
    const site = p.sites[0];
    const train = planTrainFor(p, p.trains[0]);
    const mine = targets.filter((t) => types.includes(t.type));
    const plan = planTonight({
      site: { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM },
      horizon: site.blockedArcs.length > 0 ? arcToHorizonPoints(site.blockedArcs) : null,
      minAltitude: DEFAULT_MIN_ALTITUDE,
      date: DATE,
      timeZone: site.timeZone,
      train,
      targets: mine,
      includePlanets: false,
    });
    const byId = new Map(mine.map((t) => [t.id, t]));
    return plan.entries.filter((e) => e.usableMinutes > 0 && (!sized || inSizeBand(train, byId.get(e.id) as PlanTarget, { includeTooLarge: false, minFramePercent: 3 })));
  };

  it('on a planetary train, every type that is up reads truthfully and can be opened: Supernova remnants are up but larger than the 3.5 arcmin frame', async () => {
    const trainId = 'planet-c11-powermate-676';
    const { catalog } = mount({ objects: raw.objects, trainId });
    await ready();
    const targets = (await catalog.load()).targets;
    for (const g of TYPE_GROUPS.filter((x) => x.types !== undefined)) {
      const fit = direct(targets, g.types as string[], trainId).length;
      const up = direct(targets, g.types as string[], trainId, false).length;
      const opt = screen.getByRole('option', { name: new RegExp(`^${g.label}`) }) as HTMLOptionElement;
      if (fit > 0) expect(opt.textContent).toBe(`${g.label} · ${fit} fit ${WORD}`);
      else if (up > 0) expect(opt.textContent).toBe(`${g.label} · ${up} up, none fit this frame`);
      else expect(opt.textContent).toBe(`${g.label} · none up ${WORD}`);
      expect(opt.disabled).toBe(up === 0);
    }
    const snr = direct(targets, ['supernova-remnant'], trainId, false).length;
    expect(snr).toBeGreaterThan(0);
    expect(direct(targets, ['supernova-remnant'], trainId)).toHaveLength(0);
    await choose('supernova-remnants');
    await screen.findByTestId('list-empty');
    expect(screen.getByTestId('list-empty').textContent).toBe(`No supernova remnants that fit this frame are up ${WORD}: ${snr} larger than this frame.`);
    fireEvent.click(screen.getByRole('checkbox', { name: /Show targets that do not fit/ }));
    await screen.findByRole('button', { name: new RegExp(`^Does not fit this frame \\(${snr}\\)`) });
    expect(screen.getByTestId('list-empty').textContent).toMatch(/They are listed below\./);
  }, 120000);

  it('option counts equal a direct catalog count, and a type is ranked best to worst over all of the catalog, not the mixed top 100 filtered', async () => {
    const { catalog } = mount({ objects: raw.objects });
    await ready();
    const targets = (await catalog.load()).targets;
    const groups = TYPE_GROUPS.filter((g) => g.types !== undefined);
    for (const g of groups) expect(optionCount(g.id)).toBe(direct(targets, g.types as string[]).length);
    expect(optionCount('open-clusters')).toBeGreaterThan(0);
    showAll();
    const mixedTop = new Set(rowNames());
    let outside = 0;
    for (const id of ['globular-clusters', 'open-clusters', 'planetary-nebulae']) {
      const g = TYPE_GROUPS.find((x) => x.id === id)!;
      const want = direct(targets, g.types as string[]);
      await choose(id);
      if (want.length === 0) continue;
      await listed();
      showAll();
      const names = rowNames();
      expect(names).toHaveLength(Math.min(100, want.length));
      expect(names[0]).toBe(want[0].name);
      for (let i = 1; i < names.length; i++) expect(scoreOf(listRows()[i])).toBeLessThanOrEqual(scoreOf(listRows()[i - 1]));
      if (!mixedTop.has(names[0])) outside++;
    }
    expect(outside).toBeGreaterThan(0); // some type's best is not in the mixed list at all: only a query by type finds it
  }, 120000);
});
