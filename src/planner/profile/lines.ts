/**
 * The emission lines a nebula filter is judged against, in nm (air wavelengths). One table: the gear card names a band's line from it, and the
 * per-target filter mix (G3) reads the same list. A line is "near" a band when the band's centre is within LINE_MATCH_NM of it.
 */
export interface EmissionLine {
  /** What imagers call it: Ha, OIII, Hb, SII, NII. Two lines can share a symbol (OIII 500.7 and 495.9). */
  symbol: 'Ha' | 'OIII' | 'Hb' | 'SII' | 'NII';
  /** In words, for the plain line on a card. */
  name: string;
  nm: number;
}

export const EMISSION_LINES: readonly EmissionLine[] = [
  { symbol: 'Ha', name: 'hydrogen-alpha', nm: 656.3 },
  { symbol: 'OIII', name: 'doubly ionised oxygen', nm: 500.7 },
  { symbol: 'OIII', name: 'doubly ionised oxygen', nm: 495.9 },
  { symbol: 'Hb', name: 'hydrogen-beta', nm: 486.1 },
  { symbol: 'SII', name: 'singly ionised sulphur', nm: 671.7 },
  { symbol: 'SII', name: 'singly ionised sulphur', nm: 673.1 },
  { symbol: 'NII', name: 'singly ionised nitrogen', nm: 658.4 },
  { symbol: 'NII', name: 'singly ionised nitrogen', nm: 654.8 },
];

/** How far a band's centre may be from a line to be called centred on it, nm. */
export const LINE_MATCH_NM = 3;

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The nearest known line within LINE_MATCH_NM of `centreNm`; on a tie the one listed first. Undefined when none is near. */
export function lineNear(centreNm: number): EmissionLine | undefined {
  let best: EmissionLine | undefined;
  let bestDistance = Infinity;
  for (const line of EMISSION_LINES) {
    const d = round(Math.abs(centreNm - line.nm));
    if (d <= LINE_MATCH_NM && d < bestDistance) {
      best = line;
      bestDistance = d;
    }
  }
  return best;
}
