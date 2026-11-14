import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from '../catalog';
import { parseExtract } from '../catalog/openngc';
import { createCatalogIndex } from '../catalog/search';
import { catalogPatches } from '../catalog/supplement';
import { opticalTrain } from '../optics';
import type { Site } from '../astro';
import type { PlanEntry, PlanTarget, PlanTrain } from './index';
import { rankTargets } from './rank';
import type { RankInput } from './rank';

/** "Tonight's best" over the whole catalog, judged on what an imager would want to see in the list. */
const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));
const catalog: readonly PlanTarget[] = createCatalogIndex(parseExtract(raw).objects, starterTargets, catalogPatches).targets;

const phoenix: Site = { latitude: 33.5, longitude: -112, elevationM: 400 };
const camera = { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 };
const refractor: PlanTrain = { kind: 'optical', name: '540/80', optics: opticalTrain({ focalLengthMm: 540, apertureMm: 80 }, camera) };
const longTrain: PlanTrain = { kind: 'optical', name: '2000/200', optics: opticalTrain({ focalLengthMm: 2000, apertureMm: 200 }, camera) };
const smart: PlanTrain = { kind: 'smart', name: 'smart', optics: null };

const top = (over: Partial<RankInput> & Pick<RankInput, 'date' | 'train' | 'minAltitude'>): PlanEntry[] =>
  rankTargets({ site: phoenix, timeZone: 'America/Phoenix', horizon: null, targets: catalog, limit: 100, ...over }).entries;

const share = (entries: readonly PlanEntry[], types: readonly string[]): number => entries.filter((e) => types.includes(e.type)).length / entries.length;
const rankOf = (entries: readonly PlanEntry[], id: string): number => entries.findIndex((e) => e.id === id);
const smallInTop = (entries: readonly PlanEntry[], n: number, percent: number): string[] =>
  entries.slice(0, n).filter((e) => e.percentOfFrame !== null && e.percentOfFrame < percent).map((e) => `${e.name} ${e.percentOfFrame?.toFixed(1)}%`);

describe('tonight\'s best: PHX 2026-11-14, 540 mm / 80 mm, no horizon, min 30', () => {
  const entries = top({ date: '2026-11-14', train: refractor, minAltitude: 30 });

  it('lists NGC 891 in the top 25', () => {
    expect(rankOf(entries, 'ngc891')).toBeGreaterThanOrEqual(0);
    expect(rankOf(entries, 'ngc891')).toBeLessThan(25);
  });

  it('is at most 30 percent open clusters', () => {
    expect(share(entries, ['open-cluster'])).toBeLessThanOrEqual(0.3);
  });

  it('has M33 inside the top 15', () => {
    expect(rankOf(entries, 'm33')).toBeGreaterThanOrEqual(0);
    expect(rankOf(entries, 'm33')).toBeLessThan(15);
  });

  // M31 is 178 x 70 arcmin; this frame is 150 x 100. It does not fit, so by the ranking's rule it is not in the list
  // unless too-large targets are asked for, and then it comes after everything that fits. It leads the ones that do not.
  it('M31 does not fit this frame: out by default, first of the too-large ones when they are asked for', () => {
    expect(rankOf(entries, 'm31')).toBe(-1);
    const all = top({ date: '2026-11-14', train: refractor, minAltitude: 30, includeTooLarge: true, limit: 1000 });
    const tooLarge = all.filter((e) => e.fit === 'too-large');
    expect(tooLarge[0].id).toBe('m31');
    expect(all.slice(0, all.length - tooLarge.length).every((e) => e.fit !== 'too-large')).toBe(true);
  });

  it('has nothing under 6 percent of the frame in the top 20', () => {
    expect(smallInTop(entries, 20, 6)).toEqual([]);
  });
});

describe('tonight\'s best: the other scenarios', () => {
  it('PHX 2027-04-15, 2000 mm: M94 ranks above NGC 5656', () => {
    const entries = top({ date: '2027-04-15', train: longTrain, minAltitude: 30 });
    expect(rankOf(entries, 'ngc4736')).toBeGreaterThanOrEqual(0);
    const small = rankOf(entries, 'ngc5656');
    expect(rankOf(entries, 'ngc4736')).toBeLessThan(10);
    if (small >= 0) expect(rankOf(entries, 'ngc4736')).toBeLessThan(small);
    expect(share(entries, ['open-cluster'])).toBeLessThanOrEqual(0.3);
    expect(smallInTop(entries, 20, 6)).toEqual([]);
  });

  it('PHX 2027-07-10, smart scope, min 20: clusters are at most 35 percent', () => {
    const entries = top({ date: '2027-07-10', train: smart, minAltitude: 20 });
    expect(share(entries, ['open-cluster', 'globular-cluster'])).toBeLessThanOrEqual(0.35);
  });

  it('60 N 2027-01-10, 540 mm, min 40: at most 30 percent open clusters, nothing under 6 percent in the top 20', () => {
    const entries = top({ site: { latitude: 60, longitude: 10, elevationM: 100 }, timeZone: 'Europe/Oslo', date: '2027-01-10', train: refractor, minAltitude: 40 });
    expect(entries.length).toBeGreaterThan(20);
    expect(share(entries, ['open-cluster'])).toBeLessThanOrEqual(0.3);
    expect(smallInTop(entries, 20, 6)).toEqual([]);
  });

  it('40 S 2027-06-15, 2000 mm, min 30: at most 30 percent open clusters, nothing under 6 percent in the top 20', () => {
    const entries = top({ site: { latitude: -40, longitude: 175, elevationM: 50 }, timeZone: 'Pacific/Auckland', date: '2027-06-15', train: longTrain, minAltitude: 30 });
    expect(entries.length).toBeGreaterThan(20);
    expect(share(entries, ['open-cluster'])).toBeLessThanOrEqual(0.3);
    expect(smallInTop(entries, 20, 6)).toEqual([]);
  });

  it('PHX 2026-11-24 (full Moon), 540 mm, min 60: the few that fit are ranked first, clusters no more than their share of what is usable', () => {
    const entries = top({ date: '2026-11-24', train: refractor, minAltitude: 60 });
    const usable = top({ date: '2026-11-24', train: refractor, minAltitude: 60, limit: 5000 });
    // Only 98 of the 193 usable targets are open clusters, so a top 100 cannot avoid many of them; the top 25 can.
    expect(share(entries, ['open-cluster'])).toBeLessThanOrEqual(share(usable, ['open-cluster']));
    expect(share(entries.slice(0, 25), ['open-cluster'])).toBeLessThanOrEqual(0.3);
    // At min 60 only 40 galaxies and 43 nebulae clear the limit, so the 20th place reaches down to M32 at 5.2 percent.
    expect(smallInTop(entries, 20, 5)).toEqual([]);
  });
});
