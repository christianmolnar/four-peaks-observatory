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

describe('KvRestCounterStore fails closed', () => {
  const never = () => new Promise<Response>(() => undefined)
  const wire = (f: () => Promise<Response>, ms = 20) => new KvRestCounterStore('https://x', 't', f, ms)
  it('a fetch that never resolves rejects with CounterStoreError at the timeout, whether or not it honours the signal', async () => {
    jest.useFakeTimers()
    try {
      const p = wire(never, 2000).get('k')
      const settled = p.then(() => 'ok', (e: Error) => e)
      await jest.advanceTimersByTimeAsync(1999)
      let done = false
      void settled.then(() => { done = true })
      await Promise.resolve()
      expect(done).toBe(false)
      await jest.advanceTimersByTimeAsync(2)
      expect(await settled).toBeInstanceOf(CounterStoreError)
    } finally {
      jest.useRealTimers()
    }
  })
  it('passes an abort signal, aborted at the timeout', async () => {
    let signal: AbortSignal | undefined
    const store = new KvRestCounterStore('https://x', 't', (_u, init) => { signal = init.signal as AbortSignal; return never() }, 10)
    await expect(store.get('k')).rejects.toThrow(/timed out/)
    expect(signal?.aborted).toBe(true)
  })
  it('a body that hangs after the headers also times out', async () => {
    const res = { ok: true, json: () => never() } as unknown as Response
    await expect(wire(async () => res).get('k')).rejects.toThrow(CounterStoreError)
  })
  it.each([
    ['an HTML body', '<html>502</html>'],
    ['[null]', '[null]'],
    ['a non-array', '{"result":1}'],
    ['the wrong length', '[{"result":1},{"result":2}]'],
    ['a non-object entry', '[3]'],
    ['an array entry', '[[1]]'],
  ])('%s is a CounterStoreError', async (_n, text) => {
    await expect(wire(async () => new Response(text, { status: 200 })).get('k')).rejects.toBeInstanceOf(CounterStoreError)
  })
  it('decr is one request (atomic), and is harmless on a missing key', async () => {
    const kv = fakeKv({ t: 0 })
    const store = new KvRestCounterStore('https://x', 'tok', kv.fetchImpl)
    await store.decr('missing')
    expect(kv.requests).toHaveLength(1)
    expect(kv.data.has('missing')).toBe(false)
    await store.incr('k', 60)
    kv.requests.length = 0
    await store.decr('k')
    expect(kv.requests).toHaveLength(1)
    expect(await store.get('k')).toBe(0)
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
