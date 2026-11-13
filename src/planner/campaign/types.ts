import type { Site } from '../astro';
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
  /** Hours of imaging wanted each night. */
  hoursPerNight: number;
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
  /** True when the requested length fits only as a slot that straddles the transit, flip time included (a flip cannot be avoided, whatever else is imaged). False when a clean slot fits, or when no slot of the full length fits at all. */
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
  requestedMin: number;
  /** Imaging minutes placed (flip time not counted). */
  gotMin: number;
  slot: CampaignSlot | null;
  /** Why `gotMin` is under `requestedMin`; null when it got everything. */
  reason: ShortReason | null;
}

export interface CandidateFit {
  subjectId: string;
  /** Longest imaging length of at least 30 min that fits in the room left; 0 when none does. */
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
  /** One entry per candidate and per subject that got no minutes, in input order. */
  next: CandidateFit[];
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
}

export interface CampaignResult {
  nights: CampaignNight[];
  perSubject: { subjectId: string; requestedMin: number; gotMin: number }[];
}
