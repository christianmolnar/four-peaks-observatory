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
import { brightnessScore, nightContext, planTonight } from './index';
import type { PlanTarget, PlanTrain, TonightInput } from './index';
import { canReachAltitude, rankTargets, screenTargets } from './rank';
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

  it('rankTargets over the curated 25 gives planTonight\'s entries, in its order, with nothing screened out', () => {
    const plan = planTonight(input);
    const ranked = rankTargets({ ...input, minFramePercent: 0, includeTooLarge: true });
    expect(ranked.entries).toEqual(plan.entries.filter((e) => e.usableMinutes > 0));
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
    expect(canReachAltitude(33.5, -60, 30)).toBe(false);
    expect(canReachAltitude(33.5, 33.5, 89)).toBe(true);
    expect(canReachAltitude(-33.9, 40, 30)).toBe(false);
    expect(canReachAltitude(89, 0, 30)).toBe(false);
  });

  it('over the whole catalog the ranked top matches a full plan\'s top', () => {
    const input = { site: phoenix, horizon, minAltitude: 25, date: DATE, train: wide, includePlanets: false };
    const ranked = rankTargets({ ...input, targets: catalog, minFramePercent: 0, includeTooLarge: true, limit: 100 });
    const full = planTonight({ ...input, targets: catalog });
    expect(ranked.entries.map((e) => e.id)).toEqual(full.entries.slice(0, 100).map((e) => e.id));
  }, 120000);
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

  it('orders by score, never puts a target that does not fit above one that does, and lists only usable targets', () => {
    const r = rank({ limit: 200, includeTooLarge: true });
    for (let i = 1; i < r.entries.length; i++) {
      const [p, q] = [r.entries[i - 1], r.entries[i]];
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

  it('reports the percent of the frame, from the long side, and nothing for an unknown size', () => {
    const r = rank({ ...base });
    expect(r.entries.find((e) => e.id === 'mid')!.percentOfFrame).toBeCloseTo((10 / Math.max(narrow.optics!.fovWidthArcmin!, narrow.optics!.fovHeightArcmin!)) * 100, 9);
    expect(r.entries.find((e) => e.id === 'nosize')!.percentOfFrame).toBeNull();
    expect(r.entries.find((e) => e.id === 'nosize')!.fit).toBe('unknown');
  });

  it('applies no size band for a smart scope', () => {
    expect(ids(rank({ ...base, train: smart }))).toEqual(['huge', 'mid', 'nosize', 'speck']);
  });
});

describe('brightness', () => {
  it('is neutral without data, higher for a brighter surface, and flags a computed value', () => {
    expect(brightnessScore({})).toBe(0);
    expect(brightnessScore({ surfaceBrightness: 19 })).toBe(10);
    expect(brightnessScore({ surfaceBrightness: 26 })).toBe(-10);
    expect(brightnessScore({ surfaceBrightness: 22.5 })).toBeCloseTo(0, 9);
    expect(brightnessScore({ surfaceBrightness: 21 })).toBeGreaterThan(brightnessScore({ surfaceBrightness: 23 }));
    expect(brightnessScore({ mag: 6 })).toBeGreaterThan(brightnessScore({ mag: 13 }));
    // Surface brightness wins over magnitude when both are there.
    expect(brightnessScore({ mag: 6, surfaceBrightness: 26 })).toBe(-10);
  });

  it('ranks the brighter of two otherwise equal targets first, never hides the unknown, and says "computed"', () => {
    const at = { raHours: 4.5, decDeg: 33.5, type: 'galaxy', sizeArcmin: { major: 10, minor: 8 } };
    const targets: PlanTarget[] = [
      { id: 'faint', name: 'Faint', surfaceBrightness: 24, ...at },
      { id: 'unknown', name: 'Unknown', ...at },
      { id: 'bright', name: 'Bright', surfaceBrightness: 20, sbComputed: true, ...at },
    ];
    const r = rank({ targets, includePlanets: false });
    expect(r.entries.map((e) => e.id)).toEqual(['bright', 'unknown', 'faint']);
    const [bright, unknown] = r.entries;
    expect(bright.sbComputed).toBe(true);
    expect(bright.why).toContain('SB 20.0 (computed)');
    expect(unknown.score.brightness).toBe(0);
    expect(unknown.surfaceBrightness).toBeNull();
    expect(unknown.why).not.toMatch(/SB|mag /);
  });

  it('does not change the curated 25, which carry no brightness', () => {
    for (const e of planTonight({ site: phoenix, horizon: null, minAltitude: 20, date: DATE, train: narrow, targets: starterTargets }).entries) {
      expect(e.score.brightness).toBe(0);
    }
  });
});
