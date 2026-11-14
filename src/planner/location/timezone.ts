import tzlookup from 'tz-lookup'

/**
 * IANA time zone for a point, from the bundled tz-lookup boundary data (works offline, in the browser and on the server).
 * Accuracy is lower right at zone borders and at sea; the site editor leaves the field editable. Throws RangeError on bad coordinates.
 */
export function timeZoneAt(latitude: number, longitude: number): string {
  return tzlookup(latitude, longitude)
}

/** True when this runtime knows the zone name (guards a bad zone from a remote reply). */
export function isKnownTimeZone(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return true
  } catch {
    return false
  }
}
