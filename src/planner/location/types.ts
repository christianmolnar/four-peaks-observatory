/** One place a search found, ready to apply to a site. */
export interface PlaceCandidate {
  /** Place name, e.g. "Phoenix". */
  name: string
  /** State, province or county, when the source gave one. */
  admin?: string
  country?: string
  latitude: number
  longitude: number
  /** Metres above sea level. Absent when the source does not know it (never a guess). */
  elevationM?: number
  /** IANA zone, e.g. America/Phoenix. */
  timeZone: string
  source: 'open-meteo' | 'nominatim'
}

/** What describeCoordinates found for hand-entered coordinates. A missing part is left out, with the reason in `notes`. */
export interface CoordinateDetails {
  timeZone?: string
  elevationM?: number
  notes: string[]
}
