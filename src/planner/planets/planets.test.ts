import fixture from './horizons.fixture.json';
import { astronomicalNight, bodyAltAz } from '../astro';
import type { Site } from '../astro';
import { diskState, elongationDeg, nearestEvent, nextBodyTransit } from '../astro/bodies';
import type { CardBody } from '../astro/bodies';
import { arcToHorizonPoints } from '../profile';
import { tonightsNight } from '../plan';
import {
  BLUE_RED_INDEX_DIFFERENCE,
  CARD_BODIES,
  EQUATORIAL_RADIUS_KM,
  MAX_CLIP_S,
  ROTATION,
  apparentDiameterArcsec,
  clipsInSession,
  dawesArcsec,
  dispersionAltitudeDeg,
  dispersionArcsec,
  moonPhaseName,
  planetCard,
  planetCards,
  rotationClip,
  samplingFor,
} from './index';

// The site of the sample profile; the Horizons fixture was fetched for the same place.
const SITE: Site = { latitude: 33.6115, longitude: -111.719, elevationM: 500 };
const ARC = arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 });
const APERTURE = 279.4;

type Row = (typeof fixture.positions)[number];
const rows = fixture.positions as Row[];
const rowsOf = (body: string) => rows.filter((r) => r.body === body);

describe('planet numbers against JPL Horizons (independent ephemeris, fixed instants)', () => {
  // Tolerances: Horizons uses JPL DE441, the library its own series (VSOP87 and a lunar series), so a few arcseconds of position
  // and a few hundredths of a percent in distance are expected. The Moon is looser because of its parallax and the 1738.1 km
  // equatorial radius here against Horizons' 1737.4 km mean radius.
  const tol = (body: string) => (body === 'Moon' ? { pos: 0.05, diam: 0.0015, illum: 0.05 } : { pos: 0.02, diam: 0.0015, illum: 0.05 });

  for (const r of rows) {
    const when = new Date(r.at);
    it(`${r.body} at ${r.at}: altitude and azimuth`, () => {
      const p = bodyAltAz(r.body as CardBody, when, SITE);
      expect(Math.abs(p.altitude - r.altitudeDeg)).toBeLessThan(tol(r.body).pos);
      const dAz = Math.abs(((p.azimuth - r.azimuthDeg + 540) % 360) - 180);
      expect(dAz).toBeLessThan(tol(r.body).pos * 2 + 0.01);
    });
    it(`${r.body} at ${r.at}: apparent diameter and illuminated fraction`, () => {
      const d = apparentDiameterArcsec(r.body as CardBody, when, SITE);
      expect(Math.abs(d / r.diameterArcsec - 1)).toBeLessThan(tol(r.body).diam);
      expect(Math.abs(diskState(r.body as CardBody, when, SITE).illuminatedFraction * 100 - r.illuminatedPercent)).toBeLessThan(tol(r.body).illum);
    });
  }

  it('phase angle matches Horizons for every row', () => {
    for (const r of rows) {
      expect(Math.abs(diskState(r.body as CardBody, new Date(r.at), SITE).phaseAngleDeg - r.phaseAngleDeg)).toBeLessThan(r.body === 'Moon' ? 0.1 : 0.05);
    }
  });

  it('elongation matches Horizons for Mercury, Venus, Mars, Jupiter and Saturn', () => {
    for (const r of rows.filter((x) => x.elongationDeg !== undefined)) {
      expect(Math.abs(elongationDeg(r.body as CardBody, new Date(r.at)).degrees - (r.elongationDeg as number))).toBeLessThan(0.05);
    }
  });

  it('Saturn ring tilt matches Horizons sub-observer latitude once that is made planetocentric', () => {
    // Horizons ObsSub-LAT is planetographic. Saturn's flattening is 0.09796 (NASA fact sheet), so
    // tan(planetocentric) = tan(planetographic) * (1 - f)^2: -7.4668 becomes -6.0866, the ring plane's angle to the line of sight.
    const f = 0.09796;
    for (const r of rowsOf('Saturn')) {
      const centric = (Math.atan(Math.tan((r.obsSubLatDeg * Math.PI) / 180) * (1 - f) ** 2) * 180) / Math.PI;
      const tilt = diskState('Saturn', new Date(r.at)).ringTiltDeg as number;
      expect(Math.abs(tilt - Math.abs(centric))).toBeLessThan(0.03);
    }
    expect(Math.abs(diskState('Saturn', new Date(rowsOf('Saturn')[0].at)).ringTiltDeg as number)).toBeCloseTo(6.1, 0);
  });

  it('ring tilt is given for Saturn only', () => {
    for (const b of CARD_BODIES) {
      expect(diskState(b, new Date('2026-12-05T04:00:00Z')).ringTiltDeg !== undefined).toBe(b === 'Saturn');
    }
  });

  it('culmination time and altitude match Horizons transits (to the minute)', () => {
    for (const t of fixture.transits) {
      const found = nextBodyTransit(t.body as CardBody, new Date(new Date(t.timeUtc).getTime() - 6 * 3600000), SITE);
      expect(Math.abs(found.getTime() - new Date(t.timeUtc).getTime())).toBeLessThanOrEqual((t.toleranceMin + 0.5) * 60000);
      const p = bodyAltAz(t.body as CardBody, found, SITE);
      expect(Math.abs(p.altitude - t.altitudeDeg)).toBeLessThan(0.1);
    }
  });

  it('oppositions fall at the instants whose Horizons elongation is near 180', () => {
    for (const o of fixture.oppositions) {
      const near = new Date(new Date(o.timeUtc).getTime() + 20 * 86400000);
      const e = nearestEvent(o.body as CardBody, near);
      expect(e.kind).toBe('opposition');
      expect(Math.abs(e.time.getTime() - new Date(o.timeUtc).getTime())).toBeLessThan(5 * 60000);
      expect(Math.abs(elongationDeg(o.body as CardBody, e.time).degrees - o.horizonsElongationDeg)).toBeLessThan(0.05);
    }
  });
});

