import { CounterStoreError } from './counter-store'
import { GuestLimitError, LimitConfigError, VisitorKeyError } from './guest-limits'

/** Shared by the AI routes (night plan, spec library): the no-store headers, a JSON error answer, and the answer for a limit problem. */
export const noStore = { 'Cache-Control': 'private, no-store' }
export const fail = (status: number, error: string, extra: HeadersInit = {}): Response => Response.json({ error }, { status, headers: { ...noStore, ...extra } })

/** The answer for a limit, a broken limit config or an unreachable counter store; undefined for any other error. Guests are refused, never let through uncounted. */
export function refusal(e: unknown): Response | undefined {
  if (e instanceof GuestLimitError) return fail(429, e.message, { 'Retry-After': String(e.retryAfterSeconds) })
  if (e instanceof LimitConfigError || e instanceof VisitorKeyError) return fail(503, e.message)
  if (e instanceof CounterStoreError) return fail(503, 'Planner limits are unavailable right now, try again later')
  return undefined
}
