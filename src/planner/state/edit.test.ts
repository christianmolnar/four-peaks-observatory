import { ProfileError, parseProfile } from '../profile';
import {
  addItem,
  addTrain,
  describeImportError,
  LIST_SPECS,
  profileFromText,
  removeItem,
  removeTrain,
  replaceItem,
  replaceTrain,
  textsOf,
} from './edit';
import { sampleProfile } from './index';

const sample = () => sampleProfile();

describe('site time zone', () => {
  it('accepts an IANA name and rejects anything else with a plain message', () => {
    const p = sample();
    const site = { ...p.sites[0], timeZone: 'America/Phoenix' };
    expect(parseProfile(JSON.stringify({ ...p, sites: [site] })).sites[0].timeZone).toBe('America/Phoenix');
    expect(() => parseProfile(JSON.stringify({ ...p, sites: [{ ...site, timeZone: 'Mars/Olympus' }] }))).toThrow(/time zone/);
  });
  it('the sample site names its time zone', () => {
    expect(sample().sites[0].timeZone).toBe('America/Phoenix');
  });
});

describe('replaceItem', () => {
  it('changes a scope from typed text and keeps everything else', () => {
    const p = sample();
    const scope = p.equipment.scopes[0];
    const texts = { ...textsOf('scopes', scope), name: 'My scope', focalLengthMm: '1000', apertureMm: '' };
    const next = replaceItem(p, 'scopes', scope.id, texts);
    expect(next.equipment.scopes[0]).toEqual({ id: scope.id, name: 'My scope', focalLengthMm: 1000 });
    expect(next.trains).toEqual(p.trains);
    expect(p.equipment.scopes[0].name).not.toBe('My scope'); // input untouched
  });
  it('edits a site and keeps its horizon arc', () => {
    const p = sample();
    const s = p.sites[0];
    const next = replaceItem(p, 'sites', s.id, { ...textsOf('sites', s), latitude: '35.5', longitude: '-110', elevationM: '700', timeZone: 'America/Denver' });
    expect(next.sites[0]).toMatchObject({ latitude: 35.5, longitude: -110, elevationM: 700, timeZone: 'America/Denver', blockedArc: s.blockedArc });
  });
  it('an empty optional box means unknown, not zero', () => {
    const p = sample();
    const s = p.sites[0];
    const next = replaceItem(p, 'sites', s.id, { ...textsOf('sites', s), elevationM: '', timeZone: '' });
    expect('elevationM' in next.sites[0]).toBe(false);
    expect('timeZone' in next.sites[0]).toBe(false);
  });
  it('rejects text that is not a number, naming the box', () => {
    const p = sample();
    const s = p.sites[0];
    expect(() => replaceItem(p, 'sites', s.id, { ...textsOf('sites', s), latitude: 'north' })).toThrow(/Latitude.*number/);
  });
  it('rejects an out-of-range value with the box name, not a field path', () => {
    const p = sample();
    const s = p.sites[0];
    let msg = '';
    try {
      replaceItem(p, 'sites', s.id, { ...textsOf('sites', s), latitude: '95' });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/^Latitude/);
    expect(msg).not.toMatch(/\$\./);
  });
  it('rejects an empty name', () => {
    const p = sample();
    const c = p.equipment.cameras[0];
    expect(() => replaceItem(p, 'cameras', c.id, { ...textsOf('cameras', c), name: '  ' })).toThrow(/Name/);
  });
  it('sets a tri-state box to yes, no or unknown', () => {
    const p = sample();
    const c = p.equipment.cameras[0];
    const yes = replaceItem(p, 'cameras', c.id, { ...textsOf('cameras', c), colour: 'yes' });
    expect(yes.equipment.cameras[0].colour).toBe(true);
    const no = replaceItem(p, 'cameras', c.id, { ...textsOf('cameras', c), colour: 'no' });
    expect(no.equipment.cameras[0].colour).toBe(false);
    const unk = replaceItem(p, 'cameras', c.id, { ...textsOf('cameras', c), colour: '' });
    expect('colour' in unk.equipment.cameras[0]).toBe(false);
  });
  it('every spec field round-trips through textsOf for every sample item', () => {
    const p = sample();
    const lists = { sites: p.sites, ...p.equipment };
    for (const key of Object.keys(LIST_SPECS) as (keyof typeof LIST_SPECS)[]) {
      for (const item of lists[key]) {
        expect(replaceItem(p, key, item.id, textsOf(key, item))).toEqual(p);
      }
    }
  });
});

