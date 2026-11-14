import * as Astronomy from 'astronomy-engine';
import { bodyAltAz, toObserver } from '../astro';
import type { AltAz, Site } from '../astro';

const DEG = Math.PI / 180;

/** A J2000 position as a unit vector, built once per target and reused at every instant. */
export interface SkyPoint {
  x: number;
  y: number;
  z: number;
}

export function skyPoint(raHours: number, decDeg: number): SkyPoint {
  if (!Number.isFinite(raHours) || raHours < 0 || raHours >= 24) throw new RangeError(`RA must be in [0, 24) hours: ${raHours}`);
  if (!Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) throw new RangeError(`Dec must be in [-90, 90] degrees: ${decDeg}`);
  const cd = Math.cos(decDeg * DEG);
  return { x: cd * Math.cos(raHours * 15 * DEG), y: cd * Math.sin(raHours * 15 * DEG), z: Math.sin(decDeg * DEG) };
}

/**
 * The night's sky frame, computed once for every sample time: the observer's zenith, north and west directions
 * expressed in J2000 axes (precession, nutation and sidereal time already folded in), and the Moon's position.
 * A target's alt/az at a sample is then three dot products, the same arithmetic as `targetAltAz` and
 * `moonSeparation` without redoing the Earth orientation and the Moon's ephemeris for every target.
 *
 * Samples are `start + k * stepMs`, the last one clamped to `end`. Between samples the frame is interpolated
 * (and re-normalised), which only the edge refinement of the usable windows uses.
 */
export interface NightSky {
  /** Sample instants in ms. */
  readonly times: readonly number[];
  readonly moonUp: readonly boolean[];
  /** Zenith distance based alt/az at sample `k`, exactly as `targetAltAz`. */
  altAzAt(p: SkyPoint, k: number): AltAz;
  /** Altitude only, at sample `k` (no azimuth, no atan2): for the cheap screen. */
  altitudeAt(p: SkyPoint, k: number): number;
  /** Alt/az at any instant within the night (interpolated between samples; exact on a sample). */
  altAzAtMs(p: SkyPoint, ms: number): AltAz;
  /** Degrees between the Moon and the target at sample `k`. */
  moonSeparationAt(p: SkyPoint, k: number): number;
}

export function createNightSky(site: Site, start: Date, end: Date, stepMinutes: number): NightSky {
  if (!(stepMinutes > 0)) throw new RangeError('stepMinutes must be positive');
  const t0 = start.getTime();
  const t1 = end.getTime();
  if (!(t1 > t0)) throw new RangeError('end must be after start');
  const stepMs = stepMinutes * 60000;
  const times: number[] = [];
  for (let t = t0; ; t += stepMs) {
    const tt = Math.min(t, t1);
    times.push(tt);
    if (tt >= t1) break;
  }
  const n = times.length;

  const observer = toObserver(site);
  const sinlat = Math.sin(observer.latitude * DEG);
  const coslat = Math.cos(observer.latitude * DEG);
  const sinlon = Math.sin(observer.longitude * DEG);
  const coslon = Math.cos(observer.longitude * DEG);
  const uze = [coslat * coslon, coslat * sinlon, sinlat];
  const une = [-sinlat * coslon, -sinlat * sinlon, coslat];
  const uwe = [sinlon, -coslon, 0];

  // basis[k*9 ..]: Z (3), N (3), W (3), each in J2000 axes.
  const basis = new Float64Array(n * 9);
  const moon = new Float64Array(n * 3);
  const moonUp: boolean[] = [];
  for (let k = 0; k < n; k++) {
    const date = new Date(times[k]);
    const time = Astronomy.MakeTime(date);
    const rot = Astronomy.Rotation_EQJ_EQD(time).rot;
    const angle = -15 * Astronomy.SiderealTime(time) * DEG;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const spin = (v: number[]): number[] => [c * v[0] + s * v[1], c * v[1] - s * v[0], v[2]];
    [spin(uze), spin(une), spin(uwe)].forEach((u, row) => {
      for (let j = 0; j < 3; j++) basis[k * 9 + row * 3 + j] = rot[j][0] * u[0] + rot[j][1] * u[1] + rot[j][2] * u[2];
    });
    const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, false, true);
    const m = skyPoint(eq.ra, eq.dec);
    moon[k * 3] = m.x;
    moon[k * 3 + 1] = m.y;
    moon[k * 3 + 2] = m.z;
    moonUp.push(bodyAltAz('Moon', date, site).altitude > 0);
  }

  const altAzFrom = (p: SkyPoint, b: ArrayLike<number>, o: number): AltAz => {
    const pz = p.x * b[o] + p.y * b[o + 1] + p.z * b[o + 2];
    const pn = p.x * b[o + 3] + p.y * b[o + 4] + p.z * b[o + 5];
    const pw = p.x * b[o + 6] + p.y * b[o + 7] + p.z * b[o + 8];
    const proj = Math.hypot(pn, pw);
    let azimuth = 0;
    if (proj > 0) {
      azimuth = -Math.atan2(pw, pn) / DEG;
      if (azimuth < 0) azimuth += 360;
    }
    return { altitude: 90 - Math.atan2(proj, pz) / DEG, azimuth };
  };

  const scratch = new Float64Array(9);
  return {
    times,
    moonUp,
    altAzAt: (p, k) => altAzFrom(p, basis, k * 9),
    altitudeAt: (p, k) => {
      const o = k * 9;
      return Math.asin(Math.max(-1, Math.min(1, p.x * basis[o] + p.y * basis[o + 1] + p.z * basis[o + 2]))) / DEG;
    },
    altAzAtMs(p, ms) {
      if (ms < t0 || ms > t1) throw new RangeError('Instant is outside the night');
      let k = Math.min(Math.floor((ms - t0) / stepMs), n - 1);
      if (k < 0) k = 0;
      if (k === n - 1 || ms === times[k]) return altAzFrom(p, basis, k * 9);
      const w = (ms - times[k]) / (times[k + 1] - times[k]);
      for (let v = 0; v < 3; v++) {
        const o = k * 9 + v * 3;
        const x = basis[o] + w * (basis[o + 9] - basis[o]);
        const y = basis[o + 1] + w * (basis[o + 10] - basis[o + 1]);
        const z = basis[o + 2] + w * (basis[o + 11] - basis[o + 2]);
        const len = Math.hypot(x, y, z);
        scratch[v * 3] = x / len;
        scratch[v * 3 + 1] = y / len;
        scratch[v * 3 + 2] = z / len;
      }
      return altAzFrom(p, scratch, 0);
    },
    moonSeparationAt(p, k) {
      const dot = p.x * moon[k * 3] + p.y * moon[k * 3 + 1] + p.z * moon[k * 3 + 2];
      if (dot <= -1) return 180;
      if (dot >= 1) return 0;
      return Math.acos(dot) / DEG;
    },
  };
}
