import type { TargetType } from './index';

/**
 * What a target gives off, for the per-target filter mix (research note: emission and continuum content of deep-sky targets). One module: the profile shape,
 * the default for each catalog type, and the per-object overrides that merge over it. Every profile is judged when the module loads (ranges 0 to 1).
 */
export type Line = 'Ha' | 'NII' | 'SII' | 'OIII' | 'Hb' | 'HeII';
export type Confidence = 'measured' | 'amateur' | 'type-default';

export interface EmissionProfile {
  /** 0 to 1, flux relative to the object's strongest of Ha, OIII and SII. NII is listed only for the Ha-band note. A line not listed is absent. */
  lines: Partial<Record<Line, number>>;
  /** 0 to 1: the share of the broadband flux that is not emission lines. */
  continuum: number;
  /** A citation in words, or "type default". */
  source: string;
  confidence: Confidence;
  note?: string;
  /** True when the lines belong to small knots (HII regions) inside a target whose light is mostly something else: the whole target is not the emission target. */
  knotsOnly?: boolean;
}

const LINES: readonly Line[] = ['Ha', 'NII', 'SII', 'OIII', 'Hb', 'HeII'];
const CONFIDENCES: readonly Confidence[] = ['measured', 'amateur', 'type-default'];
const inUnit = (n: unknown): boolean => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;

/** The plain problems with a profile (empty when it is good): every line and the continuum a number from 0 to 1, a source, a known confidence. */
export function judgeProfile(p: unknown): string[] {
  if (typeof p !== 'object' || p === null) return ['The profile is not an object.'];
  const o = p as Record<string, unknown>;
  const problems: string[] = [];
  const lines = o.lines;
  if (typeof lines !== 'object' || lines === null || Array.isArray(lines)) problems.push('lines must be an object.');
  else {
    for (const [k, v] of Object.entries(lines)) {
      if (!LINES.includes(k as Line)) problems.push(`"${k}" is not a known line.`);
      else if (!inUnit(v)) problems.push(`The ${k} weight must be a number from 0 to 1.`);
    }
  }
  if (!inUnit(o.continuum)) problems.push('The continuum must be a number from 0 to 1.');
  if (typeof o.source !== 'string' || o.source.trim() === '') problems.push('A profile needs a source.');
  if (!CONFIDENCES.includes(o.confidence as Confidence)) problems.push('The confidence must be measured, amateur or type-default.');
  if (o.note !== undefined && typeof o.note !== 'string') problems.push('The note must be text.');
  if (o.knotsOnly !== undefined && typeof o.knotsOnly !== 'boolean') problems.push('knotsOnly must be true or false.');
  return problems;
}

const DEFAULT_SOURCE = 'type default';
const typed = (lines: EmissionProfile['lines'], continuum: number, note?: string): EmissionProfile => ({ lines, continuum, source: DEFAULT_SOURCE, confidence: 'type-default', ...(note === undefined ? {} : { note }) });
/** No emission: all of the light is continuum. */
const noEmission = (): EmissionProfile => typed({}, 1);

/** The default for each catalog type. The catalog's "nebula" is an emission nebula unless an override says otherwise. */
export const TYPE_DEFAULTS: Record<TargetType, EmissionProfile> = {
  nebula: typed({ Ha: 1, OIII: 0.4, SII: 0.15, NII: 0.2 }, 0.1),
  'planetary-nebula': typed({ Ha: 0.3, OIII: 1, SII: 0.06, NII: 0.5 }, 0.1),
  'supernova-remnant': typed({ Ha: 0.7, OIII: 1, SII: 0.6 }, 0.2),
  galaxy: noEmission(),
  'galaxy-group': noEmission(),
  'open-cluster': noEmission(),
  'globular-cluster': noEmission(),
  'dark-nebula': noEmission(),
  asterism: noEmission(),
  'double-star': noEmission(),
};

/** An HII region inside a galaxy (a knot small against the disk). The catalog has no type for it; the objects below use it. */
const HII_IN_GALAXY = typed({ Ha: 1, OIII: 0.3, SII: 0.15 }, 0.9, 'An HII region in a galaxy: the knot is small against the stellar disk.');

