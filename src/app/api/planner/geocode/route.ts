import { parseQuery } from '@/planner/location/query'
import { chargeLookup, failure, getLocationService, publicCache } from '@/planner/location/route-support'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Open-Meteo (6 s), Nominatim queue (about 4 s) and its call (6 s), elevation (5 s).
export const maxDuration = 30

/**
 * GET /api/planner/geocode?q=Phoenix, AZ  (or a postal code)
 * Up to 5 candidates: name, admin, country, latitude, longitude, elevationM when known, timeZone, source.
 * Called on a button press only (Nominatim forbids autocomplete). A cached answer costs the visitor nothing;
 * a miss counts against the visitor's hour and the site's day, and is refused (never let through) if the counters are unreachable.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const q = parseQuery(new URL(request.url).searchParams.get('q'))
    const service = getLocationService()
    let candidates = service.cachedPlaces(q)
    if (!candidates) {
      await chargeLookup(request)
      candidates = await service.searchPlaces(q)
    }
    return Response.json({ candidates }, { headers: candidates.length > 0 ? publicCache : { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return failure(e)
  }
}
