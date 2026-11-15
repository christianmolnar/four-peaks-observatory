import { parseBody } from './request'
import { planNightWithAi } from './plan'
import type { AiPlanResult } from './plan'
import { INPUT, TZ, clock, earliestSlot, night, planOf, validSlots } from './testkit'
import {
  clockOfIso,
  itineraryFromAiPlan,
  modeForMinutes,
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
    expect(items.every((i) => i.trainId === 'train-a' && i.filterId === 'filter-b')).toBe(true)
    expect(new Set(items.map((i) => i.id)).size).toBe(3)
    expect(startTime).toBe(clockOfIso(slots[0][1]))
    // The item holds no AI time or minutes: the itinerary shows its own times for the slot, and the two would disagree.
    expect(items.map((i) => i.note)).toEqual([1, 2, 3].map((n) => `From the AI plan, slot ${n} of 3. The itinerary times it again with its own estimate.`))
    expect(items.every((i) => !/\d\d:\d\d|\d min/.test(i.note))).toBe(true)
  })
})

describe('modeForMinutes', () => {
  // Presets no longer have fixed minute ranges. Each aims at its diminishing-returns point (20%, 10%, 5% per half hour): 68, 143 and 293 min.
  // A number of minutes takes the nearest aim on a log scale; the boundaries are the geometric means, 98.6 and 204.4 min.
  // (The old rule used the ranges 30 to 60, 60 to 120 and 120 to 300: 90 min moves from balanced to quick, 150 min stays in balanced to deep at 205.)
  it.each([
    [30, 'quick'], [45, 'quick'], [68, 'quick'], [98, 'quick'], [99, 'balanced'], [143, 'balanced'], [204, 'balanced'], [205, 'deep'], [300, 'deep'],
  ])('%i min is nearest the %s aim', (min, mode) => expect(modeForMinutes(min)).toBe(mode))
  it.each([
    [5, 'quick'], [0, 'quick'], [400, 'deep'], [1000, 'deep'],
  ])('%i min is far from every aim: the nearest one, %s', (min, mode) => expect(modeForMinutes(min)).toBe(mode))
})

describe('applied modes follow the AI slot minutes', () => {
  const slotsOf = (mins: number[], withExposure = false) => {
    let t = Date.parse('2026-12-10T20:00:00-07:00')
    const plan = mins.map((m, i) => {
      const start = clock(t), end = clock(t + m * 60000)
      t += (m + 5) * 60000
      return { id: `t${(i % 3) + 1}`, start, end, ...(withExposure ? { exposureMinutes: m } : {}) }
    })
    return { status: 'verified', plan: { plan, cut: [], exposures: [] }, violations: [], warnings: [] } as unknown as AiPlanResult
  }
  it('a 2-target plan: 50 min is quick, 250 min is deep', () => {
    const { items } = itineraryFromAiPlan(slotsOf([50, 250]), 'train-a', null)
    expect(items.map((i) => i.mode)).toEqual(['quick', 'deep'])
  })
  it('a 6-target plan: each slot takes the preset whose aim is nearest its minutes', () => {
    const mins = [20, 45, 120, 150, 250, 400]
    const { items } = itineraryFromAiPlan(slotsOf(mins), 'train-a', null)
    expect(items.map((i) => i.mode)).toEqual(['quick', 'quick', 'balanced', 'balanced', 'deep', 'deep'])
  })
  it('uses exposureMinutes when the AI set them', () => {
    const r = slotsOf([150])
    r.plan.plan[0].exposureMinutes = 45
    expect(itineraryFromAiPlan(r, 'train-a', null).items[0].mode).toBe('quick')
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
    // An identical request is refused again, so no "Try again".
    for (const status of [400, 413]) {
      const p = problemFor(status, null, '')
      expect(p.text).toMatch(/If it keeps happening, tell the site owner\./)
      expect(p.text).not.toMatch(/Try again/)
      expect(p.retry).toBe(false)
    }
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