describe('addItem and removeItem', () => {
  it('adds an item with a new unique id and a name to edit', () => {
    const p = sample();
    const a = addItem(p, 'scopes');
    const b = addItem(a, 'scopes');
    const ids = b.equipment.scopes.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.equipment.scopes).toHaveLength(p.equipment.scopes.length + 2);
  });
  it('a new site starts with no horizon blocked and the coordinates of the first site', () => {
    const p = sample();
    const n = addItem(p, 'sites').sites[1];
    expect(n.blockedArc).toBeNull();
    expect(n.latitude).toBe(p.sites[0].latitude);
  });
  it('removes an unused item', () => {
    const p = addItem(sample(), 'filters');
    const id = p.equipment.filters[p.equipment.filters.length - 1].id;
    expect(removeItem(p, 'filters', id).equipment.filters.find((f) => f.id === id)).toBeUndefined();
  });
  it('refuses to remove gear a train uses, naming the train', () => {
    const p = sample();
    const train = p.trains.find((t) => t.kind === 'optical');
    if (!train || train.kind !== 'optical') throw new Error('no optical train in sample');
    expect(() => removeItem(p, 'scopes', train.scopeId)).toThrow(`"${train.name}"`);
  });
  it('refuses to remove the last site', () => {
    const p = sample();
    expect(() => removeItem(p, 'sites', p.sites[0].id)).toThrow(/at least one site/);
  });
});

describe('trains', () => {
  it('replaces an optical train from its parts', () => {
    const p = sample();
    const t = p.trains.find((x) => x.kind === 'optical');
    if (!t || t.kind !== 'optical') throw new Error('x');
    const next = replaceTrain(p, t.id, { name: 'Renamed', scopeId: t.scopeId, accessoryIds: [], cameraId: t.cameraId, filterId: '' });
    const n = next.trains.find((x) => x.id === t.id);
    expect(n).toEqual({ kind: 'optical', id: t.id, name: 'Renamed', scopeId: t.scopeId, accessoryIds: [], cameraId: t.cameraId });
  });
  it('refuses two accessories that each replace the optics', () => {
    const p = sample();
    const t = p.trains.find((x) => x.kind === 'optical');
    if (!t || t.kind !== 'optical') throw new Error('x');
    const withTwo = addItem(addItem(p, 'accessories'), 'accessories');
    const [a, b] = withTwo.equipment.accessories.slice(-2);
    let q = replaceItem(withTwo, 'accessories', a.id, { ...textsOf('accessories', a), effectiveFocalLengthMm: '500' });
    q = replaceItem(q, 'accessories', b.id, { ...textsOf('accessories', b), effectiveFocalLengthMm: '600' });
    expect(() => replaceTrain(q, t.id, { name: t.name, scopeId: t.scopeId, accessoryIds: [a.id, b.id], cameraId: t.cameraId, filterId: '' })).toThrow(/more than one accessory/i);
  });
  it('replaces a smart-scope train', () => {
    const p = sample();
    const t = p.trains.find((x) => x.kind === 'smart');
    if (!t || t.kind !== 'smart') throw new Error('x');
    const next = replaceTrain(p, t.id, { name: 'Mine', smartScopeId: t.smartScopeId });
    expect(next.trains.find((x) => x.id === t.id)).toMatchObject({ name: 'Mine', kind: 'smart' });
  });
  it('adds optical and smart trains, and removes one but not the last', () => {
    const p = sample();
    const a = addTrain(p, 'optical');
    const b = addTrain(a, 'smart');
    expect(b.trains).toHaveLength(p.trains.length + 2);
    expect(removeTrain(b, b.trains[b.trains.length - 1].id).trains).toHaveLength(p.trains.length + 1);
    const one = { ...p, trains: [p.trains[0]] };
    expect(() => removeTrain(one, one.trains[0].id)).toThrow(/at least one train/);
  });
  it('cannot add an optical train with no scope or camera', () => {
    const p = { ...sample(), trains: [], equipment: { ...sample().equipment, scopes: [], cameras: [] } };
    expect(() => addTrain(p, 'optical')).toThrow(/scope and a camera/);
  });
});

describe('import errors in plain language', () => {
  const stringify = (o: unknown) => JSON.stringify(o);
  it('accepts an exported profile and returns an identical one', () => {
    const p = sample();
    expect(profileFromText(JSON.stringify(p, null, 2) + '\n')).toEqual(p);
  });
  it('says a non-JSON file is not a profile', () => {
    expect(() => profileFromText('hello')).toThrow(/not a planner profile|not valid JSON/i);
    expect(() => profileFromText('')).toThrow(/empty/i);
  });
  it('names the version problem for a wrong or missing version', () => {
    const p = sample();
    expect(() => profileFromText(stringify({ ...p, version: 99 }))).toThrow(/version 99.*reads version/i);
    const { version: _v, ...noVersion } = p;
    expect(() => profileFromText(stringify(noVersion))).toThrow(/no version/i);
  });
  it('rejects a JSON value that is not an object', () => {
    for (const t of ['[]', '42', 'null', '"x"']) expect(() => profileFromText(t)).toThrow(/profile/i);
  });
  it('names the field for other problems', () => {
    const p = sample();
    expect(() => profileFromText(stringify({ ...p, sites: [{ ...p.sites[0], latitude: 200 }] }))).toThrow(/sites\[0\]\.latitude/);
  });
  it('rejects a file that is too big without parsing it', () => {
    expect(() => profileFromText('x'.repeat(2_000_001))).toThrow(/too large/i);
  });
  it('describeImportError never returns a stack or "undefined"', () => {
    expect(describeImportError(new ProfileError('$.version', 'expected 2, got 5'))).not.toMatch(/undefined|\bat \w/);
    expect(describeImportError(new Error('boom'))).toMatch(/boom/);
  });
});
