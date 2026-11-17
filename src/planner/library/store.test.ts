import { fakeKv } from '../ai/kv-fake'
import { KV_TIMEOUT_MS } from '../ai/counter-store'
import { KvRestLibraryStore, LibraryStoreError, MemoryLibraryStore, getLibraryStore, resetLibraryStore, seeded } from './store'
import type { LibraryStore } from './store'
import { SEED_ENTRIES } from './seed'
import { nameKey } from './specs'
import type { LibraryEntry } from './specs'

const entry = (name: string, over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  cls: 'scope', nameKey: nameKey(name), name, specs: { apertureMm: 80 }, source: 'model', confirmed: false, updatedAt: '2026-11-17T10:00:00.000Z', previous: null, ...over,
})

const makers: [string, () => { store: LibraryStore; kv?: ReturnType<typeof fakeKv> }][] = [
  ['MemoryLibraryStore', () => ({ store: new MemoryLibraryStore() })],
  ['KvRestLibraryStore (fake Upstash)', () => { const kv = fakeKv({ t: 1_000_000 }); return { store: new KvRestLibraryStore('https://kv.example/', 'tok', kv.fetchImpl), kv } }],
]

describe.each(makers)('%s contract', (_n, make) => {
  it('reads null for an unknown entry and what was put for a known one', async () => {
    const { store } = make()
    expect(await store.get('scope', 'edge')).toBeNull()
    await store.put(entry('Edge'))
    expect(await store.get('scope', 'edge')).toEqual(entry('Edge'))
    expect(await store.get('camera', 'edge')).toBeNull()
  })
  it('put replaces (last write wins); putIfAbsent never replaces', async () => {
    const { store } = make()
    expect(await store.putIfAbsent(entry('Edge'))).toBe(true)
    expect(await store.putIfAbsent(entry('Edge', { specs: { apertureMm: 99 } }))).toBe(false)
    expect((await store.get('scope', 'edge'))?.specs).toEqual({ apertureMm: 80 })
    await store.put(entry('Edge', { specs: { apertureMm: 99 } }))
    expect((await store.get('scope', 'edge'))?.specs).toEqual({ apertureMm: 99 })
  })
  it('lists every entry', async () => {
    const { store } = make()
    await store.put(entry('Edge'))
    await store.put(entry('Refractor', { cls: 'scope' }))
    await store.put(entry('Cam', { cls: 'camera', specs: { pixelSizeUm: 3.76 } }))
    expect((await store.list()).map((e) => e.nameKey).sort()).toEqual(['cam', 'edge', 'refractor'])
  })
  it('keeps a hostile name as plain data: it cannot reach another key', async () => {
    const { store } = make()
    const evil = entry('x:y "; DEL planner')
    await store.put(evil)
    expect(await store.get('scope', evil.nameKey)).toEqual(evil)
    expect(await store.get('scope', 'x')).toBeNull()
  })
  it('hands back copies: changing a result does not change the store', async () => {
    const { store } = make()
    await store.put(entry('Edge'))
    const a = await store.get('scope', 'edge')
    ;(a!.specs as { apertureMm: number }).apertureMm = 1
    expect((await store.get('scope', 'edge'))?.specs).toEqual({ apertureMm: 80 })
  })
})

