export type AuthState = { kind: 'disabled' } | { kind: 'signedOut' } | { kind: 'signedIn'; login: string; /** On the owner allowlist: the AI plan's quality review is for these. */ owner: boolean };

/** The page is prerendered, so the signed-out form is in the HTML; the session is read here after load. */
export async function loadAuthState(): Promise<AuthState> {
  const res = await fetch('/api/planner/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw new Error(`Session check failed: ${res.status}`);
  const body = (await res.json()) as { signedIn?: boolean; login?: string; owner?: boolean; configured?: boolean };
  if (body.signedIn && body.login) return { kind: 'signedIn', login: body.login, owner: body.owner === true };
  return body.configured === false ? { kind: 'disabled' } : { kind: 'signedOut' };
}
