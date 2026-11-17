import type { CounterStore } from '../ai/counter-store'
import { GuestLimitError } from '../ai/guest-limits'
import { fail } from '../ai/refusal'
import { LibraryDataError } from './specs'
import { LibraryStoreError } from './store'

/** A library request carries a class, a name and a few numbers: 16 KB is far more than any real one. */
export const MAX_LIBRARY_BODY_BYTES = 16 * 1024

/** Corrections one visitor may save per hour (every visitor, owner included). Counted before the body is judged, so a flood of bad ones is stopped too. */
export const LIBRARY_WRITES_PER_HOUR = 20
const HOUR_S = 3600

/** Counts one correction for this visitor in the current hour window, or throws GuestLimitError (the routes answer 429 with Retry-After). */
export async function takeWrite(store: CounterStore, visitor: string, nowMs: number = Date.now(), perHour: number = LIBRARY_WRITES_PER_HOUR): Promise<void> {
  const s = Math.floor(nowMs / 1000)
  const key = `planner:lib:w:${visitor}:${Math.floor(s / HOUR_S)}`
  const n = await store.incr(key, HOUR_S + 60)
  if (n > perHour) throw new GuestLimitError('visitor', HOUR_S - (s % HOUR_S), `Too many corrections saved this hour (${perHour} per hour), try again later`)
}

/** Reads a small JSON object body, or returns the answer to send. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | Response> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_LIBRARY_BODY_BYTES) return fail(413, 'Request body too large')
  const text = await request.text()
  if (text.length > MAX_LIBRARY_BODY_BYTES) return fail(413, 'Request body too large')
  let body: unknown
  try { body = JSON.parse(text) } catch { return fail(400, 'Body is not valid JSON') }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return fail(400, 'Body must be a JSON object')
  return body as Record<string, unknown>
}

/** The answer for a bad request or an unreachable library; undefined for any other error. */
export function libraryFailure(e: unknown): Response | undefined {
  if (e instanceof LibraryDataError) return fail(400, e.message)
  if (e instanceof LibraryStoreError) return fail(503, 'The spec library is unavailable right now, try again later.')
  return undefined
}
