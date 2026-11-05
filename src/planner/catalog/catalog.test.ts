import {
  createResolver,
  loadTargets,
  normalizeName,
  resolveTarget,
  starterTargets,
} from './index';
import type { CatalogTarget } from './index';

// Cited values: OpenNGC database_files/NGC.csv (J2000), as sexagesimal strings
// so the test does not share the catalog's decimal conversion.
//   NGC1976 (M42):  RA 05:35:16.48  Dec -05:23:22.8
//   NGC3031 (M81):  RA 09:55:33.17  Dec +69:03:55.1
//   NGC7000:        RA 20:59:17.14  Dec +44:31:43.6
const hms = (s: string): number => {
  const [h, m, x] = s.split(':').map(Number);
  return h + m / 60 + x / 3600;
};
const dms = (s: string): number => {
  const sign = s.startsWith('-') ? -1 : 1;
  const [d, m, x] = s.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (d + m / 60 + x / 3600);
};

describe('starter catalog', () => {
  it('has 24 targets with unique ids', () => {
    expect(starterTargets).toHaveLength(24);
    expect(new Set(starterTargets.map((t) => t.id)).size).toBe(24);
  });

  it.each([
    ['m42', '05:35:16.48', '-05:23:22.8'],
    ['m81', '09:55:33.17', '+69:03:55.1'],
    ['ngc7000', '20:59:17.14', '+44:31:43.6'],
  ])('%s matches the cited OpenNGC position within 0.05 deg', (id, ra, dec) => {
    const t = starterTargets.find((x) => x.id === id)!;
    expect(Math.abs(t.raHours - hms(ra)) * 15 * Math.cos((dms(dec) * Math.PI) / 180)).toBeLessThan(0.05);
    expect(Math.abs(t.decDeg - dms(dec))).toBeLessThan(0.05);
  });

  it('includes the requested starter objects', () => {
    for (const name of [
      'IC 405', 'NGC 2264', 'NGC 1499', 'M43', 'Running Man', 'NGC 2174',
      'NGC 2359', 'M81', 'M82', 'M51', 'Leo Triplet', 'M101',
    ]) {
      expect(resolveTarget(name)).not.toBeNull();
    }
  });

  it('keeps every target in range with a season', () => {
    for (const t of starterTargets) {
      expect(t.raHours).toBeGreaterThanOrEqual(0);
      expect(t.raHours).toBeLessThan(24);
      expect(t.seasonMonths.length).toBeGreaterThan(0);
    }
  });
});

describe('alias resolver', () => {
  it('resolves three aliases of M42 to one id', () => {
    const ids = ['M42', 'NGC 1976', 'Orion Nebula'].map((n) => resolveTarget(n)?.id);
    expect(ids).toEqual(['m42', 'm42', 'm42']);
  });

  it('tolerates case, spacing, apostrophes and leading zeros', () => {
    for (const n of ['m 42', ' M42 ', 'ngc1976', 'NGC 01976', 'orion   nebula', 'ORION NEBULA']) {
      expect(resolveTarget(n)?.id).toBe('m42');
    }
    expect(resolveTarget("Bode's Galaxy")?.id).toBe('m81');
    expect(resolveTarget('bodes galaxy')?.id).toBe('m81');
    expect(resolveTarget('NGC 0224')?.id).toBe('m31');
  });

  it('returns null for unknown names and empty input', () => {
    expect(resolveTarget('M9999')).toBeNull();
    expect(resolveTarget('not a target')).toBeNull();
    expect(resolveTarget('')).toBeNull();
  });

  it('does not confuse numbers: M4 is not M42', () => {
    expect(resolveTarget('M4')).toBeNull();
  });

  it('throws when two targets claim the same alias', () => {
    const a: CatalogTarget = { ...starterTargets[0], id: 'a', aliases: ['Same'] };
    const b: CatalogTarget = { ...starterTargets[1], id: 'b', aliases: ['same'] };
    expect(() => createResolver([a, b])).toThrow(/same/i);
  });

  it('normalizes names', () => {
    expect(normalizeName('NGC 0224')).toBe('ngc224');
    expect(normalizeName("Thor's Helmet")).toBe('thorshelmet');
  });
});

describe('loadTargets', () => {
  it('rejects a bad value with its path', () => {
    const bad = { targets: [{ ...starterTargets[0], raHours: 30 }] };
    expect(() => loadTargets(bad)).toThrow('targets[0].raHours');
  });

  it('rejects duplicate ids', () => {
    expect(() => loadTargets({ targets: [starterTargets[0], starterTargets[0]] })).toThrow(/duplicate id/);
  });
});
