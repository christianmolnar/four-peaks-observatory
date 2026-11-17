/**
 * Bump when the JSON shape changes. Older versions are migrated on load
 * (see `migrate.ts`): 1 -> 2 adds the filter library; 2 -> 3 turns a site's
 * `blockedArc` into the `blockedArcs` list. A site's optional `bortle` needed no bump:
 * no older profile has it, and absent means not set.
 */
export const PROFILE_VERSION = 3;

/** Most blocked zones one site can hold. */
export const MAX_ZONES = 4;

/**
 * One contiguous blocked zone, clockwise from `startAz` to `endAz` (degrees from
 * north). It may cross north: 300 to 60 blocks 300..360 and 0..60.
 */
export interface BlockedArc {
  startAz: number;
  endAz: number;
  /** Height of the obstruction in degrees above the horizon. */
  heightDeg: number;
}

export interface ProfileSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevationM?: number;
  /** IANA time zone name, e.g. America/Phoenix. Absent: times show in the browser's zone. */
  timeZone?: string;
  /** Sky darkness at the site, Bortle class 1 to 9 (whole number). Absent: not set, and the planner assumes DEFAULT_BORTLE and says so. */
  bortle?: number;
  /** Blocked zones, 0 to MAX_ZONES. They may overlap or touch: the blocked region is their union, and where they overlap the highest height applies. Empty: nothing is blocked. */
  blockedArcs: BlockedArc[];
}

export interface ProfileScope {
  id: string;
  name: string;
  focalLengthMm?: number;
  apertureMm?: number;
  /** Set when the boxes came from an AI lookup nobody has confirmed; cleared when the user confirms the library entry or edits a spec box. Absent: not AI-filled. */
  aiFilled?: boolean;
}

/**
 * Reducer (< 1), flattener (1) or extender (> 1) set `factor`, which multiplies
 * the scope's focal length. An accessory that replaces the scope's optics (a
 * HyperStar) sets `effectiveFocalLengthMm` instead: the focal length of the
 * whole scope with it fitted. A train may carry at most one such accessory.
 */
export interface ProfileAccessory {
  id: string;
  name: string;
  factor?: number;
  effectiveFocalLengthMm?: number;
}

/** Rough read-noise bracket; the exposure module maps it to a number (an assumption it names). */
export type ReadNoiseClass = 'low' | 'medium' | 'high';

export interface ProfileCamera {
  id: string;
  name: string;
  pixelSizeUm?: number;
  sensorWidthPx?: number;
  sensorHeightPx?: number;
  /** One-shot colour (Bayer) sensor. Absent: unknown. */
  colour?: boolean;
  /** The camera's own window cuts UV and IR. false: it does not (a filter must). Absent: unknown. */
  hasUvIrCut?: boolean;
  readNoiseClass?: ReadNoiseClass;
  /** Set when the boxes came from an AI lookup nobody has confirmed; cleared when the user confirms the library entry or edits a spec box. Absent: not AI-filled. */
  aiFilled?: boolean;
}

export type FilterKind =
  | 'broadband-LP'
  | 'dual-band'
  | 'tri-band'
  | 'narrowband'
  | 'UV-IR cut'
  | 'visual-only';

/** One wavelength band a filter passes: its centre and its full width, in nm. */
export interface Passband {
  centreNm: number;
  widthNm: number;
}

/**
 * A filter in the library. Every value but id and name is optional: absent
 * means unknown, never a default. Wavelengths in nm.
 */
export interface ProfileFilter {
  id: string;
  name: string;
  kind?: FilterKind;
  /** Cell or glass diameter, mm. */
  sizeMm?: number;
  /** Free text, e.g. "Ha 15 nm, OIII 35 nm". */
  bandpassNotes?: string;
  /**
   * The bands the filter passes, 1 to MAX_PASSBANDS, separate from each other. Absent: unknown (never a default). When present the two sums below are
   * derived from it (`bandSums`) and the validator keeps them equal. A new optional field needed no version bump: no older profile has it.
   */
  passbands?: Passband[];
  /** Sum of the passband widths. Needed for the exposure estimate; absent: the kind's default is used and flagged. Derived from `passbands` when those are present. */
  passbandWidthNm?: number;
  /** Width of the narrowest passband; used to judge the angle shift. Derived from `passbands` when those are present. */
  narrowestBandNm?: number;
  /** The filter itself cuts UV and IR. */
  blocksUvIr?: boolean;
  /** Published slowest-allowed beam: the fastest focal ratio the maker rates it for. */
  ratedMinFRatio?: number;
  /** Published largest incident angle (degrees from the axis). */
  maxIncidentAngleDeg?: number;
  /** Set when the boxes came from an AI lookup nobody has confirmed; cleared when the user confirms the library entry or edits a spec box. Absent: not AI-filled. */
  aiFilled?: boolean;
}

/** Fixed optics and sensor in one body. */
export interface ProfileSmartScope {
  id: string;
  name: string;
  mountMode: 'alt-az' | 'eq';
  focalLengthMm?: number;
  apertureMm?: number;
  pixelSizeUm?: number;
  sensorWidthPx?: number;
  sensorHeightPx?: number;
}

export interface OpticalTrainEntry {
  kind: 'optical';
  id: string;
  name: string;
  scopeId: string;
  accessoryIds: string[];
  cameraId: string;
  /** Library filter in use; absent: no filter. */
  filterId?: string;
  /** What the train is set up for, when it is for one thing: a planetary train frames a planet, so deep-sky objects are large in it. */
  tag?: 'planetary';
}

export interface SmartTrainEntry {
  kind: 'smart';
  id: string;
  name: string;
  smartScopeId: string;
}

export type TrainEntry = OpticalTrainEntry | SmartTrainEntry;

export interface ObservingPlan {
  id: string;
  name: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  siteId: string;
  trainId: string;
  /** Catalog target ids, in observing order. */
  targetIds: string[];
  notes: string;
}

export interface Profile {
  version: typeof PROFILE_VERSION;
  sites: ProfileSite[];
  equipment: {
    scopes: ProfileScope[];
    accessories: ProfileAccessory[];
    cameras: ProfileCamera[];
    smartScopes: ProfileSmartScope[];
    filters: ProfileFilter[];
  };
  trains: TrainEntry[];
  plans: ObservingPlan[];
}