describe('nearest event', () => {
  it('Venus: the greatest elongation nearest 2026-12-05 is found, with its angle and sky', () => {
    const e = nearestEvent('Venus', new Date('2026-12-05T04:00:00Z'));
    expect(e.kind).toBe('greatest-elongation');
    expect(e.elongationDeg).toBeGreaterThan(44);
    expect(e.elongationDeg).toBeLessThan(48);
    expect(e.side).toMatch(/evening|morning/);
  });
  it('Mercury: the event is within 60 days either way', () => {
    const when = new Date('2027-03-15T04:00:00Z');
    const e = nearestEvent('Mercury', when);
    expect(Math.abs(e.time.getTime() - when.getTime())).toBeLessThan(60 * 86400000);
    expect(e.elongationDeg).toBeGreaterThan(17);
    expect(e.elongationDeg).toBeLessThan(28.5);
  });
  it('Moon: the nearest full Moon is within 15 days', () => {
    const when = new Date('2026-12-05T04:00:00Z');
    const e = nearestEvent('Moon', when);
    expect(e.kind).toBe('full-moon');
    expect(Math.abs(e.time.getTime() - when.getTime())).toBeLessThan(15 * 86400000);
  });
});

describe('moon phase names', () => {
  it('eight bins centred on the principal phases', () => {
    expect(moonPhaseName(0)).toBe('New');
    expect(moonPhaseName(359)).toBe('New');
    expect(moonPhaseName(22)).toBe('New');
    expect(moonPhaseName(23)).toBe('Waxing crescent');
    expect(moonPhaseName(90)).toBe('First quarter');
    expect(moonPhaseName(135)).toBe('Waxing gibbous');
    expect(moonPhaseName(180)).toBe('Full');
    expect(moonPhaseName(225)).toBe('Waning gibbous');
    expect(moonPhaseName(270)).toBe('Last quarter');
    expect(moonPhaseName(315)).toBe('Waning crescent');
  });
});

