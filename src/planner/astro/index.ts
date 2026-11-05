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

const HOUR_MS = 3600000;

/**
 * Instant of the Sun's lowest altitude after `dusk`, a descending crossing.
 * The lowest point is near the Sun's anti-transit but not at it: the Sun's
 * declination is changing, so it can fall a few minutes before or after. A
 * night of under two minutes can sit wholly after the anti-transit that
 * precedes its dusk, so then that anti-transit, not the next one a day later,
 * is the anchor. The altitude is unimodal over the bracket (it holds no
 * transit), so a golden-section search finds the minimum.
 */
function lowestSunTime(
  observer: Astronomy.Observer,
  sunAlt: (d: Date) => number,
  dusk: Astronomy.AstroTime,
): Date {
  const duskMs = dusk.date.getTime();
  const next = Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 12, dusk).time.date;
  // Dusk falls between transit and the lowest point, at most about 12 h before it.
  const anchor =
    next.getTime() - duskMs > 18 * HOUR_MS
      ? Astronomy.SearchHourAngle(Astronomy.Body.Sun, observer, 12, dusk.AddDays(-1)).time.date
      : next;
  let lo = duskMs;
  let hi = anchor.getTime() + 3 * HOUR_MS;
  const phi = (Math.sqrt(5) - 1) / 2;
  let a = hi - phi * (hi - lo);
  let b = lo + phi * (hi - lo);
  let fa = sunAlt(new Date(a));
  let fb = sunAlt(new Date(b));
  for (let i = 0; i < 60; i++) {
    if (fa < fb) {
      hi = b;
      b = a;
      fb = fa;
      a = hi - phi * (hi - lo);
      fa = sunAlt(new Date(a));
    } else {
      lo = a;
      a = b;
      fa = fb;
      b = lo + phi * (hi - lo);
      fb = sunAlt(new Date(b));
    }
  }
  return new Date((lo + hi) / 2);
}

const REFINE_WINDOW_MS = 10 * 60000;

/**
 * Bisects the dawn crossing of -18 deg next to the engine's estimate `seed`.
 * The estimate is off by up to tens of seconds when the night lasts about a
 * minute, because the Sun's altitude is nearly flat there; dusk is accurate.
 * `nadir` is on the dark side. If the bracket does not hold, the estimate is
 * returned unchanged.
 */
function refineCrossing(sunAlt: (d: Date) => number, seed: Date, nadir: Date): Date {
  let light = seed.getTime() + REFINE_WINDOW_MS; // Sun above -18
  let dark = nadir.getTime();
  if (light <= dark || sunAlt(new Date(light)) < ASTRONOMICAL_TWILIGHT_DEG) return seed;
  for (let i = 0; i < 50; i++) {
    const mid = (light + dark) / 2;
    if (sunAlt(new Date(mid)) < ASTRONOMICAL_TWILIGHT_DEG) dark = mid;
    else light = mid;
  }
  return new Date(dark);
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

  // Dawn is searched from the Sun's true lowest point after dusk, not from dusk plus a
  // margin (a margin jumps over dawn when the night lasts under a minute).
  const nadir = lowestSunTime(observer, sunAlt, start);
  const end = Astronomy.SearchAltitude(
    Astronomy.Body.Sun,
    observer,
    +1,
    nadir,
    1.5,
    ASTRONOMICAL_TWILIGHT_DEG,
  );
  if (!end) {
    // Last dusk before polar night: the Sun dips below -18 and never comes back up.
    return { kind: 'polar-night', start: null, end: null };
  }
  return {
    kind: 'normal',
    start: start.date,
    end: refineCrossing(sunAlt, end.date, nadir),
  };
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
