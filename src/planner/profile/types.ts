/**
 * Bump when the JSON shape changes. Older versions are migrated on load
 * (see `migrate.ts`): 1 -> 2 adds the filter library; 2 -> 3 turns a site's
 * `blockedArc` into the `blockedArcs` list.
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
  /** Blocked zones, 0 to MAX_ZONES, none overlapping or touching. Empty: nothing is blocked. */
  blockedArcs: BlockedArc[];
}

export interface ProfileScope {
  id: string;
  name: string;
  focalLengthMm?: number;
  apertureMm?: number;
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
}

export type FilterKind =
  | 'broadband-LP'
  | 'dual-band'
  | 'tri-band'
  | 'narrowband'
  | 'UV-IR cut'
  | 'visual-only';

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
  /** Sum of the passband widths. Needed for the exposure estimate; absent: the kind's default is used and flagged. */
  passbandWidthNm?: number;
  /** Width of the narrowest passband; used to judge the angle shift. */
  narrowestBandNm?: number;
  /** The filter itself cuts UV and IR. */
  blocksUvIr?: boolean;
  /** Published slowest-allowed beam: the fastest focal ratio the maker rates it for. */
  ratedMinFRatio?: number;
  /** Published largest incident angle (degrees from the axis). */
  maxIncidentAngleDeg?: number;
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
