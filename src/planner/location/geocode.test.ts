import { CounterStoreError, MemoryCounterStore } from '@/planner/ai/counter-store'
import type { CounterStore } from '@/planner/ai/counter-store'
import { ELEVATION_TIMEOUT_MS, LocationService, LookupUnavailableError, NOMINATIM_TIMEOUT_MS, OPEN_METEO_TIMEOUT_MS, USER_AGENT } from './geocode'
import { parseQuery } from './query'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

const PHOENIX = {
  id: 5308655, name: 'Phoenix', latitude: 33.44838, longitude: -112.07404, elevation: 331.0, country_code: 'US', timezone: 'America/Phoenix',
  country: 'United States', admin1: 'Arizona', admin2: 'Maricopa', postcodes: ['85001'],
}
const PHOENIX_OR = { ...PHOENIX, id: 2, latitude: 42.27541, longitude: -122.81809, elevation: 460, timezone: 'America/Los_Angeles', admin1: 'Oregon', admin2: 'Jackson' }
const NOM_PHOENIX = {
  lat: '33.4484367', lon: '-112.0741410', name: 'Phoenix', display_name: 'Phoenix, Maricopa County, Arizona, United States',
  address: { city: 'Phoenix', county: 'Maricopa County', state: 'Arizona', country: 'United States', country_code: 'us' },
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>
interface Calls { url: string; init?: RequestInit; at: number }

/** A fake clock, a sleep that advances it, and a fetch routed by host. */
function rig(handlers: { meteo?: Handler; nominatim?: Handler; elevation?: Handler }, store: CounterStore = new MemoryCounterStore()) {
  const clock = { t: 1_700_000_000_000 }
  const calls: Calls[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init, at: clock.t })
    const h = url.startsWith('https://geocoding-api.open-meteo.com/') ? handlers.meteo : url.startsWith('https://nominatim.openstreetmap.org/') ? handlers.nominatim : url.startsWith('https://api.open-meteo.com/v1/elevation') ? handlers.elevation : undefined
    if (!h) throw new Error(`unexpected fetch ${url}`)
    return h(url, init)
  }
  const sleeps: number[] = []
  const service = new LocationService({ fetch, store, now: () => clock.t, sleep: async (ms) => { sleeps.push(ms); clock.t += ms } })
  const hosts = (h: string) => calls.filter((c) => c.url.startsWith(h))
  return { service, calls, clock, sleeps, meteo: () => hosts('https://geocoding-api.open-meteo.com/'), nominatim: () => hosts('https://nominatim.openstreetmap.org/'), elevation: () => hosts('https://api.open-meteo.com/') }
}

const q = (s: string) => parseQuery(s)

describe('Open-Meteo is the primary', () => {
  it('"Phoenix, AZ" returns Phoenix first with coordinates, elevation and time zone; the Oregon Phoenix is dropped by the state', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX, PHOENIX_OR] }) })
    const out = await r.service.searchPlaces(q('Phoenix, AZ'))
    expect(out).toEqual([{ name: 'Phoenix', admin: 'Arizona', country: 'United States', latitude: 33.44838, longitude: -112.07404, elevationM: 331, timeZone: 'America/Phoenix', source: 'open-meteo' }])
    expect(r.nominatim()).toHaveLength(0)
    expect(new URL(r.meteo()[0].url).searchParams.get('name')).toBe('Phoenix')
  })

  it('a plain name keeps up to 5 candidates in the service order', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...PHOENIX, id: i, name: `Phoenix ${i}` }))
    const r = rig({ meteo: () => json({ results: many }) })
    const out = await r.service.searchPlaces(q('Phoenix'))
    expect(out.map((c) => c.name)).toEqual(['Phoenix 0', 'Phoenix 1', 'Phoenix 2', 'Phoenix 3', 'Phoenix 4'])
  })

  it('US ZIP "85001" and ZIP+4 "85001-1234" both ask for the 5 digits and give the city', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX] }) })
    expect((await r.service.searchPlaces(q('85001')))[0].name).toBe('Phoenix')
    const r2 = rig({ meteo: () => json({ results: [PHOENIX] }) })
    expect((await r2.service.searchPlaces(q('85001-1234')))[0].name).toBe('Phoenix')
    expect(new URL(r2.meteo()[0].url).searchParams.get('name')).toBe('85001')
  })

  it('a non-US postcode goes through unchanged', async () => {
    const paris = { ...PHOENIX, name: 'Paris', admin1: 'Île-de-France', country: 'France', country_code: 'FR', timezone: 'Europe/Paris', latitude: 48.85, longitude: 2.35, elevation: 42 }
    const r = rig({ meteo: () => json({ results: [paris] }) })
    const out = await r.service.searchPlaces(q('75001'))
    expect(out[0]).toMatchObject({ name: 'Paris', country: 'France', timeZone: 'Europe/Paris' })
    const r2 = rig({ meteo: () => json({ results: [paris] }) })
    await r2.service.searchPlaces(q('SW1A 1AA'))
    expect(new URL(r2.meteo()[0].url).searchParams.get('name')).toBe('SW1A 1AA')
  })

  it('an elevation of -9999 (no data) is left out, and a missing zone comes from the coordinates', async () => {
    const r = rig({ meteo: () => json({ results: [{ ...PHOENIX, elevation: -9999, timezone: undefined }] }) })
    const [c] = await r.service.searchPlaces(q('Phoenix'))
    expect('elevationM' in c).toBe(false)
    expect(c.timeZone).toBe('America/Phoenix')
  })

  it('sends the descriptive User-Agent with no personal data', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX] }) })
    await r.service.searchPlaces(q('Phoenix'))
    const ua = (r.meteo()[0].init?.headers as Record<string, string>)['User-Agent']
    expect(ua).toBe(USER_AGENT)
    expect(ua).toMatch(/FourPeaksObservatory/)
    expect(ua).not.toMatch(/@/)
  })
})

