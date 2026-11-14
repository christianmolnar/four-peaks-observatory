import { MemoryCounterStore } from './counter-store'
import { GUEST_PER_DAY, GUEST_PER_HOUR, GuestLimiter, GuestLimitError, LimitConfigError, guestLimitsFrom, visitorKey } from './guest-limits'

const H = 3600_000
const T0 = Date.UTC(2026, 10, 14, 10, 30) // 10:30 UTC
const limiterAt = (store: MemoryCounterStore, who: string, now: number, limits = { perHour: 2, perDay: 5 }) => new GuestLimiter(store, limits, who, now)

describe('guestLimitsFrom', () => {
  it('defaults are 6 per hour and 60 per day', () => {
    expect(guestLimitsFrom({})).toEqual({ perHour: GUEST_PER_HOUR, perDay: GUEST_PER_DAY })
    expect([GUEST_PER_HOUR, GUEST_PER_DAY]).toEqual([6, 60])
  })
  it('env overrides, 0 allowed', () => {
    expect(guestLimitsFrom({ PLANNER_GUEST_PER_HOUR: '3', PLANNER_GUEST_PER_DAY: ' 0 ' })).toEqual({ perHour: 3, perDay: 0 })
  })
  it('a malformed value is an error, not a silent default', () => {
    expect(() => guestLimitsFrom({ PLANNER_GUEST_PER_HOUR: 'six' })).toThrow(LimitConfigError)
    expect(() => guestLimitsFrom({ PLANNER_GUEST_PER_DAY: '-1' })).toThrow(LimitConfigError)
    expect(() => guestLimitsFrom({ PLANNER_GUEST_PER_DAY: '1.5' })).toThrow(LimitConfigError)
  })
})

describe('visitorKey', () => {
  const h = (o: Record<string, string>) => new Headers(o)
  it('same client IP gives the same key; the first forwarded entry is the client', () => {
    expect(visitorKey(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), 's')).toBe(visitorKey(h({ 'x-forwarded-for': '203.0.113.9' }), 's'))
    expect(visitorKey(h({ 'x-forwarded-for': '203.0.113.10' }), 's')).not.toBe(visitorKey(h({ 'x-forwarded-for': '203.0.113.9' }), 's'))
    expect(visitorKey(h({ 'x-real-ip': '203.0.113.9' }), 's')).toBe(visitorKey(h({ 'x-forwarded-for': '203.0.113.9' }), 's'))
  })
  it('the key never contains the IP, and depends on the secret', () => {
    const key = visitorKey(h({ 'x-forwarded-for': '203.0.113.9' }), 's')
    expect(key).toMatch(/^[0-9a-f]{24}$/)
    expect(key).not.toContain('203')
    expect(visitorKey(h({ 'x-forwarded-for': '203.0.113.9' }), 'other')).not.toBe(key)
  })
  it('no header gives one shared key', () => {
    expect(visitorKey(h({}), 's')).toBe(visitorKey(h({}), 's'))
  })
})

describe('GuestLimiter', () => {
  it('allows perHour calls, then refuses with the time to the end of the hour', async () => {
    const store = new MemoryCounterStore(() => T0)
    const l = limiterAt(store, 'v1', T0)
    await l.takeCall()
    await l.takeCall()
    const err = await l.takeCall().catch((e) => e)
    expect(err).toBeInstanceOf(GuestLimitError)
    expect(err.scope).toBe('visitor')
    expect(err.retryAfterSeconds).toBe(30 * 60)
    await expect(l.assertRoom()).rejects.toMatchObject({ scope: 'visitor' })
  })
  it('a refused call is not counted: the counters stay at the limit', async () => {
    const store = new MemoryCounterStore(() => T0)
    const l = limiterAt(store, 'v1', T0)
    await l.takeCall(); await l.takeCall()
    for (let i = 0; i < 5; i++) await l.takeCall().catch(() => undefined)
    const day = Math.floor(T0 / 1000 / 86400)
    expect(await store.get(`planner:guest:d:${day}`)).toBe(2)
  })
  it('another visitor is not limited; the next hour starts at zero', async () => {
    const store = new MemoryCounterStore(() => T0)
    const a = limiterAt(store, 'v1', T0)
    await a.takeCall(); await a.takeCall()
    await expect(limiterAt(store, 'v2', T0).takeCall()).resolves.toBeUndefined()
    await expect(limiterAt(store, 'v1', T0 + H).assertRoom()).resolves.toBeUndefined()
  })
  it('the global day cap stops every visitor, with the daily message, and gives the hour call back', async () => {
    const store = new MemoryCounterStore(() => T0)
    const limits = { perHour: 10, perDay: 3 }
    await limiterAt(store, 'v1', T0, limits).takeCall()
    await limiterAt(store, 'v2', T0, limits).takeCall()
    await limiterAt(store, 'v3', T0, limits).takeCall()
    const err = await limiterAt(store, 'v4', T0, limits).takeCall().catch((e) => e)
    expect(err).toBeInstanceOf(GuestLimitError)
    expect(err.scope).toBe('day')
    expect(err.message).toBe('Daily planner limit reached, try tomorrow')
    expect(err.retryAfterSeconds).toBe(13.5 * 3600)
    await expect(limiterAt(store, 'v5', T0, limits).assertRoom()).rejects.toMatchObject({ scope: 'day' })
    const hour = Math.floor(T0 / 1000 / 3600)
    expect(await store.get(`planner:guest:h:v4:${hour}`)).toBe(0)
  })
  it('the day cap resets at the next UTC day', async () => {
    const store = new MemoryCounterStore(() => T0)
    const limits = { perHour: 10, perDay: 1 }
    await limiterAt(store, 'v1', T0, limits).takeCall()
    await expect(limiterAt(store, 'v2', T0, limits).assertRoom()).rejects.toBeInstanceOf(GuestLimitError)
    await expect(limiterAt(store, 'v2', T0 + 14 * H, limits).assertRoom()).resolves.toBeUndefined()
  })
  it('wrap counts each call before making it and never calls the model once refused', async () => {
    const store = new MemoryCounterStore(() => T0)
    const model = jest.fn(async () => 'ok')
    const call = limiterAt(store, 'v1', T0).wrap(model)
    await call([]); await call([])
    await expect(call([])).rejects.toBeInstanceOf(GuestLimitError)
    expect(model).toHaveBeenCalledTimes(2)
  })
})
