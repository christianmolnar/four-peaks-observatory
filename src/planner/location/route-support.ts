import { CounterStoreError, getCounterStore } from '@/planner/ai/counter-store'
import { VisitorKeyError, visitorKey } from '@/planner/ai/guest-limits'
import { LocationService, LookupUnavailableError } from './geocode'
import { LocationLimitConfigError, LocationLimitError, locationLimitsFrom, takeLookup } from './limits'
import { QueryError } from './query'
import { UpstreamError } from './bounded-fetch'

let shared: LocationService | undefined

/** One service per server instance, so its caches and Nominatim queue are shared by every request. */
export function getLocationService(): LocationService {
  shared ??= new LocationService({ fetch: (url, init) => fetch(url, init), store: getCounterStore() })
  return shared
}

/** Test hook: forget the service and its caches. */
export function resetLocationService(): void {
  shared = undefined
}

/** Counts one lookup for this visitor, or throws a limit, config, key or counter-store error (see `failure`). */
export async function chargeLookup(request: Request): Promise<void> {
  await takeLookup(getCounterStore(), locationLimitsFrom(), visitorKey(request.headers))
}

export const noStore = { 'Cache-Control': 'private, no-store' }
/** A good answer is the same for everyone: the CDN keeps it a day. */
export const publicCache = { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600' }

const fail = (status: number, error: string, extra: HeadersInit = {}): Response => Response.json({ error }, { status, headers: { ...noStore, ...extra } })

/** The response for any error the lookup routes expect. Unknown errors are rethrown (a 500), never hidden. */
export function failure(e: unknown): Response {
  if (e instanceof QueryError) return fail(400, e.message)
  if (e instanceof LocationLimitError) return fail(429, e.message, { 'Retry-After': String(e.retryAfterSeconds) })
  if (e instanceof LocationLimitConfigError || e instanceof VisitorKeyError) {
    // A setting is missing or malformed on the server: the owner reads the cause in the log, the guest gets a line they can act on.
    console.error(`Place lookup is not configured: ${e.message}`)
    return fail(503, 'Site search is not available right now. Enter latitude and longitude below.')
  }
  if (e instanceof CounterStoreError) return fail(503, 'Lookup limits are unavailable right now, try again later')
  if (e instanceof LookupUnavailableError) return fail(502, e.message)
  if (e instanceof UpstreamError) return fail(502, 'Elevation is not available right now. Enter it by hand or try again later.')
  throw e
}
