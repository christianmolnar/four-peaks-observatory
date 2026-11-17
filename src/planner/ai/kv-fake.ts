// Test double for the Upstash REST API (used by counter-store.test.ts and the route test). Not imported by shipping code.
/** A fake Upstash REST server: POST /pipeline with a list of commands, bearer auth, TTL on a fake clock. */
export function fakeKv(clock: { t: number }, token = 'tok') {
  const data = new Map<string, { v: number; exp: number }>()
  // Plain string values and sets (the spec library): SET [NX] [EX|PX], GET, MGET, SADD, SMEMBERS. A string key with an EX/PX expires on the same fake clock.
  const strings = new Map<string, { v: string; exp: number }>()
  const sets = new Map<string, Set<string>>()
  const liveString = (k: string) => {
    const e = strings.get(k)
    if (e && e.exp <= clock.t) strings.delete(k)
    return strings.get(k)
  }
  const requests: { url: string; commands: unknown[][] }[] = []
  const fetchImpl = async (url: string, init: RequestInit): Promise<Response> => {
    if ((init.headers as Record<string, string>).Authorization !== `Bearer ${token}`) return new Response('{"error":"unauthorized"}', { status: 401 })
    const commands = JSON.parse(init.body as string) as (string | number)[][]
    requests.push({ url, commands })
    const live = (k: string) => {
      const e = data.get(k)
      if (e && e.exp <= clock.t) data.delete(k)
      return data.get(k)
    }
    const out = commands.map(([cmd, key, arg, evalKey, ...rest]) => {
      if (cmd === 'SET') {
        const opts = [evalKey, ...rest].map((o) => String(o).toUpperCase())
        if (opts.includes('NX') && liveString(key as string)) return { result: null }
        const ttl = opts.indexOf('EX') >= 0 ? Number([evalKey, ...rest][opts.indexOf('EX') + 1]) * 1000 : opts.indexOf('PX') >= 0 ? Number([evalKey, ...rest][opts.indexOf('PX') + 1]) : Infinity
        strings.set(key as string, { v: String(arg), exp: clock.t + ttl })
        return { result: 'OK' }
      }
      if (cmd === 'MGET') return { result: [key, arg, evalKey, ...rest].filter((k) => k !== undefined).map((k) => liveString(k as string)?.v ?? null) }
      if (cmd === 'SADD') {
        const set = sets.get(key as string) ?? new Set<string>()
        const before = set.size
        for (const m of [arg, evalKey, ...rest]) if (m !== undefined) set.add(String(m))
        sets.set(key as string, set)
        return { result: set.size - before }
      }
      if (cmd === 'SMEMBERS') return { result: [...(sets.get(key as string) ?? [])] }
      if (cmd === 'EVAL') {
        // Only the decrement-if-exists script is supported; it runs atomically like Redis.
        const e = live(evalKey as string)
        if (!e || e.v <= 0) return { result: 0 }
        e.v -= 1
        return { result: e.v }
      }
      const k = key as string
      if (cmd === 'INCR') {
        const e = live(k) ?? { v: 0, exp: Infinity }
        e.v += 1
        data.set(k, e)
        return { result: e.v }
      }
      if (cmd === 'EXPIRE') {
        const e = live(k)
        if (e) e.exp = clock.t + (arg as number) * 1000
        return { result: e ? 1 : 0 }
      }
      if (cmd === 'GET') {
        const str = liveString(k)
        if (str) return { result: str.v }
        const e = live(k)
        return { result: e ? String(e.v) : null }
      }
      if (cmd === 'DECR') {
        const e = live(k) ?? { v: 0, exp: Infinity }
        e.v -= 1
        data.set(k, e)
        return { result: e.v }
      }
      return { error: 'ERR unknown command' }
    })
    return new Response(JSON.stringify(out), { status: 200 })
  }
  return { fetchImpl, requests, data, strings, sets }
}

