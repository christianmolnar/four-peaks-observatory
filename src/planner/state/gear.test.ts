import { addItem, addTrain, removeItem, removeTrain, replaceItem, replaceTrain, textsOf } from './edit';
import { GEAR_CLASSES, isUsed, missingOf, refusalText, usedText, usesOf } from './gear';
import { PROFILE_KEY, loadProfile, sampleProfile } from './index';
import type { PlanRef } from './gear';

const sample = () => sampleProfile();
const optical = (p = sample()) => {
  const t = p.trains.find((x) => x.kind === 'optical');
  if (!t || t.kind !== 'optical') throw new Error('no optical train');
  return t;
};
const smart = (p = sample()) => {
  const t = p.trains.find((x) => x.kind === 'smart');
  if (!t || t.kind !== 'smart') throw new Error('no smart train');
  return t;
};
const noPlans: PlanRef[] = [];
/** The sample with a filter fitted to its first optical train (the sample trains carry none). */
const filteredSample = () => {
  const p = sample();
  const t = optical(p);
  return replaceTrain(p, t.id, { name: t.name, scopeId: t.scopeId, accessoryIds: t.accessoryIds, cameraId: t.cameraId, filterId: p.equipment.filters[0].id });
};

describe('the gear classes', () => {
  it('offers trains, scopes (smart scopes inside), cameras, filters, accessories and sites, once each', () => {
    expect(GEAR_CLASSES.map((c) => c.label)).toEqual(['Trains', 'Scopes', 'Cameras', 'Filters', 'Accessories', 'Sites']);
  });
});

describe('who uses an item', () => {
  it('a scope, a camera, a filter and an accessory are used by the trains that name them', () => {
    const p = filteredSample();
    const filtered = p.trains.find((t) => t.kind === 'optical' && t.filterId !== undefined);
    const withAccessory = p.trains.find((t) => t.kind === 'optical' && t.accessoryIds.length > 0);
    if (!filtered || filtered.kind !== 'optical' || !withAccessory || withAccessory.kind !== 'optical') throw new Error('sample has no such train');
    const t = optical(p);
    expect(usesOf(p, noPlans, 'scopes', t.scopeId).trains).toContain(t.name);
    expect(usesOf(p, noPlans, 'cameras', t.cameraId).trains).toContain(t.name);
    expect(usesOf(p, noPlans, 'filters', filtered.filterId as string).trains).toContain(filtered.name);
    expect(usesOf(p, noPlans, 'accessories', withAccessory.accessoryIds[0]).trains).toContain(withAccessory.name);
    const s = smart(p);
    expect(usesOf(p, noPlans, 'smartScopes', s.smartScopeId).trains).toContain(s.name);
  });
  it('a site and a train are used by the saved plans that name them; the hidden example plans never count', () => {
    const p = sample();
    const plans: PlanRef[] = [{ name: 'Camping', siteId: p.sites[0].id, trainId: p.trains[1].id }];
    expect(usesOf(p, plans, 'sites', p.sites[0].id).plans).toContain('Camping');
    expect(usesOf(p, plans, 'trains', p.trains[1].id).plans).toContain('Camping');
    expect(usesOf(p, plans, 'trains', p.trains[1].id).plans).not.toContain(p.plans[0].name); // the sample's example plan is hidden: no plan switcher can open it
    expect(usesOf(p, plans, 'trains', p.trains[0].id).plans).toEqual([]);
  });
  it('says it in plain words', () => {
    expect(usedText({ trains: ['A', 'B'], plans: [], planIds: [] })).toBe('Used by 2 trains: "A", "B".');
    expect(usedText({ trains: ['A'], plans: [], planIds: [] })).toBe('Used by 1 train: "A".');
    expect(usedText({ trains: [], plans: ['Trip'], planIds: [] })).toBe('Used by 1 plan: "Trip".');
    expect(usedText({ trains: ['1', '2', '3', '4', '5'], plans: [], planIds: [] })).toBe('Used by 5 trains: "1", "2", "3" and 2 more.');
    expect(usedText({ trains: [], plans: [], planIds: [] })).toBe('Not used.');
    expect(isUsed({ trains: [], plans: [], planIds: [] })).toBe(false);
  });
  it('refusal names the users and the way out', () => {
    expect(refusalText({ trains: ['A', 'B'], plans: [], planIds: [] }, 'gear')).toBe('Not removed. Used by 2 trains: "A", "B". Change or remove those trains first.');
    expect(refusalText({ trains: [], plans: ['Trip'], planIds: [] }, 'site')).toBe('Not removed. Used by 1 plan: "Trip". Open that plan and choose another site first.');
    expect(refusalText({ trains: [], plans: ['T', 'U'], planIds: [] }, 'train')).toBe('Not removed. Used by 2 plans: "T", "U". Open those plans and choose another train first.');
  });
});

