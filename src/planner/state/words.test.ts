import { ProfileError, parseProfile, validateProfile } from '../profile';
import { describeImportError } from './edit';
import { loadProfile, sampleProfile } from './index';
import { profileProblemText } from './words';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = (): Rec => JSON.parse(JSON.stringify(sampleProfile()));

/** Every way the validator can refuse a profile, one edit of the sample each. `want` is a sentence the user must see. */
const CASES: { name: string; edit: (p: Rec) => unknown; want?: RegExp }[] = [
  { name: 'version too new', edit: (p) => { p.version = 99; }, want: /^It is version 99; this planner reads version 3 \(and upgrades versions 1 and 2\)\.$/ },
  { name: 'version missing', edit: (p) => { delete p.version; }, want: /no version number/ },
  { name: 'top level not an object', edit: () => [1, 2, 3], want: /not in the planner\u2019s format/ },
  { name: 'null', edit: () => null, want: /not in the planner\u2019s format/ },
  { name: 'unknown top-level field', edit: (p) => { p.extra = 1; }, want: /"extra"/ },
  { name: 'unknown item field', edit: (p) => { p.equipment.scopes[0].colr = 1; }, want: /"colr"/ },
  { name: 'list is not a list', edit: (p) => { p.sites = 5; }, want: /should be a list/ },
  { name: 'equipment not an object', edit: (p) => { p.equipment = 5; } },
  { name: 'id empty', edit: (p) => { p.equipment.cameras[0].id = ''; }, want: /id/ },
  { name: 'notes not text', edit: (p) => { p.plans[0].notes = 5; }, want: /not text/ },
  { name: 'list item empty', edit: (p) => { p.plans[0].targetIds = ['']; } },
  { name: 'arc number', edit: (p) => { p.sites[0].blockedArcs = [{ startAz: 'x', endAz: 10, heightDeg: 5 }]; }, want: /should be a number from 0 to 360/ },
  { name: 'arc too small', edit: (p) => { p.sites[0].blockedArcs = [{ startAz: 10, endAz: 10, heightDeg: 5 }]; }, want: /must differ/ },
  { name: 'arc leaves nothing', edit: (p) => { p.sites[0].blockedArcs = [{ startAz: 10, endAz: 9.95, heightDeg: 5 }]; }, want: /open/ },
  { name: 'arc 360', edit: (p) => { p.sites[0].blockedArcs = [{ startAz: 360, endAz: 10, heightDeg: 5 }]; }, want: /0 instead of 360/ },
  { name: 'too many zones', edit: (p) => { p.sites[0].blockedArcs = Array.from({ length: 40 }, (_, i) => ({ startAz: i, endAz: i + 1, heightDeg: 5 })); }, want: /at most/ },
  { name: 'time zone', edit: (p) => { p.sites[0].timeZone = 'Mars/Base'; }, want: /not a time zone name/ },
  { name: 'bortle fraction', edit: (p) => { p.sites[0].bortle = 2.5; }, want: /whole number/ },
  { name: 'bortle word', edit: (p) => { p.sites[0].bortle = 'abc'; } },
  { name: 'zones missing', edit: (p) => { delete p.sites[0].blockedArcs; }, want: /zones/ },
  { name: 'latitude', edit: (p) => { p.sites[0].latitude = -100; }, want: /latitude/i },
  { name: 'gear number', edit: (p) => { p.equipment.scopes[0].focalLengthMm = -5; }, want: /focal length/i },
  { name: 'name too long', edit: (p) => { p.equipment.scopes[0].name = 'x'.repeat(200); }, want: /at most/ },
  { name: 'boolean', edit: (p) => { p.equipment.cameras[0].colour = 'yes'; }, want: /true or false/ },
  { name: 'read noise', edit: (p) => { p.equipment.cameras[0].readNoiseClass = 'zzz'; }, want: /read noise is saved as "zzz"; use low, medium or high\./ },
  { name: 'filter kind', edit: (p) => { p.equipment.filters[0].kind = 'zzz'; }, want: /is saved as "zzz"; use broadband-LP/ },
  { name: 'mount mode', edit: (p) => { p.equipment.smartScopes[0].mountMode = 'zzz'; }, want: /use "?alt-az"? or "?eq"?/ },
  { name: 'train tag', edit: (p) => { p.trains.find((t: Rec) => t.kind === 'optical').tag = 'zzz'; }, want: /planetary/ },
  { name: 'train kind', edit: (p) => { p.trains[0].kind = 'zzz'; }, want: /optical/ },
  { name: 'plan date', edit: (p) => { p.plans[0].date = '2026-13-45'; }, want: /YYYY-MM-DD/ },
  { name: 'duplicate id', edit: (p) => { p.equipment.cameras.push({ ...p.equipment.cameras[0] }); }, want: /which another camera already uses/ },
  { name: 'unknown scope', edit: (p) => { p.trains.find((t: Rec) => t.kind === 'optical').scopeId = 'nope'; }, want: /no scope has the id "nope"/ },
  { name: 'unknown accessory', edit: (p) => { p.trains.find((t: Rec) => t.kind === 'optical').accessoryIds = ['nope']; }, want: /accessory/ },
  { name: 'unknown smart scope', edit: (p) => { p.trains.find((t: Rec) => t.kind === 'smart').smartScopeId = 'nope'; }, want: /smart scope/ },
  { name: 'plan site', edit: (p) => { p.plans[0].siteId = 'nope'; }, want: /no site has the id "nope"/ },
  { name: 'plan train', edit: (p) => { p.plans[0].trainId = 'nope'; }, want: /no train has the id "nope"/ },
];