describe('fallback to Nominatim', () => {
  it('Open-Meteo empty: Nominatim answers, the zone comes from the coordinates and the height from the elevation API', async () => {
    const r = rig({
      meteo: () => json({ generationtime_ms: 0.1 }),
      nominatim: () => json([NOM_PHOENIX]),
      elevation: () => json({ elevation: [331] }),
    })
    const out = await r.service.searchPlaces(q('Phoenix Arizona'))
    expect(out).toEqual([{ name: 'Phoenix', admin: 'Arizona', country: 'United States', latitude: 33.4484367, longitude: -112.074141, elevationM: 331, timeZone: 'America/Phoenix', source: 'nominatim' }])
    expect((r.nominatim()[0].init?.headers as Record<string, string>)['User-Agent']).toBe(USER_AGENT)
    expect(r.elevation()).toHaveLength(1)
  })

  it('Open-Meteo down (500): Nominatim answers; elevation unreachable leaves the height out without failing', async () => {
    const r = rig({ meteo: () => json({}, 500), nominatim: () => json([NOM_PHOENIX]), elevation: () => { throw new Error('connect ETIMEDOUT') } })
    const out = await r.service.searchPlaces(q('Phoenix Arizona'))
    expect(out).toHaveLength(1)
    expect(out[0].source).toBe('nominatim')
    expect('elevationM' in out[0]).toBe(false)
  })

  it('both down: a clear message, not a hang or a raw error', async () => {
    const r = rig({ meteo: () => { throw new Error('fetch failed') }, nominatim: () => json({}, 503) })
    await expect(r.service.searchPlaces(q('Phoenix'))).rejects.toThrow(LookupUnavailableError)
    await expect(r.service.searchPlaces(q('Phoenix'))).rejects.toThrow(/not available right now/)
  })

  it('both answer and both are empty: an empty list, not an error', async () => {
    const r = rig({ meteo: () => json({}), nominatim: () => json([]) })
    expect(await r.service.searchPlaces(q('Zzzzqx'))).toEqual([])
  })

  it('a state that matches nothing in Open-Meteo falls through to Nominatim', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX] }), nominatim: () => json([]) })
    expect(await r.service.searchPlaces(q('Phoenix, TX'))).toEqual([])
    expect(r.nominatim()).toHaveLength(1)
  })

  it.each([
    ['not JSON', () => new Response('<html>oops</html>', { status: 200 })],
    ['an array where an object is expected', () => json([1, 2])],
    ['results that is not a list', () => json({ results: 'nope' })],
    ['null', () => json(null)],
  ])('Open-Meteo reply that is %s counts as a failure and Nominatim is tried', async (_n, meteo) => {
    const r = rig({ meteo, nominatim: () => json([NOM_PHOENIX]), elevation: () => json({ elevation: [331] }) })
    const out = await r.service.searchPlaces(q('Phoenix Arizona'))
    expect(out[0].source).toBe('nominatim')
  })

  it('malformed entries are skipped: bad coordinates, non-object rows, missing names, unknown time zone is replaced', async () => {
    const rows = [null, 'x', { name: 'A', latitude: 'a', longitude: 1 }, { name: 'B', latitude: 91, longitude: 0 }, { name: '', latitude: 1, longitude: 1 }, { ...PHOENIX, timezone: 'Mars/Olympus' }]
    const r = rig({ meteo: () => json({ results: rows }) })
    const out = await r.service.searchPlaces(q('Phoenix'))
    expect(out).toHaveLength(1)
    expect(out[0].timeZone).toBe('America/Phoenix')
  })

  it('malformed Nominatim rows are skipped, and a non-array reply is a failure', async () => {
    const r = rig({ meteo: () => json({}), nominatim: () => json([{ lat: 'x', lon: '1' }, { lat: '95', lon: '1', name: 'Q' }, null, NOM_PHOENIX]), elevation: () => json({ elevation: [331] }) })
    expect(await r.service.searchPlaces(q('Phoenix Arizona'))).toHaveLength(1)
    const r2 = rig({ meteo: () => json({}), nominatim: () => json({ error: 'x' }) })
    await expect(r2.service.searchPlaces(q('Phoenix Arizona'))).rejects.toThrow(LookupUnavailableError)
  })

  it('an elevation reply with the wrong length leaves heights out rather than guessing', async () => {
    const r = rig({ meteo: () => json({}), nominatim: () => json([NOM_PHOENIX]), elevation: () => json({ elevation: [1, 2, 3] }) })
    const out = await r.service.searchPlaces(q('Phoenix Arizona'))
    expect('elevationM' in out[0]).toBe(false)
  })
})

