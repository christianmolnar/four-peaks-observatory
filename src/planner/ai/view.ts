import type { AstronomicalNight, Site } from '../astro'
import type { HorizonPoint } from '../horizon'
import { MAX_NOTE_CHARS, slotAltitudes } from '../itinerary'
import type { ItineraryItem, ItineraryPlan, Slot, SlotInput } from '../itinerary'
import type { AiPlanResult } from './plan'

/** The clock part of an ISO local instant ("2026-12-10T22:40-07:00" is "22:40"): the site's own time, the way the facts and the plan write it. */
export const clockOfIso = (iso: string): string => iso.slice(11, 16)

const ISO_IN_TEXT = /\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})[+-]\d{2}:\d{2}/g
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A checker sentence in plain words: target ids become names, ISO instants become clock times, "deg" becomes the degree sign. */
export function plainText(message: string, names: ReadonlyMap<string, string>): string {
  let out = message.replace(ISO_IN_TEXT, '$1').replace(/(\d) deg\b/g, '$1°')
  const ids = [...names.keys()].sort((a, b) => b.length - a.length)
  if (ids.length > 0) {
    const re = new RegExp(`(?<![\\w-])(${ids.map(escapeRe).join('|')})(?![\\w-])`, 'g')
    out = out.replace(re, (id) => names.get(id) ?? id)
  }
  return out
}

/** What the route answered, checked just enough to draw it; null when it is not an answer of that shape. */
export function readResult(json: unknown): AiPlanResult | null {
  const o = json as Partial<AiPlanResult> | null
  if (typeof o !== 'object' || o === null) return null
  if (o.status !== 'verified' && o.status !== 'unverified') return null
  const p = o.plan
  if (typeof p !== 'object' || p === null || !Array.isArray(p.plan) || !Array.isArray(p.cut) || !Array.isArray(p.exposures)) return null
  if (!p.plan.every((s) => typeof s?.id === 'string' && typeof s.start === 'string' && typeof s.end === 'string')) return null
  if (!Array.isArray(o.violations) || !Array.isArray(o.warnings)) return null
  return o as AiPlanResult
}

const wholeMinutes = (seconds: number): number => Math.max(1, Math.ceil(seconds / 60))

/** "in about 12 minutes", "in about 3 hours": when to try again, from a Retry-After in seconds. */
export function retryWhen(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'Try again later.'
  const m = wholeMinutes(seconds)
  if (m < 60) return `Try again in about ${m} ${m === 1 ? 'minute' : 'minutes'}.`
  const h = Math.round(m / 60)
  return `Try again in about ${h} ${h === 1 ? 'hour' : 'hours'}.`
}

export interface AiProblem {
  text: string
  /** A Retry button makes sense: the same request may work next time. */
  retry: boolean
}

/** Each route error in plain language. The route's own text is for developers and is never shown. */
export function problemFor(status: number, retryAfter: string | null, serverMessage: string): AiProblem {
  switch (status) {
    case 429:
      return { text: `You have used the AI planner's allowance for now. ${retryWhen(retryAfter === null || retryAfter.trim() === '' ? null : Number(retryAfter))}`, retry: false }
    case 503:
      return { text: 'The AI planner is not available right now. The rest of the planner works as usual; try the AI plan again later.', retry: false }
    case 502:
      return { text: 'The AI planner did not give a usable answer this time. Nothing was changed. Try again.', retry: true }
    case 422:
      return /too large|do not fit|fewer targets/i.test(serverMessage)
        ? { text: 'There are too many or too large targets for one AI plan. Remove some from My plan and try again.', retry: false }
        : { text: 'There is no usable night to plan: at this site on this date the sky is never dark enough, or nothing in My plan is up. Pick another night or site.', retry: false }
    case 413:
    case 400:
      return { text: 'The AI planner could not accept this request. Try fewer targets in My plan or a simpler horizon.', retry: false }
    default:
      return { text: `The AI planner could not be reached (error ${status}). Try again.`, retry: true }
  }
}

export const NETWORK_PROBLEM: AiProblem = { text: 'The AI planner could not be reached. Check your connection and try again.', retry: true }
export const TIMEOUT_PROBLEM: AiProblem = { text: 'The AI planner took too long and was stopped. Nothing was changed. Try again.', retry: true }
export const UNREADABLE_PROBLEM: AiProblem = { text: 'The AI planner answered, but the answer could not be read. Nothing was changed. Try again.', retry: true }

/** The minutes between two ISO instants. */
export const minutesBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 60000)

const noteFor = (clockStart: string, clockEnd: string, light: number | undefined): string => {
  const text = `AI plan: ${clockStart} to ${clockEnd}${light !== undefined ? `, about ${Math.round(light)} min of light` : ''}.`
  return text.length <= MAX_NOTE_CHARS ? text : text.slice(0, MAX_NOTE_CHARS)
}

/**
 * The AI plan as the manual itinerary holds it: one item per slot in time order, on the chosen train and its filter, with the
 * plan's first start as the itinerary's start. The itinerary then times the slots itself (its own estimates).
 */
export function itineraryFromAiPlan(result: AiPlanResult, trainId: string, filterId: string | null): { items: ItineraryItem[]; startTime: string | null } {
  const slots = [...result.plan.plan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const items = slots.map((s, i): ItineraryItem => ({
    id: `s${i + 1}`,
    targetId: s.id,
    trainId,
    filterId,
    mode: 'balanced',
    note: noteFor(clockOfIso(s.start), clockOfIso(s.end), s.exposureMinutes),
  }))
  return { items, startTime: slots.length > 0 ? clockOfIso(slots[0].start) : null }
}

export interface TimelineArgs {
  items: readonly ItineraryItem[]
  inputs: readonly SlotInput[]
  result: AiPlanResult
  site: Site
  horizon: readonly HorizonPoint[] | null
  minAltitude: number
  night: AstronomicalNight
}

/** The AI plan as an `ItineraryPlan`, so the page's own night graph draws it. Times are the AI plan's, not re-estimated. */
export function timelinePlanOf({ items, inputs, result, site, horizon, minAltitude }: TimelineArgs): ItineraryPlan {
  const ordered = [...result.plan.plan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const slots = ordered.map((s, i): Slot => {
    const start = new Date(s.start)
    const end = new Date(s.end)
    const input = inputs[i]
    return {
      id: items[i].id,
      name: input.name,
      trainName: input.trainName,
      filterName: input.filterName,
      mode: items[i].mode,
      note: items[i].note,
      start,
      end,
      waitMin: 0,
      changeover: { minutes: 0, parts: [] },
      subSeconds: null,
      subCount: null,
      integrationMin: s.exposureMinutes ?? (end.getTime() - start.getTime()) / 60000,
      window: null,
      altitudes: input.problem ? null : slotAltitudes(input.source, site, start, end, horizon, minAltitude),
      warnings: [],
      label: 'estimate',
    }
  })
  return {
    startsAt: slots[0]?.start ?? new Date(0),
    startNote: null,
    slots,
    why: '',
    totals: {
      integrationMin: slots.reduce((n, s) => n + s.integrationMin, 0),
      changeoverMin: 0,
      waitMin: 0,
      filterChanges: 0,
      trainChanges: 0,
      ends: slots.length > 0 ? slots[slots.length - 1].end : null,
    },
  }
}
