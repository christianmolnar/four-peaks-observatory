export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export class UpstreamError extends Error {}

/** Largest reply body read from a remote service. A real reply is a few KB. */
export const MAX_REPLY_BYTES = 256 * 1024

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
    let text: string
    try {
      text = await res.text()
    } catch {
      throw new UpstreamError(`${label} answered with an unreadable body`)
    }
    if (text.length > MAX_REPLY_BYTES) throw new UpstreamError(`${label} answered with an oversize body`)
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
