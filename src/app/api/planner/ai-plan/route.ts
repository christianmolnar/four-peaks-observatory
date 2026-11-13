import { requireOwner } from '@/lib/planner-auth/require-user'
import { createAnthropicCaller, MissingKeyError, redactKey } from '@/planner/ai/anthropic'
import { NoNightError } from '@/planner/ai/facts'
import { ModelReplyError, planNightWithAi } from '@/planner/ai/plan'
import { MAX_BODY_BYTES, parseBody, RATE_LIMIT, takeRateSlot } from '@/planner/ai/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// At most 6 model calls and a 110 s budget (planNightWithAi stops repairing when a full call no longer fits).
export const maxDuration = 120

const noStore = { 'Cache-Control': 'private, no-store' }
const fail = (status: number, error: string, extra: HeadersInit = {}): Response => Response.json({ error }, { status, headers: { ...noStore, ...extra } })

// Owner-only: this route spends money per call. The guard runs before the body is read.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwner()
  if ('response' in auth) return auth.response

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
  const wait = takeRateSlot(auth.user.id)
  if (wait > 0) return fail(429, `Rate limit: ${RATE_LIMIT} AI plans per hour`, { 'Retry-After': String(wait) })

  try {
    const result = await planNightWithAi(parsed.input, { callModel, qualityReview: parsed.qualityReview })
    return Response.json(result, { headers: noStore })
  } catch (e) {
    if (e instanceof NoNightError || e instanceof RangeError) return fail(422, e.message)
    if (e instanceof ModelReplyError) return fail(502, e.message)
    return fail(502, `Model call failed: ${redactKey(e instanceof Error ? e.message : String(e)).slice(0, 300)}`)
  }
}
