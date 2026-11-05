import { ProfileError } from '../profile';
import {
  CAPTURED_KEY,
  checkNumberText,
  PROFILE_KEY,
  defaultTonightDate,
  loadCaptured,
  loadProfile,
  sampleProfile,
  saveCaptured,
  saveProfile,
  withSiteArc,
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
  it('is today in the evening and yesterday between midnight and 06:00', () => {
    expect(defaultTonightDate(new Date(2026, 10, 5, 21, 0))).toBe('2026-11-05');
    expect(defaultTonightDate(new Date(2026, 10, 5, 9, 0))).toBe('2026-11-05');
    expect(defaultTonightDate(new Date(2026, 10, 5, 2, 30))).toBe('2026-11-04');
    expect(defaultTonightDate(new Date(2026, 0, 1, 1, 0))).toBe('2025-12-31');
  });
});

describe('checkNumberText', () => {
  it('accepts numbers in range, including the ends and decimals', () => {
    expect(checkNumberText('120', 0, 360, 'Start azimuth', 'deg')).toEqual({ ok: true, value: 120 });
    expect(checkNumberText('0', 0, 360, 'x', 'deg')).toEqual({ ok: true, value: 0 });
    expect(checkNumberText('42.5', 0, 90, 'x', 'deg')).toEqual({ ok: true, value: 42.5 });
  });

  it('rejects empty, non-numeric and out-of-range text with a message', () => {
    expect(checkNumberText('', 0, 90, 'Height', 'deg')).toEqual({ ok: false, error: 'Height: enter a number.' });
    expect(checkNumberText('  ', 0, 90, 'Height', 'deg').ok).toBe(false);
    expect(checkNumberText('abc', 0, 90, 'Height', 'deg')).toEqual({ ok: false, error: 'Height: "abc" is not a number.' });
    expect(checkNumberText('91', 0, 90, 'Height', 'deg')).toEqual({ ok: false, error: 'Height must be from 0 to 90 deg.' });
    expect(checkNumberText('-1', 0, 90, 'Height', 'deg').ok).toBe(false);
    expect(checkNumberText('Infinity', 0, 90, 'Height', 'deg').ok).toBe(false);
  });
});
