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
  const text = storage.getItem(PROFILE_KEY);
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
 * The evening date to plan for, YYYY-MM-DD in the clock's local time: today,
 * except between midnight and 06:00, when the night still running began yesterday.
 */
export function defaultTonightDate(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getHours() < 6 ? 1 : 0));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
