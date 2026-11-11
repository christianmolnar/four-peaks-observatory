import { authConfigured, isOwner, parseOwnerIds } from './owners'

describe('owner id list', () => {
  it('parses a comma list of numeric ids, trimmed', () => {
    expect(parseOwnerIds(' 12345 , 678 ,,')).toEqual(['12345', '678'])
  })
  it('drops anything that is not a plain positive integer', () => {
    expect(parseOwnerIds('alice, 0, 012, -5, 1.5, 12a, 99')).toEqual(['99'])
  })
  it('is empty when unset or blank', () => {
    expect(parseOwnerIds(undefined)).toEqual([])
    expect(parseOwnerIds(' , ')).toEqual([])
  })
  it('matches a listed id (string or number) and nobody else', () => {
    expect(isOwner('42', '42,43')).toBe(true)
    expect(isOwner(43, '42,43')).toBe(true)
    expect(isOwner('44', '42,43')).toBe(false)
    expect(isOwner('', '42')).toBe(false)
    expect(isOwner(undefined, '42')).toBe(false)
    expect(isOwner(null, '42')).toBe(false)
    expect(isOwner('42', undefined)).toBe(false)
  })
  it('does not treat a login as an id', () => {
    expect(isOwner('alice', 'alice')).toBe(false)
  })
  it('reads PLANNER_OWNER_GITHUB_ID by default', () => {
    const prev = process.env.PLANNER_OWNER_GITHUB_ID
    process.env.PLANNER_OWNER_GITHUB_ID = '42'
    try {
      expect(isOwner('42')).toBe(true)
      expect(isOwner('7')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.PLANNER_OWNER_GITHUB_ID
      else process.env.PLANNER_OWNER_GITHUB_ID = prev
    }
  })
})

describe('authConfigured', () => {
  const all = { AUTH_SECRET: 'x', AUTH_GITHUB_ID: 'x', AUTH_GITHUB_SECRET: 'x' }
  it('needs all three vars', () => {
    expect(authConfigured(all)).toBe(true)
    expect(authConfigured({ ...all, AUTH_SECRET: undefined })).toBe(false)
    expect(authConfigured({ ...all, AUTH_GITHUB_ID: ' ' })).toBe(false)
    expect(authConfigured({})).toBe(false)
  })
})
