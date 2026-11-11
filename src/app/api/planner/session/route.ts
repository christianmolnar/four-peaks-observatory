import { requireUser } from '@/lib/planner-auth/require-user'
import { authConfigured } from '@/lib/planner-auth/owners'

export const dynamic = 'force-dynamic'

// Says who is calling, for the planner's sign-in control. No model call, no quota.
// The 401 body says whether sign-in exists at all, so the control can tell "signed out" from "not configured".
export async function GET() {
  const result = await requireUser()
  if ('response' in result) {
    return Response.json({ signedIn: false, configured: authConfigured() }, { status: 401 })
  }
  return Response.json({ signedIn: true, owner: result.user.owner, login: result.user.login })
}
