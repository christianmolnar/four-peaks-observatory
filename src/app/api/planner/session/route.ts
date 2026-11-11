import { requireUser } from '@/lib/planner-auth/require-user'

export const dynamic = 'force-dynamic'

// Placeholder for the model-backed features: says who is calling. No model call, no quota.
export async function GET() {
  const result = await requireUser()
  if ('response' in result) return result.response
  return Response.json({ signedIn: true, owner: result.user.owner })
}
