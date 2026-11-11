/**
 * Parse a comma-separated list of numeric GitHub user ids. Unset or empty means nobody.
 * Anything that is not a plain positive integer is dropped, so a typo can never grant access.
 */
export function parseOwnerIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[1-9]\d*$/.test(s))
}

/**
 * True only for a numeric GitHub id on the owner list. Unset or empty list means no owners.
 * Ids, not logins: a GitHub login can be renamed and then claimed by someone else, an id cannot.
 */
export function isOwner(
  id: string | number | null | undefined,
  raw: string | undefined = process.env.PLANNER_OWNER_GITHUB_ID,
): boolean {
  if (id === null || id === undefined || id === '') return false
  return parseOwnerIds(raw).includes(String(id))
}

/** True when every env var sign-in needs is present. Names only; values are never read out. */
export function authConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET'].every((k) => Boolean(env[k]?.trim()))
}
