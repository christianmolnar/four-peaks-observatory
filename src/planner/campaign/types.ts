import type { Site } from '../astro';
import type { SurfaceBrightness } from '../exposure';
import type { HorizonPoint, TimeWindow } from '../horizon';

/** One catalog object (or any fixed J2000 position) that goes into a subject. */
export interface CampaignTarget {
  id: string;
  name: string;
  raHours: number;
  decDeg: number;
}

/**
 * One thing framed on its own. Two targets framed together are one subject with two targets and an
 * `aim`: the point the frame is centred on. A single-target subject aims at its target.
 */
export interface CampaignSubject {
  id: string;
  name: string;
  /** At least one. */
  targets: CampaignTarget[];
  /** Required when there are two or more targets; absent for one target. */
  aim?: { raHours: number; decDeg: number };
  /** Catalog type (e.g. 'galaxy'), read with `surfaceBrightness` by `surfaceBrightnessOf` to pick the useful range. */
  type?: string;
  /** Surface brightness class. Absent: from `type`, else 'unknown'. */
  surfaceBrightness?: SurfaceBrightness;
  /** Per-target override of the useful range (minutes of integration, multiples of 5, min <= max). Absent: the class range. */
  useful?: { minMin: number; maxMin: number };
  /** Marginal gain of more integration once the target is useful; higher is lengthened first. Absent: the list order (earlier is higher). */
  value?: number;
  /** Optional cap on imaging hours in one night (multiple of 5 minutes). Never lowers a first useful slot below the target's minUseful. */
  hoursPerNight?: number;
}

export interface CampaignInput {
  subjects: CampaignSubject[];
  /**
   * Subjects that are not scheduled but are asked about: the packing report says how long each would fit in the room
   * left. Optional.
   */
  candidates?: CampaignSubject[];
  site: Site;
  /** IANA zone of the site: which civil date "the night of" means, and what `startTime` is read in. Absent: site mean solar time. */
  timeZone?: string;
  /** Horizon points (`arcToHorizonPoints` of the site's zones). Null or empty: nothing is blocked. */
  horizon: readonly HorizonPoint[] | null;
  /** Flat minimum altitude in degrees. */
  minAltitude: number;
  /** YYYY-MM-DD of the first night (the evening the night starts). */
  startDate: string;
  /** 1 to 14. */
  nights: number;
  /** "HH:MM" local clock time to start imaging each night (never before dusk). Absent: astronomical dusk. */
  startTime?: string;
}

export type ShortCode =
  | 'no-astronomical-night'
  | 'polar-night'
  | 'start-after-dawn'
  | 'below-min-altitude'
  | 'blocked-by-horizon'
  | 'window-too-short'
  | 'flip-cuts-slot'
  | 'no-room';

export interface ShortReason {
  code: ShortCode;
  text: string;
}

/** One subject on one night, before any scheduling. */
export interface SubjectNight {
  subjectId: string;
  /** Where the subject is above the horizon zones and the minimum altitude, inside the usable part of the night. */
  windows: TimeWindow[];
  usableMin: number;
  /** Meridian transit of the aim point inside the night; null when it falls outside the night. */
  transit: Date | null;
  /** True when the target's minUseful fits only as a slot that straddles the transit, flip time included (a flip cannot be avoided, whatever else is imaged). False when a clean slot fits, or when no slot of that length fits at all. */
  unavoidableFlip: boolean;
}

export interface CampaignSlot {
  subjectId: string;
  /** On a 5-minute grid from the start of the night, so up to 5 minutes at a window edge can go unused. */
  start: Date;
  /** End of the slot including the flip when there is one. */
  end: Date;
  /** Minutes of imaging. */
  integrationMin: number;
  /** MERIDIAN_FLIP_MIN when the slot straddles the transit, else 0. */
  flipMin: number;
  flip: boolean;
  /** Mean altitude over the slot's 5-minute samples, degrees. */
  meanAltitude: number;
}

export interface SubjectOutcome {
  subjectId: string;
  /** Imaging minutes placed tonight (flip time not counted). */
  gotMin: number;
  slot: CampaignSlot | null;
  /** Why nothing was placed tonight; null when it got a slot or was already done. */
  reason: ShortReason | null;
}

export interface CandidateFit {
  subjectId: string;
  /** Longest imaging length of at least MIN_SLOT_MIN that fits in the room left; 0 when none does. */
  fitMin: number;
  /** True when that fit straddles the transit (its flip is inside the slot). */
  flip: boolean;
  /** Why nothing fits, when `fitMin` is 0. */
  reason: ShortReason | null;
}

export interface NightPacking {
  /** Length of the usable night (from the start time to dawn), whole minutes. */
  nightMin: number;
  /** Imaging plus flip minutes of every slot. */
  usedMin: number;
  /** Slew and centring between slots (SLEW_CENTER_MIN each). */
  slewMin: number;
  /** nightMin - usedMin - slewMin. */
  leftMin: number;
  /** One entry per candidate, in input order. */
  next: CandidateFit[];
}

/** One target that still needed its first useful slot tonight. */
export interface CutEntry {
  subjectId: string;
  /** True when tonight's plan gives it a slot that makes it useful. */
  fits: boolean;
  /** Minutes it would take in the room left (slot, flip and the slew after the other slots); null when it fits, or when no slot of its minUseful fits in its clear time at all. */
  needMin: number | null;
  /** Why it does not fit; null when it fits. */
  reason: ShortReason | null;
}

/** Where tonight's list runs out: targets in list order, the free time left after the plan, the last that fits and the first that does not. */
export interface NightCutLine {
  entries: CutEntry[];
  /** Free time after the plan (the packing's leftMin). */
  leftMin: number;
  lastFitId: string | null;
  firstCutId: string | null;
  /** E.g. "ngc-b: needs 90 min, 40 left"; null when everything fits. */
  text: string | null;
}

export interface CampaignNight {
  /** YYYY-MM-DD of the evening. */
  date: string;
  /** Usable part of the night; null when there is none. */
  start: Date | null;
  end: Date | null;
  subjects: SubjectNight[];
  /** In time order. */
  slots: CampaignSlot[];
  /** In subject input order. */
  outcomes: SubjectOutcome[];
  packing: NightPacking;
  cutLine: NightCutLine;
}

/** `full`: reached maxUseful. `useful`: reached minUseful only. `cut`: never reached minUseful in the nights given. */
export type SubjectStatus = 'full' | 'useful' | 'cut';

export interface SubjectResult {
  subjectId: string;
  minUsefulMin: number;
  maxUsefulMin: number;
  /** Imaging minutes over all nights. */
  totalMin: number;
  nightsUsed: number;
  status: SubjectStatus;
  /** Why it is cut; null otherwise. */
  reason: ShortReason | null;
}

/** Where the whole list runs out, in list order. */
export interface CutLine {
  /** The last target before the first cut one that is not cut; null when the first target is cut (or there is no cut). */
  lastFitId: string | null;
  firstCutId: string | null;
  /** Minutes the first cut target would need on the night with the most room left, when a slot of its minUseful fits its clear time; null otherwise. */
  needMin: number | null;
  /** Free time after the plan on that night; null with needMin. */
  leftMin: number | null;
  /** E.g. "ngc-b: needs 90 min, 40 left (2026-12-11)", or the reason it is cut; null when nothing is cut. */
  text: string | null;
  /** Every cut target, in list order. */
  cutIds: string[];
}

export interface CampaignResult {
  nights: CampaignNight[];
  perSubject: SubjectResult[];
  cutLine: CutLine;
}
