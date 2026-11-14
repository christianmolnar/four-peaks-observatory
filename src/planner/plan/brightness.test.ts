import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from '../catalog';
import { parseExtract } from '../catalog/openngc';
import { createCatalogIndex } from '../catalog/search';
import { catalogPatches } from '../catalog/supplement';
import { BRIGHTNESS_RANGE, brightnessClass, brightnessScore, fractionBrighter, scoreOfFraction } from './brightness';
import type { BrightnessClass, Photometry } from './brightness';
import { BRIGHTNESS_PERCENTILES } from './brightness-percentiles';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));
const objects = raw.objects as (Photometry & { id: string })[];
const catalog = createCatalogIndex(parseExtract(raw).objects, starterTargets, catalogPatches).targets;
const CLASSES = Object.keys(BRIGHTNESS_PERCENTILES) as BrightnessClass[];

/** The values a class's table is built from: its one measure, for every catalog object that has it. */
function measures(c: BrightnessClass): number[] {
  return objects
    .map((o) => {
      // The galaxy table is the measured surface brightness only; a computed one is ranked against it, not part of it.
      if (c === 'galaxy' && o.sbComputed === true) return null;
      const m = brightnessClass(o);
      return m.class === c || c === 'other' ? (c === 'other' ? (o.mag ?? null) : m.value) : null;
    })
    .filter((v): v is number => v !== null);
}

describe('the percentile tables', () => {
  it.each(CLASSES)('%s: 101 cut points re-derived from the bundled catalog match the committed table', (c) => {
    const sorted = [...measures(c)].sort((a, b) => a - b);
    const cuts = Array.from({ length: 101 }, (_, k) => sorted[Math.round((k * (sorted.length - 1)) / 100)]);
    expect(BRIGHTNESS_PERCENTILES[c].n).toBe(sorted.length);
    expect([...BRIGHTNESS_PERCENTILES[c].cuts]).toEqual(cuts);
  });

  it('every table is sorted brightest (smallest) first and big enough to rank in', () => {
    for (const c of CLASSES) {
      const { cuts, n } = BRIGHTNESS_PERCENTILES[c];
      expect(cuts).toHaveLength(101);
      expect(n).toBeGreaterThan(100);
      for (let k = 1; k < cuts.length; k++) expect(cuts[k]).toBeGreaterThanOrEqual(cuts[k - 1]);
    }
  });
});

describe('scoring by percentile', () => {
  it('maps a share to the same range for every class: +10 in the brightest tenth, 0 at the median, -10 in the faintest tenth', () => {
    expect(BRIGHTNESS_RANGE).toBe(10);
    expect(scoreOfFraction(0)).toBe(10);
    expect(scoreOfFraction(0.1)).toBeCloseTo(10, 9);
    expect(scoreOfFraction(0.5)).toBeCloseTo(0, 9);
    expect(scoreOfFraction(0.9)).toBeCloseTo(-10, 9);
    expect(scoreOfFraction(1)).toBe(-10);
    expect(scoreOfFraction(0.3)).toBeCloseTo(5, 9);
  });

  it('is neutral for an object with no value for its class\'s measure, and brighter never scores lower', () => {
    expect(brightnessScore({})).toBe(0);
    expect(brightnessScore({ type: 'galaxy' })).toBe(0);
    expect(brightnessScore({ type: 'galaxy', mag: 9 })).toBe(0);
    expect(brightnessScore({ type: 'nebula', surfaceBrightness: 18 })).toBe(0);
    for (const c of CLASSES) {
      const { cuts } = BRIGHTNESS_PERCENTILES[c];
      let last = Infinity;
      for (let v = cuts[0] - 1; v <= cuts[100] + 1; v += (cuts[100] - cuts[0] + 2) / 400) {
        const f = fractionBrighter(v, BRIGHTNESS_PERCENTILES[c]);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
        expect(scoreOfFraction(f)).toBeLessThanOrEqual(last + 1e-9);
        last = scoreOfFraction(f);
      }
    }
  });

  it('reads one measure per class: surface brightness for a galaxy, magnitude for a cluster, a nebula or anything else', () => {
    expect(brightnessClass({ type: 'galaxy', surfaceBrightness: 23, mag: 9 })).toEqual({ class: 'galaxy', value: 23 });
    expect(brightnessClass({ type: 'open-cluster', surfaceBrightness: 21, mag: 6 })).toEqual({ class: 'cluster', value: 6 });
    expect(brightnessClass({ type: 'supernova-remnant', surfaceBrightness: 21, mag: 7 })).toEqual({ class: 'nebula', value: 7 });
    expect(brightnessClass({ type: 'planetary-nebula', surfaceBrightness: 19, mag: 9 })).toEqual({ class: 'nebula', value: 9 });
    expect(brightnessClass({ type: 'double-star', mag: 8 })).toEqual({ class: 'other', value: 8 });
  });

  // The point of the method: the same share of every class lands at the top and at the bottom, by construction.
  // Ties in the catalog's rounded numbers blur the edges a little, hence the tolerance (in share of the class).
  const TOLERANCE = 0.04;
  const scored = (c: BrightnessClass): number[] => {
    const type = { galaxy: 'galaxy', cluster: 'open-cluster', nebula: 'nebula', other: 'double-star' }[c];
    return measures(c).map((v) => brightnessScore(c === 'galaxy' ? { type, surfaceBrightness: v } : { type, mag: v }));
  };
  const share = (xs: number[], keep: (s: number) => boolean): number => xs.filter(keep).length / xs.length;

  it.each(CLASSES)('%s: a tenth of the class scores +10, a tenth -10, three tenths are above +5 and the median is 0', (c) => {
    const s = scored(c);
    expect(Math.abs(share(s, (x) => x >= 10 - 1e-9) - 0.1)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(share(s, (x) => x <= -10 + 1e-9) - 0.1)).toBeLessThanOrEqual(TOLERANCE);
    expect(Math.abs(share(s, (x) => x >= 5) - 0.3)).toBeLessThanOrEqual(TOLERANCE);
    const median = [...s].sort((a, b) => a - b)[Math.floor(s.length / 2)];
    expect(Math.abs(median)).toBeLessThanOrEqual(1);
  });

  it('puts the same share at the top in every class (the classes differ by no more than the tolerance)', () => {
    const tops = CLASSES.map((c) => share(scored(c), (x) => x >= 10 - 1e-9));
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(TOLERANCE);
  });
});

describe('the showpiece nebulae score at least their class median (computed surface brightness scored them the faintest)', () => {
  const byId = (id: string) => catalog.find((t) => t.id === id);
  it.each([
    ['m42', 'Orion Nebula'],
    ['m8', 'Lagoon'],
    ['m20', 'Trifid'],
    ['ngc2237', 'Rosette'],
    ['ngc6992', 'Eastern Veil'],
    ['ngc6960', 'Western Veil'],
    ['ngc3372', 'Carina'],
    ['ngc2070', '30 Doradus'],
  ])('%s (%s)', (id) => {
    const t = byId(id);
    expect(t).toBeDefined();
    expect(brightnessScore(t!)).toBeGreaterThanOrEqual(0);
  });
});
