import { CounterStoreError, KvRestCounterStore, MemoryCounterStore, getCounterStore, kvConfigFrom, resetCounterStore } from './counter-store'
import type { CounterStore } from './counter-store'
import { fakeKv } from './kv-fake'

const stores: [string, () => { store: CounterStore; clock: { t: number } }][] = [
  ['MemoryCounterStore', () => { const clock = { t: 1_000_000 }; return { store: new MemoryCounterStore(() => clock.t), clock } }],
  ['KvRestCounterStore (fake Upstash)', () => { const clock = { t: 1_000_000 }; return { store: new KvRestCounterStore('https://kv.example/', 'tok', fakeKv(clock).fetchImpl), clock } }],
]

describe.each(stores)('%s', (_name, make) => {
  it('counts up from zero; get never changes the count', async () => {
    const { store } = make()
    expect(await store.get('a')).toBe(0)
    expect(await store.incr('a', 60)).toBe(1)
    expect(await store.incr('a', 60)).toBe(2)
    expect(await store.get('a')).toBe(2)
    expect(await store.get('a')).toBe(2)
    expect(await store.get('b')).toBe(0)
  })
  it('a key expires after its ttl and starts again from zero', async () => {
    const { store, clock } = make()
    await store.incr('a', 60)
    clock.t += 59_000
    expect(await store.get('a')).toBe(1)
    clock.t += 2_000
    expect(await store.get('a')).toBe(0)
    expect(await store.incr('a', 60)).toBe(1)
  })
  it('decr gives one back, never below zero, and does not recreate an expired key', async () => {
    const { store, clock } = make()
    await store.incr('a', 60)
    await store.incr('a', 60)
    await store.decr('a')
    expect(await store.get('a')).toBe(1)
    await store.decr('a')
    await store.decr('a')
    expect(await store.get('a')).toBe(0)
    await store.incr('b', 60)
    clock.t += 61_000
    await store.decr('b')
    expect(await store.incr('b', 60)).toBe(1)
  })
})

describe('KvRestCounterStore wire and errors', () => {
  it('posts INCR + EXPIRE to /pipeline once, with the bearer token', async () => {
    const clock = { t: 0 }
    const kv = fakeKv(clock)
    const store = new KvRestCounterStore('https://kv.example///', 'tok', kv.fetchImpl)
    await store.incr('k', 3660)
    expect(kv.requests).toEqual([{ url: 'https://kv.example/pipeline', commands: [['INCR', 'k'], ['EXPIRE', 'k', 3660]] }])
  })
  it('a rejected token, a network error and a bad shape all throw CounterStoreError, never echoing url or token', async () => {
    const clock = { t: 0 }
    const bad = new KvRestCounterStore('https://secret-host.example', 'wrong-token', fakeKv(clock).fetchImpl)
    await expect(bad.incr('k', 1)).rejects.toThrow(CounterStoreError)
    const down = new KvRestCounterStore('https://secret-host.example', 'secret-token', async () => { throw new Error('connect ECONNREFUSED secret-host.example') })
    const err = await down.get('k').catch((e: Error) => e)
    expect(err).toBeInstanceOf(CounterStoreError)
    expect((err as Error).message).not.toMatch(/secret/)
    const odd = new KvRestCounterStore('https://x', 't', async () => new Response('{"nope":1}', { status: 200 }))
    await expect(odd.get('k')).rejects.toThrow(CounterStoreError)
    const cmdErr = new KvRestCounterStore('https://x', 't', async () => new Response('[{"error":"WRONGTYPE"}]', { status: 200 }))
    await expect(cmdErr.get('k')).rejects.toThrow(CounterStoreError)
  })
})

describe('store selection', () => {
  afterEach(resetCounterStore)
  it('kvConfigFrom accepts the Vercel KV names and the Upstash names, and needs both url and token', () => {
    expect(kvConfigFrom({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toEqual({ url: 'u', token: 't' })
    expect(kvConfigFrom({ UPSTASH_REDIS_REST_URL: 'u2', UPSTASH_REDIS_REST_TOKEN: 't2' })).toEqual({ url: 'u2', token: 't2' })
    expect(kvConfigFrom({ KV_REST_API_URL: 'u' })).toBeNull()
    expect(kvConfigFrom({ KV_REST_API_URL: ' ', KV_REST_API_TOKEN: 't' })).toBeNull()
    expect(kvConfigFrom({})).toBeNull()
  })
  it('getCounterStore: KV store with the env vars, memory store without, built once', () => {
    expect(getCounterStore({})).toBeInstanceOf(MemoryCounterStore)
    expect(getCounterStore({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toBeInstanceOf(MemoryCounterStore)
    resetCounterStore()
    expect(getCounterStore({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' })).toBeInstanceOf(KvRestCounterStore)
  })
})
