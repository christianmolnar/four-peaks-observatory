import type { AstronomicalNight, Site } from '../astro'
import type { HorizonPoint } from '../horizon'
import { MODE_ORDER } from '../exposure/constants'
import type { ExposureMode } from '../exposure/constants'
import { presetNominalMin } from '../exposure'
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
      return { text: 'The AI planner could not accept this request. Nothing was changed. If it keeps happening, tell the site owner.', retry: false }
    default:
      return { text: `The AI planner could not be reached (error ${status}). Try again.`, retry: true }
  }
}

export const NETWORK_PROBLEM: AiProblem = { text: 'The AI planner could not be reached. Check your connection and try again.', retry: true }
export const TIMEOUT_PROBLEM: AiProblem = { text: 'The AI planner took too long and was stopped. Nothing was changed. Try again.', retry: true }
export const UNREADABLE_PROBLEM: AiProblem = { text: 'The AI planner answered, but the answer could not be read. Nothing was changed. Try again.', retry: true }

/** The minutes between two ISO instants. */
export const minutesBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 60000)

/** No AI clock times or minutes here: the itinerary shows its own times for the slot, and the two would disagree. */
const noteFor = (index: number, count: number): string => {
  const text = `From the AI plan, slot ${index + 1} of ${count}. The itinerary times it again with its own estimate.`
  return text.length <= MAX_NOTE_CHARS ? text : text.slice(0, MAX_NOTE_CHARS)
}

/** The minutes the AI gives a slot: its exposureMinutes when it set them, else the slot's length. The night graph draws the same. */
export const aiSlotMinutes = (s: { start: string; end: string; exposureMinutes?: number }): number => s.exposureMinutes ?? minutesBetween(s.start, s.end)

/**
 * The itinerary's exposure preset nearest to `minutes`, on a log scale, measured from each preset's own aim (`presetNominalMin`:
 * about 68, 143 and 293 min, the points where one more half hour adds under 20%, 10% and 5%). A tie goes to the shorter preset.
 * Presets no longer have fixed ranges, so the old "range holds it" rule is this nearest-aim rule.
 */
export function modeForMinutes(minutes: number): ExposureMode {
  const gap = (m: ExposureMode): number => Math.abs(Math.log(Math.max(minutes, 1) / presetNominalMin(m)))
  return MODE_ORDER.reduce((best, m) => (gap(m) < gap(best) ? m : best))
}

/**
 * The AI plan as the manual itinerary holds it: one item per slot in time order, on the chosen train and its filter, with the
 * plan's first start as the itinerary's start. An item holds only a mode, not minutes: each takes the mode whose range holds the AI slot's
 * minutes (the nearest range when none does), so lengths follow the AI's by mode. The AI's own times are not kept: the itinerary times
 * the slots itself (its own estimates) and the page says so.
 */
export function itineraryFromAiPlan(result: AiPlanResult, trainId: string, filterId: string | null): { items: ItineraryItem[]; startTime: string | null } {
  const slots = [...result.plan.plan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
  const items = slots.map((s, i): ItineraryItem => ({
    id: `s${i + 1}`,
    targetId: s.id,
    trainId,
    filterId,
    mode: modeForMinutes(aiSlotMinutes(s)),
    note: noteFor(i, slots.length),
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
      integrationMin: aiSlotMinutes(s),
      window: null,
      altitudes: input.problem ? null : slotAltitudes(input.source, site, start, end, horizon, minAltitude),
      warnings: [],
      // The type requires it; the night graph never draws it.
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