describe('timeouts: every outbound fetch is bounded', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  const never = (): Promise<Response> => new Promise<Response>(() => undefined)

  it('a hanging Open-Meteo falls to Nominatim after its timeout', async () => {
    const r = rig({ meteo: never, nominatim: () => json([NOM_PHOENIX]), elevation: () => json({ elevation: [331] }) })
    const p = r.service.searchPlaces(q('Phoenix Arizona'))
    await jest.advanceTimersByTimeAsync(OPEN_METEO_TIMEOUT_MS + 1)
    const out = await p
    expect(out[0].source).toBe('nominatim')
  })

  it('both hanging: the search ends in the clear message within the sum of the timeouts', async () => {
    const r = rig({ meteo: never, nominatim: never })
    const p = r.service.searchPlaces(q('Phoenix'))
    const settled = expect(p).rejects.toThrow(LookupUnavailableError)
    await jest.advanceTimersByTimeAsync(OPEN_METEO_TIMEOUT_MS + NOMINATIM_TIMEOUT_MS + 10)
    await settled
  })

  it('a hanging elevation call ends in an error for the elevation route', async () => {
    const r = rig({ elevation: never })
    const p = r.service.elevationAt(33.4, -112)
    const settled = expect(p).rejects.toThrow(/timed out/)
    await jest.advanceTimersByTimeAsync(ELEVATION_TIMEOUT_MS + 1)
    await settled
  })

  it('a hanging body read is also bounded', async () => {
    const stuckBody = () => ({ ok: true, status: 200, text: never }) as unknown as Response
    const r = rig({ elevation: stuckBody })
    const p = r.service.elevationAt(33.4, -112)
    const settled = expect(p).rejects.toThrow(/timed out/)
    await jest.advanceTimersByTimeAsync(ELEVATION_TIMEOUT_MS + 1)
    await settled
  })
})

