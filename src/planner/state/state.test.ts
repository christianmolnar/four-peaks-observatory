import { ProfileError } from '../profile';
import {
  CAPTURED_KEY,
  checkNumberText,
  friendlyArcError,
  numberView,
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
    expect(msg({ startAz: 100, endAz: 100, heightDeg: 30 })).toBe('Start and end must differ.');
    expect(msg({ startAz: 0, endAz: 359.99, heightDeg: 30 })).toMatch(/^The arc is too wide/);
    expect(msg({ startAz: 10, endAz: 50, heightDeg: 91 })).not.toContain('$');
  });
});

// numberView drives NumberSlider: the box text and message are derived from the draft and the
// committed value, so these sequences are what a user sees after typing, Discard, Reset, and so on.
describe('numberView (slider and number box stay in sync)', () => {
  const ok = () => null;
  const view = (d: { text: string; base: number } | null, value: number, validate: (n: number) => string | null = ok) =>
    numberView(d, value, 0, 359, 'Start azimuth', 'deg', validate);

  it('shows the committed value when nothing was typed', () => {
    expect(view(null, 120)).toEqual({ text: '120', error: null });
  });

  it('keeps accepted text as typed while it matches the value', () => {
    expect(view({ text: '150.0', base: 120 }, 150)).toEqual({ text: '150.0', error: null });
  });

  it('Discard: after typing 150 (accepted) the value goes back to 120, and the box follows', () => {
    expect(view({ text: '150', base: 120 }, 120)).toEqual({ text: '120', error: null });
  });

  it('Reset: a typed height of 77 is replaced when the value returns to 42', () => {
    expect(view({ text: '77', base: 42 }, 42)).toEqual({ text: '42', error: null });
  });

  it('a rejected value keeps its text and message while the value is unchanged', () => {
    const refuse = (n: number) => (n === 320 ? 'Start and end must differ.' : null);
    expect(view({ text: '320', base: 120 }, 120, refuse)).toEqual({ text: '320', error: 'Start and end must differ.' });
  });

  it('reject, then the other field changes: the old error and text go away', () => {
    const refuse = (n: number) => (n === 320 ? 'Start and end must differ.' : null);
    expect(view({ text: '320', base: 120 }, 120, refuse).error).not.toBeNull();
    // End azimuth moved away from 320: 320 would now be accepted, so the box shows 120 again.
    expect(view({ text: '320', base: 120 }, 120, ok)).toEqual({ text: '120', error: null });
  });

  it('a rejected draft is dropped when the value changes from outside (site change)', () => {
    expect(view({ text: '361', base: 120 }, 90)).toEqual({ text: '90', error: null });
  });

  it('range and number errors come from checkNumberText', () => {
    expect(view({ text: '361', base: 120 }, 120).error).toBe('Start azimuth must be from 0 to 359 deg.');
    expect(view({ text: '', base: 120 }, 120).error).toBe('Start azimuth: enter a number.');
  });
});
