import type { CounterStore } from '@/planner/ai/counter-store'
import { getJson, UpstreamError } from './bounded-fetch'
import type { FetchLike } from './bounded-fetch'
import { cacheKey, coordText, regionMatches } from './query'
import type { ParsedQuery } from './query'
import { isKnownTimeZone, timeZoneAt } from './timezone'
import type { PlaceCandidate } from './types'

/** Identifies this site to Nominatim (its policy requires a real name; no personal contact data goes in it). */
export const USER_AGENT = 'FourPeaksObservatory-planner/1.0 (+https://fourpeaksobservatory.com; site-location lookup, button-press only)'

export const MAX_CANDIDATES = 5
/** Every outbound call is bounded. Worst case for one search: Open-Meteo (6 s), the gate wait (3 s, or the search fails), Nominatim (6 s), then the elevation budget (3 s): about 18 s. */
export const OPEN_METEO_TIMEOUT_MS = 6000
export const NOMINATIM_TIMEOUT_MS = 6000
export const ELEVATION_TIMEOUT_MS = 5000
/** Second elevation source. Its public API allows 1 call a second and 1,000 a day; we stay under both (see `elevationTurn`, `TOPO_DAILY_CAP`). */
export const TOPO_TIMEOUT_MS = 5000
export const TOPO_DAILY_CAP = 900
/** Both elevation sources together, when they only decorate a place search: keeps the search's worst case (about 18 s) under the browser's wait. */
export const PLACE_ELEVATION_BUDGET_MS = 3000
export const CACHE_TTL_MS = 24 * 3600 * 1000
export const CACHE_MAX_ENTRIES = 500

const UNAVAILABLE = 'Place search is not available right now. Enter the coordinates by hand or try again later.'

/** Neither service could answer. The message is fit to show the user. */
export class LookupUnavailableError extends Error {}

/** Open-Meteo's DEM uses -9999 for "no data"; anything outside real land and near-coast heights is unknown. */
const plausibleElevation = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v > -500 && v < 9000 ? Math.round(v) : undefined)

const inRange = (lat: unknown, lon: unknown): boolean =>
  typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 120) : undefined)

/** A small map with a time limit and a size limit (oldest entry goes first). */
class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; at: number }>()
  constructor(private readonly now: () => number) {}
  get(key: string): T | undefined {
    const e = this.entries.get(key)
    if (!e) return undefined
    if (this.now() - e.at > CACHE_TTL_MS) {
      this.entries.delete(key)
      return undefined
    }
    return e.value
  }
  set(key: string, value: T): void {
    this.entries.delete(key)
    this.entries.set(key, { value, at: this.now() })
    if (this.entries.size > CACHE_MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value as string)
  }
}

export interface LocationDeps {
  fetch: FetchLike
  /** Shared across server instances when KV is configured; per instance otherwise. */
  store: CounterStore
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  /** Nominatim's policy asks for a switch that needs no software update. Default: off when env PLANNER_NOMINATIM is "off". */
  nominatimOn?: () => boolean
}

/** A 5-digit search is a US ZIP first: stable order, United States matches ahead of other countries' postcodes. Any other search keeps the geocoder's own order. */
function usFirstForZip(q: ParsedQuery, found: PlaceCandidate[]): PlaceCandidate[] {
  if (!/^\d{5}$/.test(q.name) || q.region !== '') return found
  const us = (c: PlaceCandidate) => c.country === 'United States'
  return [...found.filter(us), ...found.filter((c) => !us(c))]
}

const heightKey = (latitude: number, longitude: number): string => `${coordText(latitude)},${coordText(longitude)}`

/**
 * Place search and elevation, with Open-Meteo first and Nominatim as the fallback; elevation from Open-Meteo, then Open Topo Data.
 * Nominatim's usage policy is enforced here: at most one request per second for the whole app (see `nominatimTurn`),
 * a descriptive User-Agent, results cached, and no autocomplete (the caller is a button press).
 */
export class LocationService {
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly nominatimOn: () => boolean
  private readonly places: TtlCache<PlaceCandidate[]>
  private readonly heights: TtlCache<number | null>
  /** Callers wait their turn here, so one server instance never has two requests open at once to a service limited to one a second. */
  private readonly queues: Partial<Record<'nom' | 'topo', Promise<unknown>>> = {}

  constructor(private readonly deps: LocationDeps) {
    this.now = deps.now ?? Date.now
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.nominatimOn = deps.nominatimOn ?? (() => process.env.PLANNER_NOMINATIM?.trim().toLowerCase() !== 'off')
    this.places = new TtlCache(this.now)
    this.heights = new TtlCache(this.now)
  }

