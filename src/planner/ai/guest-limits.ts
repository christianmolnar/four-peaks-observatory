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

/** Raised when guests cannot be told apart safely (no HMAC secret). The route refuses guests with 503. */
export class VisitorKeyError extends Error {}

/** Expands an IPv6 address to its 8 groups, or null when it is not valid. Handles `::`, an embedded IPv4 tail, brackets and a zone id. */
function ipv6Groups(raw: string): number[] | null {
  let a = raw.replace(/^\[|\]$/g, '').split('%')[0].toLowerCase()
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a)
  if (v4) {
    const o = v4.slice(1).map(Number)
    if (o.some((n) => n > 255)) return null
    a = a.slice(0, v4.index) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16)
  }
  const halves = a.split('::')
  if (halves.length > 2) return null
  const side = (t: string) => (t === '' ? [] : t.split(':'))
  const head = side(halves[0])
  const tail = halves.length === 2 ? side(halves[1]) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (all.length !== 8 || !all.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null
  return all.map((g) => parseInt(g, 16))
}

/** The bucket an address belongs to: IPv4 as is; IPv6 by its /64 prefix (one household or device owns a whole /64); IPv4-mapped IPv6 as the IPv4. */
export function ipBucket(ip: string): string {
  const groups = ip.includes(':') ? ipv6Groups(ip) : null
  if (!groups) return ip
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
  }
  return groups.slice(0, 4).map((g) => g.toString(16)).join(':') + '::/64'
}

/**
 * Who is calling, as an opaque key. The IP comes from the platform's own header: `x-vercel-forwarded-for` (Vercel sets it and drops any client-sent copy),
 * then `x-real-ip`, and only as a last resort the first `x-forwarded-for` entry (a client can forge that one when the platform does not overwrite it).
 * It is only ever an HMAC input: the raw address is never stored, logged or returned. No header: one shared bucket, the strictest case.
 * No secret: throws VisitorKeyError (there is no constant fallback; a public key would make the stored hashes reversible).
 */
export function visitorKey(headers: Headers, secret: string | undefined = process.env.AUTH_SECRET): string {
  if (!secret || secret.trim() === '') throw new VisitorKeyError('AUTH_SECRET must be set so guests can be limited')
  const ip =
    headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  return createHmac('sha256', secret).update(ipBucket(ip)).digest('hex').slice(0, 24)
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