describe('each class: add, change, remove, in use', () => {
  const classes = ['scopes', 'cameras', 'filters', 'accessories', 'smartScopes', 'sites'] as const;
  for (const list of classes) {
    it(`${list}: add, change, remove an unused one`, () => {
      const p = sample();
      const added = addItem(p, list);
      const item = (list === 'sites' ? added.sites : added.equipment[list]).slice(-1)[0];
      const changed = replaceItem(added, list, item.id, { ...textsOf(list, item), name: 'Renamed' });
      expect((list === 'sites' ? changed.sites : changed.equipment[list]).find((x) => x.id === item.id)?.name).toBe('Renamed');
      const removed = removeItem(changed, list, item.id, noPlans);
      expect(removed).toEqual(p);
    });
  }
  it('scopes, cameras, filters, accessories, smart scopes: removing one a train uses is refused with the train named, nothing changes', () => {
    const p = filteredSample();
    const t = optical(p);
    const withAcc = p.trains.find((x) => x.kind === 'optical' && x.accessoryIds.length > 0);
    const filtered = p.trains.find((x) => x.kind === 'optical' && x.filterId !== undefined);
    if (!withAcc || withAcc.kind !== 'optical' || !filtered || filtered.kind !== 'optical') throw new Error('x');
    const cases: [Parameters<typeof removeItem>[1], string, string][] = [
      ['scopes', t.scopeId, t.name],
      ['cameras', t.cameraId, t.name],
      ['accessories', withAcc.accessoryIds[0], withAcc.name],
      ['filters', filtered.filterId as string, filtered.name],
      ['smartScopes', smart(p).smartScopeId, smart(p).name],
    ];
    for (const [list, id, trainName] of cases) {
      expect(() => removeItem(p, list, id, noPlans)).toThrow(/^Not removed\. Used by \d+ trains?: /);
      expect(() => removeItem(p, list, id, noPlans)).toThrow(`"${trainName}"`);
    }
  });
  it('a site a saved plan uses is refused, naming the plan', () => {
    const p = addItem(sample(), 'sites');
    const id = p.sites[p.sites.length - 1].id;
    expect(() => removeItem(p, 'sites', id, [{ name: 'Camping trip', siteId: id, trainId: p.trains[0].id }])).toThrow('Used by 1 plan: "Camping trip".');
    expect(removeItem(p, 'sites', id, noPlans).sites).toHaveLength(p.sites.length - 1);
  });
  it('the last site is never removed', () => {
    const p = sample();
    expect(() => removeItem({ ...p, sites: [p.sites[0]], plans: [] }, 'sites', p.sites[0].id, noPlans)).toThrow(/at least one site/);
  });
});