  /** The cached answer for a query, or undefined. Reads only: a cached answer costs the visitor nothing. */
  cachedPlaces(q: ParsedQuery): PlaceCandidate[] | undefined {
    return this.places.get(cacheKey(q))
  }

  /** The cached elevation for a point, or undefined when not cached (null: cached "no height here"). */
  cachedElevation(latitude: number, longitude: number): number | null | undefined {
    return this.heights.get(heightKey(latitude, longitude))
  }

  async searchPlaces(q: ParsedQuery): Promise<PlaceCandidate[]> {
    const hit = this.cachedPlaces(q)
    if (hit) return hit
    let found: PlaceCandidate[] = []
    let openMeteoFailed = false
    try {
      found = await this.openMeteo(q)
    } catch (e) {
      if (!(e instanceof UpstreamError)) throw e
      openMeteoFailed = true
    }
    if (found.length === 0 && this.nominatimOn()) {
      try {
        found = await this.nominatim(q)
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e
        throw new LookupUnavailableError(UNAVAILABLE)
      }
    } else if (found.length === 0 && openMeteoFailed) {
      throw new LookupUnavailableError(UNAVAILABLE)
    }
    found = usFirstForZip(q, found)
    if (found.length > 0) this.places.set(cacheKey(q), found)
    return found
  }

