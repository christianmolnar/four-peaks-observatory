import { authConfigured, isOwner, parseOwnerEmails, parseOwnerSubs } from './owners'

describe('owner sub list', () => {
  it('parses a comma list of numeric subs, trimmed, long ones kept whole as strings', () => {
    expect(parseOwnerSubs(' 12345 , 678 ,,')).toEqual(['12345', '678'])
    expect(parseOwnerSubs('104857295638274619203')).toEqual(['104857295638274619203'])
  })
  it('drops anything that is not a plain positive integer', () => {
    expect(parseOwnerSubs('alice, 0, 012, -5, 1.5, 12a, a@b.co, 99')).toEqual(['99'])
  })
  it('is empty when unset or blank', () => {
    expect(parseOwnerSubs(undefined)).toEqual([])
    expect(parseOwnerSubs(' , ')).toEqual([])
  })
})

describe('owner email list', () => {
  it('parses, trims and lowercases', () => {
    expect(parseOwnerEmails(' Me@Example.com , you@example.org ,,')).toEqual(['me@example.com', 'you@example.org'])
  })
  it('drops malformed entries; empty or unset means nobody', () => {
    expect(parseOwnerEmails('nope, @x.com, a@b, a b@c.com, ok@x.io')).toEqual(['ok@x.io'])
    expect(parseOwnerEmails(undefined)).toEqual([])
    expect(parseOwnerEmails('')).toEqual([])
  })
})

describe('isOwner', () => {
  const env = { PLANNER_OWNER_GOOGLE_SUB: '42,43', PLANNER_OWNER_GOOGLE_EMAIL: 'me@example.com' }
  it('matches a listed sub and nobody else', () => {
    expect(isOwner({ sub: '42' }, env)).toBe(true)
    expect(isOwner({ sub: '44' }, env)).toBe(false)
    expect(isOwner({ sub: '' }, env)).toBe(false)
    expect(isOwner({ sub: null }, env)).toBe(false)
    expect(isOwner({}, env)).toBe(false)
  })
  it('a sub match needs no email at all', () => {
    expect(isOwner({ sub: '43', email: 'other@x.com', emailVerified: false }, env)).toBe(true)
  })
  it('matches a verified allowlisted email, case-insensitively', () => {
    expect(isOwner({ sub: '9', email: 'ME@example.com', emailVerified: true }, env)).toBe(true)
  })
  it('rejects an allowlisted email that Google has not verified (false, missing or null)', () => {
    expect(isOwner({ sub: '9', email: 'me@example.com', emailVerified: false }, env)).toBe(false)
    expect(isOwner({ sub: '9', email: 'me@example.com' }, env)).toBe(false)
    expect(isOwner({ sub: '9', email: 'me@example.com', emailVerified: null }, env)).toBe(false)
  })
  it('an email is not a sub and a sub is not an email', () => {
    expect(isOwner({ sub: 'me@example.com' }, env)).toBe(false)
    expect(isOwner({ email: '42', emailVerified: true }, env)).toBe(false)
  })
  it('nobody when both lists are unset or empty', () => {
    expect(isOwner({ sub: '42', email: 'me@example.com', emailVerified: true }, {})).toBe(false)
    expect(isOwner({ sub: '42', email: 'me@example.com', emailVerified: true }, { PLANNER_OWNER_GOOGLE_SUB: ' ', PLANNER_OWNER_GOOGLE_EMAIL: ',' })).toBe(false)
  })
  it('reads the process env by default', () => {
    const prev = process.env.PLANNER_OWNER_GOOGLE_SUB
    process.env.PLANNER_OWNER_GOOGLE_SUB = '42'
    try {
      expect(isOwner({ sub: '42' })).toBe(true)
      expect(isOwner({ sub: '7' })).toBe(false)
    } finally {
      if (prev === undefined) delete process.env.PLANNER_OWNER_GOOGLE_SUB
      else process.env.PLANNER_OWNER_GOOGLE_SUB = prev
    }
  })
})

describe('authConfigured', () => {
  const all = { AUTH_SECRET: 'x', AUTH_GOOGLE_ID: 'x', AUTH_GOOGLE_SECRET: 'x' }
  it('needs all three vars', () => {
    expect(authConfigured(all)).toBe(true)
    expect(authConfigured({ ...all, AUTH_SECRET: undefined })).toBe(false)
    expect(authConfigured({ ...all, AUTH_GOOGLE_ID: ' ' })).toBe(false)
    expect(authConfigured({ AUTH_SECRET: 'x', AUTH_GITHUB_ID: 'x', AUTH_GITHUB_SECRET: 'x' })).toBe(false)
    expect(authConfigured({})).toBe(false)
  })
})
