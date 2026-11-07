import { ProfileError } from '../profile';
import {
  CAPTURED_KEY,
  checkArcFields,
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
  withSiteArc,
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
    const edited = withSiteArc(sampleProfile(), sampleProfile().sites[0].id, { startAz: 10, endAz: 50, heightDeg: 25 });
    saveProfile(s, edited);
    const r = loadProfile(s);
    expect(r.stored).toBe(true);
    expect(r.profile.sites[0].blockedArc).toEqual({ startAz: 10, endAz: 50, heightDeg: 25 });
  });

  it('rejects stored data with the field path, shows the sample, and leaves the stored text alone', () => {
    const bad = JSON.stringify({ ...sampleProfile(), sites: [{ ...sampleProfile().sites[0], latitude: 120 }] });
    const s = memory({ [PROFILE_KEY]: bad });
    const r = loadProfile(s);
    expect(r.error).toContain('$.sites[0].latitude');
    expect(r.profile).toEqual(sampleProfile());
    expect(s.data.get(PROFILE_KEY)).toBe(bad);
  });

  it('reports malformed stored JSON as an error, not a crash', () => {
    const r = loadProfile(memory({ [PROFILE_KEY]: '{nope' }));
    expect(r.error).toContain('not valid JSON');
  });

  it('refuses to save an invalid profile and writes nothing', () => {
    const s = memory();
    const p = sampleProfile();
    const bad = { ...p, sites: [{ ...p.sites[0], longitude: 500 }] };
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
    expect(() => loadCaptured(memory({ [CAPTURED_KEY]: '{"a":1}' }))).toThrow();
  });
});

describe('withSiteArc', () => {
  const p = sampleProfile();
  const id = p.sites[0].id;

  it('sets, changes and clears the arc', () => {
    expect(withSiteArc(p, id, { startAz: 300, endAz: 60, heightDeg: 35 }).sites[0].blockedArc).toEqual({ startAz: 300, endAz: 60, heightDeg: 35 });
    expect(withSiteArc(p, id, null).sites[0].blockedArc).toBeNull();
    expect(p.sites[0].blockedArc).toEqual({ startAz: 120, endAz: 320, heightDeg: 42 });
  });

  it('rejects arcs the M1b validator rejects, with the field path', () => {
    expect(() => withSiteArc(p, id, { startAz: 100, endAz: 100, heightDeg: 30 })).toThrow(/\$\.sites\[0\]\.blockedArc: .*differ/);
    expect(() => withSiteArc(p, id, { startAz: 0, endAz: 359.99, heightDeg: 30 })).toThrow(/shorten/);
    expect(() => withSiteArc(p, id, { startAz: 10, endAz: 50, heightDeg: 91 })).toThrow(/heightDeg/);
    expect(() => withSiteArc(p, id, { startAz: -5, endAz: 50, heightDeg: 30 })).toThrow(/startAz/);
    expect(() => withSiteArc(p, id, { startAz: Number.NaN, endAz: 50, heightDeg: 30 })).toThrow(/startAz/);
    expect(() => withSiteArc(p, 'nope', null)).toThrow(/unknown site/);
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
  const eff = (f: { start: string; end: string; height: string }) => effectiveArc(f, checkArcFields(f, refuse), base, refuse);

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

describe('checkArcFields', () => {
  const ok = () => null;
  it('is computed from the text alone: same text, same answer', () => {
    const f = fieldsFromArc({ startAz: 120, endAz: 320, heightDeg: 42 });
    expect(checkArcFields(f, ok)).toEqual({});
    expect(checkArcFields({ ...f, start: '500' }, ok)).toEqual({ start: 'Use 0 to 359 degrees.' });
    expect(checkArcFields({ ...f, start: '500' }, ok)).toEqual({ start: 'Use 0 to 359 degrees.' });
    expect(checkArcFields({ ...f, height: '91' }, ok)).toEqual({ height: 'Use 0 to 90 degrees.' });
    expect(checkArcFields({ start: '', end: 'x', height: '1.5' }, ok)).toEqual({
      start: 'Enter a number from 0 to 359.',
      end: 'Numbers only, from 0 to 359.',
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
    expect(sameFields({ ...saved, height: '045' }, saved)).toBe(true);
    expect(sameFields({ ...saved, start: '0120' }, saved)).toBe(true);
    expect(sameFields({ ...saved, start: '121' }, saved)).toBe(false);
    expect(sameFields({ ...saved, start: '12.0' }, { ...saved, start: '12' })).toBe(true);
    expect(sameFields({ ...saved, start: '' }, saved)).toBe(false);
    expect(sameFields(null, null)).toBe(true);
    expect(sameFields(null, saved)).toBe(false);
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
      withSiteArc(sampleProfile(), id, arc);
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
    const store = memory({ [PROFILE_KEY]: JSON.stringify(v1) });
    const r = loadProfile(store);
    expect(r.error).toBeNull();
    expect(r.stored).toBe(true);
    expect(r.profile.version).toBe(2);
    expect(r.profile.equipment.filters).toEqual([]);
    expect(r.profile.sites[0].blockedArc).toEqual({ startAz: 100, endAz: 200, heightDeg: 33 });
  });
});
