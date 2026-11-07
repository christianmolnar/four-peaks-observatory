import {
  astronomicalNight,
  bodyAltAz,
  moonIllumination,
  hourAngleHours,
  moonSeparation,
  nextMeridianTransit,
  targetAltAz,
} from './index';
import type { Site } from './types';

const sunAltitudeAt = (d: Date, site: Site): number =>
  bodyAltAz('Sun', d, site).altitude;

// Fixtures
const washington: Site = { latitude: 38.921389, longitude: -77.065556 }; // Meeus ex. 13.b
const boulder: Site = { latitude: 40.0, longitude: -105.0, elevationM: 500 };
const newYork: Site = { latitude: 40.7128, longitude: -74.006 }; // DST ends 2026-11-01
const sydney: Site = { latitude: -33.8688, longitude: 151.2093 };

const SIRIUS = { ra: 6.752477, dec: -16.716116 }; // J2000

function localHour(d: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')!.value);
  const m = Number(parts.find((p) => p.type === 'minute')!.value);
  return h + m / 60;
}

describe('alt/az', () => {
  it('matches Meeus example 13.b (Venus, Washington, 1987-04-10 19:21 UT) within 0.1 deg', () => {
    // Published: altitude 15.1249 deg, azimuth 68.0337 deg west of south = 248.0337 from north.
    const r = bodyAltAz('Venus', new Date(Date.UTC(1987, 3, 10, 19, 21, 0)), washington);
    expect(Math.abs(r.altitude - 15.1249)).toBeLessThan(0.1);
    expect(Math.abs(r.azimuth - 248.0337)).toBeLessThan(0.1);
  });

  // Reference values for Vega (J2000 RA 18.615649 h, Dec +38.783689) at 40.0 N, 105.0 W,
  // computed independently of astronomy-engine with Meeus, Astronomical Algorithms:
  // IAU 1976 precession (ch. 21) and mean sidereal time (ch. 12), nutation ignored (< 0.01 deg).
  // The same script reproduced Meeus example 13.b. Precession between J2000 and 1900/2100 is
  // about 1.4 deg, so those cases fail if precession is dropped; a 1 h RA error is 15 deg.
  const VEGA = { ra: 18.615649, dec: 38.783689 };
  it.each([
    ['2026-11-05 04:00 UTC', Date.UTC(2026, 10, 5, 4), 30.4689, 297.0996],
    ['1900-01-01 03:00 UTC', Date.UTC(1900, 0, 1, 3), 4.9249, 318.3215],
    ['2100-01-01 03:00 UTC', Date.UTC(2100, 0, 1, 3), 5.6356, 317.7756],
  ])('puts Vega at the published alt/az through targetAltAz (%s)', (_l, ms, alt, az) => {
    const r = targetAltAz(VEGA.ra, VEGA.dec, new Date(ms), boulder);
    expect(Math.abs(r.altitude - alt)).toBeLessThan(0.1);
    expect(Math.abs(r.azimuth - az)).toBeLessThan(0.1);
  });

  it('puts a J2000 star on the meridian at its culmination altitude (90 - |lat - dec|)', () => {
    // Search for the moment of highest altitude on 2026-01-15 night at the fixture site.
    let best = { alt: -90, az: 0 };
    for (let m = 0; m < 24 * 60; m += 1) {
      const t = new Date(Date.UTC(2026, 0, 15, 0, 0) + m * 60000);
      const r = targetAltAz(SIRIUS.ra, SIRIUS.dec, t, boulder);
      if (r.altitude > best.alt) best = { alt: r.altitude, az: r.azimuth };
    }
    const expected = 90 - (boulder.latitude - SIRIUS.dec);
    expect(Math.abs(best.alt - expected)).toBeLessThan(0.1);
    expect(Math.abs(best.az - 180)).toBeLessThan(0.5);
  });

  it('puts the north celestial pole at altitude equal to latitude', () => {
    const r = targetAltAz(0, 90, new Date(Date.UTC(2026, 5, 1, 6)), boulder);
    // The J2000 pole sits ~0.14 deg from the pole of date in 2026 (precession), so allow 0.2.
    expect(Math.abs(r.altitude - boulder.latitude)).toBeLessThan(0.2);
  });

  it('rejects bad input loudly', () => {
    expect(() => targetAltAz(25, 0, new Date(), boulder)).toThrow(RangeError);
    expect(() => targetAltAz(1, 91, new Date(), boulder)).toThrow(RangeError);
    expect(() => targetAltAz(1, 1, new Date('x'), boulder)).toThrow(TypeError);
    expect(() => bodyAltAz('Sun', new Date(), { latitude: 100, longitude: 0 })).toThrow(RangeError);
  });

  it('returns azimuth in 0..360 and Sun above horizon at local noon', () => {
    const r = bodyAltAz('Sun', new Date(Date.UTC(2026, 5, 21, 19, 30)), boulder);
    expect(r.altitude).toBeGreaterThan(70);
    expect(r.azimuth).toBeGreaterThanOrEqual(0);
    expect(r.azimuth).toBeLessThan(360);
  });
});

