import sample from '../data/sample-profile.json';
import { ProfileError, parseProfile, validateProfile } from '../profile';
import type { BlockedArc, Profile } from '../profile';
import { zoneOffsetMs } from '../plan';

export const PROFILE_KEY = 'fpo-planner-profile-v1';
export const CAPTURED_KEY = 'fpo-planner-captured-v1';
export const SELECTION_KEY = 'fpo-planner-selection-v1';
export const MY_PLAN_KEY = 'fpo-planner-my-plan-v1';
/** Targets one plan can hold: a night has hours for a handful, and a stored list is read back from the browser, so it is bounded. */
export const MAX_MY_PLAN = 50;

/** The site and train last chosen at the top of the page, and the list's type; any may be gone by now (a removed train, a type the page no longer has). */
export interface Selection {
  siteId: string;
  trainId: string;
  /** The "Best [type] tonight" choice; absent in a selection saved before it existed. */
  typeId?: string;
}

/**
 * The saved selection, or null when none is stored. Damaged text is removed from storage and throws, in words, so the page says it once
 * and the choice starts over; a storage that cannot be read throws too. Whether the ids still exist is the caller's check.
 */
export function loadSelection(storage: Pick<Storage, 'getItem' | 'removeItem'>): Selection | null {
  let text: string | null;
  try {
    text = storage.getItem(SELECTION_KEY);
  } catch (e) {
    throw new Error(`Your last site and train could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  if (text === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    v = null;
  }
  const o = v as Record<string, unknown> | null;
  if (typeof o !== 'object' || o === null || typeof o.siteId !== 'string' || typeof o.trainId !== 'string') {
    try {
      storage.removeItem(SELECTION_KEY);
    } catch (e) {
      throw new Error(`Your saved site and train choice is damaged and could not be cleared: ${(e as Error).message}`);
    }
    throw new Error('Your saved site and train choice is damaged, so the first of each is used.');
  }
  // A type that is not text is dropped (All): the site and train beside it are still good.
  return typeof o.typeId === 'string' ? { siteId: o.siteId, trainId: o.trainId, typeId: o.typeId } : { siteId: o.siteId, trainId: o.trainId };
}

export function saveSelection(storage: Pick<Storage, 'setItem'>, selection: Selection): void {
  storage.setItem(SELECTION_KEY, JSON.stringify({ siteId: selection.siteId, trainId: selection.trainId, typeId: selection.typeId }));
}

/**
 * "My plan": the targets the user picked, best first (the order is their priority), as catalog ids (a planet is "planet-jupiter").
 * Same storage pattern as the selection: damaged text is removed and throws in words, so the page says it once and starts with an empty plan.
 */
export function loadMyPlan(storage: Pick<Storage, 'getItem' | 'removeItem'>): string[] {
  let text: string | null;
  try {
    text = storage.getItem(MY_PLAN_KEY);
  } catch (e) {
    throw new Error(`Your plan could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  if (text === null) return [];
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    v = null;
  }
  const ids = (v as { version?: unknown; ids?: unknown } | null)?.ids;
  const ok =
    (v as { version?: unknown } | null)?.version === 1 &&
    Array.isArray(ids) &&
    ids.length <= MAX_MY_PLAN &&
    ids.every((id) => typeof id === 'string' && id !== '') &&
    new Set(ids).size === ids.length;
  if (!ok) {
    try {
      storage.removeItem(MY_PLAN_KEY);
    } catch (e) {
      throw new Error(`Your saved plan is damaged and could not be cleared: ${(e as Error).message}`);
    }
    throw new Error('Your saved plan is damaged, so it starts empty.');
  }
  return ids as string[];
}

export function saveMyPlan(storage: Pick<Storage, 'setItem'>, ids: readonly string[]): void {
  storage.setItem(MY_PLAN_KEY, JSON.stringify({ version: 1, ids }));
}

/** The default profile for a first visit, loaded through the same validator as any user's. */
export function sampleProfile(): Profile {
  return validateProfile(sample);
}

export interface LoadedProfile {
  profile: Profile;
  /** Set when stored data was rejected: the sample is shown and the stored text is left untouched. */
  error: string | null;
  /** True when the profile came from storage, false for the sample. */
  stored: boolean;
}

/**
 * Reads the saved profile. Nothing stored gives the sample. Stored text that
 * fails validation gives the sample plus the error with its field path; the
 * bad text stays in storage until the user saves or resets.
 */
export function loadProfile(storage: Pick<Storage, 'getItem'>): LoadedProfile {
  let text: string | null;
  try {
    text = storage.getItem(PROFILE_KEY);
  } catch (e) {
    return {
      profile: sampleProfile(),
      error: `Saved profile could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`,
      stored: false,
    };
  }
  if (text === null) return { profile: sampleProfile(), error: null, stored: false };
  try {
    return { profile: parseProfile(text), error: null, stored: true };
  } catch (e) {
    if (e instanceof ProfileError) {
      const why = e.path === '$' && /not valid JSON/.test(e.message)
        ? 'It is not valid JSON.'
        : `Problem at ${e.path}: ${e.message.slice(e.path.length + 2)}`;
      return { profile: sampleProfile(), error: `Your saved profile could not be used, so the sample is shown. ${why}`, stored: false };
    }
    throw e;
  }
}

/** Validates, then stores. Throws ProfileError on an invalid profile and writes nothing. */
export function saveProfile(storage: Pick<Storage, 'setItem'>, profile: Profile): void {
  validateProfile(profile);
  storage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function loadCaptured(storage: Pick<Storage, 'getItem'>): Set<string> {
  let text: string | null;
  try {
    text = storage.getItem(CAPTURED_KEY);
  } catch (e) {
    throw new Error(`Your saved captured list could not be read (browser storage is blocked or unavailable): ${(e as Error).message}`);
  }
  if (text === null) return new Set();
  const damaged = new Error('Your saved captured list is damaged, so it starts empty.');
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw damaged;
  }
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) throw damaged;
  return new Set(v);
}

