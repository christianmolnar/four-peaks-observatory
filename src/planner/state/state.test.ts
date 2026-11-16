import { ProfileError, siteProblems, usableSites } from '../profile';
import {
  CAPTURED_KEY,
  HORIZON_RANGE,
  checkZoneFields,
  newZoneFields,
  checkWholeDegrees,
  effectiveArc,
  fieldsFromArc,
  friendlyArcError,
  PROFILE_KEY,
  defaultTonightDate,
  loadCaptured,
  loadProfile,
  sampleProfile,
  saveCaptured,
  sameFields,
  saveProfile,
  withSiteArcs,
  withTrainFilter,
  defaultDateForProfile,
} from './index';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('profile storage', () => {
  it('first visit gives the sample, marked as not stored', () => {
    const r = loadProfile(memory());
    expect(r.stored).toBe(false);
    expect(r.error).toBeNull();
    expect(r.profile).toEqual(sampleProfile());
  });

  it('round-trips a saved profile', () => {
    const s = memory();
    const edited = withSiteArcs(sampleProfile(), sampleProfile().sites[0].id, [{ startAz: 10, endAz: 50, heightDeg: 25 }]);
    saveProfile(s, edited);
    const r = loadProfile(s);
    expect(r.stored).toBe(true);
    expect(r.profile.sites[0].blockedArcs).toEqual([{ startAz: 10, endAz: 50, heightDeg: 25 }]);
  });

  it('rejects stored data it cannot load in words, shows the sample, holds the stored text back and leaves it alone', () => {
    const p = sampleProfile();
    const bad = JSON.stringify({ ...p, trains: p.trains.map((t, i) => (i === 0 && t.kind === 'optical' ? { ...t, scopeId: 'gone' } : t)) });
    const s = memory({ [PROFILE_KEY]: bad });
    const r = loadProfile(s);
    expect(r.error).toContain('Train "');
    expect(r.error).toContain('no scope has the id "gone" in this profile. Your saved copy is kept as it is');
    expect(r.error).not.toContain('$.');
    expect(r.profile).toEqual(sampleProfile());
    expect(r.held).toBe(bad);
    expect(s.data.get(PROFILE_KEY)).toBe(bad);
  });

  it('a stored site number outside its range, null or text keeps the profile: loaded, kept as stored, flagged and not usable', () => {
    for (const latitude of [120, -100, null, 'abc', {}, [1]]) {
      const own = { ...sampleProfile().equipment.cameras[0], id: 'own', name: 'My own camera' };
      const base = sampleProfile();
      const text = JSON.stringify({ ...base, equipment: { ...base.equipment, cameras: [...base.equipment.cameras, own] }, sites: [{ ...base.sites[0], latitude }] });
      const r = loadProfile(memory({ [PROFILE_KEY]: text }));
      expect(r.error).toBeNull();
      expect(r.held).toBeNull();
      expect(r.stored).toBe(true);
      expect(r.profile.equipment.cameras.map((c) => c.name)).toContain('My own camera');
      expect(r.profile.sites[0].latitude).toEqual(latitude);
      expect(siteProblems(r.profile).map((x) => x.key)).toEqual(['latitude']);
      expect(usableSites(r.profile)).toEqual([]);
    }
  });

  it('reports malformed stored JSON as an error, not a crash', () => {
    const r = loadProfile(memory({ [PROFILE_KEY]: '{nope' }));
    expect(r.error).toMatch(/^Your saved profile could not be used, so the sample is shown\. .*not valid JSON/);
    expect(r.error).not.toMatch(/\$|Unexpected|rejected/);
  });

  it('refuses to save an invalid profile and writes nothing', () => {
    const s = memory();
    const p = sampleProfile();
    const bad = { ...p, trains: [{ ...p.trains[0], id: p.trains[1].id }, ...p.trains.slice(1)] }; // two trains with one id
    expect(() => saveProfile(s, bad)).toThrow(ProfileError);
    expect(s.data.size).toBe(0);
  });
});

