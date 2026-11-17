import type { Profile } from './types';

/**
 * The real range of every number a user can enter for gear, defined once. The form, the validator, the store, the engine's inputs and
 * every message read these; nothing else holds a copy. A range is a domain decision (what telescopes and cameras exist), not a typing guard.
 */
export interface GearLimit {
  min: number;
  max: number;
  /** Whole numbers only. */
  whole?: boolean;
  /** Shown after the numbers: "mm", "µm", "px"; empty when the number has no unit. */
  unit: string;
  /** What the number is, in a sentence: "focal length", "pixel size". */
  noun: string;
}

/** Longest name a gear item, train or site may have; the cards and the print sheet are made for names of this size. */
export const MAX_NAME_CHARS = 80;

/** The focal length of a scope and of a whole train (reducers and extenders included): one range, so the two cannot drift apart. */
const FOCAL_LENGTH_MM = { min: 10, max: 10000 } as const;

export const GEAR_LIMITS = {
  focalLengthMm: { ...FOCAL_LENGTH_MM, unit: 'mm', noun: 'focal length' },
  apertureMm: { min: 5, max: 1000, unit: 'mm', noun: 'aperture' },
  pixelSizeUm: { min: 1, max: 25, unit: 'µm', noun: 'pixel size' },
  sensorWidthPx: { min: 100, max: 20000, whole: true, unit: 'px', noun: 'sensor width' },
  sensorHeightPx: { min: 100, max: 20000, whole: true, unit: 'px', noun: 'sensor height' },
  factor: { min: 0.2, max: 5, unit: '', noun: 'focal length factor' },
  effectiveFocalLengthMm: { ...FOCAL_LENGTH_MM, unit: 'mm', noun: 'whole-scope focal length' },
  sizeMm: { min: 10, max: 100, unit: 'mm', noun: 'filter size' },
  passbandWidthNm: { min: 0.1, max: 1000, unit: 'nm', noun: 'total passband width' },
  narrowestBandNm: { min: 0.1, max: 1000, unit: 'nm', noun: 'narrowest band' },
  ratedMinFRatio: { min: 0.5, max: 30, unit: '', noun: 'fastest rated focal ratio' },
  maxIncidentAngleDeg: { min: 0.1, max: 89, unit: 'deg', noun: 'largest incident angle' },
  // The spec library's numbers (a passband is a centre and a width; glass is the filter's thickness; the f-number is a scope's focal ratio).
  passbandCentreNm: { min: 300, max: 1100, unit: 'nm', noun: 'passband centre' },
  bandWidthNm: { min: 0.1, max: 1000, unit: 'nm', noun: 'passband width' },
  glassMm: { min: 0.5, max: 10, unit: 'mm', noun: 'glass thickness' },
  fNumber: { min: 0.5, max: 30, unit: '', noun: 'focal ratio' },
} as const satisfies Record<string, GearLimit>;

export type GearLimitKey = keyof typeof GEAR_LIMITS;

/** The wavelengths a passband's two edges (centre minus and plus half its width) may reach: ultraviolet to near infrared, what a filter for an imaging sensor covers. */
export const BAND_EDGE_NM = { min: 200, max: 1200, whole: false, unit: 'nm', noun: 'passband edge' } as const satisfies GearLimit;

/** The numbers of a site. Latitude, longitude and the Bortle class are structure, not gear: a value outside is always refused. */
export const SITE_LIMITS = {
  latitude: { min: -90, max: 90, unit: 'deg', noun: 'latitude' },
  longitude: { min: -180, max: 180, unit: 'deg', noun: 'longitude' },
  elevationM: { min: -500, max: 9000, unit: 'm', noun: 'elevation' },
  bortle: { min: 1, max: 9, whole: true, unit: '', noun: 'Bortle class' },
} as const satisfies Record<string, GearLimit>;

export type SiteLimitKey = keyof typeof SITE_LIMITS;

export const limitOf = (key: string): GearLimit | undefined =>
  (GEAR_LIMITS as Record<string, GearLimit>)[key] ?? (SITE_LIMITS as Record<string, GearLimit>)[key];

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 6 });

/** "10 to 10,000 mm". */
export function rangeText(limit: GearLimit): string {
  return `${fmt(limit.min)} to ${fmt(limit.max)}${limit.unit === '' ? '' : ` ${limit.unit}`}`;
}

/** True for a finite number inside the range (and whole, when the field is whole). */
export function inRange(limit: GearLimit, v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= limit.min && v <= limit.max && (!limit.whole || Number.isInteger(v));
}

export const capitalised = (s: string): string => (s === '' ? s : s[0].toUpperCase() + s.slice(1));

/** The plain sentence that says what to enter: "Enter a focal length between 10 and 10,000 mm." */
export function enterText(limit: GearLimit): string {
  const unit = limit.unit === '' ? '' : ` ${limit.unit}`;
  const article = /^[aeiou]/i.test(limit.noun) ? 'an' : 'a';
  return `Enter ${limit.whole ? `a whole number for the ${limit.noun}` : `${article} ${limit.noun}`} between ${fmt(limit.min)} and ${fmt(limit.max)}${unit}.`;
}