export function saveCaptured(storage: Pick<Storage, 'setItem'>, ids: ReadonlySet<string>): void {
  storage.setItem(CAPTURED_KEY, JSON.stringify([...ids].sort()));
}

/**
 * A copy of the profile with one site's blocked zones replaced, run through the
 * M1b validator. Throws ProfileError (message starts with the field path) when
 * the list is invalid (more than MAX_ZONES, overlapping, a bad arc), and the profile is unchanged.
 */
export function withSiteArcs(profile: Profile, siteId: string, arcs: BlockedArc[]): Profile {
  if (!profile.sites.some((s) => s.id === siteId)) throw new ProfileError('$.sites', `unknown site "${siteId}"`);
  return validateProfile({
    ...profile,
    sites: profile.sites.map((s) => (s.id === siteId ? { ...s, blockedArcs: arcs } : s)),
  });
}

/**
 * A copy of the profile with one optical train's filter set (or cleared with null),
 * run through the validator. Throws ProfileError for an unknown filter, and for a
 * smart-scope train, which has no filter slot. The profile is unchanged on error.
 */
export function withTrainFilter(profile: Profile, trainId: string, filterId: string | null): Profile {
  const train = profile.trains.find((t) => t.id === trainId);
  if (!train) throw new ProfileError('$.trains', `unknown train "${trainId}"`);
  if (train.kind !== 'optical') throw new ProfileError('$.trains', `train "${trainId}" is a smart scope and has no filter`);
  return validateProfile({
    ...profile,
    trains: profile.trains.map((t) => {
      if (t.id !== trainId || t.kind !== 'optical') return t;
      const next = { ...t };
      delete next.filterId;
      return filterId === null ? next : { ...next, filterId };
    }),
  });
}

