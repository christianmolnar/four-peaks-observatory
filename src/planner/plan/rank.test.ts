import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from '../catalog';
import { parseExtract } from '../catalog/openngc';
import { createCatalogIndex } from '../catalog/search';
import { catalogPatches } from '../catalog/supplement';
import { limitAltitudeAt } from '../horizon';
import { opticalTrain } from '../optics';
import { arcToHorizonPoints } from '../profile';
import { moonSeparation, targetAltAz } from '../astro';
import type { Site } from '../astro';
import { NOMINAL_FIELD_ARCMIN, compareEntries, fieldOf, framingScore, nightContext, percentOfFrame, planTonight, planTrainFor, sizeScore } from './index';
import type { PlanEntry, PlanTarget, PlanTrain, TonightInput } from './index';
import { CLASS_CAP_FROM_PLACE, CLASS_CAP_MIN_PLACES, CLASS_PROMOTION_MARGIN, CLASS_PROMOTION_MIN_FRACTION, CLASS_SHARE_CAP, HIDDEN_LEADING, canReachAltitude, capClassShare, precessionMargin, rankTargets, screenTargets } from './rank';
import type { RankInput } from './rank';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));
const index = createCatalogIndex(parseExtract(raw).objects, starterTargets, catalogPatches);
const catalog: readonly PlanTarget[] = index.targets;

const phoenix: Site = { latitude: 33.5, longitude: -112, elevationM: 400 };
const DATE = '2026-11-14';

