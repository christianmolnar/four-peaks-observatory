import sample from '../data/sample-profile.json';
import { ProfileError, parseProfile, validateProfile } from '../profile';
import type { BlockedArc, Profile } from '../profile';

export const PROFILE_KEY = 'fpo-planner-profile-v1';
export const CAPTURED_KEY = 'fpo-planner-captured-v1';

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
      return { profile: sampleProfile(), error: `Saved profile rejected: ${e.message}`, stored: false };
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
  const text = storage.getItem(CAPTURED_KEY);
  if (text === null) return new Set();
  const v: unknown = JSON.parse(text);
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`${CAPTURED_KEY} must hold an array of strings`);
  }
  return new Set(v);
}

export function saveCaptured(storage: Pick<Storage, 'setItem'>, ids: ReadonlySet<string>): void {
  storage.setItem(CAPTURED_KEY, JSON.stringify([...ids].sort()));
}

/**
 * A copy of the profile with one site's blocked arc replaced, run through the
 * M1b validator. Throws ProfileError (message starts with the field path) when
 * the arc is invalid, and the profile is unchanged.
 */
export function withSiteArc(profile: Profile, siteId: string, arc: BlockedArc | null): Profile {
  if (!profile.sites.some((s) => s.id === siteId)) throw new ProfileError('$.sites', `unknown site "${siteId}"`);
  return validateProfile({
    ...profile,
    sites: profile.sites.map((s) => (s.id === siteId ? { ...s, blockedArc: arc } : s)),
  });
}

/**
 * The evening date to plan for, YYYY-MM-DD in the site's local mean solar
 * time (from its longitude, so no time zone is needed and the browser's zone
 * does not matter): today, except between midnight and 06:00, when the night
 * still running began yesterday.
 */
export function defaultTonightDate(now: Date, longitude: number): string {
  const local = new Date(now.getTime() + (longitude / 15) * 3600000);
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

/** The three horizon text boxes, exactly as typed. The only copy of the form's state. */
export interface HorizonFields {
  start: string;
  end: string;
  height: string;
}
export type HorizonField = keyof HorizonFields;

/** Limits of each box, in whole degrees. */
export const HORIZON_RANGE: Record<HorizonField, { min: number; max: number }> = {
  start: { min: 0, max: 359 },
  end: { min: 0, max: 359 },
  height: { min: 0, max: 90 },
};
export const MIN_ALTITUDE_RANGE = { min: 0, max: 89 } as const;
export const DEFAULT_MIN_ALTITUDE = 20;
/** What a new blocked arc starts as, and the fallback base when no horizon is saved. */
export const DEFAULT_ARC: BlockedArc = { startAz: 90, endAz: 180, heightDeg: 30 };

export function fieldsFromArc(arc: BlockedArc): HorizonFields {
  return { start: String(arc.startAz), end: String(arc.endAz), height: String(arc.heightDeg) };
}

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
 * True when two sets of boxes mean the same arc: boxes that hold valid whole numbers compare by
 * number (0150 is 150), anything else by its text.
 */
export const sameFields = (a: HorizonFields | null, b: HorizonFields | null): boolean => {
  if (a === null || b === null) return a === b;
  return (['start', 'end', 'height'] as const).every((k) => {
    const x = checkWholeDegrees(a[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
    const y = checkWholeDegrees(b[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
    return x.ok && y.ok ? x.value === y.value : a[k] === b[k];
  });
};

export interface HorizonErrors {
  start?: string;
  end?: string;
  height?: string;
  /** The three numbers are fine but the arc is refused (start equals end, too wide). */
  arc?: string;
}

/** The arc the fields spell, or null if any box is not a valid whole number in range. */
function numbersOf(fields: HorizonFields): BlockedArc | null {
  const s = checkWholeDegrees(fields.start, HORIZON_RANGE.start.min, HORIZON_RANGE.start.max);
  const e = checkWholeDegrees(fields.end, HORIZON_RANGE.end.min, HORIZON_RANGE.end.max);
  const h = checkWholeDegrees(fields.height, HORIZON_RANGE.height.min, HORIZON_RANGE.height.max);
  return s.ok && e.ok && h.ok ? { startAz: s.value, endAz: e.value, heightDeg: h.value } : null;
}

/**
 * Every message for the current text, computed from scratch on each call. Nothing is stored,
 * so a message cannot outlive the text it was about. `arcCheck` is the profile validator's verdict on an arc.
 */
export function checkArcFields(fields: HorizonFields, arcCheck: (arc: BlockedArc) => string | null): HorizonErrors {
  const errors: HorizonErrors = {};
  for (const k of ['start', 'end', 'height'] as const) {
    const c = checkWholeDegrees(fields[k], HORIZON_RANGE[k].min, HORIZON_RANGE[k].max);
    if (!c.ok) errors[k] = c.error;
  }
  const arc = numbersOf(fields);
  if (arc) {
    const message = arcCheck(arc);
    if (message !== null) errors.arc = message;
  }
  return errors;
}

/**
 * The arc the chart previews while the boxes are being edited, and the slider positions (the plan itself uses the saved arc).
 * A box with a message falls back to `base` (the saved arc), never to a half-typed prefix. When the
 * arc itself is refused, including the mix of a typed Start with a fallback End, Start and End both
 * fall back. Valid whenever `base` is.
 */
export function effectiveArc(
  fields: HorizonFields,
  errors: HorizonErrors,
  base: BlockedArc,
  arcCheck: (arc: BlockedArc) => string | null,
): BlockedArc {
  const pick = (k: HorizonField, fallback: number): number => (errors[k] === undefined ? Number(fields[k]) : fallback);
  const arc = { startAz: pick('start', base.startAz), endAz: pick('end', base.endAz), heightDeg: pick('height', base.heightDeg) };
  return errors.arc !== undefined || arcCheck(arc) !== null ? { ...arc, startAz: base.startAz, endAz: base.endAz } : arc;
}

/**
 * The evening date for a profile: its first site's longitude, or the
 * browser's own (from its UTC offset in minutes, as `getTimezoneOffset` gives it)
 * when the profile has no site.
 */
export function defaultDateForProfile(now: Date, profile: Profile): string {
  const lon = profile.sites[0]?.longitude ?? (-now.getTimezoneOffset() / 60) * 15;
  return defaultTonightDate(now, lon);
}
