import {
  astronomicalNight,
  bodyAltAz,
  moonIllumination,
  moonSeparation,
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