describe('KvRestLibraryStore wire', () => {
  const setup = () => { const kv = fakeKv({ t: 0 }); return { kv, store: new KvRestLibraryStore('https://kv.example/', 'tok', kv.fetchImpl) } }
  const everyToken = (kv: ReturnType<typeof fakeKv>) => kv.requests.flatMap((r) => r.commands.flat()).map((t) => String(t).toUpperCase())
  it('never sets an expiry: no EX, PX, EXAT, PXAT, EXPIRE, PEXPIRE or KEEPTTL on any request body', async () => {
    const { kv, store } = setup()
    await store.put(entry('Edge'))
    await store.putIfAbsent(entry('Other'))
    await store.get('scope', 'edge')
    await store.list()
    const tokens = everyToken(kv)
    for (const bad of ['EX', 'PX', 'EXAT', 'PXAT', 'EXPIRE', 'PEXPIRE', 'EXPIREAT', 'PEXPIREAT', 'KEEPTTL', 'SETEX', 'PSETEX']) expect(tokens).not.toContain(bad)
    expect(kv.requests.length).toBeGreaterThan(3)
    expect([...kv.strings.values()].every((s) => s.exp === Infinity)).toBe(true)
  })
  it('uses SET with the bearer token to /pipeline and a JSON string value', async () => {
    const { kv, store } = setup()
    await store.put(entry('Edge'))
    const sets = kv.requests.flatMap((r) => r.commands).filter((c) => c[0] === 'SET')
    expect(sets).toHaveLength(1)
    expect(sets[0][1]).toBe('planner:lib:v1:scope:edge')
    expect(JSON.parse(sets[0][2] as string)).toMatchObject({ nameKey: 'edge' })
    expect(kv.requests[0].url).toBe('https://kv.example/pipeline')
  })
  it('an entry the store holds but cannot trust (out of range, not JSON) is a LibraryStoreError, never a number shown', async () => {
    const { kv, store } = setup()
    kv.strings.set('planner:lib:v1:scope:edge', { v: JSON.stringify({ ...entry('Edge'), specs: { apertureMm: 99999 } }), exp: Infinity })
    await expect(store.get('scope', 'edge')).rejects.toThrow(LibraryStoreError)
    kv.strings.set('planner:lib:v1:scope:edge', { v: 'not json', exp: Infinity })
    await expect(store.get('scope', 'edge')).rejects.toThrow(LibraryStoreError)
  })
  it('a rejected token, a network error and a hung request all throw LibraryStoreError without echoing the url or token', async () => {
    await expect(new KvRestLibraryStore('https://secret-host.example', 'wrong', fakeKv({ t: 0 }).fetchImpl).get('scope', 'a')).rejects.toThrow(LibraryStoreError)
    const down = new KvRestLibraryStore('https://secret-host.example', 'secret-token', async () => { throw new Error('connect ECONNREFUSED secret-host.example') })
    const err = await down.put(entry('Edge')).catch((e: Error) => e)
    expect(err).toBeInstanceOf(LibraryStoreError)
    expect((err as Error).message).not.toMatch(/secret/)
    const hung = new KvRestLibraryStore('https://x', 't', () => new Promise<Response>(() => undefined), 10)
    await expect(hung.get('scope', 'a')).rejects.toThrow(/timed out/)
    expect(KV_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('seed', () => {
  it('ships NBZ-II and NB3-PM, unverified, source seed', () => {
    const byKey = Object.fromEntries(SEED_ENTRIES.map((e) => [e.nameKey, e]))
    const nbz = byKey[nameKey('IDAS NBZ-II')]
    const nb3 = byKey[nameKey('IDAS NB3-PM')]
    expect(nbz).toMatchObject({ cls: 'filter', source: 'seed', confirmed: false })
    expect(nbz.specs).toMatchObject({ type: 'dual-band', passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }], glassMm: 2 })
    expect(nb3).toMatchObject({ cls: 'filter', source: 'seed', confirmed: false })
    expect(nb3.specs).toMatchObject({ passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] })
  })
  it('the memory store starts with the seed', async () => {
    const store = new MemoryLibraryStore(SEED_ENTRIES)
    expect((await store.get('filter', nameKey('IDAS NBZ-II')))?.source).toBe('seed')
  })
  it('an empty KV is seeded on the first read, once, and a correction is never overwritten by the seed', async () => {
    const kv = fakeKv({ t: 0 })
    const raw = new KvRestLibraryStore('https://kv.example/', 'tok', kv.fetchImpl)
    const store = seeded(raw)
    const first = await store.get('filter', nameKey('IDAS NBZ-II'))
    expect(first?.source).toBe('seed')
    const after = kv.requests.length
    await store.get('filter', nameKey('IDAS NBZ-II'))
    expect(kv.requests.length).toBe(after + 1) // one GET, no second seeding
    await raw.put({ ...first!, source: 'user', confirmed: true, specs: { ...first!.specs, glassMm: 2.5 } })
    const again = seeded(raw)
    expect((await again.get('filter', nameKey('IDAS NBZ-II')))?.specs).toMatchObject({ glassMm: 2.5 })
    expect(kv.requests.flatMap((r) => r.commands).filter((c) => c[0] === 'SET').every((c) => c.includes('NX') || c[1] === 'planner:lib:v1:filter:' + nameKey('IDAS NBZ-II'))).toBe(true)
  })
  it('a seeding failure is a LibraryStoreError and is retried on the next read', async () => {
    let fail = true
    const kv = fakeKv({ t: 0 })
    const raw = new KvRestLibraryStore('https://kv.example/', 'tok', async (u, i) => (fail ? Promise.reject(new Error('down')) : kv.fetchImpl(u, i)))
    const store = seeded(raw)
    await expect(store.get('filter', 'x')).rejects.toThrow(LibraryStoreError)
    fail = false
    expect(await store.get('filter', 'x')).toBeNull()
  })
})

describe('getLibraryStore', () => {
  afterEach(() => resetLibraryStore())
  it('memory (seeded) without KV env vars, KV with them, built once', async () => {
    const a = getLibraryStore({})
    expect(await a.get('filter', nameKey('IDAS NB3-PM'))).not.toBeNull()
    expect(getLibraryStore({ KV_REST_API_URL: 'https://x' })).toBe(a)
    resetLibraryStore()
    const kvStore = getLibraryStore({ KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 't' })
    expect(kvStore).not.toBe(a)
  })
})
