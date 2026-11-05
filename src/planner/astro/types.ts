export interface Site {
  /** Degrees, north positive. */
  latitude: number;
  /** Degrees, east positive. */
  longitude: number;
  /** Metres above sea level. Defaults to 0 when unknown. */
  elevationM?: number;
}

export interface AltAz {
  /** Degrees above the horizon (geometric, no refraction). */
  altitude: number;
  /** Degrees clockwise from north, 0..360. */
  azimuth: number;
}

export type PlanetName =
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export type BodyName = 'Sun' | 'Moon' | PlanetName;

export interface AstronomicalNight {
  /**
   * normal: the Sun crosses -18 deg going down and up.
   * none: the Sun never gets below -18 deg (start and end are null).
   * polar-night: the Sun stays below -18 deg all day (start and end are null).
   */
  kind: 'normal' | 'none' | 'polar-night';
  /** Astronomical dusk, an absolute instant. */
  start: Date | null;
  /** Following astronomical dawn, an absolute instant. */
  end: Date | null;
}