describe('astronomical night', () => {
  it('has the Sun at -18 deg at both ends', () => {
    const n = astronomicalNight(boulder, new Date(Date.UTC(2026, 0, 15, 19)));
    expect(n.kind).toBe('normal');
    expect(Math.abs(sunAltitudeAt(n.start!, boulder) + 18)).toBeLessThan(0.05);
    expect(Math.abs(sunAltitudeAt(n.end!, boulder) + 18)).toBeLessThan(0.05);
    expect(n.end!.getTime()).toBeGreaterThan(n.start!.getTime());
  });

  it('is correct across a DST change (New York, 2026-11-01)', () => {
    const night = (day: number) =>
      astronomicalNight(newYork, new Date(Date.UTC(2026, 9, day, 17))); // ~noon local
    const before = night(31);
    const after = astronomicalNight(newYork, new Date(Date.UTC(2026, 10, 1, 18))); // noon EST
    // Instants are continuous: the night lengths differ by only a minute or two.
    const len = (n: ReturnType<typeof night>) => n.end!.getTime() - n.start!.getTime();
    expect(Math.abs(len(before) - len(after))).toBeLessThan(5 * 60000);
    // Dusk moves about 1 min earlier per day in UTC, but the wall clock jumps back ~1 h.
    const utcShift = (after.start!.getTime() - before.start!.getTime()) / 3600000;
    expect(utcShift).toBeGreaterThan(23);
    expect(utcShift).toBeLessThan(24);
    const wallShift =
      localHour(after.start!, 'America/New_York') - localHour(before.start!, 'America/New_York');
    expect(wallShift).toBeLessThan(-0.9);
    expect(wallShift).toBeGreaterThan(-1.1);
    // Sun is at -18 deg at each instant, whatever the clock says.
    for (const t of [before.start!, before.end!, after.start!, after.end!]) {
      expect(Math.abs(sunAltitudeAt(t, newYork) + 18)).toBeLessThan(0.05);
    }
  });

  it('works in the southern hemisphere (Sydney): winter nights are longer than summer nights', () => {
    const june = astronomicalNight(sydney, new Date(Date.UTC(2026, 5, 21, 2)));
    const dec = astronomicalNight(sydney, new Date(Date.UTC(2026, 11, 21, 2)));
    const hours = (n: typeof june) => (n.end!.getTime() - n.start!.getTime()) / 3600000;
    expect(june.kind).toBe('normal');
    expect(hours(june)).toBeGreaterThan(hours(dec) + 3);
    expect(hours(june)).toBeGreaterThan(11);
    expect(hours(dec)).toBeLessThan(8);
    for (const t of [june.start!, june.end!, dec.start!, dec.end!]) {
      expect(Math.abs(sunAltitudeAt(t, sydney) + 18)).toBeLessThan(0.05);
    }
    // Dusk in Sydney (AEST, UTC+10) in June is evening local time.
    const h = localHour(june.start!, 'Australia/Sydney');
    expect(h).toBeGreaterThan(17);
    expect(h).toBeLessThan(19.5);
  });

  it('returns the current night when the reference is already inside one', () => {
    const day = astronomicalNight(boulder, new Date(Date.UTC(2026, 0, 15, 19)));
    const mid = new Date((day.start!.getTime() + day.end!.getTime()) / 2);
    const again = astronomicalNight(boulder, mid);
    expect(Math.abs(again.start!.getTime() - day.start!.getTime())).toBeLessThan(2000);
    expect(Math.abs(again.end!.getTime() - day.end!.getTime())).toBeLessThan(2000);
  });

  it('reports no astronomical night at high summer latitude', () => {
    const oslo: Site = { latitude: 59.9, longitude: 10.75 };
    const n = astronomicalNight(oslo, new Date(Date.UTC(2026, 5, 21, 10)));
    expect(n.kind).toBe('none');
    expect(n.start).toBeNull();
  });

  it('never returns a zero-length night between 50 and 60 degrees, either hemisphere, all year', () => {
    for (const lat of [51.5, -54.8, 52.5, -53.2, 59.9]) {
      const site: Site = { latitude: lat, longitude: 0 };
      for (let day = 0; day < 365; day++) {
        const noon = new Date(Date.UTC(2026, 0, 1 + day, 12));
        const n = astronomicalNight(site, noon);
        if (n.kind === 'normal') {
          expect(n.end!.getTime() - n.start!.getTime()).toBeGreaterThan(0);
        }
      }
    }
  });

  it('dawn matches an independent 1-minute scan of the Sun, and the Sun is below -18 at the midpoint', () => {
    for (const lat of [51.5, 59.9, -54.8]) {
      const site: Site = { latitude: lat, longitude: 0 };
      for (let day = 0; day < 365; day += 5) {
        const noon = new Date(Date.UTC(2026, 0, 1 + day, 12));
        const n = astronomicalNight(site, noon);
        if (n.kind !== 'normal') continue;
        const mid = new Date((n.start!.getTime() + n.end!.getTime()) / 2);
        expect(sunAltitudeAt(mid, site)).toBeLessThan(-18);
        // Independent value: first minute after dusk+2min at which the Sun is back above -18.
        let t = n.start!.getTime() + 2 * 60000;
        while (sunAltitudeAt(new Date(t), site) < -18 && t < n.start!.getTime() + 36 * 3600000) {
          t += 60000;
        }
        expect(Math.abs(t - n.end!.getTime())).toBeLessThanOrEqual(3 * 60000);
      }
    }
  });

  // Nights of about a minute. Truth below is an independent 1-second scan of the Sun.
  const scanSeconds = (site: Site, from: Date): number => {
    let first: number | null = null;
    let last = 0;
    for (let t = from.getTime(); t < from.getTime() + 40 * 3600000; t += 1000) {
      if (sunAltitudeAt(new Date(t), site) < -18) {
        if (first === null) first = t;
        last = t;
      } else if (first !== null) break;
    }
    return first === null ? 0 : (last - first) / 1000;
  };
  const lengthSeconds = (site: Site, from: Date): number => {
    const n = astronomicalNight(site, from);
    expect(n.kind).toBe('normal');
    return (n.end!.getTime() - n.start!.getTime()) / 1000;
  };

  it('measures a 60 s night that is ending (lat 54.174665, May)', () => {
    const site: Site = { latitude: 54.174665, longitude: 0 };
    const from = new Date(Date.UTC(2026, 4, 10, 12));
    const truth = scanSeconds(site, from);
    expect(truth).toBeGreaterThan(55);
    expect(Math.abs(lengthSeconds(site, from) - truth)).toBeLessThanOrEqual(3);
  });

  it('measures a 60 s night that is returning (lat 54.194972, August) instead of a day-long one', () => {
    const site: Site = { latitude: 54.194972, longitude: 0 };
    const from = new Date(Date.UTC(2026, 7, 1, 12));
    const truth = scanSeconds(site, from);
    expect(truth).toBeGreaterThan(55);
    expect(Math.abs(lengthSeconds(site, from) - truth)).toBeLessThanOrEqual(3);
  });

  it('never returns a day-long night for a returning night under a minute (lat 54.19503, August)', () => {
    const n = astronomicalNight(
      { latitude: 54.19503, longitude: 0 },
      new Date(Date.UTC(2026, 7, 1, 12)),
    );
    // True night is about 28 s. The old search came back with 24.5 h.
    expect(n.kind).toBe('normal');
    expect((n.end!.getTime() - n.start!.getTime()) / 1000).toBeLessThan(60);
  });

  it('finds returning nights of 30 to 40 s near lat 71 in September, not a day-long one', () => {
    const site: Site = { latitude: 71.221358, longitude: 0 };
    const from = new Date(Date.UTC(2026, 8, 20, 12));
    const truth = scanSeconds(site, from);
    expect(truth).toBeGreaterThan(35);
    expect(truth).toBeLessThan(45);
    expect(Math.abs(lengthSeconds(site, from) - truth)).toBeLessThanOrEqual(3);
  });

  it('finds a returning night that the Sun barely enters (28 s, 1.8e-5 deg deep) at lat 54.195028', () => {
    // The Sun's lowest point is only 0.00002 deg under -18, so it must not be judged "never below".
    const site: Site = { latitude: 54.195028, longitude: 0 };
    const from = new Date(Date.UTC(2026, 7, 1, 12));
    const truth = scanSeconds(site, from);
    expect(truth).toBeGreaterThan(20);
    expect(Math.abs(lengthSeconds(site, from) - truth)).toBeLessThanOrEqual(3);
  });

  it('measures the whole night when the reference is inside a night of about 4 minutes (lat 51.25268, July)', () => {
    // Review carry item 1: the old backward search returned 0.5 s here against 246.7 s true.
    const site: Site = { latitude: 51.25268, longitude: 94.27453 };
    const reference = new Date('2022-07-19T17:51:30.008Z');
    expect(sunAltitudeAt(reference, site)).toBeLessThan(-18);
    const truth = scanSeconds(site, new Date(reference.getTime() - 3600000));
    expect(truth).toBeGreaterThan(200);
    const n = astronomicalNight(site, reference);
    expect(n.kind).toBe('normal');
    expect(n.start!.getTime()).toBeLessThanOrEqual(reference.getTime());
    expect(n.end!.getTime()).toBeGreaterThanOrEqual(reference.getTime());
    expect(Math.abs((n.end!.getTime() - n.start!.getTime()) / 1000 - truth)).toBeLessThanOrEqual(3);
  });

  it('gives the same night from every reference position inside it', () => {
    const site: Site = { latitude: 51.25268, longitude: 94.27453 };
    const base = astronomicalNight(site, new Date('2022-07-19T12:00:00Z'));
    expect(base.kind).toBe('normal');
    const s = base.start!.getTime();
    const e = base.end!.getTime();
    for (const f of [0.02, 0.25, 0.5, 0.75, 0.98]) {
      const n = astronomicalNight(site, new Date(s + f * (e - s)));
      expect(n.kind).toBe('normal');
      expect(Math.abs(n.start!.getTime() - s)).toBeLessThanOrEqual(3000);
      expect(Math.abs(n.end!.getTime() - e)).toBeLessThanOrEqual(3000);
    }
  });

  it('does not report polar night when the Sun never gets below -18 (nadir at -18, lat 55.55960812050098)', () => {
    // Review carry item 2: a night of hundredths of a second came back as polar-night.
    const n = astronomicalNight(
      { latitude: 55.55960812050098, longitude: 45.3 },
      new Date('2026-05-05T08:58:48Z'),
    );
    expect(n.kind).not.toBe('polar-night');
    if (n.kind === 'normal') {
      expect(n.end!.getTime()).toBeGreaterThan(n.start!.getTime());
    } else {
      expect(n.start).toBeNull();
    }
  });

  it('reports none just above the threshold latitude, never a day', () => {
    const n = astronomicalNight(
      { latitude: 71.22139, longitude: 0 },
      new Date(Date.UTC(2026, 8, 20, 12)),
    );
    expect(n.kind).toBe('none');
  });

  it('returns a typed result, not an error, on the last dusk before polar night (lat 85)', () => {
    const n = astronomicalNight(
      { latitude: 85, longitude: 0 },
      new Date(Date.UTC(2026, 11, 11, 12)),
    );
    expect(['normal', 'polar-night']).toContain(n.kind);
    if (n.kind === 'normal') {
      expect(n.end!.getTime()).toBeGreaterThan(n.start!.getTime());
    } else {
      expect(n.start).toBeNull();
    }
  });

  it('reports polar night at high winter latitude', () => {
    const highArctic: Site = { latitude: 85, longitude: 15.6 }; // noon Sun ~ -18.4 deg
    const n = astronomicalNight(highArctic, new Date(Date.UTC(2026, 11, 21, 12)));
    expect(n.kind).toBe('polar-night');
  });
});

