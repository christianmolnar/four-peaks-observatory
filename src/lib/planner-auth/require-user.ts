import { getSession } from '@/auth'
import { isOwner } from './owners'

export type PlannerUser = { login: string; id: string; owner: boolean }

/**
 * Guard for API routes. Returns the signed-in user, or a 401 Response to return as is.
 * Default deny: no session, no login or id, or sign-in not configured all give 401.
 * Signed-in is not enough for anything that costs money: use requireOwner.
 */
export async function requireUser(): Promise<{ user: PlannerUser } | { response: Response }> {
  const session = await getSession()
  const login = session?.user?.login
  const id = session?.user?.githubId
  if (!login || !id) return { response: new Response('Unauthorized', { status: 401 }) }
  return { user: { login, id, owner: isOwner(id) } }
}

/**
 * THE gate for every route that costs money (model prompt box, AI lookup, anything billed per call).
 * Call it first in the handler, before any paid call. 401 signed out, 403 signed in but not an owner.
 * Every other signed-in visitor gets the free planner only.
 */
export async function requireOwner(): Promise<{ user: PlannerUser } | { response: Response }> {
  const result = await requireUser()
  if ('response' in result) return result
  if (!result.user.owner) return { response: new Response('Forbidden', { status: 403 }) }
  return result
}
