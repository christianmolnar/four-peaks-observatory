export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class UpstreamError extends Error {}

/** Largest reply body read from a remote service. A real reply is a few KB. */
export const MAX_REPLY_BYTES = 256 * 1024

/** Reads the body as a stream and stops (cancelling the rest) the moment it passes MAX_REPLY_BYTES, so a huge reply is never held in memory. */
async function readBounded(res: Response, label: string): Promise<string> {
  const oversize = () => new UpstreamError(`${label} answered with an oversize body`)
  try {
    if (!res.body) {
      const text = await res.text()
      if (text.length > MAX_REPLY_BYTES) throw oversize()
      return text
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let text = ''
    let bytes = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_REPLY_BYTES) {
        void reader.cancel().catch(() => undefined)
        throw oversize()
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } catch (e) {
    if (e instanceof UpstreamError) throw e
    throw new UpstreamError(`${label} answered with an unreadable body`)
  }
}

/**
 * GET `url` and parse the JSON body. The whole exchange (connect, headers, body) is bounded by `timeoutMs`, whether or not the fetch honours the abort signal.
 * Any failure (network, timeout, non-200, oversize, unreadable body) throws UpstreamError with fixed text: the URL and any header are never echoed.
 */
export async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>, timeoutMs: number, label: string): Promise<unknown> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new UpstreamError(`${label} timed out`))
    }, timeoutMs)
  })
  const exchange = async (): Promise<unknown> => {
    let res: Response
    try {
      res = await fetchImpl(url, { method: 'GET', headers, cache: 'no-store', signal: controller.signal })
    } catch {
      throw new UpstreamError(`${label} unreachable`)
    }
    if (!res.ok) throw new UpstreamError(`${label} answered ${res.status}`)
    const declared = Number(res.headers?.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_REPLY_BYTES) {
      void res.body?.cancel().catch(() => undefined)
      throw new UpstreamError(`${label} answered with an oversize body`)
    }
    const text = await readBounded(res, label)
    try {
      return JSON.parse(text)
    } catch {
      throw new UpstreamError(`${label} answered with a body that is not JSON`)
    }
  }
  try {
    return await Promise.race([exchange(), timedOut])
  } finally {
    clearTimeout(timer)
  }
}
