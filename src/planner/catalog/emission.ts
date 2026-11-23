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
  if (o.knotsOnly !== undefined && typeof o.knotsOnly !== 'boolean') problems.push('knotsOnly must be true or false.');
  return problems;
}

const DEFAULT_SOURCE = 'type default';
const typed = (lines: EmissionProfile['lines'], continuum: number): EmissionProfile => ({ lines, continuum, source: DEFAULT_SOURCE, confidence: 'type-default' });
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
const HII_IN_GALAXY = typed({ Ha: 1, OIII: 0.3, SII: 0.15 }, 0.9);

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
});
const SPIRAL_SOURCE = 'Typical for a star-forming spiral, not measured for this galaxy (Kennicutt 1998, arXiv:astro-ph/9807187)';
const knotsType = (): Partial<EmissionProfile> => knotsOf(SPIRAL_SOURCE, 'type-default');

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
  },
  // Helix: a survey column, partly unverified (the literature columns differ 2 to 3 times). NII is 1.7 times Ha, so NII = 0.55 x 1.7 (derived).
  ngc7293: {
    lines: { Ha: 0.55, OIII: 1, SII: 0.06, NII: 0.9 },
    source: 'LVM integrated spectrum, arXiv:2602.10072, Table 3',
    confidence: 'measured',
  },
  // California Nebula: three imagers' SHO write-ups, no flux table.
  ngc1499: {
    lines: { Ha: 1, OIII: 0.1, SII: 0.4 },
    source: 'Three SHO write-ups (AstroBin, AAPOD2): Ha strongest, SII second, OIII faintest',
    confidence: 'amateur',
  },
  // Crab: the continuum is synchrotron; the lines stay the type default.
  ngc1952: {
    continuum: 0.8,
    source: 'Crab: synchrotron continuum passes narrowband filters (arXiv:2512.11103); lines are the type default',
  },
  // Reflection nebulae: M78 and the M45 nebulosity.
  ngc2068: REFLECTION,
  ngc1435: REFLECTION,
  ngc1432: REFLECTION,
  ic349: REFLECTION,
  // HII regions in M33.
  ngc604: { ...HII_IN_GALAXY },
  ngc595: { ...HII_IN_GALAXY },
  // Star-forming galaxies: Ha for the knots only. Ellipticals, S0 and any galaxy not named here keep the type default (no emission): M87, M49, M60, M84, M85, M86, M89, M105, M32, M110, M104, M65.
  // Amateur-grade sources named: M33 (NGC 604 and the other HII regions, imaged and mapped) and M82 (Shopbell, Ha filaments of the starburst wind).
  m33: knotsOf('M33 HII regions (NGC 604 Ha maps); amateur-grade, no flux table', 'amateur'),
  m82: knotsOf('M82 starburst Ha filaments (Shopbell, Ha imaging of the wind); no flux table', 'amateur'),
  // The rest, by class alone (type default), including the large spirals that are well imaged:
  m31: knotsType(), // its HII rings are faint: type default
  m51: knotsType(),
  m101: knotsType(),
  m81: knotsType(),
  ngc6946: knotsType(),
  ngc628: knotsType(),
  ngc5236: knotsType(),
  ngc253: knotsType(),
  ngc2903: knotsType(),
  ngc4490: knotsType(),
  ngc891: knotsType(),
  ngc4501: knotsType(),
  ngc3368: knotsType(),
  ngc4565: knotsType(),
  ngc2841: knotsType(),
  ngc5907: knotsType(),
  ngc4244: knotsType(),
  ngc4826: knotsType(),
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
