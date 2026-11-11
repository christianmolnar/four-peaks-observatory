import { getSession } from '@/auth'
import { isOwner } from './owners'

export type PlannerUser = { login: string; owner: boolean }

/**
 * Guard for API routes. Returns the signed-in user, or a 401 Response to return as is.
 * Default deny: no session, no login, or sign-in not configured all give 401.
 */
export async function requireUser(): Promise<{ user: PlannerUser } | { response: Response }> {
  const session = await getSession()
  const login = session?.user?.login
  if (!login) return { response: new Response('Unauthorized', { status: 401 }) }
  return { user: { login, owner: isOwner(login) } }
}
