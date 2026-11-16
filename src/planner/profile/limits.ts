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

export const GEAR_LIMITS = {
  focalLengthMm: { min: 50, max: 10000, unit: 'mm', noun: 'focal length' },
  apertureMm: { min: 20, max: 1000, unit: 'mm', noun: 'aperture' },
  pixelSizeUm: { min: 1, max: 20, unit: 'µm', noun: 'pixel size' },
  sensorWidthPx: { min: 100, max: 20000, whole: true, unit: 'px', noun: 'sensor width' },
  sensorHeightPx: { min: 100, max: 20000, whole: true, unit: 'px', noun: 'sensor height' },
  factor: { min: 0.2, max: 5, unit: '', noun: 'focal length factor' },
  effectiveFocalLengthMm: { min: 50, max: 10000, unit: 'mm', noun: 'whole-scope focal length' },
  sizeMm: { min: 10, max: 100, unit: 'mm', noun: 'filter size' },
  passbandWidthNm: { min: 0.1, max: 1000, unit: 'nm', noun: 'total passband width' },
  narrowestBandNm: { min: 0.1, max: 1000, unit: 'nm', noun: 'narrowest band' },
  ratedMinFRatio: { min: 0.5, max: 30, unit: '', noun: 'fastest rated focal ratio' },
  maxIncidentAngleDeg: { min: 0.1, max: 89, unit: 'deg', noun: 'largest incident angle' },
} as const satisfies Record<string, GearLimit>;

export type GearLimitKey = keyof typeof GEAR_LIMITS;

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

/** "50 to 10,000 mm". */
export function rangeText(limit: GearLimit): string {
  return `${fmt(limit.min)} to ${fmt(limit.max)}${limit.unit === '' ? '' : ` ${limit.unit}`}`;
}

/** True for a finite number inside the range (and whole, when the field is whole). */
export function inRange(limit: GearLimit, v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= limit.min && v <= limit.max && (!limit.whole || Number.isInteger(v));
}

export const capitalised = (s: string): string => (s === '' ? s : s[0].toUpperCase() + s.slice(1));

/** The plain sentence that says what to enter: "Enter a focal length between 50 and 10,000 mm." */
export function enterText(limit: GearLimit): string {
  const unit = limit.unit === '' ? '' : ` ${limit.unit}`;
  const article = /^[aeiou]/i.test(limit.noun) ? 'an' : 'a';
  return `Enter ${limit.whole ? `a whole number for the ${limit.noun}` : `${article} ${limit.noun}`} between ${fmt(limit.min)} and ${fmt(limit.max)}${unit}.`;
}

/** A value a box holds that is not a number in range, as one plain sentence: "Focal length: Enter a focal length between 50 and 10,000 mm." */
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
  value: number;
}

/** A stored value as text: "99,999 mm", "1.00e+300 mm". */
export function valueText(key: GearLimitKey, value: number): string {
  const limit = GEAR_LIMITS[key];
  const n = Math.abs(value) >= 1e7 || (value !== 0 && Math.abs(value) < 1e-3) ? value.toExponential(2) : fmt(value);
  return `${n}${limit.unit === '' ? '' : ` ${limit.unit}`}`;
}

/** "Focal length 99,999 mm is outside 50 to 10,000 mm, so the planner does not use it." */
export function problemText(p: Pick<GearProblem, 'key' | 'value'>): string {
  const limit = GEAR_LIMITS[p.key];
  return `${capitalised(limit.noun)} ${valueText(p.key, p.value)} is outside ${rangeText(limit)}, so the planner does not use it.`;
}

const KEYS = Object.keys(GEAR_LIMITS) as GearLimitKey[];

/** The keys of `item` that hold a number outside the gear range. */
export function outOfRangeKeys(item: object): GearLimitKey[] {
  const rec = item as Record<string, unknown>;
  return KEYS.filter((k) => typeof rec[k] === 'number' && !inRange(GEAR_LIMITS[k], rec[k]));
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
      for (const key of outOfRangeKeys(item)) out.push({ list, id: item.id, itemName: item.name, key, value: (item as unknown as Record<string, number>)[key] });
    }
  }
  return out;
}
