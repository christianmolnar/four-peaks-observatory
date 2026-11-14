/**
 * Parse a comma-separated list of Google account ids (the `sub` claim, a numeric string). Unset or empty means nobody.
 * Anything that is not a plain positive integer is dropped, so a typo can never grant access.
 */
export function parseOwnerSubs(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[1-9]\d*$/.test(s))
}

const EMAIL_RE = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

/** Parse a comma-separated list of email addresses, lowercased. Malformed entries are dropped; unset or empty means nobody. */
export function parseOwnerEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s))
}

export type GoogleIdentity = { sub?: string | null; email?: string | null; emailVerified?: boolean | null }

/**
 * True for a Google account on the allowlist. Two ways in:
 * - `sub` is in PLANNER_OWNER_GOOGLE_SUB (the stable id, preferred).
 * - `email` is in PLANNER_OWNER_GOOGLE_EMAIL AND Google says it is verified (`email_verified === true`). An unverified email never matches.
 * Unset or empty lists mean nobody.
 */
export function isOwner(identity: GoogleIdentity, env: Record<string, string | undefined> = process.env): boolean {
  if (identity.sub && parseOwnerSubs(env.PLANNER_OWNER_GOOGLE_SUB).includes(String(identity.sub))) return true
  if (identity.emailVerified === true && identity.email) {
    return parseOwnerEmails(env.PLANNER_OWNER_GOOGLE_EMAIL).includes(identity.email.trim().toLowerCase())
  }
  return false
}

/** True when every env var sign-in needs is present. Names only; values are never read out. */
export function authConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return ['AUTH_SECRET', 'AUTH_GOOGLE_ID', 'AUTH_GOOGLE_SECRET'].every((k) => Boolean(env[k]?.trim()))
}
