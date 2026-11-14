import { starterTargets } from '../catalog'
import type { HorizonPoint } from '../horizon'
import { resolveTrain } from '../profile'
import type { Profile, TrainEntry } from '../profile'
import { MAX_TARGETS } from './facts'
import type { AiPlanInput, AiTarget, RigInfo } from './facts'
import { MAX_HORIZON_POINTS } from './request'

/** The curated catalog's ids: the only targets the server can add object facts for (see `parseBody`). */
const CURATED = new Set(starterTargets.map((t) => t.id))

/** One fixed-position target of My plan, as the page knows it. */
export interface PlanTarget {
  id: string
  name: string
  raHours: number
  decDeg: number
}

/** What the page holds for a request: the same fields `AiPlanInput` carries, minus the ones the page never sets (startTime, allowFlips). */
export interface AiPlanForm extends Omit<AiPlanInput, 'targets' | 'startTime' | 'allowFlips'> {
  targets: readonly PlanTarget[]
}

/** The JSON the route's `parseBody` reads. Exactly these keys, nothing else. */
export interface AiPlanBody {
  targets: (Pick<AiTarget, 'id' | 'name' | 'raHours' | 'decDeg'> & { catalogId?: string })[]
  site: AiPlanInput['site']
  timeZone: string
  horizon: HorizonPoint[] | null
  minAltitude: number
  date: string
  rig?: RigInfo
  bortle?: number
  qualityReview?: boolean
}

export class RequestTooLargeError extends Error {}

/** The imaging rig of a train, in the words the route takes. Every field the profile does not hold is left out (unknown), never guessed. */
export function rigOf(profile: Profile, train: TrainEntry): RigInfo {
  const r = resolveTrain(profile, train)
  const rig: RigInfo = {}
  if (r.scope.focalLengthMm !== undefined) rig.focalLengthMm = r.scope.focalLengthMm
  if (r.scope.apertureMm !== undefined) rig.apertureMm = r.scope.apertureMm
  if (r.camera.pixelSizeUm !== undefined) rig.pixelSizeUm = r.camera.pixelSizeUm
  if (r.camera.name) rig.camera = r.camera.name
  if (r.cameraSpec?.colour !== undefined) rig.colourCamera = r.cameraSpec.colour
  if (r.filter) {
    rig.filter = r.filter.name
    if (r.filter.kind) rig.filterKind = r.filter.kind
  }
  return rig
}

/**
 * The request body for the AI night plan, from what the page already holds. My plan's order is the targets' order. Only the
 * first MAX_TARGETS go (the caller says so); a horizon over the route's limit is refused here in words, not left to a 400.
 */
export function buildAiPlanBody(form: AiPlanForm, qualityReview: boolean): AiPlanBody {
  if (form.horizon && form.horizon.length > MAX_HORIZON_POINTS) throw new RequestTooLargeError('Your horizon has too many points for the AI planner.')
  const body: AiPlanBody = {
    targets: form.targets.slice(0, MAX_TARGETS).map((t) => ({ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg, ...(CURATED.has(t.id) ? { catalogId: t.id } : {}) })),
    site: form.site,
    timeZone: form.timeZone,
    horizon: form.horizon ? form.horizon.map((p) => ({ az: p.az, alt: p.alt })) : null,
    minAltitude: form.minAltitude,
    date: form.date,
  }
  if (form.rig && Object.keys(form.rig).length > 0) body.rig = form.rig
  if (form.bortle !== undefined) body.bortle = form.bortle
  if (qualityReview) body.qualityReview = true
  return body
}