describe('rotation limit of a clip', () => {
  it('uses the stated formula: half a Dawes limit divided by the smear speed at the disc centre', () => {
    // Jupiter 40 arcsec across, 279.4 mm: dawes 0.41521; smear speed = 2pi/(9.925*3600) * 20 = 3.5170e-3 arcsec/s
    const c = rotationClip('Jupiter', 40, APERTURE)!;
    expect(c.resolutionArcsec).toBeCloseTo(116 / 279.4, 9);
    expect(c.smearArcsecPerMin).toBeCloseTo(((2 * Math.PI) / (9.925 * 3600)) * 20 * 60, 9);
    expect(c.limitS).toBeCloseTo((0.5 * (116 / 279.4)) / (((2 * Math.PI) / (9.925 * 3600)) * 20), 6);
    expect(c.limitS).toBeCloseTo(59.03, 1); // python3: 0.5*116/279.4 / (2*pi/(9.925*3600)*20)
    expect(c.suggestedS).toBe(c.limitS);
    expect(c.cappedByMax).toBe(false);
    expect(c.periodBasis).toBe('sourced');
  });
  it('a slower planet gets a longer limit, capped at MAX_CLIP_S in the suggestion only', () => {
    const jup = rotationClip('Jupiter', 40, APERTURE)!;
    const mars = rotationClip('Mars', 12, APERTURE)!;
    expect(mars.limitS).toBeGreaterThan(jup.limitS);
    const venus = rotationClip('Venus', 30, APERTURE)!;
    expect(venus.limitS).toBeGreaterThan(MAX_CLIP_S);
    expect(venus.suggestedS).toBe(MAX_CLIP_S);
    expect(venus.cappedByMax).toBe(true);
    expect(venus.periodBasis).toBe('assumption');
  });
  it('a bigger telescope has a finer resolution, so a shorter limit; a bigger disc smears faster', () => {
    expect(rotationClip('Saturn', 18, 200)!.limitS).toBeGreaterThan(rotationClip('Saturn', 18, 400)!.limitS);
    expect(rotationClip('Saturn', 18, APERTURE)!.limitS).toBeGreaterThan(rotationClip('Saturn', 36, APERTURE)!.limitS);
  });
  it('the Moon does not rotate under the camera: no limit', () => {
    expect(rotationClip('Moon', 1900, APERTURE)).toBeNull();
  });
  it('every rotation period is positive and the fact-sheet ones are as read from NASA', () => {
    expect(ROTATION.Jupiter.periodH).toBe(9.925);
    expect(ROTATION.Saturn.periodH).toBe(10.656);
    expect(ROTATION.Mars.periodH).toBe(24.6229);
    expect(ROTATION.Uranus.periodH).toBe(17.24);
    expect(ROTATION.Neptune.periodH).toBe(16.11);
    expect(ROTATION.Mercury.periodH).toBe(1407.6);
    for (const r of Object.values(ROTATION)) expect(r.periodH).toBeGreaterThan(0);
  });
  it('clips in a session count the gap between clips', () => {
    expect(clipsInSession(30, 60)).toBe(20); // 1800 / (60 + 30)
    expect(clipsInSession(0, 60)).toBe(0);
  });
});

describe('sampling of the planetary train', () => {
  it('native C11 + ASI676MC: 0.147 arcsec/px against a Nyquist scale of 0.185, near the limit', () => {
    const s = samplingFor((206.265 * 2) / 2800, APERTURE);
    expect(s.scaleArcsecPx).toBeCloseTo(0.1473, 3);
    // python3: 500e-9/(2*0.2794)*206264.806 = 0.18457
    expect(s.nyquistArcsecPx).toBeCloseTo(0.18457, 4);
    expect(s.ratio).toBeCloseTo(0.798, 2);
    expect(s.verdict).toBe('near-limit');
    expect(s.seeingLimited).toBe(true);
    expect(s.dawesArcsec).toBeCloseTo(0.4152, 3);
  });
  it('with the nominal 2.5x extender: 0.059 arcsec/px is oversampled', () => {
    const s = samplingFor((206.265 * 2) / 7000, APERTURE);
    expect(s.scaleArcsecPx).toBeCloseTo(0.0589, 3);
    expect(s.verdict).toBe('oversampled');
    expect(s.ratio).toBeLessThan(0.5);
  });
  it('a scale coarser than the Nyquist scale is flagged coarse', () => {
    expect(samplingFor(0.4, APERTURE).verdict).toBe('coarse');
  });
  it('rejects a bad scale or aperture', () => {
    expect(() => samplingFor(0, APERTURE)).toThrow(RangeError);
    expect(() => dawesArcsec(0)).toThrow(RangeError);
  });
});

