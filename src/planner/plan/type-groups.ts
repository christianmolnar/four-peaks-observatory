/**
 * The choices of the list's one Type selector ("Best globular clusters tonight"): plain names over the catalog's real types.
 * Double stars and asterisms have no choice of their own (search finds them; asterisms are still in "All").
 */
export interface TypeGroup {
  id: string;
  /** The option: "Globular clusters". */
  label: string;
  /** The heading's noun: "Best globular clusters for tonight". */
  noun: string;
  /** Catalog types the choice lists; undefined for the two choices the ranker is not asked to narrow (All, Solar system). */
  types?: readonly string[];
}

export const TYPE_GROUPS: readonly TypeGroup[] = [
  { id: 'all', label: 'All', noun: 'targets' },
  { id: 'galaxies', label: 'Galaxies', noun: 'galaxies', types: ['galaxy'] },
  { id: 'nebulae', label: 'Nebulae', noun: 'nebulae', types: ['nebula', 'dark-nebula'] },
  { id: 'planetary-nebulae', label: 'Planetary nebulae', noun: 'planetary nebulae', types: ['planetary-nebula'] },
  { id: 'globular-clusters', label: 'Globular clusters', noun: 'globular clusters', types: ['globular-cluster'] },
  { id: 'open-clusters', label: 'Open clusters', noun: 'open clusters', types: ['open-cluster'] },
  { id: 'supernova-remnants', label: 'Supernova remnants', noun: 'supernova remnants', types: ['supernova-remnant'] },
  { id: 'galaxy-groups', label: 'Galaxy groups and pairs', noun: 'galaxy groups and pairs', types: ['galaxy-group'] },
  { id: 'solar-system', label: 'Solar system', noun: 'Moon and planets' },
];

export const SOLAR_SYSTEM = 'solar-system';

/** The group of a stored or chosen id; "All" for one that does not exist (a choice saved by an older page). */
export function typeGroupOf(id: string | undefined): TypeGroup {
  return TYPE_GROUPS.find((g) => g.id === id) ?? TYPE_GROUPS[0];
}

/**
 * How many are up and fit, for one choice, from the ranker's per-type counts and the number of Moon and planets up.
 * All is every ranked type (asterisms and dark nebulae included) and the solar system.
 */
export function groupCount(group: TypeGroup, typeCounts: Readonly<Record<string, number>>, solarUp: number): number {
  if (group.id === SOLAR_SYSTEM) return solarUp;
  if (group.types === undefined) return Object.values(typeCounts).reduce((a, b) => a + b, 0) + solarUp;
  return group.types.reduce((a, t) => a + (typeCounts[t] ?? 0), 0);
}

/**
 * How many of a choice's targets are up but do not fit the frame, for the types with nothing fitting up (`RankResult.typeNotFit`).
 * Zero for a choice with something fitting: it reads from its count of what fits.
 */
export function groupNotFit(group: TypeGroup, typeNotFit: Readonly<Record<string, { tooLarge: number; tooSmall: number }>>): { tooLarge: number; tooSmall: number } {
  const types = group.types ?? Object.keys(typeNotFit);
  return types.reduce((a, t) => ({ tooLarge: a.tooLarge + (typeNotFit[t]?.tooLarge ?? 0), tooSmall: a.tooSmall + (typeNotFit[t]?.tooSmall ?? 0) }), { tooLarge: 0, tooSmall: 0 });
}
