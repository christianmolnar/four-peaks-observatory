/** Checking and reading a place query. Shared by the route (which must refuse bad input) and the client (which should not send it). */

export const MAX_QUERY_LENGTH = 100
export const MIN_QUERY_LENGTH = 2

export class QueryError extends Error {}

export interface ParsedQuery {
  /** Trimmed, whitespace collapsed. The cache key is its lower case. */
  text: string
  /** What Open-Meteo is asked for: the 5 digits of a ZIP, or the part before the first comma. */
  name: string
  /** The part after the first comma ("AZ", "Arizona", "USA"), lower case; empty when none. */
  region: string
}

/** US states and DC: the two-letter code people type, and the name Open-Meteo returns. */
export const US_STATES: Readonly<Record<string, string>> = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware', dc: 'district of columbia',
  fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa', ks: 'kansas', ky: 'kentucky', la: 'louisiana',
  me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota', ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska',
  nv: 'nevada', nh: 'new hampshire', nj: 'new jersey', nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma',
  or: 'oregon', pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah', vt: 'vermont',
  va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
}

/** Decimals kept in an elevation request and its cache key (5 is about 1 m). One rounding for both, so a cache cell is the point asked for. */
export const COORD_DECIMALS = 5

/** A coordinate as the text sent upstream: fixed decimals, never exponent notation (1e-7 would fail the route's own check). */
export const coordText = (v: number): string => v.toFixed(COORD_DECIMALS)

const STREET_WORD = /\b(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court|pl|place|hwy|highway|pkwy|parkway|cir|circle|trl|trail|ter|terrace)\b\.?/i

/**
 * Drops a leading house number from a street address ("123 Main St, Phoenix" -> "Main St, Phoenix"), so a house number is never sent on.
 * Only when the part before the first comma also has a street word, so "29 Palms, CA" is left alone.
 */
function dropHouseNumber(text: string): string {
  const first = text.split(',')[0]
  const m = /^\d{1,6}[A-Za-z]?\s+(?=[A-Za-z])/.exec(first)
  if (!m || !STREET_WORD.test(first.slice(m[0].length))) return text
  return text.slice(m[0].length)
}

/** Splits a trailing US state name or upper-case code off "City State" (no comma). Null when there is none or nothing would be left of the city. */
function splitTrailingState(text: string): { name: string; region: string } | null {
  const words = text.split(' ')
  for (const n of [2, 1]) {
    if (words.length <= n) continue
    const tail = words.slice(-n).join(' ')
    const lower = tail.toLowerCase()
    const isName = Object.values(US_STATES).includes(lower)
    const isCode = n === 1 && /^[A-Z]{2}$/.test(tail) && lower in US_STATES
    if (!isName && !isCode) continue
    const name = words.slice(0, -n).join(' ')
    if (name.length < MIN_QUERY_LENGTH) continue
    return { name, region: lower }
  }
  return null
}

/** Throws QueryError (a message fit to show the user) for anything that is not a short line of plain text. */
export function parseQuery(raw: unknown): ParsedQuery {
  if (typeof raw !== 'string') throw new QueryError('Enter a place or a postal code.')
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(raw)) throw new QueryError('The search text has characters that are not allowed.')
  const typed = raw.trim().replace(/\s+/g, ' ')
  const text = dropHouseNumber(typed)
  if (text.length < MIN_QUERY_LENGTH) throw new QueryError('Enter at least two characters.')
  if (typed.length > MAX_QUERY_LENGTH) throw new QueryError(`Search text is limited to ${MAX_QUERY_LENGTH} characters.`)
  const zip = /^(\d{5})(?:-\d{4})?$/.exec(text)
  if (zip) return { text, name: zip[1], region: '' }
  if (!text.includes(',')) {
    const split = splitTrailingState(text)
    if (split) return { text, ...split }
  }
  const [first, ...rest] = text.split(',')
  const name = first.trim()
  if (name.length < MIN_QUERY_LENGTH) throw new QueryError('Enter a place name before the comma.')
  return { text, name, region: rest.join(',').trim().toLowerCase() }
}

/** Cache key: the same search typed with different case or spacing shares one entry. */
export const cacheKey = (q: ParsedQuery): string => q.text.toLowerCase()

/** True when a result's state, county or country matches what followed the comma ("AZ" matches Arizona). */
export function regionMatches(region: string, parts: { admin1?: string; admin2?: string; country?: string; countryCode?: string }): boolean {
  if (region === '') return true
  const want = US_STATES[region] ?? region
  const names = [parts.admin1, parts.admin2, parts.country].map((s) => s?.toLowerCase())
  if (parts.countryCode?.toLowerCase() === region) return true
  if (region === 'usa' || region === 'us' || region === 'united states') return parts.countryCode?.toLowerCase() === 'us'
  return names.some((n) => n === want || n === region)
}

/** Latitude and longitude as validated numbers, or a QueryError. */
export function parseCoordinates(lat: unknown, lon: unknown): { latitude: number; longitude: number } {
  const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && /^-?\d{1,3}(\.\d{1,8})?$/.test(v.trim()) ? Number(v) : NaN)
  const latitude = num(lat)
  const longitude = num(lon)
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new QueryError('Latitude must be a number from -90 to 90.')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new QueryError('Longitude must be a number from -180 to 180.')
  return { latitude, longitude }
}
