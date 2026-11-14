// Test double for the Upstash REST API (used by counter-store.test.ts and the route test). Not imported by shipping code.
/** A fake Upstash REST server: POST /pipeline with a list of commands, bearer auth, TTL on a fake clock. */
export function fakeKv(clock: { t: number }, token = 'tok') {
  const data = new Map<string, { v: number; exp: number }>()
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
    const out = commands.map(([cmd, key, arg]) => {
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
  return { fetchImpl, requests, data }
}

