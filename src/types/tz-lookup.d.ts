declare module 'tz-lookup' {
  /** IANA zone name for a point. Throws RangeError for coordinates outside -90..90 / -180..180. */
  export default function tzlookup(latitude: number, longitude: number): string
}
