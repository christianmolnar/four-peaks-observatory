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
  if (/must differ|span at least/.test(e.message)) return 'Start and end must differ.';
  if (/leave at least/.test(e.message)) return 'The arc is too wide: leave some of the horizon unblocked, or clear the horizon.';
  return e.message.replace(/^\$[^:]*: /, '');
}

/** What a number box and slider pair is typing right now. `base` is the committed value when the text was entered. */
export interface NumberDraft {
  text: string;
  base: number;
}

export interface NumberView {
  /** Text for the number box. */
  text: string;
  /** Message to show, or null. */
  error: string | null;
}

/**
 * What the number box shows and which error stands, derived from the typed
 * draft and the committed `value` on every render so it cannot go stale.
 * - No draft, or a draft the page has since moved away from (Discard, Reset,
 *   a site change), shows the committed value.
 * - A draft that was accepted shows as typed ("1.0" stays "1.0").
 * - A rejected draft keeps its text and message while the committed value is
 *   unchanged and `validate` still refuses it; once it would be accepted (the
 *   other azimuth moved) the box falls back to the committed value.
 * `validate` is pure: a message, or null when `onCommit` would accept the number.
 */
export function numberView(
  draft: NumberDraft | null,
  value: number,
  min: number,
  max: number,
  label: string,
  unit: string,
  validate: (n: number) => string | null,
): NumberView {
  const shownValue: NumberView = { text: String(value), error: null };
  if (draft === null) return shownValue;
  const c = checkNumberText(draft.text, min, max, label, unit);
  if (c.ok && c.value === value) return { text: draft.text, error: null };
  const error = c.ok ? validate(c.value) : c.error;
  if (error !== null && draft.base === value) return { text: draft.text, error };
  return shownValue;
}

export type NumberCheck = { ok: true; value: number } | { ok: false; error: string };

/** Checks text from a number box (or a slider) against a range; the message says what is wrong. */
export function checkNumberText(text: string, min: number, max: number, label: string, unit: string): NumberCheck {
  if (text.trim() === '') return { ok: false, error: `${label}: enter a number.` };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, error: `${label}: "${text}" is not a number.` };
  if (value < min || value > max) return { ok: false, error: `${label} must be from ${min} to ${max} ${unit}.` };
  return { ok: true, value };
}
