import { getJson, MAX_REPLY_BYTES, UpstreamError } from './bounded-fetch'

const CHUNK = new Uint8Array(64 * 1024).fill(0x20)

/** A body that never ends: 64 KB of spaces per pull, counting the pulls. Cancelling stops it. */
function endlessBody() {
  const state = { pulls: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      state.pulls++
      controller.enqueue(CHUNK)
    },
    cancel() {
      state.cancelled = true
    },
  })
  return { state, response: new Response(body, { status: 200 }) }
}

describe('getJson reply size', () => {
  it('a huge streamed body stops being read at the cap and is cancelled', async () => {
    const { state, response } = endlessBody()
    await expect(getJson(async () => response, 'https://x.test/', {}, 5000, 'Test')).rejects.toThrow(/oversize/)
    expect(state.cancelled).toBe(true)
    expect(state.pulls * CHUNK.byteLength).toBeLessThan(MAX_REPLY_BYTES + 4 * CHUNK.byteLength)
  })

  it('a declared Content-Length over the cap is refused before any body is read', async () => {
    const { state, response } = endlessBody()
    const declared = new Response(response.body, { status: 200, headers: { 'content-length': String(MAX_REPLY_BYTES + 1) } })
    await expect(getJson(async () => declared, 'https://x.test/', {}, 5000, 'Test')).rejects.toThrow(UpstreamError)
    expect(state.pulls).toBeLessThanOrEqual(1)
  })

  it('a normal streamed body in several chunks, even split inside a multi-byte character, parses', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ name: 'São Paulo' }))
    const cut = bytes.indexOf(0xc3) + 1
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    expect(await getJson(async () => new Response(body), 'https://x.test/', {}, 5000, 'Test')).toEqual({ name: 'São Paulo' })
  })

  it('a body that is not JSON is an UpstreamError', async () => {
    await expect(getJson(async () => new Response('<html>'), 'https://x.test/', {}, 5000, 'Test')).rejects.toThrow(/not JSON/)
  })
})
