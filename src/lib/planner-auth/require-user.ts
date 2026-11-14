import { getSession } from '@/auth'
import { isOwner } from './owners'

export type PlannerUser = { login: string; id: string; owner: boolean }

async function readUser(): Promise<PlannerUser | null> {
  const session = await getSession()
  const u = session?.user
  const id = u?.googleSub
  const login = u?.login
  if (!login || !id) return null
  return { login, id, owner: isOwner({ sub: id, email: u.email, emailVerified: u.googleEmailVerified }) }
}

/**
 * Guard for API routes. Returns the signed-in user, or a 401 Response to return as is.
 * Default deny: no session, no login or Google id, or sign-in not configured all give 401.
 * Signed-in is not enough for an owner-only route: use requireOwner.
 */
export async function requireUser(): Promise<{ user: PlannerUser } | { response: Response }> {
  const user = await readUser()
  if (!user) return { response: new Response('Unauthorized', { status: 401 }) }
  return { user }
}

/**
 * Guard for any route that must stay owner-only: 401 signed out, 403 signed in but not on the allowlist.
 * The AI night-plan route is not one of them: it is open to guests with caps (see identifyCaller).
 */
export async function requireOwner(): Promise<{ user: PlannerUser } | { response: Response }> {
  const result = await requireUser()
  if ('response' in result) return result
  if (!result.user.owner) return { response: new Response('Forbidden', { status: 403 }) }
  return result
}

/** Who is calling, for routes open to everyone: an allowlisted Google account is an owner, everyone else (signed in or not) is a guest. Never fails. */
export async function identifyCaller(): Promise<{ kind: 'owner'; user: PlannerUser } | { kind: 'guest' }> {
  const user = await readUser()
  return user?.owner ? { kind: 'owner', user } : { kind: 'guest' }
}
