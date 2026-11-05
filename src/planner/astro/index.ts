import * as Astronomy from 'astronomy-engine';
import type {
  AltAz,
  AstronomicalNight,
  BodyName,
  Site,
} from './types';

export type { AltAz, AstronomicalNight, BodyName, PlanetName, Site } from './types';

const ASTRONOMICAL_TWILIGHT_DEG = -18;

function assertSite(site: Site): void {
  if (
    !Number.isFinite(site.latitude) ||
    site.latitude < -90 ||
    site.latitude > 90
  ) {
    throw new RangeError(`Invalid latitude: ${site.latitude}`);
  }
  if (
    !Number.isFinite(site.longitude) ||
    site.longitude < -180 ||
    site.longitude > 360
  ) {
    throw new RangeError(`Invalid longitude: ${site.longitude}`);
  }
}

function assertDate(when: Date): void {
  if (!(when instanceof Date) || Number.isNaN(when.getTime())) {
    throw new TypeError('Invalid date');
  }
}

function assertCoords(raHours: number, decDeg: number): void {
  if (!Number.isFinite(raHours) || raHours < 0 || raHours >= 24) {
    throw new RangeError(`RA must be in [0, 24) hours: ${raHours}`);
  }
  if (!Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) {
    throw new RangeError(`Dec must be in [-90, 90] degrees: ${decDeg}`);
  }
}

export function toObserver(site: Site): Astronomy.Observer {
  assertSite(site);
  return new Astronomy.Observer(
    site.latitude,
    site.longitude,
    site.elevationM ?? 0,
  );
}

/**
 * Alt/az of a fixed target given in J2000 coordinates (RA in hours, Dec in
 * degrees). Precession and nutation are applied; refraction is not.
 */
export function targetAltAz(
  raHours: number,
  decDeg: number,
  when: Date,
  site: Site,
): AltAz {
  assertCoords(raHours, decDeg);
  assertDate(when);
  const observer = toObserver(site);
  const time = Astronomy.MakeTime(when);
  const j2000 = Astronomy.VectorFromSphere(
    new Astronomy.Spherical(decDeg, raHours * 15, 1),
    time,
  );
  const rot = Astronomy.Rotation_EQJ_EQD(time);
  const ofDate = Astronomy.RotateVector(rot, j2000);
  const eq = Astronomy.EquatorFromVector(ofDate);
  const hor = Astronomy.Horizon(time, observer, eq.ra, eq.dec);
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

/** Alt/az of the Sun, Moon or a planet (topocentric, no refraction). */
export function bodyAltAz(body: BodyName, when: Date, site: Site): AltAz {
  assertDate(when);
  const observer = toObserver(site);
  const eq = Astronomy.Equator(
    Astronomy.Body[body],
    when,
    observer,
    true,
    true,
  );
  const hor = Astronomy.Horizon(when, observer, eq.ra, eq.dec);
  return { altitude: hor.altitude, azimuth: hor.azimuth };
}

/**
 * Astronomical night (Sun below -18 deg) around `reference`.
 * Pass an instant in the daytime (for example local noon): the result is the
 * dusk after it and the dawn that follows. If `reference` is already inside a
 * night, that night is returned. Times are absolute instants, so DST needs no
 * special handling; format them in the site's time zone for display.
 */
export function astronomicalNight(
  site: Site,
  reference: Date,
): AstronomicalNight {
  assertDate(reference);
  const observer = toObserver(site);
  const sunAlt = (d: Date): number => {
    const eq = Astronomy.Equator(Astronomy.Body.Sun, d, observer, true, true);
    return Astronomy.Horizon(d, observer, eq.ra, eq.dec).altitude;
  };

  let start: Astronomy.AstroTime | null;
  if (sunAlt(reference) < ASTRONOMICAL_TWILIGHT_DEG) {
    start = Astronomy.SearchAltitude(
      Astronomy.Body.Sun,
      observer,
      -1,
      reference,
      -1,
      ASTRONOMICAL_TWILIGHT_DEG,
    );
    if (!start) {
      return { kind: 'polar-night', start: null, end: null };
    }
  } else {
    start = Astronomy.SearchAltitude(
      Astronomy.Body.Sun,
      observer,
      -1,
      reference,
      1,
      ASTRONOMICAL_TWILIGHT_DEG,
    );
    if (!start) {
      return { kind: 'none', start: null, end: null };
    }
  }

  // Search for dawn from the Sun's lowest point (anti-transit) after dusk, not from
  // dusk plus a margin: a margin jumps over dawn when the night lasts under a minute.
  const nadir = Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 12, start);
  if (sunAlt(nadir.time.date) >= ASTRONOMICAL_TWILIGHT_DEG) {
    // Dusk found but the Sun never gets (and stays) below -18: no night.
    return { kind: 'none', start: null, end: null };
  }
  const end = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    +1,
    nadir.time,
    1.5,
    ASTRONOMICAL_TWILIGHT_DEG,
  );
  if (!end) {
    // Last dusk before polar night: the Sun dips below -18 and never comes back up.
    return { kind: 'polar-night', start: null, end: null };
  }
  return { kind: 'normal', start: start.date, end: end.date };
}

/** Illuminated fraction of the Moon's disc, 0..1. */
export function moonIllumination(when: Date): number {
  assertDate(when);
  return Astronomy.Illumination(Astronomy.Body.Moon, when).phase_fraction;
}

/**
 * Angular separation in degrees between the Moon (as seen from the site) and a
 * fixed J2000 target.
 */
export function moonSeparation(
  raHours: number,
  decDeg: number,
  when: Date,
  site: Site,
): number {
  assertCoords(raHours, decDeg);
  assertDate(when);
  const observer = toObserver(site);
  const moon = Astronomy.Equator(
    Astronomy.Body.Moon,
    when,
    observer,
    false,
    true,
  );
  const toVec = (raH: number, dec: number): Astronomy.Vector =>
    Astronomy.VectorFromSphere(
      new Astronomy.Spherical(dec, raH * 15, 1),
      Astronomy.MakeTime(when),
    );
  return Astronomy.AngleBetween(
    toVec(moon.ra, moon.dec),
    toVec(raHours, decDeg),
  );
}