describe('trains: select data, create, change, remove', () => {
  it('create: an optical and a smart train, each built from the first gear', () => {
    const p = sample();
    const n = addTrain(addTrain(p, 'optical'), 'smart');
    expect(n.trains.slice(-2).map((t) => t.kind)).toEqual(['optical', 'smart']);
  });
  it('change: the parts of a train, including its filter, are replaced and the id stays', () => {
    const p = sample();
    const t = optical(p);
    const f = p.equipment.filters[0].id;
    const next = replaceTrain(p, t.id, { name: 'Wide', scopeId: t.scopeId, accessoryIds: [], cameraId: t.cameraId, filterId: f });
    expect(next.trains.find((x) => x.id === t.id)).toMatchObject({ id: t.id, name: 'Wide', filterId: f, accessoryIds: [] });
  });
  it('remove: an unused train goes; one a plan uses is refused naming the plan; the last one stays', () => {
    const p = addTrain(sample(), 'optical');
    const id = p.trains[p.trains.length - 1].id;
    expect(() => removeTrain(p, id, [{ name: 'Trip', siteId: p.sites[0].id, trainId: id }])).toThrow('Used by 1 plan: "Trip".');
    expect(removeTrain(p, id, noPlans).trains).toHaveLength(p.trains.length - 1);
    const one = { ...p, trains: [p.trains[0]], plans: [] };
    expect(() => removeTrain(one, one.trains[0].id, noPlans)).toThrow(/at least one train/);
  });
  it('the sample example plan does not block removing its train; it goes with it', () => {
    const p = sample();
    const gone = p.plans[0].trainId;
    const next = removeTrain(p, gone, noPlans);
    expect(next.trains.some((t) => t.id === gone)).toBe(false);
    expect(next.plans.every((x) => x.trainId !== gone)).toBe(true);
  });
  it('a saved plan that uses the train still blocks it, and the refusal carries the plan id', () => {
    const p = sample();
    const plans: PlanRef[] = [{ id: 'plan-7', name: 'Camping', siteId: p.sites[0].id, trainId: p.trains[1].id }];
    expect(usesOf(p, plans, 'trains', p.trains[1].id).planIds).toEqual(['plan-7']);
    expect(() => removeTrain(p, p.trains[1].id, plans)).toThrow('"Camping"');
  });
});

describe('a plan whose site or train is gone', () => {
  it('is reported by what is missing, not changed', () => {
    const p = sample();
    expect(missingOf(p, { siteId: p.sites[0].id, trainId: p.trains[0].id })).toEqual({ site: false, siteKept: false, train: false });
    expect(missingOf(p, { siteId: 'gone', trainId: p.trains[0].id })).toEqual({ site: true, siteKept: false, train: false });
    expect(missingOf(p, { siteId: p.sites[0].id, trainId: 'gone' })).toEqual({ site: false, siteKept: false, train: true });
    expect(missingOf(p, null)).toEqual({ site: false, siteKept: false, train: false });
    // A site kept with a saved number that cannot be used is not usable, and the plan says it is still there.
    const bad = { ...p, sites: [{ ...p.sites[0], latitude: -100 }] };
    expect(missingOf(bad, { siteId: p.sites[0].id, trainId: p.trains[0].id })).toEqual({ site: true, siteKept: true, train: false });
  });
});

describe('an old saved profile in the gear model', () => {
  it('a version 2 profile keeps every site, scope, camera, filter, accessory and train, and every class lists and counts them', () => {
    const now = sample();
    const old = JSON.parse(JSON.stringify(now));
    old.version = 2;
    old.sites = old.sites.map(({ blockedArcs, ...s }: { blockedArcs: unknown[] }) => ({ ...s, blockedArc: blockedArcs[0] ?? null }));
    const store = { getItem: (k: string) => (k === PROFILE_KEY ? JSON.stringify(old) : null) };
    const r = loadProfile(store);
    expect(r.error).toBeNull();
    expect(r.stored).toBe(true);
    expect(r.profile.equipment).toEqual(now.equipment);
    expect(r.profile.trains).toEqual(now.trains);
    expect(r.profile.sites.map((s) => s.id)).toEqual(now.sites.map((s) => s.id));
    const t = optical(r.profile);
    expect(usesOf(r.profile, noPlans, 'cameras', t.cameraId).trains).toContain(t.name);
  });
  it('a camera with no pixel size is a valid gear item that can still be changed and removed', () => {
    const p = addItem(sample(), 'cameras');
    const cam = p.equipment.cameras[p.equipment.cameras.length - 1];
    expect(cam.pixelSizeUm).toBeUndefined();
    expect(removeItem(p, 'cameras', cam.id, noPlans).equipment.cameras).toHaveLength(p.equipment.cameras.length - 1);
  });
});
