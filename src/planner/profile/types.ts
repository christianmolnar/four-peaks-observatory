/** Bump when the JSON shape changes incompatibly. */
export const PROFILE_VERSION = 1;

/**
 * One contiguous blocked arc, clockwise from `startAz` to `endAz` (degrees from
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
  /** null: nothing is blocked. */
  blockedArc: BlockedArc | null;
}

export interface ProfileScope {
  id: string;
  name: string;
  focalLengthMm?: number;
  apertureMm?: number;
}

/** Reducer (< 1), flattener (1) or extender (> 1); multiplies focal length. */
export interface ProfileAccessory {
  id: string;
  name: string;
  factor?: number;
}

export interface ProfileCamera {
  id: string;
  name: string;
  pixelSizeUm?: number;
  sensorWidthPx?: number;
  sensorHeightPx?: number;
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
  };
  trains: TrainEntry[];
  plans: ObservingPlan[];
}