// About 30 x 20 arcmin.
const narrow: PlanTrain = {
  kind: 'optical',
  name: 'narrow',
  optics: opticalTrain({ focalLengthMm: 2800, apertureMm: 280 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
// About 154 x 103 arcmin.
const wide: PlanTrain = {
  kind: 'optical',
  name: 'wide',
  optics: opticalTrain({ focalLengthMm: 540, apertureMm: 280 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
const smart: PlanTrain = { kind: 'smart', name: 'smart', optics: null };

const rank = (over: Partial<RankInput> = {}) =>
  rankTargets({ site: phoenix, horizon: null, minAltitude: 30, date: DATE, train: narrow, targets: catalog, ...over });

/** Seeded generator: the same sample every run. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sample = (n: number, seed: number): PlanTarget[] => {
  const r = mulberry32(seed);
  const pool = [...catalog];
  const out: PlanTarget[] = [];
  while (out.length < n) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};

describe('one scoring engine: the curated 25', () => {
  const input: TonightInput = { site: phoenix, horizon: null, minAltitude: 20, date: DATE, train: narrow, targets: starterTargets };

  it('rankTargets over the curated 25 gives planTonight\'s entries (the list is mixed by class, so compared in score order), with nothing screened out', () => {
    const plan = planTonight(input);
    const ranked = rankTargets({ ...input, minFramePercent: 0, includeTooLarge: true });
    expect([...ranked.entries, ...ranked.planets].sort(compareEntries)).toEqual(plan.entries.filter((e) => e.usableMinutes > 0));
    expect(ranked.night).toEqual(plan.night);
  });

  it('matches an independent calculation straight from the astro functions', () => {
    const plan = planTonight(input);
    const start = plan.night.start as Date;
    const end = plan.night.end as Date;
    for (const t of starterTargets) {
      const e = plan.entries.find((x) => x.id === t.id)!;
      // Sample the night at the plan's own 5 minute step.
      let best = { alt: -91, time: start };
      const step = 5 * 60000;
      const ups: boolean[] = [];
      for (let ms = start.getTime(); ; ms += step) {
        const tt = Math.min(ms, end.getTime());
        const r = targetAltAz(t.raHours, t.decDeg, new Date(tt), phoenix);
        ups.push(r.altitude >= 20);
        if (r.altitude >= 20 && r.altitude > best.alt) best = { alt: r.altitude, time: new Date(tt) };
        if (tt >= end.getTime()) break;
      }
      if (ups.every((u) => !u)) {
        expect(e.usableMinutes).toBe(0);
        continue;
      }
      expect(e.peakAltitude).toBeCloseTo(best.alt, 9);
      expect(e.peakTime.getTime()).toBe(best.time.getTime());
      expect(e.moonSeparation).toBeCloseTo(moonSeparation(t.raHours, t.decDeg, best.time, phoenix), 9);
      // Windows are edge-refined: each sampled-usable instant is inside one, to the second.
      const inWindow = (d: Date) => e.windows.some((w) => d.getTime() >= w.start.getTime() - 1000 && d.getTime() <= w.end.getTime() + 1000);
      expect(inWindow(best.time)).toBe(true);
    }
  });

  it('every window edge sits on the minimum altitude to within a second of sky motion', () => {
    const plan = planTonight(input);
    for (const e of plan.entries.filter((x) => !x.isPlanet)) {
      const t = starterTargets.find((x) => x.id === e.id)!;
      const start = e.windows[0]?.start;
      if (!start || start.getTime() === (plan.night.start as Date).getTime()) continue;
      expect(targetAltAz(t.raHours, t.decDeg, start, phoenix).altitude).toBeGreaterThan(19.99);
      expect(targetAltAz(t.raHours, t.decDeg, start, phoenix).altitude).toBeLessThan(20.05);
    }
  });
});

describe('the screen against brute force', () => {
  const horizon = arcToHorizonPoints([{ startAz: 60, endAz: 140, heightDeg: 45 }]);
  const sites: [string, Site, number, boolean][] = [
    ['Phoenix', phoenix, 30, false],
    ['Phoenix with a wall', phoenix, 20, true],
    ['equator', { latitude: 0, longitude: 10 }, 40, false],
    ['south', { latitude: -33.9, longitude: 151.2 }, 25, true],
    ['far north', { latitude: 60, longitude: 10 }, 15, false],
    ['89 N', { latitude: 89, longitude: 0 }, 10, false],
  ];
  const targets = sample(300, 7);

  it.each(sites)('%s: nothing with usable time is screened out of a random 300', (_n, site, minAltitude, wall) => {
    const input: TonightInput = { site, horizon: wall ? horizon : null, minAltitude, date: DATE, train: wide, targets, includePlanets: false };
    const all = planTonight(input);
    const ctx = nightContext(input);
    expect('sky' in ctx).toBe(true);
    if (!('sky' in ctx)) return;
    const kept = new Set(screenTargets(ctx, targets, { includeTooLarge: true, minFramePercent: 0 }).map((t) => t.id));
    const needed = all.entries.filter((e) => e.usableMinutes > 0);
    expect(needed.filter((e) => !kept.has(e.id)).map((e) => e.id)).toEqual([]);
    // And the screen does drop something on a 300 sample, so it is not trivially keeping everything.
    if (site.latitude !== 0) expect(kept.size).toBeLessThan(targets.length);
  });

  it('the strict zenith-distance rule needs no trigonometry and agrees with the sky', () => {
    expect(canReachAltitude(33.5, -60, 30, 0.5)).toBe(false);
    expect(canReachAltitude(33.5, 33.5, 89, 0.5)).toBe(true);
    expect(canReachAltitude(-33.9, 40, 30, 0.5)).toBe(false);
    expect(canReachAltitude(89, 0, 30, 0.5)).toBe(false);
  });

  it('over the whole catalog the ranked top matches a full plan\'s top', () => {
    const input = { site: phoenix, horizon, minAltitude: 25, date: DATE, train: wide, includePlanets: false };
    // Every usable entry comes back (the limit is above the pool), so the class mix does not cut anything: score order is the plan's.
    const ranked = rankTargets({ ...input, targets: catalog, minFramePercent: 0, includeTooLarge: true, limit: 5000 });
    const full = planTonight({ ...input, targets: catalog });
    expect([...ranked.entries].sort(compareEntries).slice(0, 100).map((e) => e.id)).toEqual(full.entries.slice(0, 100).map((e) => e.id));
  }, 120000);
});

describe('the screen: precession and bad input', () => {
  const one: PlanTarget = { id: 'x', name: 'X', type: 'galaxy', raHours: 0, decDeg: -26.5, sizeArcmin: { major: 30, minor: 20 } };

  it('keeps a target that planTonight finds usable far from 2000 (the margin grows with the years)', () => {
    const input = { site: phoenix, horizon: null, minAltitude: 30.6, date: '2150-09-22', timeZone: 'America/Phoenix', train: narrow, targets: [one], includePlanets: false };
    const plan = planTonight(input);
    expect(plan.entries[0].usableMinutes).toBeGreaterThan(0);
    expect(rankTargets({ ...input, minFramePercent: 0, includeTooLarge: true }).entries.map((e) => e.id)).toEqual(['x']);
  });

  it('precessionMargin is 20 arcsec a year from 2000 plus a floor, either side', () => {
    expect(precessionMargin(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(0.1, 9);
    expect(precessionMargin(new Date(Date.UTC(2100, 0, 1, 12)))).toBeCloseTo(0.1 + (100 * 20) / 3600, 2);
    expect(precessionMargin(new Date(Date.UTC(1900, 0, 1, 12)))).toBeCloseTo(0.1 + (100 * 20) / 3600, 2);
  });

  it.each([
    ['NaN declination', { raHours: 1, decDeg: NaN }],
    ['infinite declination', { raHours: 1, decDeg: Infinity }],
    ['declination past the pole', { raHours: 1, decDeg: 91 }],
    ['NaN right ascension', { raHours: NaN, decDeg: 10 }],
    ['right ascension 24', { raHours: 24, decDeg: 10 }],
  ])('%s throws a RangeError, as planTonight does, instead of dropping the target', (_n, pos) => {
    const bad: PlanTarget = { ...one, ...pos };
    const input = { site: phoenix, horizon: null, minAltitude: 30, date: DATE, train: narrow, targets: [bad], includePlanets: false };
    expect(() => planTonight(input)).toThrow(RangeError);
    expect(() => rankTargets(input)).toThrow(RangeError);
  });
});

describe('the ranking', () => {
  it('returns at most N, 100 by default, as a prefix of a longer list', () => {
    const big = rank({ limit: 400 });
    const dflt = rank();
    expect(dflt.entries).toHaveLength(100);
    expect(rank({ limit: 7 }).entries.map((e) => e.id)).toEqual(big.entries.slice(0, 7).map((e) => e.id));
    expect(big.entries.length).toBeLessThanOrEqual(400);
    expect(() => rank({ limit: 0 })).toThrow(RangeError);
    expect(() => rank({ limit: 2.5 })).toThrow(RangeError);
    expect(() => rank({ minFramePercent: -1 })).toThrow(RangeError);
  });

  it('is deterministic and does not depend on the order of the input', () => {
    const a = rank({ limit: 50 });
    const b = rank({ limit: 50 });
    const shuffled = [...catalog].reverse();
    const c = rank({ limit: 50, targets: shuffled });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(c.entries.map((e) => e.id)).toEqual(a.entries.map((e) => e.id));
  });

  it('orders by score within each class, never puts a target that does not fit above one that does, and lists only usable targets', () => {
    const r = rank({ limit: 5000, includeTooLarge: true });
    const sorted = [...r.entries].sort(compareEntries);
    expect(sorted).toHaveLength(r.entries.length);
    for (let i = 1; i < sorted.length; i++) {
      const [p, q] = [sorted[i - 1], sorted[i]];
      const missP = p.fit === 'too-large' ? 1 : 0;
      const missQ = q.fit === 'too-large' ? 1 : 0;
      expect(missP).toBeLessThanOrEqual(missQ);
      if (missP === missQ) expect(p.score.total).toBeGreaterThanOrEqual(q.score.total);
    }
    expect(r.entries.every((e) => e.usableMinutes > 0)).toBe(true);
    expect(r.counts.input).toBe(catalog.length);
    expect(r.counts.scored).toBeLessThan(catalog.length);
  });

  it('gives every result a reason built by the one code path: window hours, the Moon, and the frame share when it fits', () => {
    const r = rank();
    for (const e of r.entries) {
      expect(e.why).toMatch(/^Clear of .* for \d+\.\d h\./);
      expect(e.why).toMatch(/Moon (up|down) at the peak\.$/);
      expect(e.why.length).toBeGreaterThan(20);
      if (e.fit === 'fits') expect(e.why).toMatch(/fits the frame \(\d+%\)/i);
      expect(e.peakAltitude).toBeGreaterThanOrEqual(30 - 1e-9);
    }
  });

  it('with no astronomical night returns nothing', () => {
    const r = rank({ site: { latitude: 60, longitude: 10 }, date: '2026-06-21' });
    expect(r.night.kind).toBe('none');
    expect(r.entries).toEqual([]);
  });
});

describe('sites', () => {
  it('horizon zones are respected: every window instant of every result is above the limit', () => {
    const horizon = arcToHorizonPoints([{ startAz: 30, endAz: 210, heightDeg: 55 }]);
    const r = rank({ horizon, minAltitude: 20, limit: 60 });
    expect(r.horizonSet).toBe(true);
    expect(r.entries.length).toBeGreaterThan(0);
    for (const e of r.entries) {
      const t = catalog.find((x) => x.id === e.id);
      if (!t) continue; // a planet
      for (const w of e.windows) {
        for (const f of [0.02, 0.5, 0.98]) {
          const at = new Date(w.start.getTime() + f * (w.end.getTime() - w.start.getTime()));
          const p = targetAltAz(t.raHours, t.decDeg, at, phoenix);
          expect(p.altitude).toBeGreaterThanOrEqual(limitAltitudeAt(horizon, p.azimuth, 20) - 0.05);
        }
      }
    }
    // The wall costs usable time: fewer hours than with a flat horizon for the same list.
    const flat = rank({ minAltitude: 20, limit: 60 });
    expect(r.entries[0].usableMinutes).toBeLessThanOrEqual(flat.entries[0].usableMinutes + 1e-6);
  });

  it('an equatorial site reaches declinations on both sides', () => {
    const r = rank({ site: { latitude: 0, longitude: 10 }, minAltitude: 40, limit: 400, minFramePercent: 0, includeTooLarge: true });
    const decs = r.entries.filter((e) => e.source.kind === 'fixed').map((e) => (e.source as { decDeg: number }).decDeg);
    expect(Math.min(...decs)).toBeLessThan(-30);
    expect(Math.max(...decs)).toBeGreaterThan(30);
  });

  it('a polar site (89 N) has a long night and only objects near the pole\'s sky: nothing below the minimum altitude', () => {
    const r = rank({ site: { latitude: 89, longitude: 0 }, minAltitude: 20, limit: 400, minFramePercent: 0, includeTooLarge: true });
    expect(r.night.kind).toBe('normal');
    expect(r.entries.length).toBeGreaterThan(0);
    for (const e of r.entries) {
      if (e.source.kind === 'fixed') expect((e.source as { decDeg: number }).decDeg).toBeGreaterThan(19);
      expect(e.peakAltitude).toBeGreaterThanOrEqual(20 - 1e-9);
    }
  });

  it('a southern site ranks southern objects and none that never rise', () => {
    const r = rank({ site: { latitude: -33.9, longitude: 151.2 }, timeZone: 'Australia/Sydney', date: '2026-05-15', train: wide, minAltitude: 30, limit: 100 });
    expect(r.entries.length).toBe(100);
    expect(r.entries.some((e) => e.id === 'ngc5139')).toBe(true);
    for (const e of r.entries) {
      if (e.source.kind === 'fixed') expect((e.source as { decDeg: number }).decDeg).toBeLessThan(90 - 30 - 33.9 + 90 - 0.01);
    }
    expect(r.entries.some((e) => e.id === 'm81')).toBe(false);
  });
});

describe('the size band', () => {
  const at = { raHours: 4.5, decDeg: 33.5, type: 'nebula' };
  const objects: PlanTarget[] = [
    { id: 'speck', name: 'Speck', sizeArcmin: { major: 0.5, minor: 0.5 }, ...at },
    { id: 'mid', name: 'Mid', sizeArcmin: { major: 10, minor: 8 }, ...at },
    { id: 'huge', name: 'Huge', sizeArcmin: { major: 80, minor: 60 }, ...at },
    { id: 'nosize', name: 'No size', ...at },
  ];
  const ids = (r: ReturnType<typeof rank>) => r.entries.map((e) => e.id).sort();
  const base = { targets: objects, includePlanets: false, minAltitude: 20 };

  it('drops specks and (unless asked) too-large targets, keeps unknown sizes', () => {
    expect(ids(rank({ ...base }))).toEqual(['mid', 'nosize']);
  });

  it('keeps too-large targets when asked, and specks with a zero floor; the too-large ones rank last', () => {
    const r = rank({ ...base, includeTooLarge: true, minFramePercent: 0 });
    expect(ids(r)).toEqual(['huge', 'mid', 'nosize', 'speck']);
    expect(r.entries[r.entries.length - 1].id).toBe('huge');
  });

  it('reports the percent of the frame, the larger of the two sides\' shares, and nothing for an unknown size', () => {
    const r = rank({ ...base });
    const o = narrow.optics!;
    const long = Math.max(o.fovWidthArcmin!, o.fovHeightArcmin!);
    const short = Math.min(o.fovWidthArcmin!, o.fovHeightArcmin!);
    expect(r.entries.find((e) => e.id === 'mid')!.percentOfFrame).toBeCloseTo(Math.max(10 / long, 8 / short) * 100, 9);
    expect(r.entries.find((e) => e.id === 'nosize')!.percentOfFrame).toBeNull();
    expect(r.entries.find((e) => e.id === 'nosize')!.fit).toBe('unknown');
  });

  it('judges a smart scope against the nominal field: no too-large screen, the speck is still too small', () => {
    // 0.5 arcmin is 0.7 percent of the 76 arcmin nominal field, under the 3 percent floor; 80 arcmin is over it but fit is not computed.
    expect(ids(rank({ ...base, train: smart }))).toEqual(['huge', 'mid', 'nosize']);
    expect(ids(rank({ ...base, train: smart, minFramePercent: 0 }))).toEqual(['huge', 'mid', 'nosize', 'speck']);
  });

  it('reports what the band hid, with the brightest first: M31 at 540 mm, Omega Centauri at 2000 mm', () => {
    const f540: PlanTrain = { kind: 'optical', name: '540', optics: opticalTrain({ focalLengthMm: 540, apertureMm: 80 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }) };
    const f2000: PlanTrain = { kind: 'optical', name: '2000', optics: opticalTrain({ focalLengthMm: 2000, apertureMm: 200 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }) };
    const a = rank({ train: f540, minAltitude: 30, limit: 1000 });
    expect(a.counts.tooLarge).toBeGreaterThan(0);
    expect(a.hidden.tooLarge.map((h) => h.id)).toContain('m31');
    expect(a.hidden.tooLarge.length).toBeLessThanOrEqual(HIDDEN_LEADING);
    expect(a.entries.some((e) => e.id === 'm31')).toBe(false);
    expect(a.counts.tooSmall).toBeGreaterThan(0);
    expect(a.hidden.tooSmall.length).toBe(HIDDEN_LEADING);
    // With them asked for, nothing is hidden for size.
    const all = rank({ train: f540, minAltitude: 30, limit: 1000, includeTooLarge: true, minFramePercent: 0 });
    expect(all.counts).toMatchObject({ tooLarge: 0, tooSmall: 0 });
    expect(all.hidden).toEqual({ tooLarge: [], tooSmall: [] });
    // Omega Centauri is 27 arcmin on a 2000 mm frame of 40 x 27 arcmin: it does not fit.
    const south = { site: { latitude: -40, longitude: 175 }, timeZone: 'Pacific/Auckland', date: '2027-06-15', train: f2000, minAltitude: 30, limit: 5000 };
    const b = rank(south);
    const withLarge = rank({ ...south, includeTooLarge: true });
    const largeIds = withLarge.entries.filter((e) => e.fit === 'too-large').map((e) => e.id);
    expect(largeIds).toContain('ngc5139');
    // The count is of what the screen lets through (it may be up), so it can exceed the ones that turn out to have a usable window.
    expect(b.counts.tooLarge).toBeGreaterThanOrEqual(largeIds.length);
    expect(b.counts.tooLarge).toBeLessThanOrEqual(largeIds.length + 3);
    expect(b.entries.some((e) => e.id === 'ngc5139')).toBe(false);
    const mags = b.hidden.tooLarge.map((h) => catalog.find((t) => t.id === h.id)!.mag ?? Infinity);
    expect(mags).toEqual([...mags].sort((x, y) => x - y));
  });
});

describe('brightness in the ranking', () => {
  it('ranks the brighter of two otherwise equal targets first, never hides the unknown, and says "computed"', () => {
    const at = { raHours: 4.5, decDeg: 33.5, type: 'nebula', sizeArcmin: { major: 10, minor: 8 } };
    const targets: PlanTarget[] = [
      { id: 'faint', name: 'Faint', mag: 12, surfaceBrightness: 24, sbComputed: true, ...at },
      { id: 'unknown', name: 'Unknown', ...at },
      { id: 'bright', name: 'Bright', mag: 4, surfaceBrightness: 19, sbComputed: true, ...at },
    ];
    const r = rank({ targets, includePlanets: false });
    expect(r.entries.map((e) => e.id)).toEqual(['bright', 'unknown', 'faint']);
    const [bright, unknown] = r.entries;
    expect(bright.sbComputed).toBe(true);
    expect(bright.why).toContain('SB 19.0 (computed)');
    expect(unknown.score.brightness).toBe(0);
    expect(unknown.surfaceBrightness).toBeNull();
    expect(unknown.why).not.toMatch(/SB|mag /);
  });

  it('gives the curated showpieces the photometry of the catalog object each stands for', () => {
    const byId = (id: string) => catalog.find((t) => t.id === id)!;
    expect(byId('m31')).toMatchObject({ mag: 3.44, surfaceBrightness: 23.63 });
    expect(byId('m31').sbComputed).toBeUndefined();
    expect(byId('m42')).toMatchObject({ mag: 4, surfaceBrightness: 21.96, sbComputed: true });
    expect(byId('m33').mag).toBeCloseTo(5.79, 2);
    // The four the extract itself has no magnitude for stay neutral.
    expect(starterTargets.filter((t) => catalog.find((c) => c.id === t.id)!.mag === undefined).map((t) => t.id)).toEqual(['ic410', 'ngc1977', 'ngc2174', 'ngc2359']);
  });

  it('scores the curated 25 for brightness now that they carry photometry; planTonight and rankTargets still agree', () => {
    const input: TonightInput = { site: phoenix, horizon: null, minAltitude: 20, date: DATE, train: narrow, targets: index.targets.filter((t) => t.curated) };
    const plan = planTonight(input);
    expect(plan.entries.filter((e) => !e.isPlanet).some((e) => e.score.brightness !== 0)).toBe(true);
    const ranked = rankTargets({ ...input, minFramePercent: 0, includeTooLarge: true });
    expect([...ranked.entries, ...ranked.planets].sort(compareEntries)).toEqual(plan.entries.filter((e) => e.usableMinutes > 0));
  });
});

describe('framing', () => {
  it('is best from 20 to 70 percent of the frame, falls to the 3 percent floor, and is neutral when unknown', () => {
    expect(framingScore(null)).toBe(0);
    expect(framingScore(20)).toBe(10);
    expect(framingScore(45)).toBe(10);
    expect(framingScore(70)).toBe(10);
    expect(framingScore(3)).toBeCloseTo(-25, 9);
    expect(framingScore(100)).toBeCloseTo(0, 9);
    expect(framingScore(4)).toBeLessThan(framingScore(8));
    expect(framingScore(8)).toBeLessThan(framingScore(19));
    expect(framingScore(85)).toBeLessThan(10);
  });

  it('stays inside its documented range -25..+10, also under the 3 percent floor', () => {
    for (const p of [0, 0.5, 1, 2.9, 3, 10, 50, 100, 150, 1000]) {
      expect(framingScore(p)).toBeGreaterThanOrEqual(-25);
      expect(framingScore(p)).toBeLessThanOrEqual(10);
    }
    expect(framingScore(0)).toBe(-25);
  });

  it('is the larger of the major axis over the long side and the minor axis over the short side', () => {
    // A round 95 arcmin object on a 150 x 100 frame is 63 percent of the long side but 95 percent of the short one.
    const round = percentOfFrame(wide, { sizeArcmin: { major: 95, minor: 95 } })!;
    const w = wide.optics!;
    expect(round).toBeCloseTo((95 / Math.min(w.fovWidthArcmin!, w.fovHeightArcmin!)) * 100, 9);
    expect(round).toBeGreaterThan((95 / Math.max(w.fovWidthArcmin!, w.fovHeightArcmin!)) * 100);
    expect(percentOfFrame(wide, { sizeArcmin: { major: 30, minor: 5 } })).toBeCloseTo((30 / Math.max(w.fovWidthArcmin!, w.fovHeightArcmin!)) * 100, 9);
  });

  it('a 6 arcmin cluster at 4 percent does not tie with M33 at 42 percent', () => {
    const at = { raHours: 1.56, decDeg: 33.5, type: 'open-cluster' };
    const targets: PlanTarget[] = [
      { id: 'small', name: 'Small', sizeArcmin: { major: 6, minor: 6 }, ...at },
      { id: 'big', name: 'Big', sizeArcmin: { major: 62, minor: 36 }, ...at },
    ];
    const r = rank({ targets, train: wide, includePlanets: false, minFramePercent: 0 });
    expect(r.entries.map((e) => e.id)).toEqual(['big', 'small']);
    expect(r.entries[0].score.total).toBeGreaterThan(r.entries[1].score.total);
    expect(r.entries[1].score.framing).toBeLessThan(-15);
  });
});

describe('a train without a field of its own', () => {
  it('is framed against the nominal smart-scope field, flagged nominal; a train with optics keeps its own', () => {
    expect(NOMINAL_FIELD_ARCMIN).toEqual({ long: 76.2, short: 42.6 });
    expect(fieldOf(smart)).toEqual({ long: 76.2, short: 42.6, nominal: true });
    const noField: PlanTrain = { kind: 'optical', name: 'partial', optics: opticalTrain({ focalLengthMm: 500 }, {}) };
    expect(fieldOf(noField).nominal).toBe(true);
    const o = wide.optics!;
    expect(fieldOf(wide)).toEqual({ long: Math.max(o.fovWidthArcmin!, o.fovHeightArcmin!), short: Math.min(o.fovWidthArcmin!, o.fovHeightArcmin!), nominal: false });
    expect(percentOfFrame(smart, { sizeArcmin: { major: 38.1, minor: 10 } })).toBeCloseTo(50, 9);
  });

  it('a smart scope whose stored profile gives a field uses it, not the nominal one', () => {
    const profile = {
      equipment: { scopes: [], accessories: [], cameras: [], filters: [], smartScopes: [{ id: 'sm', name: 'Smart', mountMode: 'eq', focalLengthMm: 250, pixelSizeUm: 2.9, sensorWidthPx: 1920, sensorHeightPx: 1080 }] },
    } as unknown as Parameters<typeof planTrainFor>[0];
    const t = planTrainFor(profile, { kind: 'smart', id: 't', name: 'Smart', smartScopeId: 'sm' });
    expect(t.kind).toBe('smart');
    expect(fieldOf(t).nominal).toBe(false);
    expect(fieldOf(t).long).toBeCloseTo((206.264806 * 2.9 * 1920) / 250 / 60, 6);
    const bare = {
      equipment: { scopes: [], accessories: [], cameras: [], filters: [], smartScopes: [{ id: 'sm', name: 'Smart', mountMode: 'eq' }] },
    } as unknown as Parameters<typeof planTrainFor>[0];
    expect(fieldOf(planTrainFor(bare, { kind: 'smart', id: 't', name: 'Smart', smartScopeId: 'sm' })).nominal).toBe(true);
  });

  it('adds a size term, from absolute size, only on a nominal field: 0 at 3 arcmin, 5 at 60, never on real optics', () => {
    expect(sizeScore(3, true)).toBe(0);
    expect(sizeScore(1, true)).toBe(0);
    expect(sizeScore(60, true)).toBeCloseTo(5, 9);
    expect(sizeScore(500, true)).toBeCloseTo(5, 9);
    expect(sizeScore(10, true)).toBeLessThan(sizeScore(30, true));
    expect(sizeScore(null, true)).toBe(0);
    expect(sizeScore(60, false)).toBe(0);
    const at = { raHours: 4.5, decDeg: 33.5, type: 'nebula', mag: 8 };
    const targets: PlanTarget[] = [
      { id: 'small', name: 'Small', sizeArcmin: { major: 4, minor: 4 }, ...at },
      { id: 'big', name: 'Big', sizeArcmin: { major: 50, minor: 40 }, ...at },
    ];
    const s = rank({ targets, train: smart, includePlanets: false }).entries;
    expect(s.map((e) => e.id)).toEqual(['big', 'small']);
    expect(s[0].score.framing).toBe(0);
    expect(s[0].score.size).toBeGreaterThan(s[1].score.size);
    const w = rank({ targets, train: wide, includePlanets: false, minFramePercent: 0 }).entries;
    expect(w.every((e) => e.score.size === 0)).toBe(true);
  });
});

describe('the class share cap', () => {
  const entry = (id: string, type: string, total: number): PlanEntry => ({ id, type, name: id, usableMinutes: 100, fit: 'fits', score: { total } } as unknown as PlanEntry);
  const ids = (es: readonly PlanEntry[]): string[] => es.map((e) => e.id);
  const many = (type: string, prefix: string, n: number, top: number, step = 1): PlanEntry[] => Array.from({ length: n }, (_, i) => entry(`${prefix}${i}`, type, top - i * step));
  const byScore = (es: PlanEntry[]): PlanEntry[] => es.sort((a, b) => b.score.total - a.score.total);
  const MIX = ['galaxy', 'open-cluster', 'nebula'];
  const count = (es: readonly PlanEntry[], type: string): number => es.filter((e) => e.type === type).length;

  it('names its constants', () => {
    expect(CLASS_SHARE_CAP).toBe(0.4);
    expect(CLASS_CAP_MIN_PLACES).toBe(2);
    expect(CLASS_CAP_FROM_PLACE).toBe(5);
    expect(Math.floor(CLASS_SHARE_CAP * CLASS_CAP_FROM_PLACE)).toBe(CLASS_CAP_MIN_PLACES);
    expect(CLASS_PROMOTION_MARGIN).toBe(15);
    expect(CLASS_PROMOTION_MIN_FRACTION).toBe(0.6);
  });

  it('does not hand the first places out one per class: before the cap applies the order is the score order', () => {
    const sorted = byScore([...many('galaxy', 'g', 30, 100, 0.1), ...many('open-cluster', 'c', 5, 95, 0.1), ...many('planet', 'p', 2, 94, 0.1)]);
    expect(ids(capClassShare(sorted, CLASS_CAP_FROM_PLACE - 1))).toEqual(ids(sorted.slice(0, CLASS_CAP_FROM_PLACE - 1)));
  });

  it('holds a deep-sky class to max(2, 40%) of every prefix from 10 (the places before the cap applies went by score alone), while others have candidates near its score', () => {
    const sorted = byScore([...many('galaxy', 'g', 30, 100, 0.2), ...many('open-cluster', 'c', 10, 96, 0.2), ...many('nebula', 'n', 10, 95, 0.2)]);
    const out = capClassShare(sorted, 20);
    expect(out).toHaveLength(20);
    for (let m = 10; m <= out.length; m++) {
      for (const type of MIX) expect(count(out.slice(0, m), type)).toBeLessThanOrEqual(Math.max(CLASS_CAP_MIN_PLACES, Math.floor(CLASS_SHARE_CAP * m + 1e-9)));
    }
    for (const type of MIX) {
      const mine = ids(out.filter((e) => e.type === type));
      expect(mine).toEqual(ids(sorted.filter((e) => e.type === type)).slice(0, mine.length));
    }
  });

  it('leaves the better entry in place when the class under its cap scores far more than the margin below it', () => {
    const sorted = byScore([...many('galaxy', 'g', 30, 100, 0.1), ...many('open-cluster', 'c', 5, 100 - 2 * CLASS_PROMOTION_MARGIN)]);
    expect(capClassShare(sorted, 20).every((e) => e.type === 'galaxy')).toBe(true);
  });

  it('promotes an entry of a class under its cap that is within the margin of the entry it displaces', () => {
    const sorted = byScore([...many('galaxy', 'g', 30, 100, 0.1), ...many('open-cluster', 'c', 5, 100 - CLASS_PROMOTION_MARGIN + 0.5, 0.1)]);
    const out = capClassShare(sorted, 10);
    expect(count(out, 'open-cluster')).toBe(4);
    // Whatever is promoted is within the margin of the best entry left out at that place.
    out.forEach((e, i) => {
      const left = sorted.filter((x) => !out.slice(0, i + 1).includes(x));
      expect(left[0].score.total - e.score.total).toBeLessThanOrEqual(CLASS_PROMOTION_MARGIN);
    });
  });

  it('does not promote an entry under the minimum fraction of the night\'s best, even within the margin of the entry it displaces', () => {
    const below = byScore([entry('top', 'nebula', 100), ...many('galaxy', 'g', 30, 62, 0.1), ...many('open-cluster', 'c', 3, 100 * CLASS_PROMOTION_MIN_FRACTION - 1)]);
    expect(count(capClassShare(below, 15), 'open-cluster')).toBe(0);
    const above = byScore([entry('top', 'nebula', 100), ...many('galaxy', 'g', 30, 62, 0.1), ...many('open-cluster', 'c', 3, 100 * CLASS_PROMOTION_MIN_FRACTION + 1)]);
    expect(count(capClassShare(above, 15), 'open-cluster')).toBeGreaterThan(0);
  });

  it('the "other" bucket takes no reserved place and is never promoted: it comes where its score puts it, and does not count toward the mix', () => {
    const planets = [entry('mars', 'planet', 70), entry('m40', 'double-star', 60)];
    const sorted = byScore([...many('galaxy', 'g', 30, 100, 0.2), ...many('open-cluster', 'c', 10, 96, 0.2), ...planets]);
    const out = capClassShare(sorted, 40);
    expect(ids(out.slice(0, 10))).not.toContain('mars');
    expect(ids(out.slice(0, 10))).not.toContain('m40');
    // Never ahead of a higher-scoring entry: once picked, nothing better is left behind it.
    out.forEach((e, i) => {
      if (e.type === 'planet' || e.type === 'double-star') {
        const left = sorted.filter((x) => !out.slice(0, i + 1).includes(x));
        expect(Math.max(...left.map((x) => x.score.total))).toBeLessThanOrEqual(e.score.total);
      }
    });
    // And a strong planet is not held back by a class cap: it takes the place its score earns.
    const strong = byScore([...many('galaxy', 'g', 30, 100, 0.2), entry('jupiter', 'planet', 99.7)]);
    expect(ids(capClassShare(strong, 10)).indexOf('jupiter')).toBeLessThan(3);
  });

  it('returns what there is when the list is shorter than the limit', () => {
    const sorted = [...many('galaxy', 'g', 3, 90), ...many('nebula', 'n', 1, 80)];
    expect(capClassShare(sorted, 100)).toHaveLength(4);
    expect(capClassShare([], 10)).toEqual([]);
  });
});

describe('non-imaging objects (double stars) are not ranked unless asked', () => {
  const m40 = catalog.find((t) => t.id === 'm40') as PlanTarget;
  const bright: PlanTarget = { ...m40, id: 'dbl', name: 'Bright double', type: 'double-star', raHours: 21, decDeg: 34 };
  const opts = { targets: [bright], minFramePercent: 0, minAltitude: 20, includePlanets: false, limit: 100 } as const;

  it('M40 is a double star in the catalog, and it stays searchable', () => {
    expect(m40.type).toBe('double-star');
    expect(index.search({ text: 'M40' }).hits[0].target.id).toBe('m40');
  });

  it('a double star up tonight is left out of the list by default and comes back with includeNonImaging', () => {
    expect(rank({ ...opts, date: '2026-09-20' }).entries.map((e) => e.id)).toEqual([]);
    expect(rank({ ...opts, date: '2026-09-20', includeNonImaging: true }).entries.map((e) => e.id)).toEqual(['dbl']);
  });

  it('over the whole catalog no double star is in the list on any of 6 dates', () => {
    for (const date of ['2026-11-14', '2027-02-05', '2027-04-15', '2027-07-10', '2027-09-04', '2027-12-10']) {
      const types = rank({ date, train: smart }).entries.map((e) => e.type);
      expect(types).not.toContain('double-star');
    }
  });
});

describe('planets and the targets that do not fit sit beside the list, not inside the cut', () => {
  it('every planet that is up is returned in `planets`, even when 100 catalog objects score higher', () => {
    const r = rank({ date: '2026-11-13', minAltitude: 20, train: smart });
    expect(r.entries).toHaveLength(100);
    expect(r.entries.some((e) => e.isPlanet)).toBe(false);
    expect(r.planets.length).toBeGreaterThan(0);
    expect(r.planets.every((e) => e.isPlanet && e.usableMinutes > 0)).toBe(true);
    const lowest = Math.min(...r.entries.map((e) => e.score.total));
    expect(r.planets.some((e) => e.score.total < lowest)).toBe(true); // they would have been cut
    const ids = r.planets.map((e) => e.id);
    for (const id of ['planet-mars', 'planet-jupiter', 'planet-saturn']) expect(ids).toContain(id);
  });

  it('includePlanets false leaves `planets` empty', () => {
    expect(rank({ includePlanets: false }).planets).toEqual([]);
  });

  it('includeNoFit scores what the size band hid into `noFit`, best first, and leaves `entries` as they were', () => {
    const base = rank({ train: narrow, date: '2026-11-13', minAltitude: 20 });
    const wide2 = rank({ train: narrow, date: '2026-11-13', minAltitude: 20, includeNoFit: true });
    expect(base.noFit).toEqual([]);
    expect(wide2.entries).toEqual(base.entries);
    expect(wide2.counts.tooLarge).toBe(base.counts.tooLarge);
    expect(wide2.noFit.length).toBeGreaterThan(0);
    expect(wide2.noFit.some((e) => e.fit === 'too-large')).toBe(true);
    const totals = wide2.noFit.map((e) => e.score.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
    expect(wide2.noFit.every((e) => !base.entries.some((b) => b.id === e.id))).toBe(true);
  });

  it('a hidden-name list never repeats a display name', () => {
    const veil = (id: string): PlanTarget => ({ ...(catalog.find((t) => t.id === 'm42') as PlanTarget), id, name: id, displayName: 'Eastern Veil' });
    const r = rank({ targets: [veil('a'), veil('b'), veil('c')], train: narrow, includePlanets: false, minFramePercent: 0 });
    expect(new Set(r.hidden.tooLarge.map((h) => h.name)).size).toBe(r.hidden.tooLarge.length);
  });
});

describe('ranking one type over the whole catalog (Best [type] tonight)', () => {
  const opts = { train: wide, date: '2026-11-13', minAltitude: 20 } as const;
  const mixed = rank({ ...opts });
  const byType = (t: string) => catalog.filter((x) => x.type === t);

  it('typeCounts is, per catalog type, how many targets are up and fit the frame: the same whatever types are asked for', () => {
    const only = rank({ ...opts, types: ['globular-cluster'] });
    expect(only.typeCounts).toEqual(mixed.typeCounts);
    // Direct count: every catalog object of the type, scored alone by the planner's own single-target path.
    const direct = rankTargets({ site: phoenix, horizon: null, minAltitude: 20, date: '2026-11-13', train: wide, targets: byType('globular-cluster'), limit: 1000, includePlanets: false });
    expect(mixed.typeCounts['globular-cluster']).toBe(direct.entries.length);
    expect(direct.entries.length).toBeGreaterThan(5);
    expect(mixed.typeCounts['double-star']).toBeUndefined();
  });

  it('a type with fewer than 100 objects lists all of them that are up, best to worst, nothing of another type', () => {
    const r = rank({ ...opts, types: ['planetary-nebula'] });
    expect(r.entries.length).toBe(r.typeCounts['planetary-nebula']);
    expect(r.entries.length).toBeLessThan(43 + 1);
    expect(r.entries.every((e) => e.type === 'planetary-nebula')).toBe(true);
    const totals = r.entries.map((e) => e.score.total);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it('the best of a type that the mixed top 100 leaves out is still ranked first when the type is asked for', () => {
    // A type with enough up objects that the mixed list drops some of them.
    const missing = Object.keys(mixed.typeCounts).flatMap((type) => {
      const inMixed = new Set(mixed.entries.filter((e) => e.type === type).map((e) => e.id));
      const asked = rank({ ...opts, types: [type] });
      const best = asked.entries[0];
      return best !== undefined && !inMixed.has(best.id) ? [{ type, best, asked }] : [];
    });
    expect(missing.length).toBeGreaterThan(0);
    for (const { type, best, asked } of missing) {
      expect(asked.entries.every((e) => e.type === type)).toBe(true);
      expect(asked.entries[0].score.total).toBe(Math.max(...asked.entries.map((e) => e.score.total)));
      expect(mixed.entries.some((e) => e.id === best.id)).toBe(false);
    }
  });

  it('several types are one group (Nebulae = nebula + dark-nebula), and the cut is 100 within the group', () => {
    const r = rank({ ...opts, types: ['galaxy'] });
    expect(r.entries).toHaveLength(100); // galaxies: far more than 100 are up
    expect(r.entries.every((e) => e.type === 'galaxy')).toBe(true);
    const both = rank({ ...opts, types: ['nebula', 'dark-nebula'] });
    expect(both.entries.every((e) => e.type === 'nebula' || e.type === 'dark-nebula')).toBe(true);
    expect(both.entries.length).toBe((both.typeCounts.nebula ?? 0) + (both.typeCounts['dark-nebula'] ?? 0));
  });

  it('the hidden counts, names and the do-not-fit list are for the asked type only', () => {
    const base = { train: narrow, date: '2026-11-13', minAltitude: 20, includeNoFit: true } as const;
    const all = rank(base);
    const gal = rank({ ...base, types: ['galaxy'] });
    expect(gal.counts.tooLarge + gal.counts.tooSmall).toBeLessThan(all.counts.tooLarge + all.counts.tooSmall);
    expect(gal.noFit.length).toBeGreaterThan(0);
    expect(gal.noFit.every((e) => e.type === 'galaxy')).toBe(true);
    const names = new Set(byType('galaxy').map((t) => t.displayName ?? t.name));
    expect(gal.hidden.tooLarge.length).toBeGreaterThan(0);
    expect(gal.hidden.tooLarge.every((h) => names.has(h.name))).toBe(true);
    expect(gal.entries.every((e) => e.type === 'galaxy')).toBe(true);
  });

  it('an empty type list ranks no object but still counts them all; no types is the mixed list as before', () => {
    const none = rank({ ...opts, types: [] });
    expect(none.entries).toEqual([]);
    expect(none.typeCounts).toEqual(mixed.typeCounts);
    expect(rank({ ...opts, types: undefined }).entries).toEqual(mixed.entries);
  });
});
