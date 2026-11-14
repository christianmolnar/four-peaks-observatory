let mockStore: CounterStore
jest.mock('@/planner/ai/counter-store', () => ({
  ...jest.requireActual('@/planner/ai/counter-store'),
  getCounterStore: () => mockStore,
}))

import { CounterStoreError, MemoryCounterStore } from '@/planner/ai/counter-store'
import type { CounterStore } from '@/planner/ai/counter-store'
import { resetLocationService } from '@/planner/location/route-support'
import { GET as GEOCODE } from './route'
import { GET as ELEVATION } from '../elevation/route'

process.env.AUTH_SECRET = 'route-test-secret'
const PHOENIX = { name: 'Phoenix', latitude: 33.44838, longitude: -112.07404, elevation: 331, country_code: 'US', timezone: 'America/Phoenix', country: 'United States', admin1: 'Arizona' }
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

let outbound: string[]
let upstream: (url: string) => Response | Promise<Response>
const place = (q: string | null, ip = '203.0.113.9') =>
  GEOCODE(new Request(`http://x/api/planner/geocode${q === null ? '' : `?q=${encodeURIComponent(q)}`}`, { headers: { 'x-forwarded-for': ip } }))
const height = (query: string, ip = '203.0.113.9') => ELEVATION(new Request(`http://x/api/planner/elevation?${query}`, { headers: { 'x-forwarded-for': ip } }))

beforeEach(() => {
  mockStore = new MemoryCounterStore()
  resetLocationService()
  outbound = []
  upstream = (url) => (url.includes('geocoding-api') ? json({ results: [PHOENIX] }) : json({ elevation: [331] }))
  jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
    outbound.push(String(input))
    return upstream(String(input))
  })
  delete process.env.PLANNER_LOCATION_PER_HOUR
  delete process.env.PLANNER_LOCATION_PER_DAY
})
afterEach(() => jest.restoreAllMocks())

describe('GET /api/planner/geocode', () => {
  it('"Phoenix, AZ" returns a candidate and the CDN may keep it a day', async () => {
    const res = await place('Phoenix, AZ')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ candidates: [{ name: 'Phoenix', admin: 'Arizona', country: 'United States', latitude: 33.44838, longitude: -112.07404, elevationM: 331, timeZone: 'America/Phoenix', source: 'open-meteo' }] })
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=86400/)
  })
  it('a repeat is served from memory: no outbound call and no cap spent', async () => {
    process.env.PLANNER_LOCATION_PER_HOUR = '1'
    expect((await place('85001')).status).toBe(200)
    expect((await place('85001')).status).toBe(200)
    expect(outbound).toHaveLength(1)
  })
  it.each([[null], [''], ['a'], ['x'.repeat(101)], ['bad\u0000text']])('refuses q=%p with 400 and no outbound call', async (q) => {
    const res = await place(q)
    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(outbound).toHaveLength(0)
  })
  it('the visitor hour cap answers 429 with Retry-After; another visitor still works', async () => {
    process.env.PLANNER_LOCATION_PER_HOUR = '2'
    await place('aa town'); await place('bb town')
    const res = await place('cc town')
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await res.json()).error).toMatch(/Hourly/)
    expect((await place('cc town', '198.51.100.4')).status).toBe(200)
  })
  it('the site day cap answers 429', async () => {
    process.env.PLANNER_LOCATION_PER_DAY = '1'
    await place('aa town')
    expect((await place('bb town', '198.51.100.4')).status).toBe(429)
  })
  it('a counter store failure fails closed with 503 and nothing outbound', async () => {
    mockStore = { incr: async () => { throw new CounterStoreError('down') }, get: async () => 0, decr: async () => undefined }
    const res = await place('Phoenix')
    expect(res.status).toBe(503)
    expect(outbound).toHaveLength(0)
  })
  it('a malformed cap setting fails closed with 503', async () => {
    process.env.PLANNER_LOCATION_PER_HOUR = 'many'
    expect((await place('Phoenix')).status).toBe(503)
    expect(outbound).toHaveLength(0)
  })
  it('without AUTH_SECRET guests cannot be told apart: 503', async () => {
    const secret = process.env.AUTH_SECRET
    delete process.env.AUTH_SECRET
    try {
      expect((await place('Phoenix')).status).toBe(503)
    } finally {
      process.env.AUTH_SECRET = secret
    }
  })
  it('both services down: 502 with a clear message, never cached', async () => {
    upstream = () => json({}, 500)
    const res = await place('Phoenix')
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/not available right now/)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('nothing found: 200 with an empty list, not cached by the CDN', async () => {
    upstream = (u) => (u.includes('nominatim') ? json([]) : json({}))
    const res = await place('Zzzzqx')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ candidates: [] })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('never logs or returns the caller address', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    const res = await place('Phoenix', '203.0.113.99')
    expect(JSON.stringify(await res.json())).not.toContain('203.0.113.99')
    expect(outbound.join(' ')).not.toContain('203.0.113.99')
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('GET /api/planner/elevation', () => {
  it('returns metres for valid coordinates and caches them', async () => {
    const res = await height('lat=33.4484&lon=-112.074')
    expect(await res.json()).toEqual({ elevationM: 331 })
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage/)
    await height('lat=33.4484&lon=-112.074')
    expect(outbound).toHaveLength(1)
  })
  it.each([['lat=91&lon=0'], ['lat=0&lon=181'], ['lat=abc&lon=0'], ['lat=1'], [''], ['lat=1e2&lon=0']])('refuses %p with 400', async (qs) => {
    expect((await height(qs)).status).toBe(400)
    expect(outbound).toHaveLength(0)
  })
  it('a service failure is a 502 with a message that says to enter it by hand', async () => {
    upstream = () => { throw new Error('ETIMEDOUT') }
    const res = await height('lat=33&lon=-112')
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Enter it by hand/)
  })
  it('no height for the point is 200 with null', async () => {
    upstream = () => json({ elevation: [-9999] })
    expect(await (await height('lat=0&lon=0')).json()).toEqual({ elevationM: null })
  })
  it('shares the caps with the place search, and fails closed when the counter store is down', async () => {
    process.env.PLANNER_LOCATION_PER_HOUR = '1'
    await place('aa town')
    expect((await height('lat=33&lon=-112')).status).toBe(429)
    mockStore = { incr: async () => { throw new CounterStoreError('down') }, get: async () => 0, decr: async () => undefined }
    expect((await height('lat=34&lon=-112')).status).toBe(503)
  })
})
