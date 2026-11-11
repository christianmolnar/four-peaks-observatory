import { authConfigured, isOwner, parseOwners } from './owners'

describe('owner list', () => {
  it('parses a comma list, trimmed and lower-cased', () => {
    expect(parseOwners(' Alice , bob ,,')).toEqual(['alice', 'bob'])
  })
  it('is empty when unset or blank', () => {
    expect(parseOwners(undefined)).toEqual([])
    expect(parseOwners(' , ')).toEqual([])
  })
  it('matches a listed login case-insensitively and nobody else', () => {
    expect(isOwner('Alice', 'alice,bob')).toBe(true)
    expect(isOwner('mallory', 'alice,bob')).toBe(false)
    expect(isOwner('', 'alice')).toBe(false)
    expect(isOwner(undefined, 'alice')).toBe(false)
    expect(isOwner('alice', undefined)).toBe(false)
  })
  it('reads PLANNER_OWNER_GITHUB by default', () => {
    const prev = process.env.PLANNER_OWNER_GITHUB
    process.env.PLANNER_OWNER_GITHUB = 'alice'
    try {
      expect(isOwner('alice')).toBe(true)
      expect(isOwner('bob')).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.PLANNER_OWNER_GITHUB
      else process.env.PLANNER_OWNER_GITHUB = prev
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
