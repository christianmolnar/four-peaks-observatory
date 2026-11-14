import { parseCoordinates, parseQuery } from './query'
import { timeZoneAt } from './timezone'
import type { CoordinateDetails, PlaceCandidate } from './types'

export type ClientFetch = (input: string, init?: RequestInit) => Promise<Response>

/** The browser waits at most this long for our route (which itself bounds its upstream calls). */
export const CLIENT_TIMEOUT_MS = 20000

/** A lookup that failed, with a message fit to show the user. */
export class LookupError extends Error {}

const PLACE_URL = '/api/planner/geocode'
const ELEVATION_URL = '/api/planner/elevation'

/** GET a JSON object from our own route. Fails loud: a timeout, a refusal or a malformed reply is a LookupError carrying the route's message. */
async function getFromRoute(url: string, fetchImpl: ClientFetch, timeoutMs: number): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new LookupError('The lookup took too long. Try again, or enter the values by hand.'))
    }, timeoutMs)
  })
  const exchange = async (): Promise<Record<string, unknown>> => {
    let res: Response
    try {
      res = await fetchImpl(url, { signal: controller.signal })
    } catch {
      throw new LookupError('Could not reach the lookup service. Check your connection, or enter the values by hand.')
    }
    let body: unknown
    try {
      body = await res.json()
    } catch {
      throw new LookupError(res.ok ? 'The lookup service sent a reply that could not be read.' : `The lookup service answered ${res.status}.`)
    }
    const obj = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined
    if (!res.ok) throw new LookupError(typeof obj?.error === 'string' ? obj.error : `The lookup service answered ${res.status}.`)
    if (!obj) throw new LookupError('The lookup service sent a reply that could not be read.')
    return obj
  }
  try {
    return await Promise.race([exchange(), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

const isCandidate = (c: unknown): c is PlaceCandidate => {
  if (typeof c !== 'object' || c === null) return false
  const o = c as Record<string, unknown>
  return (
    typeof o.name === 'string' &&
    typeof o.latitude === 'number' && Number.isFinite(o.latitude) && Math.abs(o.latitude) <= 90 &&
    typeof o.longitude === 'number' && Number.isFinite(o.longitude) && Math.abs(o.longitude) <= 180 &&
    typeof o.timeZone === 'string' &&
    (o.elevationM === undefined || (typeof o.elevationM === 'number' && Number.isFinite(o.elevationM))) &&
    (o.source === 'open-meteo' || o.source === 'nominatim')
  )
}

/** Searches by place name or postal code. An empty list means nothing was found. Throws LookupError (bad text, refusal, outage, timeout, malformed reply). Call on a button press only. */
export async function lookupPlace(query: string, fetchImpl: ClientFetch = (u, i) => fetch(u, i), timeoutMs: number = CLIENT_TIMEOUT_MS): Promise<PlaceCandidate[]> {
  let q
  try {
    q = parseQuery(query)
  } catch (e) {
    throw new LookupError((e as Error).message)
  }
  const body = await getFromRoute(`${PLACE_URL}?q=${encodeURIComponent(q.text)}`, fetchImpl, timeoutMs)
  if (!Array.isArray(body.candidates) || !body.candidates.every(isCandidate)) throw new LookupError('The lookup service sent a reply that could not be read.')
  return body.candidates
}

/**
 * Time zone (offline, from the coordinates) and elevation (our route, which asks Open-Meteo) for hand-entered coordinates.
 * Never throws for a service problem: the part that failed is left out and `notes` says why, so the site's boxes stay editable.
 * Bad coordinates throw LookupError.
 */
export async function describeCoordinates(latitude: number, longitude: number, fetchImpl: ClientFetch = (u, i) => fetch(u, i), timeoutMs: number = CLIENT_TIMEOUT_MS): Promise<CoordinateDetails> {
  let c
  try {
    c = parseCoordinates(latitude, longitude)
  } catch (e) {
    throw new LookupError((e as Error).message)
  }
  const out: CoordinateDetails = { notes: [] }
  out.timeZone = timeZoneAt(c.latitude, c.longitude)
  try {
    const body = await getFromRoute(`${ELEVATION_URL}?lat=${c.latitude}&lon=${c.longitude}`, fetchImpl, timeoutMs)
    if (body.elevationM === null) out.notes.push('No elevation is known for this point. Enter it by hand.')
    else if (typeof body.elevationM === 'number' && Number.isFinite(body.elevationM)) out.elevationM = body.elevationM
    else throw new LookupError('The lookup service sent a reply that could not be read.')
  } catch (e) {
    if (!(e instanceof LookupError)) throw e
    out.notes.push(`Elevation was not filled in: ${e.message}`)
  }
  return out
}

/** The site boxes a lookup may fill. */
export type SiteFieldKey = 'latitude' | 'longitude' | 'elevationM' | 'timeZone'
const LABELS: Record<SiteFieldKey, string> = { latitude: 'Latitude', longitude: 'Longitude', elevationM: 'Elevation', timeZone: 'Time zone' }

/**
 * Puts looked-up values into the site's boxes, except boxes the user has edited by hand (`touched`): those are never overwritten.
 * Returns the new box texts and the labels of the boxes that were kept. Pure.
 */
export function fillSiteFields(
  texts: Record<string, string>,
  touched: ReadonlySet<string>,
  values: Partial<Record<SiteFieldKey, string>>,
): { texts: Record<string, string>; kept: string[] } {
  const next = { ...texts }
  const kept: string[] = []
  for (const key of Object.keys(values) as SiteFieldKey[]) {
    const v = values[key]
    if (v === undefined) continue
    if (touched.has(key)) kept.push(LABELS[key])
    else next[key] = v
  }
  return { texts: next, kept }
}

/** A candidate as box texts. Coordinates to 4 decimals (about 10 m); elevation only when the source knew it. */
export function placeValues(c: PlaceCandidate): Partial<Record<SiteFieldKey, string>> {
  return {
    latitude: String(Number(c.latitude.toFixed(4))),
    longitude: String(Number(c.longitude.toFixed(4))),
    ...(c.elevationM !== undefined ? { elevationM: String(Math.round(c.elevationM)) } : {}),
    timeZone: c.timeZone,
  }
}

/** Details of hand-entered coordinates as box texts (latitude and longitude are the user's own and never listed). */
export function detailValues(d: CoordinateDetails): Partial<Record<SiteFieldKey, string>> {
  return { ...(d.timeZone ? { timeZone: d.timeZone } : {}), ...(d.elevationM !== undefined ? { elevationM: String(Math.round(d.elevationM)) } : {}) }
}

/** The credit lines owed for a set of results. Open-Meteo always (its geocoder and elevation data); OpenStreetMap when Nominatim supplied any. */
export function creditsFor(candidates: readonly PlaceCandidate[]): string[] {
  const out = ['Place search and elevation by Open-Meteo.com (CC BY 4.0).']
  if (candidates.some((c) => c.source === 'nominatim')) out.push('Contains data from OpenStreetMap contributors (ODbL).')
  return out
}
