import targetsData from '../data/targets.json';

export type TargetType =
  | 'nebula'
  | 'galaxy'
  | 'planetary-nebula'
  | 'globular-cluster'
  | 'open-cluster'
  // Types that only the bundled OpenNGC extract uses (see `openngc.ts`):
  | 'galaxy-group'
  | 'dark-nebula'
  | 'supernova-remnant'
  | 'asterism'
  | 'double-star';

export const TARGET_TYPES: readonly TargetType[] = [
  'nebula',
  'galaxy',
  'planetary-nebula',
  'globular-cluster',
  'open-cluster',
  'galaxy-group',
  'dark-nebula',
  'supernova-remnant',
  'asterism',
  'double-star',
];

export interface CatalogTarget {
  id: string;
  name: string;
  aliases: string[];
  /** J2000 right ascension in hours, [0, 24). */
  raHours: number;
  /** J2000 declination in degrees. */
  decDeg: number;
  type: TargetType;
  /** Angular size in arcminutes; absent when the source has none. */
  sizeArcmin?: { major: number; minor: number };
  /** Months (1 to 12) in which the target is well placed for evening and night imaging. */
  seasonMonths: number[];
  /** Curated: the bright core would clip in long subs, so a short second set is worth shooting. Absent means no. */
  brightCore?: boolean;
}

// Greek letters as the Bayer abbreviations SIMBAD and OpenNGC use ("tet Car Cluster", "omi Per Cloud"), so a typed
// "ω Cen" or "omega cen" and the catalog's "Omega Centauri" meet on the same letters.
const GREEK: Record<string, string> = {
  α: 'alp', β: 'bet', γ: 'gam', δ: 'del', ε: 'eps', ζ: 'zet', η: 'eta', θ: 'tet', ι: 'iot', κ: 'kap', λ: 'lam', μ: 'mu',
  ν: 'nu', ξ: 'ksi', ο: 'omi', π: 'pi', ρ: 'rho', σ: 'sig', ς: 'sig', τ: 'tau', υ: 'ups', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'ome',
};
const GREEK_WORDS: Record<string, string> = {
  alpha: 'alp', beta: 'bet', gamma: 'gam', delta: 'del', epsilon: 'eps', zeta: 'zet', theta: 'tet', iota: 'iot', kappa: 'kap',
  lambda: 'lam', xi: 'ksi', omicron: 'omi', sigma: 'sig', upsilon: 'ups', omega: 'ome',
};
const GREEK_SYMBOLS = new RegExp(`[${Object.keys(GREEK).join('')}]`, 'g');

/**
 * The words of a name: Unicode compatibility form (NFKC: full-width digits and letters), lower case, apostrophes
 * dropped, a leading "the" dropped, Greek letters (symbol or spelled out) as Bayer abbreviations, split on anything
 * that is not a letter or digit.
 */
export function nameWords(name: string): string[] {
  const text = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/^\s*the\s+/, '')
    .replace(GREEK_SYMBOLS, (g) => ` ${GREEK[g]} `);
  return text
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => GREEK_WORDS[w] ?? w);
}

/**
 * Lookup key: the words of the name joined, with leading zeros removed from a trailing catalog number ("NGC 0224",
 * "ngc224" and "N G C 224" agree). Catalog names collapse to their short form: "Messier 42" is "M42", "Caldwell 33" is
 * "C33", "Barnard 33" is "B33", "Sharpless 155" and "Sharpless 2-155" are "Sh2155" (as in "Sh 2-155").
 */
export function normalizeName(name: string): string {
  const words = nameWords(name);
  if (words[0] === 'sharpless' && words[1] === '2' && /^\d/.test(words[2] ?? '')) words.splice(1, 1);
  const key = words
    .join('')
    .replace(/^messier(?=\d)/, 'm')
    .replace(/^caldwell(?=\d)/, 'c')
    .replace(/^barnard(?=\d)/, 'b')
    .replace(/^sharpless(?=\d)/, 'sh2');
  return key.replace(/^([a-z]+)0+(\d)/, '$1$2');
}