describe('captured', () => {
  it('round-trips and rejects a wrong shape', () => {
    const s = memory();
    saveCaptured(s, new Set(['m42', 'm31']));
    expect([...loadCaptured(s)].sort()).toEqual(['m31', 'm42']);
    expect(loadCaptured(memory()).size).toBe(0);
    expect(() => loadCaptured(memory({ [CAPTURED_KEY]: '{"a":1}' }))).toThrow(/^Your saved captured list is damaged, so it starts empty\.$/);
    expect(() => loadCaptured(memory({ [CAPTURED_KEY]: '{oops' }))).toThrow(/^Your saved captured list is damaged, so it starts empty\.$/);
  });
});

describe('withSiteArcs', () => {
  const p = sampleProfile();
  const id = p.sites[0].id;

  it('sets, changes and clears the arc', () => {
    expect(withSiteArcs(p, id, [{ startAz: 300, endAz: 60, heightDeg: 35 }]).sites[0].blockedArcs).toEqual([{ startAz: 300, endAz: 60, heightDeg: 35 }]);
    expect(withSiteArcs(p, id, []).sites[0].blockedArcs).toEqual([]);
    expect(p.sites[0].blockedArcs).toEqual([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
  });

  it('rejects arcs the M1b validator rejects, with the field path', () => {
    expect(() => withSiteArcs(p, id, [{ startAz: 100, endAz: 100, heightDeg: 30 }])).toThrow(/\$\.sites\[0\]\.blockedArcs\[0\]: .*differ/);
    expect(() => withSiteArcs(p, id, [{ startAz: 0, endAz: 359.99, heightDeg: 30 }])).toThrow(/shorten/);
    expect(() => withSiteArcs(p, id, [{ startAz: 10, endAz: 50, heightDeg: 91 }])).toThrow(/heightDeg/);
    expect(() => withSiteArcs(p, id, [{ startAz: -5, endAz: 50, heightDeg: 30 }])).toThrow(/startAz/);
    expect(() => withSiteArcs(p, id, [{ startAz: Number.NaN, endAz: 50, heightDeg: 30 }])).toThrow(/startAz/);
    expect(() => withSiteArcs(p, 'nope', [])).toThrow(/unknown site/);
  });
});

describe('defaultTonightDate', () => {
  const PHX = -112; // Phoenix area; MST is UTC-7
  const SYD = 151.2;
  it('is today in the evening and yesterday between midnight and 06:00, in the site clock', () => {
    expect(defaultTonightDate(new Date(Date.UTC(2026, 10, 6, 4, 0)), PHX)).toBe('2026-11-05'); // 21:00 MST Nov 5
    expect(defaultTonightDate(new Date(Date.UTC(2026, 10, 5, 16, 0)), PHX)).toBe('2026-11-05'); // 09:00
    expect(defaultTonightDate(new Date(Date.UTC(2026, 10, 5, 9, 30)), PHX)).toBe('2026-11-04'); // 02:30
    expect(defaultTonightDate(new Date(Date.UTC(2026, 0, 1, 8, 0)), PHX)).toBe('2025-12-31'); // 01:00 MST Jan 1
  });

  it('uses the site, not the clock zone: Sydney site at 22:00 Phoenix time on Dec 19 is the Dec 20 night', () => {
    const now = new Date(Date.UTC(2026, 11, 20, 5, 0)); // 22:00 MST Dec 19
    expect(defaultTonightDate(now, SYD)).toBe('2026-12-20');
    expect(defaultTonightDate(now, PHX)).toBe('2026-12-19');
  });
});

describe('checkWholeDegrees', () => {
  it('accepts whole numbers in range, including both ends', () => {
    expect(checkWholeDegrees('120', 0, 359)).toEqual({ ok: true, value: 120 });
    expect(checkWholeDegrees('0', 0, 359)).toEqual({ ok: true, value: 0 });
    expect(checkWholeDegrees('359', 0, 359)).toEqual({ ok: true, value: 359 });
  });

  it('gives the designer\'s one-line copy for each kind of bad text', () => {
    const msg = (t: string, max = 359) => (checkWholeDegrees(t, 0, max) as { error: string }).error;
    expect(msg('')).toBe('Enter a number from 0 to 359.');
    expect(msg('  ')).toBe('Enter a number from 0 to 359.');
    expect(msg('abc')).toBe('Numbers only, from 0 to 359.');
    expect(msg('Infinity')).toBe('Numbers only, from 0 to 359.');
    expect(msg('1.5')).toBe('Whole degrees only.');
    expect(msg('500')).toBe('Use 0 to 359 degrees.');
    expect(msg('-1')).toBe('Use 0 to 359 degrees.');
    expect(msg('91', 90)).toBe('Use 0 to 90 degrees.');
    expect((checkWholeDegrees('100', 0, 89, '') as { error: string }).error).toBe('Use 0 to 89.');
  });
});

describe('effectiveArc', () => {
  const base = { startAz: 120, endAz: 320, heightDeg: 42 };
  const refuse = (a: { startAz: number; endAz: number }) => (a.startAz === a.endAz ? 'Start and End must differ.' : null);
  const eff = (f: { start: string; end: string; height: string }) => effectiveArc(f, checkZoneFields([f], refuse)[0], base, refuse);

  it('uses every box that is fine and the saved number for a box with a message', () => {
    expect(eff({ start: '150', end: '320', height: '50' })).toEqual({ startAz: 150, endAz: 320, heightDeg: 50 });
    expect(eff({ start: '500', end: '300', height: '50' })).toEqual({ startAz: 120, endAz: 300, heightDeg: 50 });
    expect(eff({ start: '5', end: '320', height: '91' })).toEqual({ startAz: 5, endAz: 320, heightDeg: 42 });
  });

  it('never gives a refused arc: an arc error, or a typed Start meeting a fallback End, falls back', () => {
    expect(eff({ start: '320', end: '320', height: '50' })).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
    expect(eff({ start: '320', end: '', height: '50' })).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
  });
});

describe('checkZoneFields', () => {
  const ok = () => null;
  const checkArcFields = (f: { start: string; end: string; height: string }, check: (a: { startAz: number; endAz: number; heightDeg: number }) => string | null) => checkZoneFields([f], check)[0];
  it('is computed from the text alone: same text, same answer', () => {
    const f = fieldsFromArc({ startAz: 120, endAz: 320, heightDeg: 42 });
    expect(checkArcFields(f, ok)).toEqual({});
    expect(checkArcFields({ ...f, start: '500' }, ok)).toEqual({ start: 'Use 0 to 360 degrees.' });
    expect(checkArcFields({ ...f, start: '361' }, ok)).toEqual({ start: 'Use 0 to 360 degrees.' });
    expect(checkArcFields({ ...f, start: '360' }, ok)).toEqual({});
    expect(checkArcFields({ ...f, end: '360' }, ok)).toEqual({});
    expect(checkArcFields({ ...f, height: '91' }, ok)).toEqual({ height: 'Use 0 to 90 degrees.' });
    expect(checkArcFields({ start: '', end: 'x', height: '1.5' }, ok)).toEqual({
      start: 'Enter a number from 0 to 360.',
      end: 'Numbers only, from 0 to 360.',
      height: 'Whole degrees only.',
    });
  });

  it('asks the validator about the arc only when all three boxes are fine', () => {
    const calls: unknown[] = [];
    const f = { start: '320', end: '320', height: '42' };
    expect(checkArcFields(f, (a) => (calls.push(a), 'Start and End must differ.'))).toEqual({ arc: 'Start and End must differ.' });
    expect(calls).toEqual([{ startAz: 320, endAz: 320, heightDeg: 42 }]);
    calls.length = 0;
    checkArcFields({ ...f, height: '' }, (a) => (calls.push(a), null));
    expect(calls).toEqual([]);
  });

  it('sameFields compares valid boxes by number, so 0150 is 150 and 12.0 is 12', () => {
    const saved = { start: '120', end: '320', height: '45' };
    expect(sameFields([{ ...saved, height: '045' }], [saved])).toBe(true);
    expect(sameFields([{ ...saved, start: '0120' }], [saved])).toBe(true);
    expect(sameFields([{ ...saved, start: '121' }], [saved])).toBe(false);
    expect(sameFields([{ ...saved, start: '12.0' }], [{ ...saved, start: '12' }])).toBe(true);
    expect(sameFields([{ ...saved, start: '' }], [saved])).toBe(false);
    expect(sameFields([], [])).toBe(true);
    expect(sameFields([], [saved])).toBe(false);
    expect(sameFields([saved], [saved, saved])).toBe(false);
  });
});

describe('defaultDateForProfile', () => {
  it('a profile with no site uses the browser longitude (not 0)', () => {
    // 10:00 UTC on Dec 20. At the browser's UTC-7 it is 03:00 that day, so the night began Dec 19;
    // at longitude 0 it would be 10:00, so Dec 20.
    const now = new Date('2026-12-20T10:00:00Z');
    now.getTimezoneOffset = () => 420;
    expect(defaultDateForProfile(now, { ...sampleProfile(), sites: [] })).toBe('2026-12-19');
  });
});

describe('loadProfile with unusable storage', () => {
  it('falls back to the sample with a message when reading storage throws', () => {
    const blocked = { getItem: () => { throw new DOMException('denied', 'SecurityError'); } };
    const r = loadProfile(blocked);
    expect(r.profile).toEqual(sampleProfile());
    expect(r.stored).toBe(false);
    expect(r.error).toMatch(/could not be read.*denied/);
  });
});

describe('friendlyArcError', () => {
  const id = sampleProfile().sites[0].id;
  const msg = (arc: { startAz: number; endAz: number; heightDeg: number }) => {
    try {
      withSiteArcs(sampleProfile(), id, [arc]);
    } catch (e) {
      if (e instanceof ProfileError) return friendlyArcError(e);
    }
    throw new Error('expected a ProfileError');
  };
  it('says what is wrong in words, with no field path', () => {
    expect(msg({ startAz: 100, endAz: 100, heightDeg: 30 })).toBe('Start and End must differ.');
    expect(msg({ startAz: 0, endAz: 359.99, heightDeg: 30 })).toMatch(/^Too wide/);
    expect(msg({ startAz: 10, endAz: 50, heightDeg: 91 })).not.toContain('$');
  });
});

describe('train filter', () => {
  const p = sampleProfile();
  const train = (pr: ReturnType<typeof sampleProfile>, id: string) => pr.trains.find((t) => t.id === id) as { filterId?: string };

  it('sets and clears a filter on an optical train, leaving the input alone', () => {
    const set = withTrainFilter(p, 'wide-c11-hyperstar-2600', 'astronomik-cls-ccd');
    expect(train(set, 'wide-c11-hyperstar-2600').filterId).toBe('astronomik-cls-ccd');
    expect(train(p, 'wide-c11-hyperstar-2600').filterId).toBeUndefined();
    const cleared = withTrainFilter(set, 'wide-c11-hyperstar-2600', null);
    expect(train(cleared, 'wide-c11-hyperstar-2600')).not.toHaveProperty('filterId');
    expect(cleared).toEqual(p);
  });
  it('changing it twice keeps the last choice and touches no other train', () => {
    const a = withTrainFilter(withTrainFilter(p, 'deep-c11-2600', 'zwo-duo-band'), 'deep-c11-2600', 'idas-lps-p3');
    expect(train(a, 'deep-c11-2600').filterId).toBe('idas-lps-p3');
    expect(a.trains.filter((t) => t.id !== 'deep-c11-2600')).toEqual(p.trains.filter((t) => t.id !== 'deep-c11-2600'));
  });
  it('refuses an unknown filter, an unknown train and a smart scope', () => {
    expect(() => withTrainFilter(p, 'deep-c11-2600', 'nope')).toThrow(ProfileError);
    expect(() => withTrainFilter(p, 'nope', null)).toThrow(/unknown train/);
    expect(() => withTrainFilter(p, 'smart-seestar-s50', 'zwo-duo-band')).toThrow(/smart scope/);
  });
  it('a saved v1 profile in storage loads migrated, with its horizon and no filters', () => {
    const v1 = { ...JSON.parse(JSON.stringify(p)), version: 1 };
    delete v1.equipment.filters;
    for (const t of v1.trains) delete t.filterId;
    v1.sites[0].blockedArc = { startAz: 100, endAz: 200, heightDeg: 33 };
    delete v1.sites[0].blockedArcs;
    const store = memory({ [PROFILE_KEY]: JSON.stringify(v1) });
    const r = loadProfile(store);
    expect(r.error).toBeNull();
    expect(r.stored).toBe(true);
    expect(r.profile.version).toBe(3);
    expect(r.profile.equipment.filters).toEqual([]);
    expect(r.profile.sites[0].blockedArcs).toEqual([{ startAz: 100, endAz: 200, heightDeg: 33 }]);
  });
});

describe('defaultTonightDate with a site time zone', () => {
  it('Apia (UTC+13) at 21:00 civil on Nov 8 is the Nov 8 night, not Nov 9', () => {
    const now = new Date('2026-11-08T08:00:00Z'); // 21:00 in Pacific/Apia
    expect(defaultTonightDate(now, -171.76, 'Pacific/Apia')).toBe('2026-11-08');
  });
  it('Taveuni (UTC+12) at 02:30 civil on Nov 9 is still the Nov 8 night', () => {
    const now = new Date('2026-11-08T14:30:00Z'); // 02:30 Nov 9 in Pacific/Fiji
    expect(defaultTonightDate(now, -179.97, 'Pacific/Fiji')).toBe('2026-11-08');
  });
  it('Phoenix zone agrees with the longitude rule', () => {
    expect(defaultTonightDate(new Date(Date.UTC(2026, 10, 6, 4, 0)), -112, 'America/Phoenix')).toBe('2026-11-05');
  });
});

describe('zone rows', () => {
  const ok = () => null;
  const row = (startAz: number, endAz: number, heightDeg = 30) => fieldsFromArc({ startAz, endAz, heightDeg });

  it('every azimuth box runs 0 to 360 whatever the other zones hold; 360 is stored as 0', () => {
    expect(HORIZON_RANGE.start).toEqual({ min: 0, max: 360 });
    expect(HORIZON_RANGE.end).toEqual({ min: 0, max: 360 });
    expect(HORIZON_RANGE.height).toEqual({ min: 0, max: 90 });
    const crowded = [row(100, 160), row(150, 200), row(0, 359, 5), row(180, 270)];
    expect(checkZoneFields(crowded, ok)).toEqual([{}, {}, {}, {}]);
    expect(effectiveArc(row(360, 90), {}, null, ok)).toEqual({ startAz: 0, endAz: 90, heightDeg: 30 });
    expect(sameFields([{ start: '360', end: '90', height: '30' }], [row(0, 90)])).toBe(true);
  });

  it('newZoneFields: the first zone is the default; the next starts where the last ended, 30 wide, at its height', () => {
    expect(newZoneFields([])).toEqual({ start: '90', end: '180', height: '30' });
    expect(newZoneFields([row(120, 320)])).toEqual({ start: '320', end: '350', height: '30' });
    expect(newZoneFields([row(120, 320), row(10, 80, 55)])).toEqual({ start: '80', end: '110', height: '55' });
  });

  it('newZoneFields wraps past 360, ignores the other zones, and keeps going to a full four', () => {
    expect(newZoneFields([row(100, 350, 42)])).toEqual({ start: '350', end: '20', height: '42' });
    expect(newZoneFields([row(100, 360, 42)])).toEqual({ start: '0', end: '30', height: '42' });
    // Where the new zone lands is not moved to fit: it overlaps zone 1 here, which is allowed.
    expect(newZoneFields([row(10, 100), row(300, 20, 12)])).toEqual({ start: '20', end: '50', height: '12' });
    let zones = [row(120, 320)];
    while (zones.length < 4) zones = [...zones, newZoneFields(zones)];
    expect(zones.map((z) => [z.start, z.end])).toEqual([['120', '320'], ['320', '350'], ['350', '20'], ['20', '50']]);
    expect(checkZoneFields(zones, ok)).toEqual([{}, {}, {}, {}]);
  });

  it('newZoneFields starts from the last row whose boxes hold numbers', () => {
    expect(newZoneFields([row(120, 320), { start: '', end: 'x', height: '' }])).toEqual({ start: '320', end: '350', height: '30' });
  });

  it('checkZoneFields never refuses a zone for overlapping or touching another', () => {
    const e = checkZoneFields([row(100, 160), row(150, 200), row(160, 170), row(100, 160), row(300, 310)], ok);
    expect(e).toEqual([{}, {}, {}, {}, {}]);
    expect(checkZoneFields([row(100, 160), { start: '', end: '150', height: '9' }], ok)[0]).toEqual({});
  });

  it('effectiveArc: a new row (no saved zone) is drawn only when it has no message', () => {
    const f = row(200, 250);
    expect(effectiveArc(f, {}, null, ok)).toEqual({ startAz: 200, endAz: 250, heightDeg: 30 });
    expect(effectiveArc(f, { arc: 'Start and End must differ.' }, null, ok)).toBeNull();
  });
});