  private async openMeteo(q: ParsedQuery): Promise<PlaceCandidate[]> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.name)}&count=10&language=en&format=json`
    const body = await getJson(this.deps.fetch, url, { Accept: 'application/json', 'User-Agent': USER_AGENT }, OPEN_METEO_TIMEOUT_MS, 'Open-Meteo place search')
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new UpstreamError('Open-Meteo place search answered with an unexpected shape')
    const results = (body as { results?: unknown }).results
    if (results === undefined) return []
    if (!Array.isArray(results)) throw new UpstreamError('Open-Meteo place search answered with an unexpected shape')
    const out: PlaceCandidate[] = []
    for (const r of results) {
      if (typeof r !== 'object' || r === null) continue
      const o = r as Record<string, unknown>
      const name = str(o.name)
      if (!name || !inRange(o.latitude, o.longitude)) continue
      if (!regionMatches(q.region, { admin1: str(o.admin1), admin2: str(o.admin2), country: str(o.country), countryCode: str(o.country_code) })) continue
      const latitude = o.latitude as number
      const longitude = o.longitude as number
      // Prefer the geocoder's own zone; if it is missing or unknown here, the boundary data decides.
      const timeZone = isKnownTimeZone(o.timezone) ? o.timezone : timeZoneAt(latitude, longitude)
      const elevationM = plausibleElevation(o.elevation)
      out.push({ name, admin: str(o.admin1), country: str(o.country), latitude, longitude, ...(elevationM !== undefined ? { elevationM } : {}), timeZone, source: 'open-meteo' })
      if (out.length === MAX_CANDIDATES) break
    }
    return out
  }

  private async nominatim(q: ParsedQuery): Promise<PlaceCandidate[]> {
    await this.nominatimTurn()
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q.text)}&format=jsonv2&addressdetails=1&limit=${MAX_CANDIDATES}&accept-language=en`
    const body = await getJson(this.deps.fetch, url, { Accept: 'application/json', 'User-Agent': USER_AGENT }, NOMINATIM_TIMEOUT_MS, 'Nominatim place search')
    if (!Array.isArray(body)) throw new UpstreamError('Nominatim place search answered with an unexpected shape')
    const out: PlaceCandidate[] = []
    for (const r of body) {
      if (typeof r !== 'object' || r === null) continue
      const o = r as Record<string, unknown>
      const latitude = Number(o.lat)
      const longitude = Number(o.lon)
      if (!inRange(latitude, longitude)) continue
      const a = (typeof o.address === 'object' && o.address !== null ? o.address : {}) as Record<string, unknown>
      const name = str(o.name) ?? str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.hamlet) ?? str(o.display_name)?.split(',')[0].trim()
      if (!name) continue
      out.push({ name, admin: str(a.state) ?? str(a.county), country: str(a.country), latitude, longitude, timeZone: timeZoneAt(latitude, longitude), source: 'nominatim' })
    }
    // Nominatim has no heights. One batched call fills them in; if that fails the field is simply left out (editable).
    if (out.length > 0) {
      try {
        const heights = await this.within(PLACE_ELEVATION_BUDGET_MS, this.elevations(out), 'Elevation lookup for the place results')
        out.forEach((c, i) => {
          const h = heights[i]
          if (h !== undefined) c.elevationM = h
        })
      } catch (e) {
        if (!(e instanceof UpstreamError)) throw e
      }
    }
    return out
  }

  /**
   * Waits until this app may send a request to a service limited to one request a second (`kind` names the service: "nom" or "topo").
   * Rules: one at a time per instance (the queue), and across instances a claim on a one-second slot in the counter store, refused while
   * the slot before it is taken. Claimed slots are therefore never adjacent, so two requests are always more than one second apart.
   * Gives up after 4 tries (about 4 s) with UpstreamError, which reads as "service not available".
   */
  private turn(kind: 'nom' | 'topo', busyMessage: string): Promise<void> {
    const turn = (this.queues[kind] ?? Promise.resolve()).then(async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const slot = Math.floor(this.now() / 1000)
        const busy = (await this.deps.store.get(`planner:loc:${kind}:${slot - 1}`)) > 0
        if (!busy && (await this.deps.store.incr(`planner:loc:${kind}:${slot}`, 10)) === 1) return
        await this.sleep(1000 - (this.now() % 1000) + 5)
      }
      throw new UpstreamError(busyMessage)
    })
    this.queues[kind] = turn.catch(() => undefined)
    return turn
  }

  private nominatimTurn(): Promise<void> {
    return this.turn('nom', 'Nominatim is busy')
  }

  /** Open-Meteo's elevation call. */
  private async elevationsOpenMeteo(points: { latitude: number; longitude: number }[]): Promise<(number | undefined)[]> {
    const lat = points.map((p) => coordText(p.latitude)).join(',')
    const lon = points.map((p) => coordText(p.longitude)).join(',')
    const body = await getJson(this.deps.fetch, `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`, { Accept: 'application/json', 'User-Agent': USER_AGENT }, ELEVATION_TIMEOUT_MS, 'Open-Meteo elevation')
    const list = typeof body === 'object' && body !== null ? (body as { elevation?: unknown }).elevation : undefined
    if (!Array.isArray(list) || list.length !== points.length) throw new UpstreamError('Open-Meteo elevation answered with an unexpected shape')
    return list.map(plausibleElevation)
  }

  /**
   * Open Topo Data's public API: USGS NED 10 m inside the United States, SRTM 30 m elsewhere (both public-domain data), one request.
   * Held to its published limits: one call a second (the turn) and a daily cap kept below its 1,000.
   */
  private async elevationsTopo(points: { latitude: number; longitude: number }[]): Promise<(number | undefined)[]> {
    const day = new Date(this.now()).toISOString().slice(0, 10)
    if ((await this.deps.store.incr(`planner:loc:topo:day:${day}`, 2 * 24 * 3600)) > TOPO_DAILY_CAP) throw new UpstreamError('Open Topo Data daily budget used')
    await this.turn('topo', 'Open Topo Data is busy')
    const locations = points.map((p) => `${coordText(p.latitude)},${coordText(p.longitude)}`).join('%7C')
    const body = await getJson(this.deps.fetch, `https://api.opentopodata.org/v1/ned10m,srtm30m?locations=${locations}`, { Accept: 'application/json', 'User-Agent': USER_AGENT }, TOPO_TIMEOUT_MS, 'Open Topo Data elevation')
    const list = typeof body === 'object' && body !== null ? (body as { results?: unknown }).results : undefined
    if (!Array.isArray(list) || list.length !== points.length) throw new UpstreamError('Open Topo Data elevation answered with an unexpected shape')
    return list.map((r) => plausibleElevation(typeof r === 'object' && r !== null ? (r as { elevation?: unknown }).elevation : undefined))
  }

  /** The promise's result, or UpstreamError once `ms` have passed (the late result is dropped, its failure swallowed). */
  private within<T>(ms: number, work: Promise<T>, label: string): Promise<T> {
    work.catch(() => undefined)
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new UpstreamError(`${label} timed out`)), ms)
    })
    return Promise.race([work, late]).finally(() => clearTimeout(timer))
  }

  /**
   * Heights for points, in order; undefined where no service has one. One request to the first service that answers: Open-Meteo, then Open Topo Data.
   * Throws UpstreamError (naming both failures) when neither can be reached.
   */
  private async elevations(points: { latitude: number; longitude: number }[]): Promise<(number | undefined)[]> {
    try {
      return await this.elevationsOpenMeteo(points)
    } catch (first) {
      if (!(first instanceof UpstreamError)) throw first
      try {
        return await this.elevationsTopo(points)
      } catch (second) {
        if (!(second instanceof UpstreamError)) throw second
        throw new UpstreamError(`${first.message}; ${second.message}`)
      }
    }
  }

  /** Elevation for a point in metres; null when the service has no height there. Throws UpstreamError when it cannot be reached or misreplies. */
  async elevationAt(latitude: number, longitude: number): Promise<number | null> {
    const key = heightKey(latitude, longitude)
    const hit = this.heights.get(key)
    if (hit !== undefined) return hit
    const [h] = await this.elevations([{ latitude, longitude }])
    this.heights.set(key, h ?? null)
    return h ?? null
  }
}
