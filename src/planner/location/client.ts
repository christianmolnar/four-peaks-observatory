import { coordText, parseCoordinates, parseQuery } from './query'
import { timeZoneAt } from './timezone'
import type { CoordinateDetails, PlaceCandidate } from './types'

export type ClientFetch = (input: string, init?: RequestInit) => Promise<Response>

/** The browser waits at most this long for our route (which itself bounds its upstream calls). */
export const CLIENT_TIMEOUT_MS = 25000

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
    const body = await getFromRoute(`${ELEVATION_URL}?lat=${coordText(c.latitude)}&lon=${coordText(c.longitude)}`, fetchImpl, timeoutMs)
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

/** One box a lookup would change: what it holds now and what the lookup has. */
export interface FieldChange {
  key: SiteFieldKey
  label: string
  from: string
  to: string
}

const NUMERIC: ReadonlySet<SiteFieldKey> = new Set<SiteFieldKey>(['latitude', 'longitude', 'elevationM'])
const sameValue = (key: SiteFieldKey, a: string, b: string): boolean =>
  a.trim() === b.trim() || (NUMERIC.has(key) && a.trim() !== '' && b.trim() !== '' && Number(a) === Number(b))

/**
 * Puts looked-up values into the site's boxes. A box that already holds a different value is protected: it is overwritten only when
 * a lookup in this session put that value there and the user has not edited it since (`overwritable`), or when `replace` is true
 * (the user pressed Replace). Empty boxes are always filled. A value equal to what the box holds is not a change.
 * Returns the new box texts, the boxes left alone (`kept`, with what the lookup had) and the boxes overwritten over a different value (`replaced`). Pure.
 */
export function fillSiteFields(
  texts: Record<string, string>,
  overwritable: ReadonlySet<string>,
  values: Partial<Record<SiteFieldKey, string>>,
  replace = false,
): { texts: Record<string, string>; changed: SiteFieldKey[]; kept: FieldChange[]; replaced: FieldChange[] } {
  const next = { ...texts }
  const changed: SiteFieldKey[] = []
  const kept: FieldChange[] = []
  const replaced: FieldChange[] = []
  for (const key of Object.keys(values) as SiteFieldKey[]) {
    const to = values[key]
    if (to === undefined) continue
    const from = texts[key] ?? ''
    if (sameValue(key, from, to)) continue
    const change = { key, label: LABELS[key], from, to }
    if (from.trim() === '' || overwritable.has(key)) {
      next[key] = to
      changed.push(key)
    } else if (replace) {
      next[key] = to
      changed.push(key)
      replaced.push(change)
    } else kept.push(change)
  }
  return { texts: next, changed, kept, replaced }
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

/** The credit lines owed for a set of results. Open-Meteo always (its geocoder and elevation data, and the elevation backup by Open Topo Data); OpenStreetMap when Nominatim supplied any. */
export function creditsFor(candidates: readonly PlaceCandidate[]): string[] {
  const out = ['Place search and elevation by Open-Meteo.com (CC BY 4.0). Elevation backup: Open Topo Data (USGS NED and SRTM data).']
  if (candidates.some((c) => c.source === 'nominatim')) out.push('Contains data from OpenStreetMap contributors (ODbL).')
  return out
}
