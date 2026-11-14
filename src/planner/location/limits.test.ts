import { CounterStoreError, MemoryCounterStore } from '@/planner/ai/counter-store'
import type { CounterStore } from '@/planner/ai/counter-store'
import { LOCATION_PER_DAY, LOCATION_PER_HOUR, LocationLimitConfigError, LocationLimitError, locationLimitsFrom, takeLookup } from './limits'

const NOW = Date.UTC(2026, 10, 13, 10, 20, 0)

describe('lookup limits', () => {
  it('defaults are 30 an hour and 2000 a day, and env overrides them', () => {
    expect(locationLimitsFrom({})).toEqual({ perHour: LOCATION_PER_HOUR, perDay: LOCATION_PER_DAY })
    expect([LOCATION_PER_HOUR, LOCATION_PER_DAY]).toEqual([30, 2000])
    expect(locationLimitsFrom({ PLANNER_LOCATION_PER_HOUR: '5', PLANNER_LOCATION_PER_DAY: ' 9 ' })).toEqual({ perHour: 5, perDay: 9 })
  })
  it('a malformed override is an error, never a silent default', () => {
    expect(() => locationLimitsFrom({ PLANNER_LOCATION_PER_HOUR: 'lots' })).toThrow(LocationLimitConfigError)
    expect(() => locationLimitsFrom({ PLANNER_LOCATION_PER_DAY: '-1' })).toThrow(LocationLimitConfigError)
  })
  it('the visitor is refused past their hour, with the seconds left, and the refused try is given back', async () => {
    const store = new MemoryCounterStore(() => NOW)
    const limits = { perHour: 2, perDay: 100 }
    await takeLookup(store, limits, 'v1', NOW)
    await takeLookup(store, limits, 'v1', NOW)
    const err = await takeLookup(store, limits, 'v1', NOW).catch((e) => e)
    expect(err).toBeInstanceOf(LocationLimitError)
    expect(err.retryAfterSeconds).toBe(3600 - ((NOW / 1000) % 3600))
    await takeLookup(store, limits, 'v2', NOW) // another visitor is unaffected
  })
  it('the site day limit refuses everyone and gives the visitor count back', async () => {
    const store = new MemoryCounterStore(() => NOW)
    const limits = { perHour: 10, perDay: 2 }
    await takeLookup(store, limits, 'a', NOW)
    await takeLookup(store, limits, 'b', NOW)
    await expect(takeLookup(store, limits, 'c', NOW)).rejects.toThrow(/Daily/)
    expect(await store.get(`planner:loc:h:c:${Math.floor(NOW / 1000 / 3600)}`)).toBe(0)
  })
  it('does not share counters with the AI plan guest limits', async () => {
    const store = new MemoryCounterStore(() => NOW)
    await takeLookup(store, { perHour: 5, perDay: 5 }, 'v', NOW)
    expect(await store.get(`planner:guest:d:${Math.floor(NOW / 1000 / 86400)}`)).toBe(0)
  })
  it('a counter store failure propagates (the route turns it into a refusal)', async () => {
    const broken: CounterStore = { incr: async () => { throw new CounterStoreError('down') }, get: async () => 0, decr: async () => undefined }
    await expect(takeLookup(broken, { perHour: 5, perDay: 5 }, 'v', NOW)).rejects.toThrow(CounterStoreError)
  })
})
