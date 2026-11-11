/** Parse a comma-separated list of GitHub logins. Unset or empty means nobody. */
export function parseOwners(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** True only for a login on the owner list. Unset or empty list means no owners. */
export function isOwner(
  login: string | null | undefined,
  raw: string | undefined = process.env.PLANNER_OWNER_GITHUB,
): boolean {
  if (!login) return false
  return parseOwners(raw).includes(login.toLowerCase())
}

/** True when every env var sign-in needs is present. Names only; values are never read out. */
export function authConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET'].every((k) => Boolean(env[k]?.trim()))
}
