const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))
const mockCaller = jest.fn()
jest.mock('@/planner/ai/anthropic', () => ({
  ...jest.requireActual('@/planner/ai/anthropic'),
  createAnthropicCaller: () => mockCaller.mockName('createAnthropicCaller')(),
}))

import { MissingKeyError } from '@/planner/ai/anthropic'
import { MAX_BODY_BYTES, RATE_LIMIT, resetRateLimit } from '@/planner/ai/request'
import { INPUT, planOf, validSlots } from '@/planner/ai/testkit'
import { POST } from './route'

const CATALOG_ID = 'ic405'
const KEY = 'sk-ant-test-secret-0123456789abcdef'
const OWNER = { login: 'owner', githubId: '1001' }
const body = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  targets: INPUT.targets, site: INPUT.site, timeZone: INPUT.timeZone, horizon: null, minAltitude: INPUT.minAltitude, date: INPUT.date, ...over,
})
const post = (b: unknown, raw?: string): Promise<Response> =>
  POST(new Request('http://x/api/planner/ai-plan', { method: 'POST', body: raw ?? JSON.stringify(b) }))

describe('POST /api/planner/ai-plan', () => {
  const prevOwner = process.env.PLANNER_OWNER_GITHUB_ID
  const prevKey = process.env.ANTHROPIC_API_KEY
  let model: jest.Mock
  beforeEach(() => {
    process.env.PLANNER_OWNER_GITHUB_ID = '1001'
    process.env.ANTHROPIC_API_KEY = KEY
    mockSession.mockReset()
    mockSession.mockResolvedValue({ user: OWNER })
    resetRateLimit()
    model = jest.fn(async () => JSON.stringify(planOf(INPUT, validSlots())))
    mockCaller.mockReset()
    mockCaller.mockReturnValue(model)
  })
  afterAll(() => {
    if (prevOwner === undefined) delete process.env.PLANNER_OWNER_GITHUB_ID
    else process.env.PLANNER_OWNER_GITHUB_ID = prevOwner
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = prevKey
  })

  it('401 signed out, before any caller is built or model called', async () => {
    mockSession.mockResolvedValue(null)
    const res = await post(body())
    expect(res.status).toBe(401)
    expect(mockCaller).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })
  it('403 for a signed-in non-owner, even with a bad body (guard runs first)', async () => {
    mockSession.mockResolvedValue({ user: { login: 'guest', githubId: '2002' } })
    expect((await post(body())).status).toBe(403)
    expect((await post(null, 'not json')).status).toBe(403)
    expect(mockCaller).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })
  it('200 for the owner with the plan, status, violations and facts', async () => {
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
  it('429 after the per-owner limit, with Retry-After; another owner is not limited', async () => {
    for (let i = 0; i < RATE_LIMIT; i++) expect((await post(body())).status).toBe(200)
    const res = await post(body())
    expect(res.status).toBe(429)
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0)
    process.env.PLANNER_OWNER_GITHUB_ID = '1001,1002'
    mockSession.mockResolvedValue({ user: { login: 'other', githubId: '1002' } })
    expect((await post(body())).status).toBe(200)
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
