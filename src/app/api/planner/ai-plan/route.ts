import { identifyCaller } from '@/lib/planner-auth/require-user'
import { createAnthropicCaller, MissingKeyError, redactKey } from '@/planner/ai/anthropic'
import { NoNightError } from '@/planner/ai/facts'
import { ModelReplyError, planNightWithAi } from '@/planner/ai/plan'
import { getCounterStore } from '@/planner/ai/counter-store'
import { GuestLimiter, guestLimitsFrom, visitorKey } from '@/planner/ai/guest-limits'
import { fail, noStore, refusal } from '@/planner/ai/refusal'
import { MAX_BODY_BYTES, parseBody } from '@/planner/ai/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// At most 6 model calls and a 110 s budget (planNightWithAi stops repairing when a full call no longer fits).
export const maxDuration = 120

// Open to everyone. An allowlisted Google account (owner) is uncapped; every other caller is a guest:
// no sign-in needed, no quality review, and every model call counted against a per-visitor hour limit and a global day limit.
export async function POST(request: Request): Promise<Response> {
  const caller = await identifyCaller()

  let limiter: GuestLimiter | undefined
  if (caller.kind === 'guest') {
    try {
      limiter = new GuestLimiter(getCounterStore(), guestLimitsFrom(), visitorKey(request.headers))
      await limiter.assertRoom()
    } catch (e) {
      const refused = refusal(e)
      if (refused) return refused
      throw e
    }
  }

  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return fail(413, 'Request body too large')
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return fail(413, 'Request body too large')
  let body: unknown
  try { body = JSON.parse(text) } catch { return fail(400, 'Body is not valid JSON') }
  const parsed = parseBody(body)
  if (typeof parsed === 'string') return fail(400, parsed)

  let callModel
  try { callModel = createAnthropicCaller() } catch (e) {
    if (e instanceof MissingKeyError) return fail(503, e.message)
    throw e
  }
  if (limiter) callModel = limiter.wrap(callModel)

  try {
    const result = await planNightWithAi(parsed.input, { callModel, qualityReview: caller.kind === 'owner' && parsed.qualityReview })
    return Response.json(result, { headers: noStore })
  } catch (e) {
    const refused = refusal(e)
    if (refused) return refused
    if (e instanceof NoNightError || e instanceof RangeError) return fail(422, e.message)
    if (e instanceof ModelReplyError) return fail(502, e.message)
    return fail(502, `Model call failed: ${redactKey(e instanceof Error ? e.message : String(e)).slice(0, 300)}`)
  }
}