describe('atmospheric dispersion without a corrector', () => {
  it('blue minus red index difference for standard air is about 4.2e-6', () => {
    // python3 with the Edlen constants: n(450)-n(650) = 4.2037e-6 (sum 28051.7e-8 - 27631.3e-8)
    expect(BLUE_RED_INDEX_DIFFERENCE).toBeCloseTo(4.2e-6, 7);
  });
  it('red-to-blue spread at 45, 60 and 30 degrees follows tan(zenith distance)', () => {
    expect(dispersionArcsec(45)).toBeCloseTo(BLUE_RED_INDEX_DIFFERENCE * 206264.806, 6); // tan 45 = 1
    expect(dispersionArcsec(45)).toBeCloseTo(0.867, 2);
    expect(dispersionArcsec(60) / dispersionArcsec(45)).toBeCloseTo(Math.tan((30 * Math.PI) / 180), 6);
    expect(dispersionArcsec(30) / dispersionArcsec(45)).toBeCloseTo(Math.tan((60 * Math.PI) / 180), 6);
    expect(dispersionArcsec(90)).toBeCloseTo(0, 9);
  });
  it('the altitude where the spread equals one Dawes limit of a 279.4 mm telescope is about 64 degrees', () => {
    const alt = dispersionAltitudeDeg(APERTURE);
    expect(alt).toBeCloseTo(64.4, 0);
    expect(dispersionArcsec(alt)).toBeCloseTo(dawesArcsec(APERTURE), 6);
  });
  it('rejects an altitude at or below the horizon', () => {
    expect(() => dispersionArcsec(0)).toThrow(RangeError);
    expect(() => dispersionArcsec(-5)).toThrow(RangeError);
  });
});

