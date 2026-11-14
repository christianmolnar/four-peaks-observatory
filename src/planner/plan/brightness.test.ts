import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterTargets } from '../catalog';
import { parseExtract } from '../catalog/openngc';
import { createCatalogIndex } from '../catalog/search';
import { catalogPatches } from '../catalog/supplement';
import { BRIGHTNESS_RANGE, DIFFUSE_SB_FRACTION, DIFFUSE_WEIGHT_LOSS, brightnessClass, brightnessScore, fractionBrighter, galaxyBlend, magnitudeWeight, scoreOfFraction } from './brightness';
import type { BrightnessClass, Photometry } from './brightness';
import { BRIGHTNESS_PERCENTILES } from './brightness-percentiles';

const raw = JSON.parse(readFileSync(join(process.cwd(), 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8'));
type RawObject = Photometry & { id: string; majorArcmin?: number };
const objects = raw.objects as RawObject[];
const catalog = createCatalogIndex(parseExtract(raw).objects, starterTargets, catalogPatches).targets;
const TABLES = Object.keys(BRIGHTNESS_PERCENTILES) as (keyof typeof BRIGHTNESS_PERCENTILES)[];
const CLASSES: BrightnessClass[] = ['galaxy', 'cluster', 'nebula', 'other'];
const photometryOf = (o: RawObject): Photometry => ({ ...o, ...(o.majorArcmin === undefined ? {} : { sizeArcmin: { major: o.majorArcmin } }) });

/** The values a table is built from: for every catalog object that has it. */
function measures(table: keyof typeof BRIGHTNESS_PERCENTILES): number[] {
  const values = objects.map((o): number | null => {
    const p = photometryOf(o);
    switch (table) {
      // The measured surface brightness only; a computed one is ranked against it, not part of it.
      case 'galaxySB': return brightnessClass(p).class === 'galaxy' && o.sbComputed !== true ? (o.surfaceBrightness ?? null) : null;
      case 'galaxyMag': return brightnessClass(p).class === 'galaxy' ? (o.mag ?? null) : null;
      case 'galaxy': return brightnessClass(p).class === 'galaxy' ? galaxyBlend(p) : null;
      case 'other': return o.mag ?? null;
      default: return brightnessClass(p).class === table ? brightnessClass(p).value : null;
    }
  });
  return values.filter((v): v is number => v !== null);
}

describe('the percentile tables', () => {
  it.each(TABLES)('%s: 101 cut points re-derived from the bundled catalog match the committed table', (c) => {
    const sorted = [...measures(c)].sort((a, b) => a - b);
    const cuts = Array.from({ length: 101 }, (_, k) => sorted[Math.round((k * (sorted.length - 1)) / 100)]);
    expect(BRIGHTNESS_PERCENTILES[c].n).toBe(sorted.length);
    expect([...BRIGHTNESS_PERCENTILES[c].cuts]).toEqual(cuts);
  });

  it('every table is sorted brightest (smallest) first and big enough to rank in', () => {
    for (const c of TABLES) {
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

  it('is neutral for an object with no value for its class\'s measure (a galaxy with a magnitude alone is scored on that), and brighter never scores lower', () => {
    expect(brightnessScore({})).toBe(0);
    expect(brightnessScore({ type: 'galaxy' })).toBe(0);
    expect(brightnessScore({ type: 'galaxy', mag: 9 })).toBe(10);
    expect(brightnessScore({ type: 'nebula', surfaceBrightness: 18 })).toBe(0);
    for (const c of TABLES) {
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

  it('reads one measure per class: a galaxy\'s blend, magnitude for a cluster, a nebula or anything else', () => {
    expect(brightnessClass({ type: 'galaxy', surfaceBrightness: 23, mag: 9 }).class).toBe('galaxy');
    expect(brightnessClass({ type: 'open-cluster', surfaceBrightness: 21, mag: 6 })).toEqual({ class: 'cluster', value: 6 });
    expect(brightnessClass({ type: 'supernova-remnant', surfaceBrightness: 21, mag: 7 })).toEqual({ class: 'nebula', value: 7 });
    expect(brightnessClass({ type: 'planetary-nebula', surfaceBrightness: 19, mag: 9 })).toEqual({ class: 'nebula', value: 9 });
    expect(brightnessClass({ type: 'double-star', mag: 8 })).toEqual({ class: 'other', value: 8 });
  });

  it('weighs a galaxy by size: a small one on its surface brightness, a large one on its magnitude, the mean when its size is unknown', () => {
    expect(magnitudeWeight(1)).toBe(0);
    expect(magnitudeWeight(2)).toBeCloseTo(0, 9);
    expect(magnitudeWeight(10)).toBeCloseTo(1, 9);
    expect(magnitudeWeight(60)).toBe(1);
    expect(magnitudeWeight(undefined)).toBe(0.5);
    const sb = fractionBrighter(23, BRIGHTNESS_PERCENTILES.galaxySB);
    const mag = fractionBrighter(9, BRIGHTNESS_PERCENTILES.galaxyMag);
    expect(galaxyBlend({ type: 'galaxy', surfaceBrightness: 23, mag: 9, sizeArcmin: { major: 1 } })).toBeCloseTo(sb, 9);
    expect(galaxyBlend({ type: 'galaxy', surfaceBrightness: 23, mag: 9, sizeArcmin: { major: 20 } })).toBeCloseTo(mag, 9);
    expect(galaxyBlend({ type: 'galaxy', surfaceBrightness: 23, mag: 9 })).toBeCloseTo((sb + mag) / 2, 9);
    expect(galaxyBlend({ type: 'galaxy', surfaceBrightness: 23, sizeArcmin: { major: 20 } })).toBeCloseTo(sb, 9);
    expect(galaxyBlend({ type: 'galaxy', mag: 9 })).toBeCloseTo(mag, 9);
    expect(galaxyBlend({ type: 'galaxy' })).toBeNull();
  });

  it('scores a large, bright, thin galaxy by its light, not by its diluted surface brightness: NGC 891 +10 (was -10), M33 +10 (was -7.6)', () => {
    for (const id of ['ngc891', 'm33']) {
      const t = catalog.find((x) => x.id === id);
      expect(t).toBeDefined();
      expect(brightnessScore(t!)).toBeGreaterThanOrEqual(9);
    }
    // The same two numbers in a small outline are judged on the surface brightness, as before.
    expect(brightnessScore({ type: 'galaxy', mag: 10.01, surfaceBrightness: 24.17, sizeArcmin: { major: 1 } })).toBeLessThanOrEqual(-9);
  });

  it('takes weight off the magnitude share past the 98th percentile of surface brightness, linearly, up to half', () => {
    expect(magnitudeWeight(20, 0.5)).toBe(1);
    expect(magnitudeWeight(20, DIFFUSE_SB_FRACTION)).toBe(1);
    expect(magnitudeWeight(20, 1)).toBeCloseTo(1 - DIFFUSE_WEIGHT_LOSS, 9);
    expect(magnitudeWeight(20, (DIFFUSE_SB_FRACTION + 1) / 2)).toBeCloseTo(1 - DIFFUSE_WEIGHT_LOSS / 2, 9);
    expect(magnitudeWeight(1, 1)).toBe(0);
    // 0.98 of the galaxies are brighter in surface brightness than the cut: it comes from the table, not by hand.
    const sbs = objects.filter((o) => (o.type === 'galaxy' || o.type === 'galaxy-group') && o.surfaceBrightness !== undefined && !o.sbComputed).map((o) => o.surfaceBrightness as number);
    const beyond = sbs.filter((v) => v > BRIGHTNESS_PERCENTILES.galaxySB.cuts[Math.round(DIFFUSE_SB_FRACTION * 100)]).length / sbs.length;
    expect(beyond).toBeLessThanOrEqual(1 - DIFFUSE_SB_FRACTION + 0.005);
  });

  it('does not rate an ultra-diffuse dwarf +10 on its magnitude: Sextans dSph and Leo I stay under +5, while NGC 891, M33, M31, M81 and M101 keep +10', () => {
    for (const id of ['pgc88608', 'ugc5470']) {
      const t = catalog.find((x) => x.id === id);
      expect(t).toBeDefined();
      expect(brightnessScore(t!)).toBeLessThan(5);
    }
    for (const id of ['ngc891', 'm33', 'm31', 'm81', 'm101', 'ngc55', 'ngc300', 'ngc2403', 'ngc5128', 'ngc6946']) {
      const t = catalog.find((x) => x.id === id);
      expect(t).toBeDefined();
      expect(brightnessScore(t!)).toBeGreaterThanOrEqual(9.9);
    }
  });

  // The point of the method: the same share of every class lands at the top and at the bottom, by construction.
  // Ties in the catalog's rounded numbers blur the edges a little, hence the tolerance (in share of the class).
  const TOLERANCE = 0.04;
  const scored = (c: BrightnessClass): number[] => {
    const type = { galaxy: 'galaxy', cluster: 'open-cluster', nebula: 'nebula', other: 'double-star' }[c];
    if (c === 'galaxy') return objects.filter((o) => o.type === 'galaxy' || o.type === 'galaxy-group').map((o) => brightnessScore(photometryOf(o)));
    return measures(c).map((v) => brightnessScore({ type, mag: v }));
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

describe('dwarf spheroidals and catalog errors', () => {
  const dwarfs = catalog.filter((t) => /dwarf (spheroidal|elliptical)|\bdsph\b/i.test([t.name, ...t.aliases].join(' ')));

  it('finds the dwarf spheroidals of the catalog (Sculptor, Fornax, Sextans) so the check below is not empty', () => {
    expect(dwarfs.map((t) => t.id)).toEqual(expect.arrayContaining(['eso351-030', 'eso356-004', 'pgc88608']));
  });

  // A dwarf spheroidal's mean V-band surface brightness is about 23.5 (McConnachie 2012) or fainter. A value far brighter is a data
  // error, and it would take the top brightness mark through the surface brightness share alone.
  it('no dwarf spheroidal has a surface brightness brighter than 22: a catalog error cannot give one the +10', () => {
    for (const t of dwarfs) {
      expect({ id: t.id, brighterThan22: (t.surfaceBrightness ?? 99) < 22 }).toEqual({ id: t.id, brighterThan22: false });
    }
  });

  it('Sculptor dSph carries the corrected 23.5 (the build file says 19.51), set by the overrides file, not in the raw asset', () => {
    expect(objects.find((o) => o.id === 'eso351-030')?.surfaceBrightness).toBe(19.51);
    expect(catalog.find((t) => t.id === 'eso351-030')?.surfaceBrightness).toBe(23.5);
  });
});
