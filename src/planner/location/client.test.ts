import type { ClientFetch } from './client'
import { CLIENT_TIMEOUT_MS, creditsFor, describeCoordinates, detailValues, fillSiteFields, LookupError, lookupPlace, placeValues } from './client'
import type { PlaceCandidate } from './types'

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })
const PHX: PlaceCandidate = { name: 'Phoenix', admin: 'Arizona', country: 'United States', latitude: 33.44838, longitude: -112.07404, elevationM: 331, timeZone: 'America/Phoenix', source: 'open-meteo' }

describe('lookupPlace', () => {
  it('sends the trimmed, encoded query to our route and returns the candidates', async () => {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<ClientFetch>>(async () => json({ candidates: [PHX] }))
    expect(await lookupPlace('  Phoenix,  AZ ', fetchImpl)).toEqual([PHX])
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/planner/geocode?q=Phoenix%2C%20AZ')
  })
  it('bad text never reaches the network', async () => {
    const fetchImpl = jest.fn()
    await expect(lookupPlace('a', fetchImpl)).rejects.toThrow(LookupError)
    await expect(lookupPlace('x\ny', fetchImpl)).rejects.toThrow(LookupError)
    await expect(lookupPlace('x'.repeat(500), fetchImpl)).rejects.toThrow(/limited to/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('an empty list is a result, not an error', async () => {
    expect(await lookupPlace('Zzzzqx', async () => json({ candidates: [] }))).toEqual([])
  })
  it('a refusal shows the route message (cap, outage)', async () => {
    await expect(lookupPlace('Phoenix', async () => json({ error: 'Hourly place-search limit reached (30 per hour), try again later' }, 429))).rejects.toThrow(/Hourly place-search limit/)
    await expect(lookupPlace('Phoenix', async () => json({ error: 'Place search is not available right now.' }, 502))).rejects.toThrow(/not available/)
  })
  it.each([
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['a 500 with no body', () => new Response('', { status: 500 })],
    ['candidates missing', () => json({})],
    ['a candidate with a string latitude', () => json({ candidates: [{ ...PHX, latitude: '33' }] })],
    ['a candidate with latitude 99', () => json({ candidates: [{ ...PHX, latitude: 99 }] })],
    ['an unknown source', () => json({ candidates: [{ ...PHX, source: 'evil' }] })],
    ['an array instead of an object', () => json([PHX])],
  ])('malformed reply (%s) is a LookupError', async (_n, f) => {
    await expect(lookupPlace('Phoenix', async () => f())).rejects.toThrow(LookupError)
  })
  it('a network failure is a clear LookupError', async () => {
    await expect(lookupPlace('Phoenix', async () => { throw new TypeError('Failed to fetch') })).rejects.toThrow(/Could not reach/)
  })
  it('a fetch that never answers times out', async () => {
    jest.useFakeTimers()
    try {
      const p = lookupPlace('Phoenix', () => new Promise<Response>(() => undefined))
      const settled = expect(p).rejects.toThrow(/took too long/)
      await jest.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS + 1)
      await settled
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('describeCoordinates', () => {
  it('Phoenix coordinates: zone from tz-lookup (offline), elevation from our route', async () => {
    const fetchImpl = jest.fn<Promise<Response>, Parameters<ClientFetch>>(async () => json({ elevationM: 331 }))
    expect(await describeCoordinates(33.4484, -112.074, fetchImpl)).toEqual({ timeZone: 'America/Phoenix', elevationM: 331, notes: [] })
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/planner/elevation?lat=33.4484&lon=-112.074')
  })
  it('round trip: a place candidate, then its own coordinates, give the same zone and elevation', async () => {
    const d = await describeCoordinates(PHX.latitude, PHX.longitude, async () => json({ elevationM: PHX.elevationM }))
    expect(d.timeZone).toBe(PHX.timeZone)
    expect(d.elevationM).toBe(PHX.elevationM)
  })
  it('the elevation service failing keeps the zone and says why; nothing throws', async () => {
    const d = await describeCoordinates(33.4484, -112.074, async () => json({ error: 'Elevation is not available right now. Enter it by hand or try again later.' }, 502))
    expect(d.timeZone).toBe('America/Phoenix')
    expect(d.elevationM).toBeUndefined()
    expect(d.notes[0]).toMatch(/Elevation was not filled in: Elevation is not available/)
  })
  it('no height for the point (null) is a note, not a number', async () => {
    const d = await describeCoordinates(0, 0, async () => json({ elevationM: null }))
    expect(d.elevationM).toBeUndefined()
    expect(d.notes[0]).toMatch(/No elevation is known/)
  })
  it('a malformed elevation reply is a note', async () => {
    const d = await describeCoordinates(33, -112, async () => json({ elevationM: 'high' }))
    expect(d.elevationM).toBeUndefined()
    expect(d.notes[0]).toMatch(/could not be read/)
  })
  it('a hanging elevation call ends at the timeout with a note', async () => {
    jest.useFakeTimers()
    try {
      const p = describeCoordinates(33, -112, () => new Promise<Response>(() => undefined))
      await jest.advanceTimersByTimeAsync(CLIENT_TIMEOUT_MS + 1)
      const d = await p
      expect(d.timeZone).toBe('America/Phoenix')
      expect(d.notes[0]).toMatch(/took too long/)
    } finally {
      jest.useRealTimers()
    }
  })
  it('bad coordinates throw before any request', async () => {
    const fetchImpl = jest.fn()
    await expect(describeCoordinates(95, 0, fetchImpl)).rejects.toThrow(LookupError)
    await expect(describeCoordinates(NaN, 0, fetchImpl)).rejects.toThrow(LookupError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('applying results to the site boxes', () => {
  const boxes = { name: 'Home', latitude: '1', longitude: '2', elevationM: '', timeZone: '' }
  it('placeValues: 4-decimal coordinates, whole-metre elevation, the zone; no elevation key when unknown', () => {
    expect(placeValues(PHX)).toEqual({ latitude: '33.4484', longitude: '-112.074', elevationM: '331', timeZone: 'America/Phoenix' })
    expect('elevationM' in placeValues({ ...PHX, elevationM: undefined })).toBe(false)
  })
  it('fills every box nobody edited and never touches the name', () => {
    const { texts, kept } = fillSiteFields(boxes, new Set(), placeValues(PHX))
    expect(texts).toEqual({ name: 'Home', latitude: '33.4484', longitude: '-112.074', elevationM: '331', timeZone: 'America/Phoenix' })
    expect(kept).toEqual([])
  })
  it('edit-never-overwritten: a box the user typed in keeps its text and is reported', () => {
    const { texts, kept } = fillSiteFields({ ...boxes, elevationM: '1500', timeZone: 'America/Denver' }, new Set(['elevationM', 'timeZone']), placeValues(PHX))
    expect(texts.elevationM).toBe('1500')
    expect(texts.timeZone).toBe('America/Denver')
    expect(texts.latitude).toBe('33.4484')
    expect(kept).toEqual(['Elevation', 'Time zone'])
  })
  it('the input is not mutated', () => {
    const before = { ...boxes }
    fillSiteFields(boxes, new Set(), placeValues(PHX))
    expect(boxes).toEqual(before)
  })
  it('detailValues leaves latitude and longitude alone and skips what is unknown', () => {
    expect(detailValues({ timeZone: 'Asia/Tokyo', notes: [] })).toEqual({ timeZone: 'Asia/Tokyo' })
    expect(detailValues({ timeZone: 'Asia/Tokyo', elevationM: 40.6, notes: [] })).toEqual({ timeZone: 'Asia/Tokyo', elevationM: '41' })
  })
  it('credits: Open-Meteo always, OpenStreetMap only when Nominatim supplied a result', () => {
    expect(creditsFor([PHX])).toEqual([expect.stringMatching(/Open-Meteo.*CC BY 4\.0/)])
    const both = creditsFor([PHX, { ...PHX, source: 'nominatim' }])
    expect(both).toHaveLength(2)
    expect(both[1]).toMatch(/OpenStreetMap contributors/)
  })
})
