import { parseEntry } from './specs'
import type { LibraryClass, LibraryEntry, Specs } from './specs'

/** The browser's side of the spec library routes. Every entry that comes back is judged again (parseEntry), so a value out of range is never shown as a number. */
export type ClientFetch = (input: string, init?: RequestInit) => Promise<Response>

export type LookupResult =
  | { kind: 'found'; entry: LibraryEntry; from: 'library' | 'model' }
  | { kind: 'none'; message: string }
  | { kind: 'error'; message: string }
export type SaveResult = { kind: 'saved'; entry: LibraryEntry } | { kind: 'error'; message: string }

const BASE = '/api/planner/library'
const UNREADABLE = 'The library answered with values that cannot be used, so nothing was filled.'
const UNREACHABLE = 'Could not reach the spec library. Check your connection and try again.'

async function send(fetchImpl: ClientFetch, url: string, init?: RequestInit): Promise<{ status: number; body: Record<string, unknown> } | { message: string }> {
  let res: Response
  try {
    res = await fetchImpl(url, init)
  } catch {
    return { message: UNREACHABLE }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { message: `The spec library answered with something unreadable (${res.status}).` }
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { message: UNREADABLE }
  return { status: res.status, body: body as Record<string, unknown> }
}

const errorOf = (r: { status: number; body: Record<string, unknown> }): string => (typeof r.body.error === 'string' ? r.body.error : `The spec library answered ${r.status}.`)

function entryOf(raw: unknown): LibraryEntry | null {
  try {
    return parseEntry(raw)
  } catch {
    return null
  }
}

/** Library first (guests and owner), then, on a miss, the AI fill (owner only; the server says no to a guest in plain words). */
export async function lookupSpecs(cls: LibraryClass, name: string, fetchImpl: ClientFetch = (i, o) => fetch(i, o)): Promise<LookupResult> {
  const read = await send(fetchImpl, `${BASE}?${new URLSearchParams({ cls, name })}`)
  if ('message' in read) return { kind: 'error', message: read.message }
  if (read.status !== 200) return { kind: 'error', message: errorOf(read) }
  if (read.body.entry !== null && read.body.entry !== undefined) {
    const entry = entryOf(read.body.entry)
    return entry ? { kind: 'found', entry, from: 'library' } : { kind: 'error', message: UNREADABLE }
  }
  if (typeof read.body.message === 'string') return { kind: 'none', message: read.body.message }
  const fill = await send(fetchImpl, `${BASE}/fill`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cls, name }) })
  if ('message' in fill) return { kind: 'error', message: fill.message }
  if (fill.status === 403) return { kind: 'none', message: errorOf(fill) }
  if (fill.status !== 200) return { kind: 'error', message: errorOf(fill) }
  const entry = entryOf(fill.body.entry)
  if (!entry) return { kind: 'error', message: UNREADABLE }
  return { kind: 'found', entry, from: fill.body.from === 'model' ? 'model' : 'library' }
}

/** "Save correction for everyone" (with specs) or "Confirm" (without). */
export async function saveCorrection(cls: LibraryClass, name: string, specs: Specs | undefined, fetchImpl: ClientFetch = (i, o) => fetch(i, o)): Promise<SaveResult> {
  const res = await send(fetchImpl, `${BASE}/correct`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(specs === undefined ? { cls, name } : { cls, name, specs }) })
  if ('message' in res) return { kind: 'error', message: res.message }
  if (res.status !== 200) return { kind: 'error', message: errorOf(res) }
  const entry = entryOf(res.body.entry)
  return entry ? { kind: 'saved', entry } : { kind: 'error', message: UNREADABLE }
}