const RAW = /\bexpected\b|\bgot\b|allowed:|\$\.|\$:|\[object|undefined/;

function refusal(c: (typeof CASES)[number]): { e: ProfileError; raw: unknown } {
  const p = clone();
  const out = c.edit(p);
  const raw = out === undefined ? p : out;
  try {
    validateProfile(raw);
  } catch (e) {
    if (e instanceof ProfileError) return { e, raw };
    throw e;
  }
  throw new Error(`${c.name}: the validator accepted it`);
}

describe('profileProblemText: every refusal in plain words', () => {
  it.each(CASES)('$name', (c) => {
    const { e, raw } = refusal(c);
    const said = profileProblemText(e, raw);
    expect(said).not.toMatch(RAW);
    expect(said.trim()).not.toBe('');
    if (c.want) expect(said).toMatch(c.want);
  });

  it('malformed JSON', () => {
    try {
      parseProfile('{nope');
    } catch (e) {
      expect(profileProblemText(e as ProfileError, null)).toBe('It is not valid JSON.');
      return;
    }
    throw new Error('accepted');
  });

  it('a message the translator has no sentence for is never shown raw', () => {
    const said = profileProblemText(new ProfileError('$.sites[0].name', 'expected a flux capacitor, got 5'), sampleProfile());
    expect(said).not.toMatch(RAW);
    expect(said).toMatch(/^Site /);
  });

  it('a long stored value is cut', () => {
    const p = clone();
    p.equipment.cameras[0].readNoiseClass = 'z'.repeat(500);
    try {
      validateProfile(p);
    } catch (e) {
      expect(profileProblemText(e as ProfileError, p).length).toBeLessThan(250);
      return;
    }
    throw new Error('accepted');
  });
});

describe('the held notice and the import error use the same words', () => {
  it.each(CASES)('load: $name', (c) => {
    const p = clone();
    const out = c.edit(p);
  const raw = out === undefined ? p : out;
    const r = loadProfile({ getItem: () => JSON.stringify(raw) });
    // Gear numbers, names and site numbers load as they are (flagged, not held); every other refusal is held with a plain notice.
    if (r.held === null) return;
    expect(r.error).not.toMatch(RAW);
  });

  it.each(CASES)('import: $name', (c) => {
    const { e, raw } = refusal(c);
    expect(describeImportError(e, raw)).not.toMatch(RAW);
  });

  it('version too new reads like the import sentence', () => {
    const r = loadProfile({ getItem: () => JSON.stringify({ ...clone(), version: 99 }) });
    expect(r.error).toContain('It is version 99; this planner reads version 3 (and upgrades versions 1 and 2).');
  });
});
