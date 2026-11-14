/**
 * Counters for the guest limits. One interface, two shipping implementations:
 * - KvRestCounterStore: Upstash / Vercel KV over REST. Shared by every server instance, so the cap is firm.
 * - MemoryCounterStore: per server instance, reset on a cold start. Best effort only; used when no KV env vars are set.
 */
export interface CounterStore {
  /** Adds one to `key` and returns the new count. The key expires `ttlSeconds` after this call. */
  incr(key: string, ttlSeconds: number): Promise<number>
  /** Current count, 0 when the key is absent or expired. Never changes anything. */
  get(key: string): Promise<number>
  /** Gives one back (used when a call was counted but not made). Never goes below 0. */
  decr(key: string): Promise<void>
}

export class MemoryCounterStore implements CounterStore {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>()
  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): { count: number; expiresAt: number } | undefined {
    const e = this.entries.get(key)
    if (e && e.expiresAt <= this.now()) {
      this.entries.delete(key)
      return undefined
    }
    return e
  }
  async incr(key: string, ttlSeconds: number): Promise<number> {
    const e = this.live(key) ?? { count: 0, expiresAt: 0 }
    e.count += 1
    e.expiresAt = this.now() + ttlSeconds * 1000
    this.entries.set(key, e)
    return e.count
  }
  async get(key: string): Promise<number> {
    return this.live(key)?.count ?? 0
  }
  async decr(key: string): Promise<void> {
    const e = this.live(key)
    if (e && e.count > 0) e.count -= 1
  }
}

export class CounterStoreError extends Error {}

/** Upper bound for one KV round trip. A guest request waits at most this long before the clear 503. */
export const KV_TIMEOUT_MS = 2000

type Fetch = (input: string, init: RequestInit) => Promise<Response>

/**
 * Upstash Redis REST (what Vercel KV is). One POST to /pipeline per operation, bearer token auth.
 * Any failure throws CounterStoreError: the caller refuses the guest rather than spending uncounted.
 */
export class KvRestCounterStore implements CounterStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs: number = KV_TIMEOUT_MS,
  ) {}

  /** The whole exchange (connect, headers, body) is bounded by timeoutMs, whether or not the fetch honours the abort signal. */
  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new CounterStoreError('Counter store timed out'))
      }, this.timeoutMs)
    })
    try {
      return await Promise.race([this.exchange(commands, controller.signal), timedOut])
    } finally {
      clearTimeout(timer)
    }
  }

  private async exchange(commands: (string | number)[][], signal: AbortSignal): Promise<unknown[]> {
    let res: Response
    try {
      res = await this.fetchImpl(`${this.url.replace(/\/+$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
        cache: 'no-store',
        signal,
      })
    } catch {
      // The message is fixed text: never echo the URL or token.
      throw new CounterStoreError('Counter store unreachable')
    }
    if (!res.ok) throw new CounterStoreError(`Counter store answered ${res.status}`)
    let out: unknown
    try {
      out = await res.json()
    } catch {
      throw new CounterStoreError('Counter store answered with an unreadable body')
    }
    if (!Array.isArray(out) || out.length !== commands.length) throw new CounterStoreError('Counter store answered with an unexpected shape')
    return out.map((r: unknown) => {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) throw new CounterStoreError('Counter store answered with an unexpected shape')
      const { result, error } = r as { result?: unknown; error?: unknown }
      if (error) throw new CounterStoreError('Counter store rejected a command')
      return result
    })
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const [n] = await this.pipeline([['INCR', key], ['EXPIRE', key, ttlSeconds]])
    if (typeof n !== 'number') throw new CounterStoreError('Counter store returned a non-number count')
    return n
  }
  async get(key: string): Promise<number> {
    const [v] = await this.pipeline([['GET', key]])
    if (v === null || v === undefined) return 0
    const n = Number(v)
    if (!Number.isFinite(n)) throw new CounterStoreError('Counter store returned a non-number count')
    return n
  }
  async decr(key: string): Promise<void> {
    // One atomic script: only a positive count is decremented, so an expired key is never recreated as -1.
    await this.pipeline([['EVAL', DECR_IF_EXISTS, 1, key]])
  }
}

export const DECR_IF_EXISTS = "local n = tonumber(redis.call('GET', KEYS[1])) if n and n > 0 then return redis.call('DECR', KEYS[1]) end return 0"

/** Vercel's Marketplace Upstash integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*. */
export function kvConfigFrom(env: Record<string, string | undefined>): { url: string; token: string } | null {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL)?.trim()
  const token = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN)?.trim()
  return url && token ? { url, token } : null
}

let shared: { kind: 'kv' | 'memory'; store: CounterStore } | undefined

/** KV when its env vars are present, memory otherwise. Built once per server instance. */
export function getCounterStore(env: Record<string, string | undefined> = process.env): CounterStore {
  if (!shared) {
    const kv = kvConfigFrom(env)
    shared = kv ? { kind: 'kv', store: new KvRestCounterStore(kv.url, kv.token) } : { kind: 'memory', store: new MemoryCounterStore() }
  }
  return shared.store
}

/** Test hook: forget the cached store. */
export function resetCounterStore(): void {
  shared = undefined
}