describe('moon', () => {
  it('is near full at the known 2026-11-24 full-moon region and near new at 2026-11-09', () => {
    expect(moonIllumination(new Date(Date.UTC(2026, 10, 24, 14)))).toBeGreaterThan(0.97);
    expect(moonIllumination(new Date(Date.UTC(2026, 10, 9, 22)))).toBeLessThan(0.03);
  });

  it('separation is ~0 from the Moon itself and ~180 from its antipode', () => {
    const when = new Date(Date.UTC(2026, 10, 5, 4));
    const m = bodyAltAz('Moon', when, boulder);
    expect(m.altitude).toBeDefined();
    // Recover the Moon's J2000 position via separation search around a seed: use two probes.
    // Easier: separation to itself using the engine through a small grid refinement.
    let best = { sep: 999, ra: 0, dec: 0 };
    for (let ra = 0; ra < 24; ra += 0.5) {
      for (let dec = -30; dec <= 30; dec += 5) {
        const s = moonSeparation(ra, dec, when, boulder);
        if (s < best.sep) best = { sep: s, ra, dec };
      }
    }
    // Refine
    for (const step of [0.25, 0.05, 0.01]) {
      const c = { ...best };
      for (let dra = -5; dra <= 5; dra++) {
        for (let ddec = -5; ddec <= 5; ddec++) {
          const ra = (c.ra + dra * step + 24) % 24;
          const dec = c.dec + ddec * step * 5;
          const s = moonSeparation(ra, dec, when, boulder);
          if (s < best.sep) best = { sep: s, ra, dec };
        }
      }
    }
    expect(best.sep).toBeLessThan(0.1);
    const anti = moonSeparation((best.ra + 12) % 24, -best.dec, when, boulder);
    expect(Math.abs(anti - 180)).toBeLessThan(0.3);
    // Separation of poles is 180 apart and any point is 90 from the pole when on the equator.
    expect(moonSeparation(0, 90, when, boulder) + moonSeparation(0, -90, when, boulder)).toBeCloseTo(180, 4);
  });
});

