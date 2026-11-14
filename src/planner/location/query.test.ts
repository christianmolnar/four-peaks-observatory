import { cacheKey, MAX_QUERY_LENGTH, parseCoordinates, parseQuery, QueryError, regionMatches } from './query'

describe('parseQuery', () => {
  it('a city and state: name before the comma, region after, lower case', () => {
    expect(parseQuery('  Phoenix ,  AZ ')).toEqual({ text: 'Phoenix , AZ', name: 'Phoenix', region: 'az' })
  })
  it('US ZIP and ZIP+4 both become the 5 digits', () => {
    expect(parseQuery('85001')).toMatchObject({ name: '85001', region: '' })
    expect(parseQuery('85001-1234')).toMatchObject({ name: '85001', region: '' })
  })
  it('a non-US postcode stays as typed', () => {
    expect(parseQuery('SW1A 1AA').name).toBe('SW1A 1AA')
  })
  it('the cache key ignores case and spacing', () => {
    expect(cacheKey(parseQuery('Phoenix,   AZ'))).toBe(cacheKey(parseQuery('phoenix, az')))
  })
  it.each([
    ['not a string', 5],
    ['missing', null],
    ['empty', ''],
    ['one character', 'a'],
    ['only a comma part', ', AZ'],
    ['too long', 'a'.repeat(MAX_QUERY_LENGTH + 1)],
    ['a newline', 'Phoenix\nAZ'],
    ['a NUL', 'Phoenix\u0000'],
    ['an escape', 'Phoenix\u001b[31m'],
    ['a DEL', 'Phoenix\u007f'],
    ['a C1 control', 'Phoenix\u0085'],
    ['a line separator', 'Phoenix AZ'],
  ])('refuses %s', (_n, v) => {
    expect(() => parseQuery(v)).toThrow(QueryError)
  })
  it('exactly the length limit is fine', () => {
    expect(parseQuery('a'.repeat(MAX_QUERY_LENGTH)).name).toHaveLength(MAX_QUERY_LENGTH)
  })
  it('hostile but printable text is accepted as plain text (it is only ever URL-encoded)', () => {
    expect(parseQuery('<script>alert(1)</script>; DROP TABLE').name).toContain('<script>')
  })
})

describe('regionMatches', () => {
  const az = { admin1: 'Arizona', admin2: 'Maricopa', country: 'United States', countryCode: 'US' }
  it('matches a state code, a state name, a county, a country name or code, and an empty region', () => {
    for (const r of ['az', 'arizona', 'maricopa', 'united states', 'us', 'usa', '']) expect(regionMatches(r, az)).toBe(true)
  })
  it('does not match another state or country', () => {
    for (const r of ['tx', 'texas', 'france', 'fr']) expect(regionMatches(r, az)).toBe(false)
  })
})

describe('parseCoordinates', () => {
  it('accepts numbers and plain decimal strings', () => {
    expect(parseCoordinates('33.4484', '-112.074')).toEqual({ latitude: 33.4484, longitude: -112.074 })
    expect(parseCoordinates(0, 0)).toEqual({ latitude: 0, longitude: 0 })
  })
  it.each([['91', '0'], ['0', '181'], ['abc', '0'], ['', '0'], [null, '0'], ['1e2', '0'], ['0', 'NaN'], [NaN, 0]])('refuses %p, %p', (a, b) => {
    expect(() => parseCoordinates(a, b)).toThrow(QueryError)
  })
})