/**
 * The evening date to plan for, YYYY-MM-DD in the site's local mean solar
 * time (from its longitude, so no time zone is needed and the browser's zone
 * does not matter): today, except between midnight and 06:00, when the night
 * still running began yesterday. With the site's IANA `timeZone` the clock is
 * that zone's civil time instead.
 */
export function defaultTonightDate(now: Date, longitude: number, timeZone?: string): string {
  const local = new Date(now.getTime() + (timeZone ? zoneOffsetMs(now, timeZone) : (longitude / 15) * 3600000));
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - (local.getUTCHours() < 6 ? 1 : 0)));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Friendly editor wording for a rejected arc; import errors keep the field path. */
export function friendlyArcError(e: ProfileError): string {
  if (/must differ|span at least/.test(e.message)) return 'Start and End must differ.';
  if (/leave at least/.test(e.message)) return 'Too wide: leave some horizon open.';
  return e.message.replace(/^\$[^:]*: /, '');
}

/** The three boxes of one zone, exactly as typed. The zone list is the only copy of the form's state. */
export interface HorizonFields {
  start: string;
  end: string;
  height: string;
}
export type HorizonField = keyof HorizonFields;

/** Limits of each box, in whole degrees. An azimuth runs 0 to 360 whatever the other zones hold; 360 is the same direction as 0 and is stored as 0. */
export const HORIZON_RANGE: Record<HorizonField, { min: number; max: number }> = {
  start: { min: 0, max: 360 },
  end: { min: 0, max: 360 },
  height: { min: 0, max: 90 },
};
export const MIN_ALTITUDE_RANGE = { min: 0, max: 89 } as const;
export const DEFAULT_MIN_ALTITUDE = 20;
/** How wide an added zone starts, in degrees. */
export const NEW_ZONE_WIDTH = 30;
export const DEFAULT_ARC: BlockedArc = { startAz: 90, endAz: 180, heightDeg: 30 };

export function fieldsFromArc(arc: BlockedArc): HorizonFields {
  return { start: String(arc.startAz), end: String(arc.endAz), height: String(arc.heightDeg) };
}

/** An azimuth box's number as stored: 360 is north, 0. Heights are unchanged. */
const direction = (k: HorizonField, n: number): number => (k === 'height' ? n : n % 360);

const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)$/;

export type WholeDegrees = { ok: true; value: number } | { ok: false; error: string };

/**
 * Checks the text of a whole-degree box. The message is the one line shown under the box.
 * `unit` is appended to the range message ("Use 0 to 359 degrees.").
 */
export function checkWholeDegrees(text: string, min: number, max: number, unit = ' degrees'): WholeDegrees {
  const t = text.trim();
  if (t === '') return { ok: false, error: `Enter a number from ${min} to ${max}.` };
  if (!NUMBER_TEXT.test(t)) return { ok: false, error: `Numbers only, from ${min} to ${max}.` };
  const value = Number(t);
  if (!Number.isInteger(value)) return { ok: false, error: 'Whole degrees only.' };
  if (value < min || value > max) return { ok: false, error: `Use ${min} to ${max}${unit}.` };
  return { ok: true, value };
}

/**
 * True when two sets of boxes mean the same zone: boxes that hold valid whole numbers compare by
 * number (0150 is 150), anything else by its text.
 */
