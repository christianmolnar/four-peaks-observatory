import { parseCoordinates } from '@/planner/location/query'
import { chargeLookup, failure, getLocationService, publicCache } from '@/planner/location/route-support'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

/**
 * GET /api/planner/elevation?lat=33.45&lon=-112.07
 * { elevationM: number | null }: null when the service has no height for the point. Same caps and caching as the place search.
 * An unreachable service is a 502 with a message; the site's elevation box stays editable.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams
    const { latitude, longitude } = parseCoordinates(params.get('lat'), params.get('lon'))
    const service = getLocationService()
    let elevationM = service.cachedElevation(latitude, longitude)
    if (elevationM === undefined) {
      await chargeLookup(request)
      elevationM = await service.elevationAt(latitude, longitude)
    }
    return Response.json({ elevationM }, { headers: publicCache })
  } catch (e) {
    return failure(e)
  }
}
