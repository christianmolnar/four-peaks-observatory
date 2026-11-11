const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))

import { requireUser } from './require-user'

describe('requireUser', () => {
  const prev = process.env.PLANNER_OWNER_GITHUB
  beforeEach(() => {
    process.env.PLANNER_OWNER_GITHUB = 'owner'
    mockSession.mockReset()
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.PLANNER_OWNER_GITHUB
    else process.env.PLANNER_OWNER_GITHUB = prev
  })

  it('denies with 401 when there is no session', async () => {
    mockSession.mockResolvedValue(null)
    const r = await requireUser()
    expect('response' in r && r.response.status).toBe(401)
  })
  it('denies a session with no login', async () => {
    mockSession.mockResolvedValue({ user: {} })
    const r = await requireUser()
    expect('response' in r && r.response.status).toBe(401)
  })
  it('allows an owner and marks owner true', async () => {
    mockSession.mockResolvedValue({ user: { login: 'Owner' } })
    expect(await requireUser()).toEqual({ user: { login: 'Owner', owner: true } })
  })
  it('allows another login with owner false', async () => {
    mockSession.mockResolvedValue({ user: { login: 'guest' } })
    expect(await requireUser()).toEqual({ user: { login: 'guest', owner: false } })
  })
  it('gives owner false for everyone when the list is unset', async () => {
    delete process.env.PLANNER_OWNER_GITHUB
    mockSession.mockResolvedValue({ user: { login: 'owner' } })
    expect(await requireUser()).toEqual({ user: { login: 'owner', owner: false } })
  })
})