describe('cache', () => {
  it('the second identical search (any case and spacing) is served from memory with no outbound call', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX] }) })
    const a = await r.service.searchPlaces(q('Phoenix, AZ'))
    expect(r.service.cachedPlaces(q('  phoenix,   az '))).toEqual(a)
    const b = await r.service.searchPlaces(q('  phoenix,   az '))
    expect(b).toEqual(a)
    expect(r.calls).toHaveLength(1)
  })

  it('entries expire after a day', async () => {
    const r = rig({ meteo: () => json({ results: [PHOENIX] }) })
    await r.service.searchPlaces(q('Phoenix'))
    r.clock.t += 24 * 3600 * 1000 + 1
    expect(r.service.cachedPlaces(q('Phoenix'))).toBeUndefined()
    await r.service.searchPlaces(q('Phoenix'))
    expect(r.calls).toHaveLength(2)
  })

  it('empty answers and failures are not cached', async () => {
    let n = 0
    const r = rig({ meteo: () => (n++ === 0 ? json({}) : json({ results: [PHOENIX] })), nominatim: () => json([]) })
    expect(await r.service.searchPlaces(q('Phoenix'))).toEqual([])
    expect((await r.service.searchPlaces(q('Phoenix')))[0].name).toBe('Phoenix')
  })

  it('elevation answers are cached by rounded point, including "no height here"', async () => {
    const r = rig({ elevation: () => json({ elevation: [331] }) })
    expect(await r.service.elevationAt(33.4484, -112.0741)).toBe(331)
    expect(r.service.cachedElevation(33.4484, -112.0741)).toBe(331)
    expect(await r.service.elevationAt(33.4484, -112.0741)).toBe(331)
    expect(r.elevation()).toHaveLength(1)
    const none = rig({ elevation: () => json({ elevation: [-9999] }) })
    expect(await none.service.elevationAt(0, 0)).toBeNull()
    expect(none.service.cachedElevation(0, 0)).toBeNull()
  })
})

describe('elevation', () => {
  it('asks Open-Meteo for the point and returns metres', async () => {
    const r = rig({ elevation: () => json({ elevation: [331.4] }) })
    expect(await r.service.elevationAt(33.44838, -112.07404)).toBe(331)
    const u = new URL(r.elevation()[0].url)
    expect(u.searchParams.get('latitude')).toBe('33.44838')
    expect(u.searchParams.get('longitude')).toBe('-112.07404')
  })

  it('the cache cell is the point asked for: two points 60 m apart are two requests, each answered for its own point', async () => {
    const heights = [331, 340]
    const r = rig({ elevation: () => json({ elevation: [heights.shift()] }) })
    expect(await r.service.elevationAt(33.44838, -112.07404)).toBe(331)
    expect(await r.service.elevationAt(33.44888, -112.07404)).toBe(340)
    expect(r.elevation()).toHaveLength(2)
    expect(r.service.cachedElevation(33.44838, -112.07404)).toBe(331)
    expect(r.service.cachedElevation(33.44888, -112.07404)).toBe(340)
  })

  it.each([
    ['500', () => json({}, 500)],
    ['not JSON', () => new Response('x')],
    ['wrong shape', () => json({ elevation: 'a' })],
    ['network error', () => { throw new Error('ETIMEDOUT') }],
  ])('a failure (%s) throws, so the route can say so', async (_n, elevation) => {
    const r = rig({ elevation })
    await expect(r.service.elevationAt(33.4, -112)).rejects.toThrow()
  })
})

describe('searches shaped like "City State", ZIPs and street addresses', () => {
  it('"Tucson Arizona" (no comma) is answered by Open-Meteo alone: it asks for Tucson and filters by Arizona', async () => {
    const tucsonAz = { ...PHOENIX, name: 'Tucson', latitude: 32.22, longitude: -110.93, elevation: 728 }
    const tucsonOther = { ...tucsonAz, id: 9, admin1: 'Sonora', country: 'Mexico', country_code: 'MX' }
    const r = rig({ meteo: () => json({ results: [tucsonOther, tucsonAz] }) })
    const out = await r.service.searchPlaces(q('Tucson Arizona'))
    expect(out.map((c) => c.country)).toEqual(['United States'])
    expect(new URL(r.meteo()[0].url).searchParams.get('name')).toBe('Tucson')
    expect(r.nominatim()).toHaveLength(0)
  })

  it('a 5-digit search puts United States matches first, in a stable order, even when the geocoder lists France first', async () => {
    const fr = { ...PHOENIX, id: 7, name: 'La Roche-sur-Yon', country: 'France', country_code: 'FR', admin1: 'Pays de la Loire', timezone: 'Europe/Paris', latitude: 46.67, longitude: -1.43, elevation: 70 }
    const phx2 = { ...PHOENIX, id: 8, name: 'Phoenix North' }
    const r = rig({ meteo: () => json({ results: [fr, PHOENIX, phx2] }) })
    const out = await r.service.searchPlaces(q('85001'))
    expect(out.map((c) => c.name)).toEqual(['Phoenix', 'Phoenix North', 'La Roche-sur-Yon'])
  })

  it('other searches keep the geocoder order (not reordered by country)', async () => {
    const fr = { ...PHOENIX, id: 7, name: 'Paris', country: 'France', country_code: 'FR' }
    const r = rig({ meteo: () => json({ results: [fr, PHOENIX] }) })
    expect((await r.service.searchPlaces(q('Paris'))).map((c) => c.name)).toEqual(['Paris', 'Phoenix'])
  })

  it('a street address: the house number never reaches Open-Meteo, Nominatim or the cache key', async () => {
    const r = rig({ meteo: () => json({}), nominatim: () => json([NOM_PHOENIX]), elevation: () => json({ elevation: [331] }) })
    await r.service.searchPlaces(q('1234 N Central Ave, Phoenix, AZ'))
    expect(new URL(r.nominatim()[0].url).searchParams.get('q')).toBe('N Central Ave, Phoenix, AZ')
    expect(r.service.cachedPlaces(q('N Central Ave, Phoenix, AZ'))).toBeDefined()
    expect(r.calls.some((c) => c.url.includes('1234'))).toBe(false)
  })
})

