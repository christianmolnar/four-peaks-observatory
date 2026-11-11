const mockSession = jest.fn()
jest.mock('@/auth', () => ({ getSession: () => mockSession() }))

import { requireOwner, requireUser } from './require-user'

const OWNER = { login: 'owner', githubId: '1001' }

describe('requireUser and requireOwner', () => {
  const prev = process.env.PLANNER_OWNER_GITHUB_ID
  beforeEach(() => {
    process.env.PLANNER_OWNER_GITHUB_ID = '1001'
    mockSession.mockReset()
  })
  afterAll(() => {
    if (prev === undefined) delete process.env.PLANNER_OWNER_GITHUB_ID
    else process.env.PLANNER_OWNER_GITHUB_ID = prev
  })

  it('requireUser: 401 with no session', async () => {
    mockSession.mockResolvedValue(null)
    const r = await requireUser()
    expect('response' in r && r.response.status).toBe(401)
  })
  it('requireUser: 401 for a session with a login but no id (old token)', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner' } })
    const r = await requireUser()
    expect('response' in r && r.response.status).toBe(401)
  })
  it('requireUser: owner true for a listed id', async () => {
    mockSession.mockResolvedValue({ user: OWNER })
    expect(await requireUser()).toEqual({ user: { login: 'owner', id: '1001', owner: true } })
  })
  it('requireUser: owner false for another id', async () => {
    mockSession.mockResolvedValue({ user: { login: 'guest', githubId: '2002' } })
    expect(await requireUser()).toEqual({ user: { login: 'guest', id: '2002', owner: false } })
  })
  it('requireUser: a login equal to an owner login but a different id is not owner', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner', githubId: '9999' } })
    expect(await requireUser()).toEqual({ user: { login: 'owner', id: '9999', owner: false } })
  })
  it('requireUser: owner false for everyone when the list is unset', async () => {
    delete process.env.PLANNER_OWNER_GITHUB_ID
    mockSession.mockResolvedValue({ user: OWNER })
    expect(await requireUser()).toEqual({ user: { login: 'owner', id: '1001', owner: false } })
  })

  it('requireOwner: 401 signed out', async () => {
    mockSession.mockResolvedValue(null)
    const r = await requireOwner()
    expect('response' in r && r.response.status).toBe(401)
  })
  it('requireOwner: 403 signed in, not an owner', async () => {
    mockSession.mockResolvedValue({ user: { login: 'guest', githubId: '2002' } })
    const r = await requireOwner()
    expect('response' in r && r.response.status).toBe(403)
  })
  it('requireOwner: 403 for the owner login under a different id', async () => {
    mockSession.mockResolvedValue({ user: { login: 'owner', githubId: '9999' } })
    const r = await requireOwner()
    expect('response' in r && r.response.status).toBe(403)
  })
  it('requireOwner: the user for an owner id', async () => {
    mockSession.mockResolvedValue({ user: OWNER })
    expect(await requireOwner()).toEqual({ user: { login: 'owner', id: '1001', owner: true } })
  })

  // The shape every paid route must have: guard first, paid work only after it passes.
  describe('owner-only route double', () => {
    const paid = jest.fn()
    const POST = async () => {
      const r = await requireOwner()
      if ('response' in r) return r.response
      paid()
      return Response.json({ ok: true })
    }
    beforeEach(() => paid.mockReset())

    it('401 signed out, no paid call', async () => {
      mockSession.mockResolvedValue(null)
      expect((await POST()).status).toBe(401)
      expect(paid).not.toHaveBeenCalled()
    })
    it('403 for a signed-in non-owner, no paid call', async () => {
      mockSession.mockResolvedValue({ user: { login: 'guest', githubId: '2002' } })
      expect((await POST()).status).toBe(403)
      expect(paid).not.toHaveBeenCalled()
    })
    it('200 for an owner', async () => {
      mockSession.mockResolvedValue({ user: OWNER })
      expect((await POST()).status).toBe(200)
      expect(paid).toHaveBeenCalledTimes(1)
    })
  })
})