/**
 * The HII knots of a star-forming galaxy (spiral arms, irregulars). Ha only: the OIII and SII shares in the knots depend on metallicity and are not modelled
 * (research note: HII regions, "Ha only for its HII regions"). The continuum is the disk under the knot. Which galaxies are star-forming is set by name below:
 * the bundled catalog carries no morphology.
 */
const knotsOf = (source: string, confidence: 'amateur' | 'type-default'): Partial<EmissionProfile> => ({
  lines: { Ha: 1 },
  continuum: 0.9,
  source,
  confidence,
  knotsOnly: true,
  note: 'For the knots only: the HII regions in the arms are small and faint against the disk. The disk itself is broadband light.',
});
const SPIRAL_DEFAULT = 'Late-type spiral or irregular: HII knots expected (type default; Kennicutt 1998, arXiv:astro-ph/9807187: Ha+NII equivalent width 20 to 150 A for late types). Not measured for this galaxy';
const FAMOUS = 'Its HII regions are well known from Ha imaging (amateur-grade; no flux table)';
const knotsType = (): Partial<EmissionProfile> => knotsOf(SPIRAL_DEFAULT, 'type-default');
const knotsImaged = (): Partial<EmissionProfile> => knotsOf(FAMOUS, 'amateur');

const REFLECTION: Partial<EmissionProfile> = {
  lines: {},
  continuum: 1,
  source: 'Reflection nebula: scattered starlight, no emission lines (research note, amateur-grade source)',
  confidence: 'amateur',
};

/**
 * Per-object values that merge over the type default (shallow: an override's `lines` replaces the default's). Keyed by the id the planner uses
 * (a curated target's own id, such as m42, else the OpenNGC id). Only objects the research note gives numbers or a firm physical class for.
 */