describe('nextMeridianTransit', () => {
  const from = new Date('2026-12-15T02:00:00Z');
  it('is the highest point of a fixed target, due south, within one sidereal day', () => {
    const t = nextMeridianTransit(SIRIUS.ra, SIRIUS.dec, from, boulder);
    const ahead = (t.getTime() - from.getTime()) / 3600000;
    expect(ahead).toBeGreaterThanOrEqual(0);
    expect(ahead).toBeLessThan(23.94);
    const at = targetAltAz(SIRIUS.ra, SIRIUS.dec, t, boulder);
    expect(Math.abs(at.azimuth - 180)).toBeLessThan(0.1);
    // Independent: transit altitude = 90 - |latitude - declination|, give or take precession.
    expect(at.altitude).toBeCloseTo(90 - (40 + 16.716116), 1);
    for (const dm of [-10, 10]) {
      expect(targetAltAz(SIRIUS.ra, SIRIUS.dec, new Date(t.getTime() + dm * 60000), boulder).altitude).toBeLessThan(at.altitude);
    }
    expect(Math.abs(hourAngleHours(SIRIUS.ra, SIRIUS.dec, t, boulder))).toBeLessThan(1e-4);
  });
  it('a target that crossed a minute ago crosses again about a sidereal day later, not now', () => {
    const t = nextMeridianTransit(SIRIUS.ra, SIRIUS.dec, from, boulder);
    const later = nextMeridianTransit(SIRIUS.ra, SIRIUS.dec, new Date(t.getTime() + 60000), boulder);
    expect((later.getTime() - t.getTime()) / 3600000).toBeCloseTo(23.934, 2);
  });
  it('hour angle is negative before the crossing and positive after', () => {
    const t = nextMeridianTransit(SIRIUS.ra, SIRIUS.dec, from, boulder);
    expect(hourAngleHours(SIRIUS.ra, SIRIUS.dec, new Date(t.getTime() - 3600000), boulder)).toBeCloseTo(-1.0027, 2);
    expect(hourAngleHours(SIRIUS.ra, SIRIUS.dec, new Date(t.getTime() + 3600000), boulder)).toBeCloseTo(1.0027, 2);
  });
});
