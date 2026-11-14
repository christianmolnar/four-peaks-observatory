import { createHmac } from 'node:crypto'
import type { CallModel } from './plan'
import type { CounterStore } from './counter-store'

/** Defaults for guests, counted in model calls (a typical plan is one call; repairs and retries are more). Env overrides below. */
export const GUEST_PER_HOUR = 6
export const GUEST_PER_DAY = 60

const HOUR_S = 3600
const DAY_S = 86400

export class LimitConfigError extends Error {}

/** A guest limit was reached. `scope` says which one; `retryAfterSeconds` is the time to the end of that window. */
export class GuestLimitError extends Error {
  constructor(readonly scope: 'visitor' | 'day', readonly retryAfterSeconds: number, message: string) {
    super(message)
  }
}

const countFrom = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  if (!/^\d+$/.test(raw.trim())) throw new LimitConfigError(`${name} must be a whole number of model calls`)
  return Number(raw.trim())
}

/** PLANNER_GUEST_PER_HOUR and PLANNER_GUEST_PER_DAY, in model calls. Unset means the default; anything malformed is an error, never a silent default. */
export function guestLimitsFrom(env: Record<string, string | undefined> = process.env): { perHour: number; perDay: number } {
  return {
    perHour: countFrom(env.PLANNER_GUEST_PER_HOUR, GUEST_PER_HOUR, 'PLANNER_GUEST_PER_HOUR'),
    perDay: countFrom(env.PLANNER_GUEST_PER_DAY, GUEST_PER_DAY, 'PLANNER_GUEST_PER_DAY'),
  }
}

/**
 * Who is calling, as an opaque key. The IP comes from the platform's forwarded header (Vercel sets it; the first entry is the client)
 * and is only ever used as an HMAC input: the raw address is never stored, logged or returned. No header: one shared bucket, the strictest case.
 */
export function visitorKey(headers: Headers, secret: string | undefined = process.env.AUTH_SECRET): string {
  const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown'
  return createHmac('sha256', secret || 'planner-guest').update(ip).digest('hex').slice(0, 24)
}

/** Fixed windows: the hour and the UTC day. Counters are named by window, so each starts at zero by itself. */
export class GuestLimiter {
  private readonly hourKey: string
  private readonly dayKey: string
  private readonly hourLeftS: number
  private readonly dayLeftS: number
  constructor(
    private readonly store: CounterStore,
    private readonly limits: { perHour: number; perDay: number },
    visitor: string,
    nowMs: number = Date.now(),
  ) {
    const s = Math.floor(nowMs / 1000)
    this.hourKey = `planner:guest:h:${visitor}:${Math.floor(s / HOUR_S)}`
    this.dayKey = `planner:guest:d:${Math.floor(s / DAY_S)}`
    this.hourLeftS = HOUR_S - (s % HOUR_S)
    this.dayLeftS = DAY_S - (s % DAY_S)
  }

  private hourError(): GuestLimitError {
    return new GuestLimitError('visitor', this.hourLeftS, `Hourly planner limit reached (${this.limits.perHour} model calls per hour), try again later`)
  }
  private dayError(): GuestLimitError {
    return new GuestLimitError('day', this.dayLeftS, 'Daily planner limit reached, try tomorrow')
  }

  /** Reads only. Throws GuestLimitError when the next call would be refused, so a limited request does no work at all. */
  async assertRoom(): Promise<void> {
    if ((await this.store.get(this.dayKey)) >= this.limits.perDay) throw this.dayError()
    if ((await this.store.get(this.hourKey)) >= this.limits.perHour) throw this.hourError()
  }

  /** Counts one model call, or throws GuestLimitError. Call it immediately before every model call. */
  async takeCall(): Promise<void> {
    const mine = await this.store.incr(this.hourKey, HOUR_S + 60)
    if (mine > this.limits.perHour) {
      await this.store.decr(this.hourKey)
      throw this.hourError()
    }
    const all = await this.store.incr(this.dayKey, DAY_S + 60)
    if (all > this.limits.perDay) {
      await this.store.decr(this.dayKey)
      await this.store.decr(this.hourKey)
      throw this.dayError()
    }
  }

  /** The model caller with every call counted first. A refused call never reaches `callModel`. */
  wrap(callModel: CallModel): CallModel {
    return async (messages) => {
      await this.takeCall()
      return callModel(messages)
    }
  }
}
