import type { CounterStore } from '@/planner/ai/counter-store'

/** Place and elevation lookups that reach a remote service, per visitor per hour and for the whole site per UTC day. Env overrides below. */
export const LOCATION_PER_HOUR = 30
export const LOCATION_PER_DAY = 2000

const HOUR_S = 3600
const DAY_S = 86400

export class LocationLimitConfigError extends Error {}

/** A lookup limit was reached. `retryAfterSeconds` is the time to the end of that window. */
export class LocationLimitError extends Error {
  constructor(readonly retryAfterSeconds: number, message: string) {
    super(message)
  }
}

const countFrom = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  if (!/^\d+$/.test(raw.trim())) throw new LocationLimitConfigError(`${name} must be a whole number of lookups`)
  return Number(raw.trim())
}

/** PLANNER_LOCATION_PER_HOUR and PLANNER_LOCATION_PER_DAY. Unset means the default; anything malformed is an error, never a silent default. */
export function locationLimitsFrom(env: Record<string, string | undefined> = process.env): { perHour: number; perDay: number } {
  return {
    perHour: countFrom(env.PLANNER_LOCATION_PER_HOUR, LOCATION_PER_HOUR, 'PLANNER_LOCATION_PER_HOUR'),
    perDay: countFrom(env.PLANNER_LOCATION_PER_DAY, LOCATION_PER_DAY, 'PLANNER_LOCATION_PER_DAY'),
  }
}

/**
 * Counts one lookup against the visitor's hour and the site's day, or throws LocationLimitError.
 * A counter store failure propagates (CounterStoreError): the route refuses rather than spending uncounted.
 * The keys have their own prefix, so these counts never mix with the AI plan's.
 */
export async function takeLookup(store: CounterStore, limits: { perHour: number; perDay: number }, visitor: string, nowMs: number = Date.now()): Promise<void> {
  const s = Math.floor(nowMs / 1000)
  const hourKey = `planner:loc:h:${visitor}:${Math.floor(s / HOUR_S)}`
  const dayKey = `planner:loc:d:${Math.floor(s / DAY_S)}`
  const mine = await store.incr(hourKey, HOUR_S + 60)
  if (mine > limits.perHour) {
    await store.decr(hourKey)
    throw new LocationLimitError(HOUR_S - (s % HOUR_S), `Hourly place-search limit reached (${limits.perHour} per hour), try again later`)
  }
  const all = await store.incr(dayKey, DAY_S + 60)
  if (all > limits.perDay) {
    await store.decr(dayKey)
    await store.decr(hourKey)
    throw new LocationLimitError(DAY_S - (s % DAY_S), 'Daily place-search limit reached, try tomorrow')
  }
}
