import { getCounterStore } from '@/planner/ai/counter-store'
import { visitorKey } from '@/planner/ai/guest-limits'
import { noStore, refusal } from '@/planner/ai/refusal'
import { libraryFailure, readJsonBody, takeWrite } from '@/planner/library/http'
import { applyCorrection } from '@/planner/library/service'
import { getLibraryStore } from '@/planner/library/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// "Save correction for everyone" and "Confirm": open to guests and the owner, no model call, limited per visitor.
// Body: { cls, name, specs? }. With specs the entry becomes those values; without, the entry's own values are confirmed. Last write wins; one previous value is kept.
export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request)
  if (body instanceof Response) return body
  try {
    await takeWrite(getCounterStore(), visitorKey(request.headers))
    const entry = await applyCorrection({ store: getLibraryStore(), cls: body.cls, name: body.name, specs: Object.prototype.hasOwnProperty.call(body, 'specs') ? body.specs : undefined, now: new Date() })
    return Response.json({ entry }, { headers: noStore })
  } catch (e) {
    const refused = refusal(e) ?? libraryFailure(e)
    if (refused) return refused
    throw e
  }
}