export const OBJECT_OVERRIDES: Record<string, Partial<EmissionProfile>> = {
  // M42: whole-nebula integrated, extinction not corrected. OIII is the 5007 line alone (4959 adds about a third). The continuum is "high" in the note but has no number, so the type default stays.
  m42: {
    lines: { Ha: 1, OIII: 0.83, SII: 0.034, NII: 0.25 },
    source: 'Sanchez et al. 2007, arXiv:astro-ph/0611363, Tables 1 and 3',
    confidence: 'measured',
    note: 'Whole-nebula integrated values; OIII is the 5007 line alone.',
  },
  // The Veil: one filament (Cygnus Loop), the lines vary a lot from point to point.
  ngc6960: veil(),
  ngc6992: veil(),
  ngc6995: veil(),
  // M57: the ring, extinction corrected. The Ha band carries more nitrogen than hydrogen.
  ngc6720: {
    lines: { Ha: 0.25, OIII: 1, SII: 0.05, NII: 0.5 },
    source: "O'Dell et al. 2009, arXiv:0901.3185, Table 1",
    confidence: 'measured',
    note: 'The ring; values change by a factor of 3 to 10 with position. The Ha band here carries more nitrogen than hydrogen.',
  },
  // Helix: a survey column, partly unverified (the literature columns differ 2 to 3 times). NII is 1.7 times Ha, so NII = 0.55 x 1.7 (derived).
  ngc7293: {
    lines: { Ha: 0.55, OIII: 1, SII: 0.06, NII: 0.9 },
    source: 'LVM integrated spectrum, arXiv:2602.10072, Table 3',
    confidence: 'measured',
    note: 'Partly unverified: the literature columns differ 2 to 3 times. NII is derived (1.7 times Ha).',
  },
  // California Nebula: three imagers' SHO write-ups, no flux table.
  ngc1499: {
    lines: { Ha: 1, OIII: 0.1, SII: 0.4 },
    source: 'Three SHO write-ups (AstroBin, AAPOD2): Ha strongest, SII second, OIII faintest',
    confidence: 'amateur',
    note: 'OIII is the faintest line: one imager needed 19 extra hours of it.',
  },
  // Crab: the continuum is synchrotron; the lines stay the type default.
  ngc1952: {
    continuum: 0.8,
    source: 'Crab: synchrotron continuum passes narrowband filters (arXiv:2512.11103); lines are the type default',
    note: 'The continuum is a large share (synchrotron); the line weights are the type default.',
  },
  // Reflection nebulae: M78 and the M45 nebulosity.
  ngc2068: REFLECTION,
  ngc1435: REFLECTION,
  ngc1432: REFLECTION,
  ic349: REFLECTION,
  // HII regions in M33.
  ngc604: { ...HII_IN_GALAXY },
  ngc595: { ...HII_IN_GALAXY },
  // Star-forming galaxies: Ha for the knots only. Ellipticals, S0 and any galaxy not named here keep the type default (no emission): M87, M49, M60, M84, M85, M86, M89, M105, M32, M110, M31, M64, M104, M65.
  // Well imaged in Ha:
  m33: knotsImaged(),
  m51: knotsImaged(),
  m101: knotsImaged(),
  m81: knotsImaged(),
  m82: knotsOf('Starburst galaxy; its Ha filaments are well known from imaging (amateur-grade; no flux table)', 'amateur'),
  ngc6946: knotsImaged(),
  ngc628: knotsImaged(),
  ngc5236: knotsImaged(),
  ngc253: knotsImaged(),
  // Late-type spirals and irregulars by class alone:
  ngc4736: knotsType(),
  ngc3351: knotsType(),
  ngc4254: knotsType(),
  ngc4321: knotsType(),
  ngc4303: knotsType(),
  ngc4258: knotsType(),
  ngc5055: knotsType(),
  ngc3556: knotsType(),
  ngc4945: knotsType(),
  ngc2403: knotsType(),
  ngc300: knotsType(),
  ngc55: knotsType(),
  ngc247: knotsType(),
  ic342: knotsType(),
  ngc4449: knotsType(),
  ngc4631: knotsType(),
  ngc4559: knotsType(),
  ngc4038: knotsType(),
  ngc4039: knotsType(),
  ngc6822: knotsType(),
  ic1613: knotsType(),
  ngc1097: knotsType(),
  ngc7479: knotsType(),
  ngc6744: knotsType(),
  ngc4236: knotsType(),
  ngc7331: knotsType(),
};

function veil(): Partial<EmissionProfile> {
  return {
    lines: { Ha: 0.6, OIII: 1, SII: 0.5 },
    source: 'Raymond et al., arXiv:2004.09567, Table 1 (Cygnus Loop radiative shocks)',
    confidence: 'measured',
    note: 'Shock-heated: SII is strong. One filament; the lines vary a lot from point to point.',
  };
}

const merged = (type: TargetType, id: string | null): EmissionProfile => {
  const base = TYPE_DEFAULTS[type];
  const over = id !== null && Object.hasOwn(OBJECT_OVERRIDES, id) ? OBJECT_OVERRIDES[id] : null;
  return over === null ? base : { ...base, ...over };
};

/** Every type default and every override merged over a type must be a good profile; a bad one stops the module loading. */
function judgeAll(): void {
  for (const [type, p] of Object.entries(TYPE_DEFAULTS)) {
    const bad = judgeProfile(p);
    if (bad.length > 0) throw new Error(`Emission profile for type ${type}: ${bad.join(' ')}`);
  }
  for (const id of Object.keys(OBJECT_OVERRIDES)) {
    for (const type of Object.keys(TYPE_DEFAULTS) as TargetType[]) {
      const bad = judgeProfile(merged(type, id));
      if (bad.length > 0) throw new Error(`Emission override for ${id} over ${type}: ${bad.join(' ')}`);
    }
  }
}
judgeAll();

/** The profile of a catalog object: its override over its type's default, or null for a type with no default. */
export function emissionProfileFor(id: string, type: string): EmissionProfile | null {
  if (!Object.hasOwn(TYPE_DEFAULTS, type)) return null;
  return merged(type as TargetType, id);
}
