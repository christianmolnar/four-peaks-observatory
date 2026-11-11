const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))

import { GET } from './route'

describe('GET /api/planner/session', () => {
  const prev = process.env.PLANNER_OWNER_GITHUB
  beforeEach(() => {
    process.env.PLANNER_OWNER_GITHUB = 'owner'
    mockSession.mockReset()
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.PLANNER_OWNER_GITHUB
    else process.env.PLANNER_OWNER_GITHUB = prev
  })

  it('is 401 signed out', async () => {
    mockSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })
  it('reports owner true for a listed login', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner' } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ signedIn: true, owner: true })
  })
  it('reports owner false for any other login', async () => {
    mockSession.mockResolvedValue({ user: { login: 'someone' } })
    expect(await (await GET()).json()).toEqual({ signedIn: true, owner: false })
  })
})
