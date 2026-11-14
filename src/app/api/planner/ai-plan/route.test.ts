const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))
const mockCaller = jest.fn()
jest.mock('@/planner/ai/anthropic', () => ({
  ...jest.requireActual('@/planner/ai/anthropic'),
  createAnthropicCaller: () => mockCaller.mockName('createAnthropicCaller')(),
}))

let mockStore: CounterStore
jest.mock('@/planner/ai/counter-store', () => ({
  ...jest.requireActual('@/planner/ai/counter-store'),
  getCounterStore: () => mockStore,
}))

import { MissingKeyError } from '@/planner/ai/anthropic'
import { CounterStoreError, KvRestCounterStore, MemoryCounterStore } from '@/planner/ai/counter-store'
import type { CounterStore } from '@/planner/ai/counter-store'
import { fakeKv } from '@/planner/ai/kv-fake'
import { GUEST_PER_DAY, GUEST_PER_HOUR } from '@/planner/ai/guest-limits'
import { MAX_BODY_BYTES } from '@/planner/ai/request'
import { INPUT, planOf, validSlots } from '@/planner/ai/testkit'
import { POST } from './route'

const CATALOG_ID = 'ic405'
const KEY = 'sk-ant-test-secret-0123456789abcdef'
const OWNER = { login: 'owner', googleSub: '1001' }
const GUEST = { login: 'guest', googleSub: '2002' }
const IP = '203.0.113.77'
const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  targets: INPUT.targets, site: INPUT.site, timeZone: INPUT.timeZone, horizon: null, minAltitude: INPUT.minAltitude, date: INPUT.date, ...over,
})
const post = (b: unknown, raw?: string, ip = IP): Promise<Response> =>
  POST(new Request('http://x/api/planner/ai-plan', { method: 'POST', body: raw ?? JSON.stringify(b), headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }))

