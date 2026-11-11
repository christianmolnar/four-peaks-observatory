import { requireUser } from '@/lib/planner-auth/require-user'
import { authConfigured } from '@/lib/planner-auth/owners'

export const dynamic = 'force-dynamic'

// Says who is calling, for the planner's sign-in control. No model call, no quota.
// Signed out is a normal answer (200), so guests see no console error; `configured` tells "signed out" from "not configured".
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  const result = await requireUser()
  if ('response' in result) {
    return Response.json({ signedIn: false, configured: authConfigured() }, { headers })
  }
  return Response.json({ signedIn: true, owner: result.user.owner, login: result.user.login }, { headers })
}