describe('the cards for one night', () => {
  // Evening of 2027-03-15 at the sample site; the house horizon blocks 120 to 320 degrees below 42 degrees.
  const night = tonightsNight(SITE, '2027-03-15');
  const base = { site: SITE, night, horizon: ARC, minAltitude: 20, apertureMm: APERTURE, imageScaleArcsecPx: 0.1473, fieldArcmin: 8.72 };

  it('gives eight cards in the spec order', () => {
    expect(planetCards(base).map((c) => c.body)).toEqual(['Jupiter', 'Saturn', 'Mars', 'Venus', 'Mercury', 'Uranus', 'Neptune', 'Moon']);
  });

  it('Jupiter: diameter and peak against Horizons at mid-night, culmination inside the night', () => {
    const c = planetCard({ ...base, body: 'Jupiter' });
    const ref = rowsOf('Jupiter').find((r) => r.at.startsWith('2027-03-15'))!;
    expect(c.apparentDiameterArcsec).toBeGreaterThan(40); // Jupiter ~43.6 arcsec near its opposition
    expect(c.apparentDiameterArcsec).toBeLessThan(46);
    expect(ref.diameterArcsec).toBeGreaterThan(40);
    expect(c.culmination.insideNight).toBe(true);
    const h = fixture.transits.find((t) => t.body === 'Jupiter')!;
    expect(Math.abs(c.culmination.time.getTime() - new Date(h.timeUtc).getTime())).toBeLessThanOrEqual(90000);
    expect(Math.abs(c.culmination.altitude - h.altitudeDeg)).toBeLessThan(0.1);
    expect(c.peak.usable).toBe(true);
    expect(c.peak.altitude).toBeGreaterThan(70);
    expect(c.ringTiltDeg).toBeNull();
  });

  it('Saturn is behind the sun at dusk: its culmination is before the night and the card says so', () => {
    const c = planetCard({ ...base, body: 'Saturn' });
    expect(c.culmination.insideNight).toBe(false);
    expect(c.ringTiltDeg).not.toBeNull();
    expect(Math.abs(c.ringTiltDeg as number)).toBeLessThan(27.5);
  });

  it('usable minutes clip to the saved arc: with the arc a planet in the blocked south-west loses time against no arc', () => {
    const open = planetCards({ ...base, horizon: null });
    const blocked = planetCards(base);
    // No body gains time from a horizon, and at least one planet loses some.
    open.forEach((o, i) => expect(blocked[i].usableMinutes).toBeLessThanOrEqual(o.usableMinutes + 1e-6));
    expect(blocked.some((b, i) => b.usableMinutes < open[i].usableMinutes - 1)).toBe(true);
  });

  it('usable windows hold only samples above the horizon limit at their azimuth', () => {
    for (const c of planetCards(base)) {
      for (const w of c.windows) {
        for (let t = w.start.getTime() + 60000; t < w.end.getTime() - 60000; t += 300000) {
          const p = bodyAltAz(c.body, new Date(t), SITE);
          const limit = p.azimuth >= 120 && p.azimuth <= 320 ? 42 : 20;
          expect(p.altitude).toBeGreaterThanOrEqual(limit - 0.2);
        }
      }
    }
  });

  it('good minutes (above the dispersion altitude) never exceed usable minutes, and the altitude is the 64 degree figure', () => {
    for (const c of planetCards(base)) {
      expect(c.dispersionAltitudeDeg).toBeCloseTo(64.4, 0);
      expect(c.goodMinutes as number).toBeLessThanOrEqual(c.usableMinutes + 1e-6);
    }
  });

  it('the Moon card has a phase name, no rotation limit, a mosaic count and no ring tilt', () => {
    const c = planetCard({ ...base, body: 'Moon' });
    expect(c.moonPhase?.name).toMatch(/crescent|quarter|gibbous|Full|New/);
    expect(c.rotation).toBeNull();
    expect(c.mosaicPanelsPerSide).toBeGreaterThanOrEqual(3);
    expect(c.apparentDiameterArcsec).toBeGreaterThan(1750);
    expect(c.apparentDiameterArcsec).toBeLessThan(2000);
    expect(c.ringTiltDeg).toBeNull();
    expect(planetCard({ ...base, body: 'Jupiter' }).moonPhase).toBeNull();
    expect(planetCard({ ...base, body: 'Jupiter' }).mosaicPanelsPerSide).toBeNull();
  });

  it('diameter in pixels is diameter over scale; without a scale or aperture those fields are null, not guessed', () => {
    const c = planetCard({ ...base, body: 'Jupiter' });
    expect(c.diameterPx).toBeCloseTo(c.apparentDiameterArcsec / 0.1473, 6);
    const bare = planetCard({ site: SITE, night, horizon: ARC, minAltitude: 20, body: 'Jupiter' });
    expect(bare.diameterPx).toBeNull();
    expect(bare.rotation).toBeNull();
    expect(bare.goodMinutes).toBeNull();
    expect(bare.dispersionAltitudeDeg).toBeNull();
  });

  it('the track covers two hours either side of the night, with the limit at each azimuth', () => {
    const c = planetCard({ ...base, body: 'Mars' });
    expect(c.track[0].time.getTime()).toBe((night.start as Date).getTime() - 2 * 3600000);
    expect(c.track[c.track.length - 1].time.getTime()).toBeGreaterThanOrEqual((night.end as Date).getTime() + 2 * 3600000);
    for (const p of c.track) expect(p.limit).toBe(p.azimuth >= 120 && p.azimuth <= 320 ? 42 : 20);
  });

  it('refuses a night without an astronomical night', () => {
    expect(() => planetCard({ ...base, body: 'Jupiter', night: { kind: 'none', start: null, end: null } })).toThrow(RangeError);
  });

  it('equatorial radii are the NASA fact sheet figures', () => {
    expect(EQUATORIAL_RADIUS_KM.Jupiter).toBe(71492);
    expect(EQUATORIAL_RADIUS_KM.Saturn).toBe(60268);
    expect(EQUATORIAL_RADIUS_KM.Mars).toBe(3396.2);
  });

  it('astronomicalNight is the same function the page uses', () => {
    expect(astronomicalNight(SITE, new Date('2027-03-15T19:00:00Z')).kind).toBe('normal');
  });
});
