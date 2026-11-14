import { MAX_TARGETS } from './facts'
import type { AiPlanInput } from './facts'
import { CLOCK_RE } from '../itinerary/timeline'
import { parseLocalDate } from '../plan'
import { starterTargets } from '../catalog'

export const MAX_BODY_BYTES = 64 * 1024
export const MAX_HORIZON_POINTS = 360
/** The longest short text the route takes (rig camera, filter and filter kind). */
export const MAX_SHORT_TEXT = 80

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown, max = MAX_SHORT_TEXT): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** Validates the request body. Returns the input and the review flag, or the first problem. */
export function parseBody(b: unknown): { input: AiPlanInput; qualityReview: boolean } | string {
  if (!isObj(b)) return 'body must be a JSON object'
  const { targets, site, horizon, minAltitude, date, timeZone, startTime, qualityReview, rig, bortle, allowFlips } = b
  if (!Array.isArray(targets) || targets.length < 1) return 'targets must be a non-empty array'
  if (targets.length > MAX_TARGETS) return `at most ${MAX_TARGETS} targets`
  const ids = new Set<string>()
  const ts: AiPlanInput['targets'] = []
  for (const t of targets) {
    if (!isObj(t) || !str(t.id, 40) || !str(t.name, 120) || !num(t.raHours) || !num(t.decDeg)) return 'each target needs id, name, raHours and decDeg'
    if (t.raHours < 0 || t.raHours >= 24 || t.decDeg < -90 || t.decDeg > 90) return `target ${t.id}: raHours must be 0 up to 24 and decDeg -90 to 90`
    if (ids.has(t.id)) return `duplicate target id ${t.id}`
    ids.add(t.id)
    const target: AiPlanInput['targets'][number] = { id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg }
    if (t.catalogId !== undefined) {
      // Object facts come from the server's catalog, never from the request text.
      const c = typeof t.catalogId === 'string' ? starterTargets.find((x) => x.id === t.catalogId) : undefined
      if (!c) return `target ${t.id}: unknown catalogId`
      target.info = { type: c.type, ...(c.sizeArcmin ? { sizeArcmin: c.sizeArcmin } : {}), ...(c.brightCore ? { brightCore: true } : {}) }
    }
    ts.push(target)
  }
  if (!isObj(site) || !num(site.latitude) || !num(site.longitude) || site.latitude < -90 || site.latitude > 90 || site.longitude < -180 || site.longitude > 360) return 'site needs latitude (-90..90) and longitude'
  if (site.elevationM !== undefined && !num(site.elevationM)) return 'site.elevationM must be a number'
  if (!num(minAltitude) || minAltitude < 0 || minAltitude >= 90) return 'minAltitude must be from 0 up to 90 degrees'
  if (!str(date, 10)) return 'date must be YYYY-MM-DD'
  try { parseLocalDate(date) } catch (e) { return (e as Error).message }
  if (!str(timeZone, 64)) return 'timeZone must be an IANA zone name'
  try { new Intl.DateTimeFormat('en-US', { timeZone }) } catch { return `unknown timeZone ${timeZone}` }
  if (startTime !== undefined && (typeof startTime !== 'string' || !CLOCK_RE.test(startTime))) return 'startTime must be HH:MM'
  if (qualityReview !== undefined && typeof qualityReview !== 'boolean') return 'qualityReview must be true or false'
  if (allowFlips !== undefined && typeof allowFlips !== 'boolean') return 'allowFlips must be true or false'
  if (bortle !== undefined && (!num(bortle) || !Number.isInteger(bortle) || bortle < 1 || bortle > 9)) return 'bortle must be a whole number from 1 to 9'
  const rigOut = parseRig(rig)
  if (typeof rigOut === 'string') return rigOut
  let hz: AiPlanInput['horizon'] = null
  if (horizon !== null && horizon !== undefined) {
    if (!Array.isArray(horizon) || horizon.length > MAX_HORIZON_POINTS) return `horizon must be an array of at most ${MAX_HORIZON_POINTS} points`
    const azs = new Set<number>()
    for (const p of horizon) {
      if (!isObj(p) || !num(p.az) || !num(p.alt) || p.az < 0 || p.az >= 360 || p.alt < -90 || p.alt > 90) return 'each horizon point needs az (0..360) and alt (-90..90)'
      if (azs.has(p.az)) return `duplicate horizon azimuth ${p.az}`
      azs.add(p.az)
    }
    hz = horizon.map((p: Obj) => ({ az: p.az as number, alt: p.alt as number }))
  }
  return {
    input: { targets: ts, rig: rigOut, bortle: bortle as number | undefined, site: { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM as number | undefined }, timeZone, horizon: hz, minAltitude, date, startTime: startTime as string | undefined, allowFlips: allowFlips === true },
    qualityReview: qualityReview === true,
  }
}

const RIG_NUMBERS = ['focalLengthMm', 'apertureMm', 'pixelSizeUm'] as const
const RIG_TEXT = ['camera', 'filter', 'filterKind'] as const

function parseRig(r: unknown): AiPlanInput['rig'] | string {
  if (r === undefined) return undefined
  if (!isObj(r)) return 'rig must be an object'
  const out: Obj = {}
  for (const k of RIG_NUMBERS) if (r[k] !== undefined) { if (!num(r[k]) || (r[k] as number) <= 0) return `rig.${k} must be a positive number`; out[k] = r[k] }
  for (const k of RIG_TEXT) if (r[k] !== undefined) { if (!str(r[k])) return `rig.${k} must be a short string`; out[k] = r[k] }
  if (r.colourCamera !== undefined) { if (typeof r.colourCamera !== 'boolean') return 'rig.colourCamera must be true or false'; out.colourCamera = r.colourCamera }
  return out
}