/** A value a box holds that is not a number in range, as one plain sentence: "Focal length: Enter a focal length between 10 and 10,000 mm." */
export function rangeProblem(label: string, limit: GearLimit, text: string): string {
  const t = text.trim();
  const shown = t.length > 20 ? `${t.slice(0, 20)}…` : t;
  const n = Number(t);
  if (!Number.isFinite(n)) return `${label}: "${shown}" is not a number. ${enterText(limit)}`;
  return `${label}: ${shown} is outside the allowed range. ${enterText(limit)}`;
}

/** One stored gear number that is outside its range. The value is kept; the planner does not use it. */
export interface GearProblem {
  /** The list the item is in, and the item. */
  list: 'scopes' | 'accessories' | 'cameras' | 'smartScopes' | 'filters';
  id: string;
  itemName: string;
  key: GearLimitKey;
  value: unknown;
}

/** Every number the planner range-checks, gear or site. The two key sets do not overlap. */
const ALL_LIMITS: Record<GearLimitKey | SiteLimitKey, GearLimit> = { ...GEAR_LIMITS, ...SITE_LIMITS };

/** A stored value as text: "99,999 mm", "an impossibly large number", "abc" (in quotes), "nothing", "something that is not a number" (an object or list). */
export function valueText(key: GearLimitKey | SiteLimitKey, value: unknown): string {
  const limit = ALL_LIMITS[key];
  if (value === null) return 'nothing';
  if (typeof value === 'string') return `"${value.length > 20 ? `${value.slice(0, 20)}…` : value}"`;
  if (typeof value === 'boolean') return `"${value}"`;
  if (typeof value === 'object') return 'something that is not a number';
  if (typeof value !== 'number' || !Number.isFinite(value)) return `"${String(value).slice(0, 20)}"`;
  if (Math.abs(value) >= 1e7) return 'an impossibly large number';
  if (value !== 0 && Math.abs(value) < 1e-3) return 'an impossibly small number';
  return `${fmt(value)}${limit.unit === '' ? '' : ` ${limit.unit}`}`;
}

/**
 * "Focal length 99,999 mm is outside 10 to 10,000 mm, so the planner does not use it." A saved value that is not a number says so, in words
 * for any stored type. `use` is what is not used: "it" for a gear value, "this site" for a site's.
 */
export function problemText(p: { key: GearLimitKey | SiteLimitKey; value: unknown }, use = 'it'): string {
  const limit = ALL_LIMITS[p.key];
  const noun = capitalised(limit.noun);
  const shown = valueText(p.key, p.value);
  if (typeof p.value !== 'number') {
    const odd = typeof p.value === 'object' && p.value !== null;
    return `${noun} is saved as ${shown}${odd ? '' : ', which is not a number'}, so the planner does not use ${use}. Enter ${limit.whole ? 'a whole number' : 'a number'} from ${rangeText(limit)}.`;
  }
  if (shown.startsWith('an ')) return `${noun} is ${shown}, outside ${rangeText(limit)}, so the planner does not use ${use}.`;
  return `${noun} ${shown} is outside ${rangeText(limit)}, so the planner does not use ${use}.`;
}

const KEYS = Object.keys(GEAR_LIMITS) as GearLimitKey[];

/** The keys of `item` that hold a number outside the gear range. */
export function outOfRangeKeys(item: object): GearLimitKey[] {
  const rec = item as Record<string, unknown>;
  return KEYS.filter((k) => rec[k] !== undefined && !inRange(GEAR_LIMITS[k], rec[k]));
}

/** A copy of an equipment item without its out-of-range numbers (they are unknown to the planner, not guessed). */
export function withoutOutOfRange<T extends object>(item: T): T {
  const bad = outOfRangeKeys(item);
  if (bad.length === 0) return item;
  const out = { ...item } as Record<string, unknown>;
  for (const k of bad) delete out[k];
  return out as T;
}

/** Every stored gear number outside its range, in the profile's order. */
export function gearProblems(profile: Profile): GearProblem[] {
  const out: GearProblem[] = [];
  const lists = ['scopes', 'accessories', 'cameras', 'smartScopes', 'filters'] as const;
  for (const list of lists) {
    for (const item of profile.equipment[list] as { id: string; name: string }[]) {
      for (const key of outOfRangeKeys(item)) out.push({ list, id: item.id, itemName: item.name, key, value: (item as unknown as Record<string, unknown>)[key] });
    }
  }
  return out;
}

const SITE_KEYS = Object.keys(SITE_LIMITS) as SiteLimitKey[];

/** The keys of a site that hold a number outside its range, or something that is not a number. */
export function siteBadKeys(site: object): SiteLimitKey[] {
  const rec = site as Record<string, unknown>;
  return SITE_KEYS.filter((k) => rec[k] !== undefined && !inRange(SITE_LIMITS[k], rec[k]));
}

/** One stored site number that cannot be used. The value is kept; the site is not used until it is changed. */
export interface SiteProblem {
  id: string;
  siteName: string;
  key: SiteLimitKey;
  value: unknown;
}

/** Every stored site number outside its range, in the profile's order. */
export function siteProblems(profile: Profile): SiteProblem[] {
  return profile.sites.flatMap((s) => siteBadKeys(s).map((key) => ({ id: s.id, siteName: s.name, key, value: (s as unknown as Record<string, unknown>)[key] })));
}

/** The sites the planner can use: those with every number in range. A site with a bad number is kept in the profile and flagged, never used. */
export function usableSites(profile: Profile): Profile['sites'] {
  return profile.sites.filter((s) => siteBadKeys(s).length === 0);
}
