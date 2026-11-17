import { identifyCaller } from '@/lib/planner-auth/require-user'
import { createAnthropicCaller, MissingKeyError, redactKey } from '@/planner/ai/anthropic'
import { getCounterStore } from '@/planner/ai/counter-store'
import { GuestLimiter, guestLimitsFrom } from '@/planner/ai/guest-limits'
import { fail, noStore, refusal } from '@/planner/ai/refusal'
import { libraryFailure, readJsonBody } from '@/planner/library/http'
import { LookupError, fillFromModel, readFromLibrary } from '@/planner/library/service'
import { getLibraryStore } from '@/planner/library/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// One model call with the 50 s timeout of the real caller.
export const maxDuration = 60

/** The one visitor key every owner lookup is counted under: the owner is one person, and the global day limit is what bounds the bill. */
const OWNER_VISITOR = 'owner'

// Library first (everyone). A miss runs ONE model call, for the owner only, counted by the same limiter as the night plan (per-hour and the global day limit);
// a guest on a miss is told so and no model call or count happens. The reply is judged and stored with source model, confirmed false.
export async function POST(request: Request): Promise<Response> {
  const caller = await identifyCaller()
  const body = await readJsonBody(request)
  if (body instanceof Response) return body
  const store = getLibraryStore()

  try {
    const have = await readFromLibrary(store, body.cls, body.name)
    if (have) return Response.json({ entry: have, from: 'library' }, { headers: noStore })
    if (caller.kind !== 'owner') return fail(403, 'This item is not in the library yet. Only the site owner can look up new items with AI. Enter the values yourself.')

    let callModel
    try { callModel = createAnthropicCaller() } catch (e) {
      if (e instanceof MissingKeyError) return fail(503, 'AI is unavailable right now. Enter the values yourself.')
      throw e
    }
    const limiter = new GuestLimiter(getCounterStore(), guestLimitsFrom(), OWNER_VISITOR)
    await limiter.assertRoom()
    const result = await fillFromModel({ store, callModel: limiter.wrap(callModel), cls: body.cls, name: body.name, now: new Date() })
    return Response.json(result, { headers: noStore })
  } catch (e) {
    const refused = refusal(e) ?? libraryFailure(e)
    if (refused) return refused
    if (e instanceof LookupError) return fail(502, redactKey(e.message))
    throw e
  }
}