describe('Nominatim: at most one request per second for the whole app', () => {
  const nomRig = (store?: CounterStore) =>
    rig({ meteo: () => json({}), nominatim: () => json([NOM_PHOENIX]), elevation: () => json({ elevation: [331] }) }, store)

  it('five searches at once reach Nominatim more than 1 s apart, one at a time', async () => {
    const r = nomRig()
    await Promise.all(['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((n) => r.service.searchPlaces(q(`${n} town`))))
    const at = r.nominatim().map((c) => c.at)
    expect(at).toHaveLength(5)
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThan(1000)
  })

  it('a second instance sharing the counter store waits for the first one`s slot', async () => {
    const store = new MemoryCounterStore()
    const a = nomRig(store)
    const b = nomRig(store)
    b.clock.t = a.clock.t
    await a.service.searchPlaces(q('alpha town'))
    b.clock.t = a.clock.t + 300 // 0.3 s later, in the next slot or the same one
    await b.service.searchPlaces(q('bravo town'))
    const gap = b.nominatim()[0].at - a.nominatim()[0].at
    expect(gap).toBeGreaterThan(1000)
  })

  it('gives up after 4 tries when the slots stay taken: the fallback fails closed with the clear message', async () => {
    const store: CounterStore = { get: async () => 1, incr: async () => 2, decr: async () => undefined }
    const r = nomRig(store)
    await expect(r.service.searchPlaces(q('alpha town'))).rejects.toThrow(LookupUnavailableError)
    expect(r.nominatim()).toHaveLength(0)
  })

  it('a counter store failure fails closed: no Nominatim request is made', async () => {
    const store: CounterStore = { get: async () => { throw new CounterStoreError('down') }, incr: async () => { throw new CounterStoreError('down') }, decr: async () => undefined }
    const r = nomRig(store)
    await expect(r.service.searchPlaces(q('alpha town'))).rejects.toThrow(CounterStoreError)
    expect(r.nominatim()).toHaveLength(0)
  })

  it('PLANNER_NOMINATIM=off switches the fallback off without a release: empty stays empty, an Open-Meteo outage says unavailable', async () => {
    const prev = process.env.PLANNER_NOMINATIM
    process.env.PLANNER_NOMINATIM = 'off'
    try {
      const empty = nomRig()
      expect(await empty.service.searchPlaces(q('Phoenix Arizona'))).toEqual([])
      expect(empty.nominatim()).toHaveLength(0)
      const down = rig({ meteo: () => json({}, 500), nominatim: () => json([NOM_PHOENIX]) })
      await expect(down.service.searchPlaces(q('Phoenix Arizona'))).rejects.toThrow(LookupUnavailableError)
      expect(down.nominatim()).toHaveLength(0)
    } finally {
      if (prev === undefined) delete process.env.PLANNER_NOMINATIM
      else process.env.PLANNER_NOMINATIM = prev
    }
  })

  it('a failed turn does not block the next caller', async () => {
    const store = new MemoryCounterStore()
    const r = rig({ meteo: () => json({}), nominatim: () => json({}, 500) }, store)
    await expect(r.service.searchPlaces(q('alpha town'))).rejects.toThrow(LookupUnavailableError)
    await expect(r.service.searchPlaces(q('bravo town'))).rejects.toThrow(LookupUnavailableError)
    expect(r.nominatim()).toHaveLength(2)
  })
})
