import { KV_TIMEOUT_MS, kvConfigFrom } from '../ai/counter-store'
import { SEED_ENTRIES } from './seed'
import { LibraryDataError, parseEntry } from './specs'
import type { LibraryClass, LibraryEntry } from './specs'

/**
 * The shared spec library. One interface, two implementations in the style of the counter store:
 * - KvRestLibraryStore: Upstash / Vercel KV over REST. Keys have NO expiry (never EX/PX/EXPIRE): the library is data, not a counter.
 * - MemoryLibraryStore: per server instance, used when no KV env vars are set.
 * Every entry read back is judged again (parseEntry): a value the store holds that is out of range is an error, never shown.
 */
export interface LibraryStore {
  get(cls: LibraryClass, nameKey: string): Promise<LibraryEntry | null>
  /** Replaces the entry (last write wins). */
  put(entry: LibraryEntry): Promise<void>
  /** Writes only when there is no entry yet; true when it wrote. */
  putIfAbsent(entry: LibraryEntry): Promise<boolean>
  list(): Promise<LibraryEntry[]>
}

/** The store failed (unreachable, timed out, answered oddly, or holds something unreadable). The message is plain words and never holds the url or token. */
export class LibraryStoreError extends Error {}

const copy = (e: LibraryEntry): LibraryEntry => structuredClone(e)
const slot = (cls: LibraryClass, nameKey: string) => `planner:lib:v1:${cls}:${nameKey}`
const INDEX = 'planner:lib:v1:index'

/** An entry read back from memory is judged again, as one read from KV is. */
function judged(e: LibraryEntry): LibraryEntry {
  try {
    return parseEntry(e)
  } catch (err) {
    if (err instanceof LibraryDataError) throw new LibraryStoreError(UNREADABLE)
    throw err
  }
}

export class MemoryLibraryStore implements LibraryStore {
  private readonly entries = new Map<string, LibraryEntry>()
  constructor(initial: readonly LibraryEntry[] = []) {
    for (const e of initial) this.entries.set(slot(e.cls, e.nameKey), copy(e))
  }
  async get(cls: LibraryClass, nameKey: string): Promise<LibraryEntry | null> {
    const e = this.entries.get(slot(cls, nameKey))
    return e ? judged(e) : null
  }
  async put(entry: LibraryEntry): Promise<void> {
    this.entries.set(slot(entry.cls, entry.nameKey), copy(entry))
  }
  async putIfAbsent(entry: LibraryEntry): Promise<boolean> {
    if (this.entries.has(slot(entry.cls, entry.nameKey))) return false
    await this.put(entry)
    return true
  }
  async list(): Promise<LibraryEntry[]> {
    return [...this.entries.values()].map(judged)
  }
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

const UNREADABLE = 'The spec library holds an entry that cannot be read'

function readEntry(text: unknown): LibraryEntry {
  if (typeof text !== 'string') throw new LibraryStoreError(UNREADABLE)
  try {
    return parseEntry(JSON.parse(text))
  } catch (e) {
    if (e instanceof LibraryDataError || e instanceof SyntaxError) throw new LibraryStoreError(UNREADABLE)
    throw e
  }
}

export class KvRestLibraryStore implements LibraryStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: Fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs: number = KV_TIMEOUT_MS,
  ) {}

  /** The whole exchange is bounded by timeoutMs, whether or not the fetch honours the abort signal. */
  private async pipeline(commands: (string | number)[][]): Promise<unknown[]> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new LibraryStoreError('The spec library timed out'))
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
      // Fixed text: never echo the URL or token.
      throw new LibraryStoreError('The spec library is unreachable')
    }
    if (!res.ok) throw new LibraryStoreError(`The spec library answered ${res.status}`)
    let out: unknown
    try {
      out = await res.json()
    } catch {
      throw new LibraryStoreError('The spec library answered with an unreadable body')
    }
    if (!Array.isArray(out) || out.length !== commands.length) throw new LibraryStoreError('The spec library answered with an unexpected shape')
    return out.map((r: unknown) => {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) throw new LibraryStoreError('The spec library answered with an unexpected shape')
      const { result, error } = r as { result?: unknown; error?: unknown }
      if (error) throw new LibraryStoreError('The spec library rejected a command')
      return result
    })
  }

  async get(cls: LibraryClass, nameKey: string): Promise<LibraryEntry | null> {
    const [v] = await this.pipeline([['GET', slot(cls, nameKey)]])
    return v === null || v === undefined ? null : readEntry(v)
  }
  // The index is written first: a crash between the two commands leaves an index line without an entry (skipped on list), never an entry the backup cannot find.
  // No expiry option anywhere in these commands.
  async put(entry: LibraryEntry): Promise<void> {
    await this.pipeline([['SADD', INDEX, slot(entry.cls, entry.nameKey)], ['SET', slot(entry.cls, entry.nameKey), JSON.stringify(entry)]])
  }
  async putIfAbsent(entry: LibraryEntry): Promise<boolean> {
    const [, set] = await this.pipeline([['SADD', INDEX, slot(entry.cls, entry.nameKey)], ['SET', slot(entry.cls, entry.nameKey), JSON.stringify(entry), 'NX']])
    return set === 'OK'
  }
  async list(): Promise<LibraryEntry[]> {
    const [keys] = await this.pipeline([['SMEMBERS', INDEX]])
    if (!Array.isArray(keys) || keys.some((k) => typeof k !== 'string')) throw new LibraryStoreError('The spec library answered with an unexpected shape')
    if (keys.length === 0) return []
    const [values] = await this.pipeline([['MGET', ...(keys as string[])]])
    if (!Array.isArray(values)) throw new LibraryStoreError('The spec library answered with an unexpected shape')
    return values.filter((v) => v !== null).map(readEntry)
  }
}

/** The store with the seed written into it (never over an existing entry) before the first read; a failed seeding is retried on the next read. */
export function seeded(store: LibraryStore, seed: readonly LibraryEntry[] = SEED_ENTRIES): LibraryStore {
  let done: Promise<void> | null = null
  const ensure = (): Promise<void> => {
    if (done === null) {
      const p = (async () => {
        for (const e of seed) await store.putIfAbsent(e)
      })()
      done = p
      p.catch(() => { if (done === p) done = null })
    }
    return done
  }
  return {
    get: async (cls, key) => { await ensure(); return store.get(cls, key) },
    put: (e) => store.put(e),
    putIfAbsent: (e) => store.putIfAbsent(e),
    list: async () => { await ensure(); return store.list() },
  }
}

let shared: LibraryStore | undefined

/** KV (seeded on first read) when its env vars are present, memory (starting with the seed) otherwise. Built once per server instance. */
export function getLibraryStore(env: Record<string, string | undefined> = process.env): LibraryStore {
  if (!shared) {
    const kv = kvConfigFrom(env)
    shared = kv ? seeded(new KvRestLibraryStore(kv.url, kv.token)) : new MemoryLibraryStore(SEED_ENTRIES)
  }
  return shared
}

/** Test hook: forget the cached store. */
export function resetLibraryStore(): void {
  shared = undefined
}