const sameZone = (a: HorizonFields, b: HorizonFields): boolean =>
  (['start', 'end', 'height'] as const).every((k) => {
    const x = checkWholeDegrees(a[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
    const y = checkWholeDegrees(b[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
    return x.ok && y.ok ? direction(k, x.value) === direction(k, y.value) : a[k] === b[k];
  });

/** True when two zone lists mean the same zones in the same order. */
export const sameFields = (a: readonly HorizonFields[], b: readonly HorizonFields[]): boolean =>
  a.length === b.length && a.every((z, i) => sameZone(z, b[i]));

export interface HorizonErrors {
  start?: string;
  end?: string;
  height?: string;
  /** The three numbers are fine but the zone is refused (start equals end, too wide). */
  arc?: string;
}

/** The arc the fields spell, or null if any box is not a valid whole number in range. */
function numbersOf(fields: HorizonFields): BlockedArc | null {
  const s = checkWholeDegrees(fields.start, HORIZON_RANGE.start.min, HORIZON_RANGE.start.max);
  const e = checkWholeDegrees(fields.end, HORIZON_RANGE.end.min, HORIZON_RANGE.end.max);
  const h = checkWholeDegrees(fields.height, HORIZON_RANGE.height.min, HORIZON_RANGE.height.max);
  return s.ok && e.ok && h.ok ? { startAz: s.value % 360, endAz: e.value % 360, heightDeg: h.value } : null;
}

/**
 * Every message for the current text of every zone, computed from scratch on each call. Nothing is
 * stored, so a message cannot outlive the text it was about. `arcCheck` is the profile validator's
 * verdict on one zone alone. Zones may overlap, so no zone is refused for another's numbers.
 */
export function checkZoneFields(zones: readonly HorizonFields[], arcCheck: (arc: BlockedArc) => string | null): HorizonErrors[] {
  const arcs = zones.map(numbersOf);
  return zones.map((fields, i) => {
    const errors: HorizonErrors = {};
    for (const k of ['start', 'end', 'height'] as const) {
      const c = checkWholeDegrees(fields[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
      if (!c.ok) errors[k] = c.error;
    }
    const arc = arcs[i];
    if (arc) {
      const message = arcCheck(arc);
      if (message !== null) errors.arc = message;
    }
    return errors;
  });
}

/**
 * The zone the chart previews while the boxes are being edited, and the slider positions (the plan itself uses the saved zones).
 * A box with a message falls back to `base` (that row's own last saved or loaded zone, carried with the row, never another row's), never to a half-typed prefix. When the
 * zone itself is refused, including the mix of a typed Start with a fallback End, Start and End both
 * fall back. Valid whenever `base` is. A new row has no `base` (null): with any message it is not drawn.
 */
export function effectiveArc(
  fields: HorizonFields,
  errors: HorizonErrors,
  base: BlockedArc | null,
  arcCheck: (arc: BlockedArc) => string | null,
): BlockedArc | null {
  if (base === null) return Object.keys(errors).length > 0 ? null : numbersOf(fields);
  const pick = (k: HorizonField, fallback: number): number => (errors[k] === undefined ? direction(k, Number(fields[k])) : fallback);
  const arc = { startAz: pick('start', base.startAz), endAz: pick('end', base.endAz), heightDeg: pick('height', base.heightDeg) };
  return errors.arc !== undefined || arcCheck(arc) !== null ? { ...arc, startAz: base.startAz, endAz: base.endAz } : arc;
}

/**
 * A new zone: the default for the first. Otherwise it starts where the last zone in the list ends (the last one whose
 * boxes hold numbers), is NEW_ZONE_WIDTH degrees wide (wrapping past 360) and has that zone's height. Its sliders
 * run the full range; the user moves it from there. Overlap is allowed, so it is never moved to fit.
 */
export function newZoneFields(zones: readonly HorizonFields[]): HorizonFields {
  const last = zones.map(numbersOf).filter((a): a is BlockedArc => a !== null).at(-1);
  if (last === undefined) return fieldsFromArc(DEFAULT_ARC);
  return fieldsFromArc({ startAz: last.endAz, endAz: (last.endAz + NEW_ZONE_WIDTH) % 360, heightDeg: last.heightDeg });
}

/**
 * The evening date for a profile: its first site's longitude, or the
 * browser's own (from its UTC offset in minutes, as `getTimezoneOffset` gives it)
 * when the profile has no site.
 */
export function defaultDateForProfile(now: Date, profile: Profile): string {
  const lon = profile.sites[0]?.longitude ?? (-now.getTimezoneOffset() / 60) * 15;
  return defaultTonightDate(now, lon, profile.sites[0]?.timeZone);
}
