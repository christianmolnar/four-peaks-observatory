import { starterTargets } from '../catalog'
import { sampleProfile } from '../state'
import { buildAiPlanBody, RequestTooLargeError, rigOf } from './body'
import type { AiPlanForm } from './body'
import { MAX_TARGETS } from './facts'
import { MAX_HORIZON_POINTS, MAX_SHORT_TEXT, parseBody } from './request'
import { INPUT } from './testkit'

// The panel's request, checked by the route's own parseBody: what the page sends is what the route accepts, field for field.

const curated = starterTargets[0]
const form: AiPlanForm = {
  targets: [
    { id: curated.id, name: curated.name, raHours: curated.raHours, decDeg: curated.decDeg },
    { id: 'ngc891', name: 'NGC 891', raHours: 2.37, decDeg: 42.35 },
  ],
  site: INPUT.site,
  timeZone: INPUT.timeZone,
  horizon: [{ az: 0, alt: 0 }, { az: 90, alt: 20 }],
  minAltitude: 30,
  date: '2026-12-10',
}

const parsed = (body: unknown) => {
  const r = parseBody(JSON.parse(JSON.stringify(body)))
  if (typeof r === 'string') throw new Error(`parseBody refused the request: ${r}`)
  return r
}

describe('buildAiPlanBody', () => {
  it('is accepted by parseBody, with the targets in My plan order and every chosen value carried over', () => {
    const { input, qualityReview } = parsed(buildAiPlanBody(form, false))
    expect(input.targets.map((t) => t.id)).toEqual([curated.id, 'ngc891'])
    expect(input.date).toBe('2026-12-10')
    expect(input.timeZone).toBe(INPUT.timeZone)
    expect(input.site).toMatchObject({ latitude: INPUT.site.latitude, longitude: INPUT.site.longitude })
    expect(input.minAltitude).toBe(30)
    expect(input.horizon).toEqual(form.horizon)
    expect(input.allowFlips).toBe(false)
    expect(qualityReview).toBe(false)
  })

  it('sends catalogId only for the curated targets the server knows, so the route never answers unknown catalogId', () => {
    const body = buildAiPlanBody(form, false)
    expect(body.targets[0].catalogId).toBe(curated.id)
    expect(body.targets[1].catalogId).toBeUndefined()
    expect(parsed(body).input.targets[0].info?.type).toBe(curated.type)
  })

  it('carries the review flag only when asked', () => {
    expect('qualityReview' in buildAiPlanBody(form, false)).toBe(false)
    expect(parsed(buildAiPlanBody(form, true)).qualityReview).toBe(true)
  })

  it('sends a null horizon as null, and leaves out a rig and a Bortle the page does not hold', () => {
    const body = buildAiPlanBody({ ...form, horizon: null, rig: {}, bortle: undefined }, false)
    expect(body.horizon).toBeNull()
    expect('rig' in body).toBe(false)
    expect('bortle' in body).toBe(false)
    expect(parsed(body).input.horizon).toBeNull()
  })

  it('sends the rig and Bortle when held', () => {
    const body = buildAiPlanBody({ ...form, rig: { focalLengthMm: 2800, apertureMm: 280, pixelSizeUm: 3.76, camera: 'ASI533MC', colourCamera: true }, bortle: 4 }, false)
    expect(parsed(body).input).toMatchObject({ rig: { focalLengthMm: 2800, camera: 'ASI533MC', colourCamera: true }, bortle: 4 })
  })

  it('sends at most the targets the route takes', () => {
    const many = Array.from({ length: MAX_TARGETS + 3 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, raHours: 1, decDeg: 10 }))
    const body = buildAiPlanBody({ ...form, targets: many }, false)
    expect(body.targets).toHaveLength(MAX_TARGETS)
    expect(parsed(body).input.targets.map((t) => t.id)).toEqual(many.slice(0, MAX_TARGETS).map((t) => t.id))
  })

  it('refuses a horizon the route would answer 400 to, in words, before sending', () => {
    const big = Array.from({ length: MAX_HORIZON_POINTS + 1 }, (_, i) => ({ az: i % 360, alt: 1 }))
    expect(() => buildAiPlanBody({ ...form, horizon: big }, false)).toThrow(RequestTooLargeError)
  })
})

describe('rigOf', () => {
  it('reads the optical train of the sample profile in the route\'s own fields, and parseBody accepts it', () => {
    const profile = sampleProfile()
    for (const train of profile.trains) {
      const rig = rigOf(profile, train)
      expect(parsed(buildAiPlanBody({ ...form, rig }, false)).input.rig).toEqual(rig)
    }
    const optical = profile.trains.find((t) => t.kind === 'optical')!
    const rig = rigOf(profile, optical)
    expect(rig.focalLengthMm).toBeGreaterThan(0)
    expect(rig.camera).toBeTruthy()
  })

  it('clips a camera and a filter name over the route\'s limit, so parseBody accepts it and the route never answers 400 for the rig', () => {
    const profile = sampleProfile()
    const train = profile.trains.find((t) => t.kind === 'optical')!
    const long = 'N'.repeat(81)
    if (train.kind !== 'optical') throw new Error('expected an optical train')
    const filter = profile.equipment.filters[0]
    train.filterId = filter.id
    profile.equipment.cameras.find((c) => c.id === train.cameraId)!.name = long
    filter.name = long
    const rig = rigOf(profile, train)
    expect(rig.camera).toBe('N'.repeat(MAX_SHORT_TEXT))
    expect(rig.filter).toBe('N'.repeat(MAX_SHORT_TEXT))
    expect(parsed(buildAiPlanBody({ ...form, rig }, false)).input.rig).toMatchObject({ camera: rig.camera, filter: rig.filter })
  })
})
