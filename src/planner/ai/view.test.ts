import { parseBody } from './request'
import { planNightWithAi } from './plan'
import type { AiPlanResult } from './plan'
import { INPUT, TZ, clock, earliestSlot, night, planOf, validSlots } from './testkit'
import {
  clockOfIso,
  itineraryFromAiPlan,
  minutesBetween,
  plainText,
  problemFor,
  readResult,
  retryWhen,
} from './view'

// The route's answer read for the page: made by the real engine with a fake model, never a hand-written shape.

const run = async (reply: object): Promise<AiPlanResult> => planNightWithAi(INPUT, { callModel: async () => JSON.stringify(reply) })
const NAMES = new Map(INPUT.targets.map((t) => [t.id, t.name]))

describe('readResult', () => {
  it('reads what the engine returns, as it comes through JSON', async () => {
    const r = await run(planOf(INPUT, validSlots(INPUT)))
    expect(r.status).toBe('verified')
    expect(readResult(JSON.parse(JSON.stringify(r)))).not.toBeNull()
  })

  it.each([null, 7, 'x', {}, { status: 'verified' }, { status: 'verified', plan: { plan: [{ id: 1 }], cut: [], exposures: [] }, violations: [], warnings: [] }])('refuses %j', (v) => {
    expect(readResult(v)).toBeNull()
  })
})

describe('itineraryFromAiPlan', () => {
  it('makes one item per slot in time order on the chosen train and filter, with the first start as the start time', async () => {
    const slots = validSlots(INPUT)
    const r = await run(planOf(INPUT, [slots[2], slots[0], slots[1]]))
    const { items, startTime } = itineraryFromAiPlan(r, 'train-a', 'filter-b')
    expect(items.map((i) => i.targetId)).toEqual(['t1', 't2', 't3'])
    expect(items.every((i) => i.trainId === 'train-a' && i.filterId === 'filter-b' && i.mode === 'balanced')).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(3)
    expect(startTime).toBe(clockOfIso(slots[0][1]))
    expect(items[0].note).toContain(`${clockOfIso(slots[0][1])} to ${clockOfIso(slots[0][2])}`)
  })
})

describe('plain words', () => {
  it('names targets and writes clock times in the checker\'s own sentences', async () => {
    // A cut target that would fit: the checker's real warning.
    const slot = earliestSlot(INPUT, 't1', night(INPUT).start.getTime(), 60)
    const r = await run(planOf(INPUT, [['t1', clock(slot.start), clock(slot.end)]]))
    const warning = r.warnings.find((w) => w.kind === 'cut-fits-free-time')
    expect(warning).toBeDefined()
    const text = plainText(warning!.message, NAMES)
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(text).not.toMatch(/\bt[23]\b/)
    expect(text).toMatch(/Target (Two|Three)/)
    expect(text).toMatch(/\d\d:\d\d/)
  })

  it('turns "deg" into the degree sign and leaves unknown ids alone', () => {
    expect(plainText('t1 is below 25 deg at 2026-12-10T23:10-07:00 (14.0 deg), zz too', NAMES)).toBe('Target One is below 25° at 23:10 (14.0°), zz too')
  })

  it('does not replace an id inside a longer word', () => {
    expect(plainText('t10 and t1', new Map([['t1', 'One']]))).toBe('t10 and One')
  })

  it('reads clock and minutes from ISO instants', () => {
    expect(clockOfIso('2026-12-10T22:40-07:00')).toBe('22:40')
    expect(minutesBetween('2026-12-10T22:40-07:00', '2026-12-10T23:55-07:00')).toBe(75)
  })
})

describe('errors in plain language', () => {
  it('429 says when to retry from Retry-After', () => {
    expect(problemFor(429, '720', 'Hourly planner limit reached').text).toMatch(/Try again in about 12 minutes/)
    expect(problemFor(429, '10800', '').text).toMatch(/about 3 hours/)
    expect(problemFor(429, '20', '').text).toMatch(/about 1 minute\./)
    expect(problemFor(429, null, '').text).toMatch(/Try again later/)
    expect(problemFor(429, 'soon', '').text).toMatch(/Try again later/)
  })
  it('503 says the AI planner is not available, and never shows the route text', () => {
    const p = problemFor(503, null, 'ANTHROPIC_API_KEY is not set')
    expect(p.text).toMatch(/AI planner is not available right now/)
    expect(p.text).not.toMatch(/ANTHROPIC|KEY/)
    expect(p.retry).toBe(false)
  })
  it('502 offers Retry', () => {
    expect(problemFor(502, null, 'Model call failed').retry).toBe(true)
  })
  it('422 explains no usable night, or too many targets when that is the cause', () => {
    expect(problemFor(422, null, 'No astronomical night on 2026-06-21').text).toMatch(/no usable night/i)
    expect(problemFor(422, null, 'The request is too large for one model call').text).toMatch(/too many or too large/i)
  })
  it('a 400 or 413 is a plain request problem', () => {
    expect(problemFor(400, null, 'targets must be a non-empty array').text).not.toMatch(/targets must/)
    expect(problemFor(413, null, '').text).toMatch(/could not accept/)
  })
  it('retryWhen rounds up to a whole minute', () => {
    expect(retryWhen(61)).toBe('Try again in about 2 minutes.')
  })
})

describe('the body the page sends reaches the engine', () => {
  it('parseBody gives an input the engine plans for', async () => {
    const p = parseBody({ targets: INPUT.targets.map(({ id, name, raHours, decDeg }) => ({ id, name, raHours, decDeg })), site: INPUT.site, timeZone: TZ, horizon: null, minAltitude: 25, date: '2026-12-10' })
    if (typeof p === 'string') throw new Error(p)
    const r = await planNightWithAi(p.input, { callModel: async () => JSON.stringify(planOf(p.input, validSlots(p.input))) })
    expect(r.status).toBe('verified')
  })
})
