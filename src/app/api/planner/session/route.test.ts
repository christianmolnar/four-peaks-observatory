const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))

import { GET } from './route'

describe('GET /api/planner/session', () => {
  const prevOwner = process.env.PLANNER_OWNER_GITHUB_ID
  const prevAuth = ['AUTH_SECRET', 'AUTH_GITHUB_ID', 'AUTH_GITHUB_SECRET'].map((k) => [k, process.env[k]] as const)
  beforeEach(() => {
    process.env.PLANNER_OWNER_GITHUB_ID = '1001'
    for (const [k] of prevAuth) process.env[k] = 'fake'
    mockSession.mockReset()
  })
  afterAll(() => {
    if (prevOwner === undefined) delete process.env.PLANNER_OWNER_GITHUB_ID
    else process.env.PLANNER_OWNER_GITHUB_ID = prevOwner
    for (const [k, v] of prevAuth) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('is 200 signed out, configured true, no-store', async () => {
    mockSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ signedIn: false, configured: true })
  })
  it('is 200 with configured false when sign-in env is missing', async () => {
    delete process.env.AUTH_SECRET
    mockSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedIn: false, configured: false })
  })
  it('reports owner true for a listed id', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner', githubId: '1001' } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ signedIn: true, owner: true, login: 'owner' })
  })
  it('reports owner false for any other id', async () => {
    mockSession.mockResolvedValue({ user: { login: 'someone', githubId: '2002' } })
    expect(await (await GET()).json()).toEqual({ signedIn: true, owner: false, login: 'someone' })
  })
  it('reports owner false for the owner login under a different id', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner', githubId: '9999' } })
    expect((await (await GET()).json()).owner).toBe(false)
  })
})