function fail(path: string, message: string): never {
  throw new Error(`Catalog invalid at ${path}: ${message}`);
}

function checkTarget(t: unknown, i: number): CatalogTarget {
  const at = `targets[${i}]`;
  if (typeof t !== 'object' || t === null) fail(at, 'expected an object');
  const o = t as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id === '') fail(`${at}.id`, 'expected a non-empty string');
  if (typeof o.name !== 'string' || o.name === '') fail(`${at}.name`, 'expected a non-empty string');
  if (!Array.isArray(o.aliases) || !o.aliases.every((a) => typeof a === 'string')) {
    fail(`${at}.aliases`, 'expected an array of strings');
  }
  if (typeof o.raHours !== 'number' || !(o.raHours >= 0 && o.raHours < 24)) {
    fail(`${at}.raHours`, 'expected a number in [0, 24)');
  }
  if (typeof o.decDeg !== 'number' || !(o.decDeg >= -90 && o.decDeg <= 90)) {
    fail(`${at}.decDeg`, 'expected a number in [-90, 90]');
  }
  if (!TARGET_TYPES.includes(o.type as TargetType)) {
    fail(`${at}.type`, `expected one of ${TARGET_TYPES.join(', ')}`);
  }
  if (
    !Array.isArray(o.seasonMonths) ||
    !o.seasonMonths.every((m) => Number.isInteger(m) && m >= 1 && m <= 12)
  ) {
    fail(`${at}.seasonMonths`, 'expected an array of months 1 to 12');
  }
  if (o.sizeArcmin !== undefined) {
    const z = o.sizeArcmin as { major?: unknown; minor?: unknown } | null;
    if (typeof z !== 'object' || z === null || !(Number(z.major) > 0) || !(Number(z.minor) > 0)) {
      fail(`${at}.sizeArcmin`, 'expected { major, minor } as positive numbers');
    }
  }
  if (o.brightCore !== undefined && typeof o.brightCore !== 'boolean') {
    fail(`${at}.brightCore`, 'expected true or false');
  }
  return {
    id: o.id,
    name: o.name,
    aliases: o.aliases as string[],
    raHours: o.raHours,
    decDeg: o.decDeg,
    type: o.type as TargetType,
    sizeArcmin: o.sizeArcmin as CatalogTarget['sizeArcmin'],
    seasonMonths: o.seasonMonths as number[],
    ...(o.brightCore === undefined ? {} : { brightCore: o.brightCore }),
  };
}

export function loadTargets(raw: unknown): CatalogTarget[] {
  if (typeof raw !== 'object' || raw === null || !Array.isArray((raw as { targets?: unknown }).targets)) {
    fail('targets', 'expected an array');
  }
  const targets = (raw as { targets: unknown[] }).targets.map(checkTarget);
  const ids = new Set<string>();
  for (const t of targets) {
    if (ids.has(t.id)) fail('targets', `duplicate id ${t.id}`);
    ids.add(t.id);
  }
  return targets;
}

/** Builds a name resolver. Throws if two targets claim the same alias. */
export function createResolver(
  targets: readonly CatalogTarget[],
): (name: string) => CatalogTarget | null {
  const byKey = new Map<string, CatalogTarget>();
  for (const t of targets) {
    for (const label of [t.id, t.name, ...t.aliases]) {
      const key = normalizeName(label);
      const prev = byKey.get(key);
      if (prev !== undefined && prev.id !== t.id) {
        throw new Error(`Alias "${label}" belongs to both ${prev.id} and ${t.id}`);
      }
      byKey.set(key, t);
    }
  }
  return (name) => byKey.get(normalizeName(name)) ?? null;
}

/** Starter catalog: 25 targets from OpenNGC (see `data/targets.json`). */
export const starterTargets: readonly CatalogTarget[] = loadTargets(targetsData);

export const resolveTarget = createResolver(starterTargets);