describe('POST /api/planner/ai-plan', () => {
  const prevOwner = process.env.PLANNER_OWNER_GOOGLE_SUB
  const prevKey = process.env.ANTHROPIC_API_KEY
  let model: jest.Mock
  beforeEach(() => {
    process.env.PLANNER_OWNER_GOOGLE_SUB = '1001'
    process.env.ANTHROPIC_API_KEY = KEY
    mockSession.mockReset()
    mockSession.mockResolvedValue({ user: OWNER })
    mockStore = new MemoryCounterStore()
    delete process.env.PLANNER_GUEST_PER_HOUR
    delete process.env.PLANNER_GUEST_PER_DAY
    model = jest.fn(async () => JSON.stringify(planOf(INPUT, validSlots())))
    mockCaller.mockReset()
    mockCaller.mockReturnValue(model)
  })
  afterAll(() => {
    if (prevOwner === undefined) delete process.env.PLANNER_OWNER_GOOGLE_SUB
    else process.env.PLANNER_OWNER_GOOGLE_SUB = prevOwner
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prevKey
  })

  it('signed out works: a guest gets a plan with no sign-in and no session', async () => {
    mockSession.mockResolvedValue(null)
    const res = await post(body())
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('verified')
    expect(model).toHaveBeenCalledTimes(1)
  })
  it('a signed-in non-owner is a guest: 200, and a bad body is 400 (not 403)', async () => {
    mockSession.mockResolvedValue({ user: GUEST })
    expect((await post(body())).status).toBe(200)
    expect((await post(null, 'not json')).status).toBe(400)
  })
  it('200 for an owner with the plan, status, violations and facts', async () => {
    const res = await post(body())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const j = await res.json()
    expect(j.status).toBe('verified')
    expect(j.violations).toEqual([])
    expect(j.facts.targets).toHaveLength(3)
    expect(j.plan.plan).toHaveLength(3)
    expect(j.lastTarget).toMatchObject({ id: 't3', usefulness: 'useful' })
    expect(Array.isArray(j.warnings)).toBe(true)
    expect(JSON.stringify(j)).not.toContain(KEY)
  })
  it('object facts come from the catalog by catalogId, rig and bortle pass through to the model', async () => {
    const withInfo = body({ targets: [{ ...INPUT.targets[0], catalogId: CATALOG_ID }, ...INPUT.targets.slice(1)], rig: { focalLengthMm: 400, camera: 'Cam' }, bortle: 5 })
    expect((await post(withInfo)).status).toBe(200)
    const sent = JSON.parse((model.mock.calls[0][0] as { content: string }[])[1].content.split('\n\n').slice(1).join('\n\n'))
    expect(sent.targets[0].object.type).toBeDefined()
    expect(sent.rig).toEqual({ focalLengthMm: 400, camera: 'Cam' })
    expect(sent.bortle).toBe(5)
  })
  it('allowFlips passes through to the facts and must be a boolean', async () => {
    const j = await (await post(body({ allowFlips: true }))).json()
    expect(j.facts.meridianFlips).toEqual({ allowed: true, minutes: 10 })
    expect((await (await post(body())).json()).facts.meridianFlips.allowed).toBe(false)
    expect((await post(body({ allowFlips: 'yes' }))).status).toBe(400)
  })
  it('400 on an unknown catalogId, a bad rig or a bad bortle', async () => {
    for (const bad of [{ targets: [{ ...INPUT.targets[0], catalogId: 'nope' }] }, { rig: { focalLengthMm: -1 } }, { rig: { camera: 5 } }, { bortle: 10 }, { bortle: 4.5 }]) {
      expect((await post(body(bad))).status).toBe(400)
    }
    expect(model).not.toHaveBeenCalled()
  })
  it('400 on invalid JSON and on each invalid field, without calling the model', async () => {
    expect((await post(null, '{')).status).toBe(400)
    for (const bad of [
      { targets: [] }, { targets: 'x' }, { site: { latitude: 99, longitude: 0 } }, { minAltitude: 95 }, { date: '2026-13-40' },
      { timeZone: 'Not/AZone' }, { startTime: '25:00' }, { qualityReview: 'yes' }, { horizon: [{ az: 0, alt: 5 }, { az: 0, alt: 6 }] },
      { targets: [{ id: 'a', name: 'a', raHours: 30, decDeg: 0 }] },
      { targets: [INPUT.targets[0], INPUT.targets[0]] },
    ]) {
      expect((await post(body(bad))).status).toBe(400)
    }
    expect(model).not.toHaveBeenCalled()
  })
  it('caps targets at 12', async () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x${i}`, name: `x${i}`, raHours: (i * 2) % 24, decDeg: 10 }))
    const over = await post(body({ targets: many(13) }))
    expect(over.status).toBe(400)
    expect((await over.json()).error).toContain('at most 12')
    expect(model).not.toHaveBeenCalled()
    mockCaller.mockReturnValue(async () => JSON.stringify({ exposures: [], plan: [], cut: [], fitsAll: true }))
    expect((await post(body({ targets: many(12) }))).status).toBe(200)
  })
  it('413 for an oversized body', async () => {
    const res = await post(null, JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES + 1) }))
    expect(res.status).toBe(413)
    expect(model).not.toHaveBeenCalled()
  })
  it('503 when the key is not set, naming the variable only', async () => {
    mockCaller.mockImplementation(() => { throw new MissingKeyError('ANTHROPIC_API_KEY is not set; the AI night plan needs it.') })
    const res = await post(body())
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('ANTHROPIC_API_KEY')
  })
  it('502 on a model failure, and the key never appears in the error', async () => {
    mockCaller.mockReturnValue(async () => { throw new Error(`upstream rejected ${KEY}`) })
    const res = await post(body())
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).not.toContain(KEY)
  })
  it('502 when the model never returns valid JSON', async () => {
    mockCaller.mockReturnValue(async () => 'nope')
    expect((await post(body())).status).toBe(502)
  })
  it('422 when the date has no astronomical night', async () => {
    const res = await post(body({ site: { latitude: 70, longitude: 20 }, timeZone: 'Europe/Oslo', date: '2026-06-21' }))
    expect(res.status).toBe(422)
    expect(model).not.toHaveBeenCalled()
  })
})

describe('guest limits on POST /api/planner/ai-plan', () => {
  const prevOwner = process.env.PLANNER_OWNER_GOOGLE_SUB
  const prevKey = process.env.ANTHROPIC_API_KEY
  let model: jest.Mock
  let logs: jest.SpyInstance[]
  beforeEach(() => {
    process.env.PLANNER_OWNER_GOOGLE_SUB = '1001'
    process.env.ANTHROPIC_API_KEY = KEY
    delete process.env.PLANNER_GUEST_PER_HOUR
    delete process.env.PLANNER_GUEST_PER_DAY
    mockStore = new MemoryCounterStore()
    mockSession.mockReset()
    mockSession.mockResolvedValue(null)
    model = jest.fn(async () => JSON.stringify(planOf(INPUT, validSlots())))
    mockCaller.mockReset()
    mockCaller.mockReturnValue(model)
    logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined))
  })
  afterEach(() => logs.forEach((l) => l.mockRestore()))
  afterAll(() => {
    if (prevOwner === undefined) delete process.env.PLANNER_OWNER_GOOGLE_SUB
    else process.env.PLANNER_OWNER_GOOGLE_SUB = prevOwner
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prevKey
    delete process.env.PLANNER_GUEST_PER_HOUR
    delete process.env.PLANNER_GUEST_PER_DAY
  })

  it('a guest is allowed GUEST_PER_HOUR calls, then 429 with Retry-After and no model call', async () => {
    for (let i = 0; i < GUEST_PER_HOUR; i++) expect((await post(body())).status).toBe(200)
    expect(model).toHaveBeenCalledTimes(GUEST_PER_HOUR)
    const res = await post(body())
    expect(res.status).toBe(429)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await res.json()).error).toMatch(/hourly planner limit/i)
    expect(model).toHaveBeenCalledTimes(GUEST_PER_HOUR)
  })
  it('the limit is per visitor: another IP still gets through', async () => {
    process.env.PLANNER_GUEST_PER_HOUR = '1'
    expect((await post(body())).status).toBe(200)
    expect((await post(body())).status).toBe(429)
    expect((await post(body(), undefined, '198.51.100.5')).status).toBe(200)
  })
  it('counts model calls, not requests: a request that needs a repair uses two', async () => {
    process.env.PLANNER_GUEST_PER_HOUR = '2'
    const bad = JSON.stringify(planOf(INPUT, validSlots(), { fitsAll: true, cut: ['t1'] }))
    model.mockResolvedValueOnce(bad)
    const first = await post(body())
    expect(first.status).toBe(200)
    expect((await first.json()).modelCalls).toBe(2)
    expect((await post(body())).status).toBe(429)
    expect(model).toHaveBeenCalledTimes(2)
  })
  it('a limit reached mid-request keeps the plan so far (repair stops, no 429)', async () => {
    process.env.PLANNER_GUEST_PER_HOUR = '1'
    model.mockResolvedValue(JSON.stringify(planOf(INPUT, validSlots(), { fitsAll: true, cut: ['t1'] })))
    const res = await post(body())
    expect(res.status).toBe(200)
    const j = await res.json()
    expect(j.status).toBe('unverified')
    expect(j.repairError).toMatch(/hourly planner limit/i)
    expect(model).toHaveBeenCalledTimes(1)
  })
  it('the global daily cap stops every guest with the daily message, without calling the model', async () => {
    process.env.PLANNER_GUEST_PER_DAY = '2'
    expect((await post(body(), undefined, '198.51.100.1')).status).toBe(200)
    expect((await post(body(), undefined, '198.51.100.2')).status).toBe(200)
    const res = await post(body(), undefined, '198.51.100.3')
    expect(res.status).toBe(429)
    expect((await res.json()).error).toBe('Daily planner limit reached, try tomorrow')
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(model).toHaveBeenCalledTimes(2)
    mockCaller.mockClear()
    expect((await post(body(), undefined, '198.51.100.1')).status).toBe(429)
    expect(mockCaller).not.toHaveBeenCalled()
  })
  it('the daily cap does not stop an owner, and the owner is not counted', async () => {
    process.env.PLANNER_GUEST_PER_DAY = '1'
    process.env.PLANNER_GUEST_PER_HOUR = '1'
    expect((await post(body())).status).toBe(200)
    expect((await post(body())).status).toBe(429)
    mockSession.mockResolvedValue({ user: OWNER })
    for (let i = 0; i < GUEST_PER_HOUR + GUEST_PER_DAY / 6; i++) expect((await post(body())).status).toBe(200)
    mockSession.mockResolvedValue(null)
    expect((await post(body())).status).toBe(429)
  })
  it('an owner never touches the counter store', async () => {
    mockStore = { incr: jest.fn(), get: jest.fn(), decr: jest.fn() }
    mockSession.mockResolvedValue({ user: OWNER })
    expect((await post(body())).status).toBe(200)
    expect(mockStore.incr).not.toHaveBeenCalled()
    expect(mockStore.get).not.toHaveBeenCalled()
  })
  it('an owner by verified email is exempt; an unverified email is a guest', async () => {
    process.env.PLANNER_OWNER_GOOGLE_EMAIL = 'me@example.com'
    process.env.PLANNER_GUEST_PER_HOUR = '1'
    try {
      mockSession.mockResolvedValue({ user: { login: 'me', googleSub: '77', email: 'me@example.com', googleEmailVerified: false } })
      expect((await post(body())).status).toBe(200)
      expect((await post(body())).status).toBe(429)
      mockSession.mockResolvedValue({ user: { login: 'me', googleSub: '77', email: 'me@example.com', googleEmailVerified: true } })
      for (let i = 0; i < 3; i++) expect((await post(body())).status).toBe(200)
    } finally {
      delete process.env.PLANNER_OWNER_GOOGLE_EMAIL
    }
  })
  it('qualityReview is owner only: a guest asking for it gets one call, an owner gets the review', async () => {
    // The fake always answers with a plan, which is not a review verdict: the owner's review call (and its one retry) are made, the guest's never are.
    const guest = await (await post(body({ qualityReview: true }))).json()
    expect(guest.modelCalls).toBe(1)
    expect(guest.qualityError).toBeUndefined()
    model.mockClear()
    mockSession.mockResolvedValue({ user: OWNER })
    const owner = await (await post(body({ qualityReview: true }))).json()
    expect(owner.modelCalls).toBeGreaterThan(1)
    expect(owner.qualityError).toBeDefined()
  })
  it('body size, target cap and validation still apply to guests, and a bad body costs nothing', async () => {
    expect((await post(null, JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES + 1) }))).status).toBe(413)
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `x${i}`, name: `x${i}`, raHours: i, decDeg: 10 }))
    expect((await post(body({ targets: many }))).status).toBe(400)
    expect((await post(null, '{')).status).toBe(400)
    expect(model).not.toHaveBeenCalled()
    expect(await mockStore.get(`planner:guest:d:${Math.floor(Date.now() / 86400000)}`)).toBe(0)
  })
  it('the IP never appears in the response, the logs or the stored keys', async () => {
    process.env.PLANNER_GUEST_PER_HOUR = '1'
    const store = new MemoryCounterStore()
    const seen: string[] = []
    mockStore = { incr: (k, t) => { seen.push(k); return store.incr(k, t) }, get: (k) => { seen.push(k); return store.get(k) }, decr: (k) => store.decr(k) }
    const ok = await post(body())
    const limited = await post(body())
    expect(limited.status).toBe(429)
    const texts = [JSON.stringify(await ok.json()), JSON.stringify(await limited.json()), [...limited.headers.values()].join(' '), ...seen]
    for (const t of texts) { expect(t).not.toContain(IP); expect(t).not.toContain('203.0.113') }
    for (const l of logs) expect(l).not.toHaveBeenCalled()
  })
  it('works against the KV store: the cap is shared through it and the fake server only sees hashed keys', async () => {
    const clock = { t: Date.now() }
    const kv = fakeKv(clock)
    mockStore = new KvRestCounterStore('https://kv.example', 'tok', kv.fetchImpl)
    process.env.PLANNER_GUEST_PER_HOUR = '2'
    expect((await post(body())).status).toBe(200)
    expect((await post(body())).status).toBe(200)
    expect((await post(body())).status).toBe(429)
    expect(model).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(kv.requests)).not.toContain('203.0.113')
    expect([...kv.data.keys()].some((k) => k.startsWith('planner:guest:h:'))).toBe(true)
  })
  it('a down counter store refuses the guest with 503 and makes no model call (fail closed)', async () => {
    mockStore = { incr: async () => { throw new CounterStoreError('down') }, get: async () => { throw new CounterStoreError('down') }, decr: async () => undefined }
    const res = await post(body())
    expect(res.status).toBe(503)
    expect(model).not.toHaveBeenCalled()
  })
  it('a malformed limit env var is a 503 naming the variable, not a silent default', async () => {
    process.env.PLANNER_GUEST_PER_HOUR = 'lots'
    const res = await post(body())
    expect(res.status).toBe(503)
    expect((await res.json()).error).toContain('PLANNER_GUEST_PER_HOUR')
    expect(model).not.toHaveBeenCalled()
  })
})
