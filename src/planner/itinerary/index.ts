import { bodyAltAz, moonIllumination, moonSeparation, nextMeridianTransit } from '../astro';
import { nextBodyTransit } from '../astro/bodies';
import type { CardBody } from '../astro/bodies';
import type { AstronomicalNight, Site } from '../astro';
import { AUTOFOCUS_MIN, MERIDIAN_FLIP_MIN, MODE_ORDER, exposureFor, presetForSavedMode } from '../exposure';
import type { ExposureMode, ExposureOverrides, ExposureTarget } from '../exposure';
import { usableWindows, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint, TimeWindow } from '../horizon';
import { altAzOf } from '../plan';
import type { TargetSource } from '../plan';
import type { ProfileCamera, ProfileFilter } from '../profile';
import {
  EDGE_TOLERANCE_MIN,
  FILTER_CHANGE_MIN,
  MAX_NOTE_CHARS,
  MAX_SLOTS,
  PLANET_MIN_USEFUL_MIN,
  PLANET_SLOT_MIN,
  SLEW_CENTER_MIN,
  TRAIN_CHANGE_MIN,
} from './constants';
import { CLOCK_RE, slotAltitudes } from './timeline';
import type { SlotAltitudes } from './timeline';

export * from './constants';
export * from './timeline';

/** Refocus after a change is the exposure module's autofocus time. */
export const REFOCUS_AFTER_CHANGE_MIN = AUTOFOCUS_MIN;

// ------------------------------------------------------------------ saved form

/** Version 2 added `startTime`. Version 1 (items only) still loads, with the start at the night's start. */
export const ITINERARY_VERSION = 2;
const LEGACY_VERSION = 1;
export const ITINERARY_KEY = 'fpo-planner-itinerary-v1';

export interface ItineraryItem {
  /** Unique within the itinerary; the same target may appear twice. */
  id: string;
  targetId: string;
  trainId: string;
  /** Library filter for this slot; null: no filter. */
  filterId: string | null;
  mode: ExposureMode;
  /** The user's own sub length, count or total, over `mode` (a Custom target of the plan); absent: the preset's own numbers. Not part of the saved form. */
  overrides?: ExposureOverrides;
  note: string;
}

export interface Itinerary {
  version: typeof ITINERARY_VERSION;
  items: ItineraryItem[];
  /** When imaging can start, as a 24 h clock time ("21:30") in the site's time zone; null: when the night starts. */
  startTime: string | null;
}

export class ItineraryError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'ItineraryError';
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks a parsed value field by field. Throws ItineraryError with the path of the first problem; never repairs. */
export function validateItinerary(input: unknown): Itinerary {
  if (!isRecord(input)) throw new ItineraryError('$', 'must be an object');
  if (input.version !== ITINERARY_VERSION && input.version !== LEGACY_VERSION) throw new ItineraryError('$.version', `must be ${ITINERARY_VERSION} (or ${LEGACY_VERSION}), found ${JSON.stringify(input.version)}`);
  let startTime: string | null = null;
  if (input.version === ITINERARY_VERSION) {
    const t = input.startTime;
    if (t !== null && (typeof t !== 'string' || !CLOCK_RE.test(t))) throw new ItineraryError('$.startTime', 'must be a 24 h time such as "21:30", or null');
    startTime = t;
  }
  if (!Array.isArray(input.items)) throw new ItineraryError('$.items', 'must be an array');
  if (input.items.length > MAX_SLOTS) throw new ItineraryError('$.items', `at most ${MAX_SLOTS} slots, found ${input.items.length}`);
  const ids = new Set<string>();
  const items = input.items.map((raw: unknown, i: number): ItineraryItem => {
    const at = `$.items[${i}]`;
    if (!isRecord(raw)) throw new ItineraryError(at, 'must be an object');
    for (const k of ['id', 'targetId', 'trainId'] as const) {
      if (typeof raw[k] !== 'string' || raw[k] === '') throw new ItineraryError(`${at}.${k}`, 'must be a non-empty string');
    }
    if (ids.has(raw.id as string)) throw new ItineraryError(`${at}.id`, `duplicate id "${raw.id}"`);
    ids.add(raw.id as string);
    if (raw.filterId !== null && (typeof raw.filterId !== 'string' || raw.filterId === '')) throw new ItineraryError(`${at}.filterId`, 'must be a filter id or null');
    const mode = presetForSavedMode(raw.mode);
    if (mode === null) throw new ItineraryError(`${at}.mode`, `must be one of ${MODE_ORDER.join(', ')}`);
    if (typeof raw.note !== 'string') throw new ItineraryError(`${at}.note`, 'must be a string');
    if (raw.note.length > MAX_NOTE_CHARS) throw new ItineraryError(`${at}.note`, `at most ${MAX_NOTE_CHARS} characters`);
    return { id: raw.id as string, targetId: raw.targetId as string, trainId: raw.trainId as string, filterId: raw.filterId as string | null, mode, note: raw.note };
  });
  return { version: ITINERARY_VERSION, items, startTime };
}

export function parseItinerary(text: string): Itinerary {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new ItineraryError('$', `not valid JSON (${(e as Error).message})`);
  }
  return validateItinerary(value);
}

export function serializeItinerary(items: readonly ItineraryItem[], startTime: string | null = null): string {
  return JSON.stringify(validateItinerary({ version: ITINERARY_VERSION, items, startTime }));
}

/** A copy with the item moved one place up (-1) or down (+1). At either end, or for an unknown id, the same order comes back. */
export function moveItem(items: readonly ItineraryItem[], id: string, delta: -1 | 1): ItineraryItem[] {
  const i = items.findIndex((x) => x.id === id);
  const j = i + delta;
  const next = [...items];
  if (i < 0 || j < 0 || j >= items.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ------------------------------------------------------------------- scheduling

export interface SlotInput {
  item: ItineraryItem;
  name: string;
  source: TargetSource;
  exposureTarget: ExposureTarget;
  trainName: string;
  /** Shown for the slot: the filter's name, or "No filter". */
  filterName: string;
  /** Null when the train has no optics numbers (a smart scope) or could not be resolved. */
  optics: { focalRatio?: number; imageScale?: number } | null;
  camera: ProfileCamera | null;
  filter: ProfileFilter | null;
  /** Why the train's gear gives no exposure (a number not set, or outside its range), as one plain sentence; null when it does. */
  gearNote?: string | null;
  /** Set when the item points at something missing from the catalog or profile; the slot shows it and takes no time. */
  problem?: string;
}

export type SlotWarningCode = 'cut-short' | 'flip' | 'no-time' | 'problem' | 'low-start' | 'low-end';

export interface SlotWarning {
  code: SlotWarningCode;
  /** The word the page shows next to the text, so the cue is not colour only. */
  severity: 'warning' | 'note';
  /** A few words for the chip. */
  label: string;
  text: string;
}

export interface Changeover {
  minutes: number;
  /** Each charge with its minutes, e.g. "train change 15". */
  parts: { label: string; minutes: number }[];
}

export interface Slot {
  id: string;
  name: string;
  trainName: string;
  filterName: string;
  mode: ExposureMode;
  note: string;
  /** Imaging start and end; equal when the slot has no usable time. */
  start: Date;
  end: Date;
  /** Minutes waited between the end of the changeover and the start. */
  waitMin: number;
  changeover: Changeover;
  /** Null for a planet (short clips, not subs) and for a slot with no estimate. */
  subSeconds: number | null;
  subCount: number | null;
  /** Minutes of light. */
  integrationMin: number;
  /** The slot's own usable window, when it has one. */
  window: TimeWindow | null;
  /** Altitude, direction and trend at the start, middle and end; null for a slot with no time. */
  altitudes: SlotAltitudes | null;
  warnings: SlotWarning[];
  label: 'estimate';
}

/** The one definition of "Light": whole minutes of imaging in the plan. The totals line and the order advice both print this. */
export const lightMinutes = (plan: Pick<ItineraryPlan, 'totals'>): number => Math.round(plan.totals.integrationMin);

export interface ItineraryPlan {
  /** When imaging can start: the time asked for, or the night's start when none was asked for or it fell before the night. */
  startsAt: Date;
  /** Plain words when the time asked for was moved or leaves no night; null otherwise. */
  startNote: string | null;
  slots: Slot[];
  totals: { integrationMin: number; changeoverMin: number; waitMin: number; filterChanges: number; trainChanges: number; ends: Date | null };
}

export interface BuildInput {
  site: Site;
  night: AstronomicalNight;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  bortle: number;
  slots: readonly SlotInput[];
  /** When imaging can start (setup is done before this). Absent or null: when the astronomical night starts. */
  startAt?: Date | null;
  formatTime: (d: Date) => string;
  /** Finds a target's usable windows; a caller that builds many plans for one night passes `makeWindowLookup` so they are found once. Absent: found per call. */
  windows?: (source: TargetSource) => TimeWindow[];
}

/** The words of the slot warnings: a few words each, no reasons. */
export const WARNING_TEXT = {
  cutShort: 'Cut short',
  flip: (flipMin: number): string => `Flip +${flipMin} min`,
  noTimeLeft: 'No time left',
  gearIncomplete: 'Gear incomplete',
  noExposure: 'Smart scope',
  lowStart: 'Starts low',
  lowEnd: 'Ends low',
  startBeforeNight: 'Start before night',
  startAfterNight: 'Start after night',
} as const;

const minutesBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 60000;
const after = (d: Date, min: number): Date => new Date(d.getTime() + min * 60000);

export function changeoverBetween(prev: Pick<ItineraryItem, 'trainId' | 'filterId'>, next: Pick<ItineraryItem, 'trainId' | 'filterId'>): Changeover {
  const parts = [{ label: 'slew and centre', minutes: SLEW_CENTER_MIN }];
  const trainChanged = prev.trainId !== next.trainId;
  const filterChanged = prev.filterId !== next.filterId;
  if (trainChanged) parts.push({ label: 'train change', minutes: TRAIN_CHANGE_MIN });
  if (filterChanged) parts.push({ label: 'filter change', minutes: FILTER_CHANGE_MIN });
  if (trainChanged || filterChanged) parts.push({ label: 'refocus', minutes: REFOCUS_AFTER_CHANGE_MIN });
  return { minutes: parts.reduce((s, p) => s + p.minutes, 0), parts };
}

/** One try at placing a slot inside one usable window. */
interface Attempt {
  w: TimeWindow;
  start: Date;
  /** End of the slot, flip time included. */
  end: Date;
  waitMin: number;
  /** Minutes the slots before took from the start of this window (0 when the slot waits for the window). */
  delayedMin: number;
  subSeconds: number | null;
  subCount: number | null;
  integrationMin: number;
  /** Minutes the window leaves from the earliest start (a flip does not shorten it); planet windows are compared on it. */
  leftMin: number;
  /** True when the window leaves less light than the mode aims for (planet: than PLANET_SLOT_MIN). */
  short: boolean;
  /** The light that was aimed for, for the cut-short text. */
  aim: [number, number] | null;
  /** The slot ends because the window closes, not because the aim was met. */
  cut: boolean;
  flipMin: number;
  /** Planets: the slot was moved to the highest point it can reach in its window. */
  peakAt: Date | null;
  /** Planets: the slot is centred on the planet's highest point of the window (not held back by the window's edge). */
  peakHeld: boolean;
  /** Planets: altitude at the middle of the light, degrees; the windows are compared on it. */
  altitude: number;
  /** The exposure module could not plan this slot at all. */
  unplannable?: string;
}

/**
 * Lays the slots out in the order given, one after the other. Each starts when the one before is done and the changeover
 * is over, or when its target clears the horizon, whichever is later; its light is planned by the exposure module for the
 * time left in that window. A planet slot is centred on the planet's highest point where its window allows, in the
 * window where that is highest. When the first window that fits leaves less light than the mode aims for and a later window reaches the aim,
 * the slot waits for the later one. Warns when a slot waits, starts after its window opened and so gets too little,
 * is cut short by its window closing, crosses the meridian, or has no usable time left. Pure: same input, same plan.
 */
export function buildItinerary(input: BuildInput): ItineraryPlan {
  const scheduler = makeScheduler(input);
  const slots: Slot[] = [];
  const opens: { name: string; at: Date | null }[] = [];
  let state = scheduler.initial;
  let filterChanges = 0;
  let trainChanges = 0;
  for (const si of input.slots) {
    const placed = scheduler.place(si, state);
    slots.push(placed.slot);
    opens.push({ name: si.name, at: placed.opensAt });
    filterChanges += placed.filterChange ? 1 : 0;
    trainChanges += placed.trainChange ? 1 : 0;
    state = placed.next;
  }
  const real = slots.filter((s) => s.end.getTime() > s.start.getTime());
  const totals = {
    integrationMin: real.reduce((s, x) => s + x.integrationMin, 0),
    changeoverMin: real.reduce((s, x) => s + x.changeover.minutes, 0),
    waitMin: real.reduce((s, x) => s + x.waitMin, 0),
    filterChanges,
    trainChanges,
    ends: real.length > 0 ? real[real.length - 1].end : null,
  };
  return { startsAt: scheduler.startsAt, startNote: scheduler.startNote, slots, totals };
}

/** Where a schedule stands after some slots: when the last one ended and which one it was (the next changeover depends on it). */
export interface ScheduleState {
  cursor: Date;
  last: SlotInput | null;
}

/** One slot placed. */
export interface Placement {
  slot: Slot;
  /** When the target's first usable window opens (null: no window, or the slot has a problem); the "why this order" sentence reads it. */
  opensAt: Date | null;
  /** True when the slot got time (it ends after it starts); false: it changed nothing. */
  ran: boolean;
  /** The state for the slot after this one; the state it was given when this slot got no time. */
  next: ScheduleState;
  filterChange: boolean;
  trainChange: boolean;
  /** Only when `place` ran with `lean`: altitude of the target at the middle of the slot, for the search's altitude tie-break. */
  middleAltitude: number | null;
}

export interface Scheduler {
  startsAt: Date;
  startNote: string | null;
  initial: ScheduleState;
  /**
   * Places one slot after the given state. `lean` skips what the order search does not read (warning texts, the altitude
   * table, the look at other windows for a sentence) and returns only the middle altitude; start, end and light are
   * computed by exactly the same steps either way.
   */
  place(si: SlotInput, state: ScheduleState, lean?: boolean): Placement;
  /** The slot's target's usable windows tonight, found once per slot. */
  windows(si: SlotInput): TimeWindow[];
}

/**
 * The scheduler behind `buildItinerary`: it holds what is the same for every slot (the start, the night, each target's
 * usable windows, found once) and places one slot at a time. `buildItinerary` calls it in the order given; the order search
 * calls it for every prefix it tries, so what it scores is what the page shows.
 */
export function makeScheduler(input: BuildInput): Scheduler {
  const { site, night, horizon, minAltitude, bortle } = input;
  if (night.kind !== 'normal' || !night.start || !night.end) throw new RangeError('buildItinerary needs a normal astronomical night');
  const nightStart = night.start;
  const nightEnd = night.end;
  const asked = input.startAt ?? null;
  // The clock has no seconds: a time in the same minute as the night start (18:53 for 18:53:17) is the night start.
  const beforeNight = asked !== null && Math.floor(asked.getTime() / 60000) < Math.floor(nightStart.getTime() / 60000);
  const startsAt = asked && asked.getTime() > nightStart.getTime() ? asked : nightStart;
  const afterNight = startsAt.getTime() >= nightEnd.getTime();
  const startNote = asked === null ? null : beforeNight ? WARNING_TEXT.startBeforeNight : afterNight ? WARNING_TEXT.startAfterNight : null;
  const tolMs = EDGE_TOLERANCE_MIN * 60000;
  const lookup = input.windows ?? makeWindowLookup(input);
  const windowsOf = (si: SlotInput): TimeWindow[] => lookup(si.source);
  // Lean placements depend only on the slot, when the one before ended and which train and filter it left on, so they are remembered.
  const leanMemo = new Map<SlotInput, Map<string, Placement>>();

  const placeOnce = (si: SlotInput, state: ScheduleState, lean: boolean): Placement => {
    const { cursor, last } = state;
    const { item } = si;
    const warnings: SlotWarning[] = [];
    const none = (why: string, code: SlotWarningCode = 'problem'): Slot => {
      warnings.push({ code, severity: 'warning', label: code === 'no-time' ? 'No time' : 'Problem', text: why });
      return {
        id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
        start: cursor, end: cursor, waitMin: 0, changeover: { minutes: 0, parts: [] }, subSeconds: null, subCount: null, integrationMin: 0, window: null, altitudes: null, warnings, label: 'estimate',
      };
    };
    const idle = (slot: Slot, opensAt: Date | null): Placement => ({ slot, opensAt, ran: false, next: state, filterChange: false, trainChange: false, middleAltitude: null });
    if (si.problem) return idle(none(si.problem), null);
    if (afterNight) return idle(none(WARNING_TEXT.startAfterNight, 'no-time'), null);
    const source = si.source;
    const windows = windowsOf(si);
    const opensAt = windows[0]?.start ?? null;

    const change = last ? changeoverBetween(last.item, item) : { minutes: 0, parts: [] };
    const earliest = after(cursor, change.minutes);
    const fitting = windows.filter((x) => x.end.getTime() > earliest.getTime() + tolMs);
    if (fitting.length === 0) {
      return idle(none(WARNING_TEXT.noTimeLeft, 'no-time'), opensAt);
    }

    const attemptIn = (w: TimeWindow): Attempt => {
      const from = w.start.getTime() > earliest.getTime() ? w.start : earliest;
      const remaining = minutesBetween(from, w.end);
      let start = from;
      let waitMin: number;
      let end: Date;
      let subSeconds: number | null = null;
      let subCount: number | null = null;
      let integrationMin = 0;
      let short: boolean;
      let aim: [number, number] | null = null;
      let flipMin = 0;
      let peakAt: Date | null = null;
      let peakHeld = false;
      let altitude = 0;
      let cut: boolean;
      if (source.kind === 'planet') {
        const length = Math.min(PLANET_SLOT_MIN, remaining);
        const peak = peakTime(source.body, from, w.end, site);
        start = clampDate(after(peak, -length / 2), from, after(w.end, -length));
        if (start.getTime() - from.getTime() > tolMs && start.getTime() - w.start.getTime() > tolMs) peakAt = peak;
        peakHeld = Math.abs(peak.getTime() - after(start, length / 2).getTime()) <= tolMs;
        const transit = nextBodyTransit(source.body, start, site);
        if (transit.getTime() >= start.getTime() && transit.getTime() <= after(start, length).getTime()) flipMin = MERIDIAN_FLIP_MIN;
        integrationMin = Math.max(0, Math.min(length, minutesBetween(start, w.end) - flipMin));
        end = after(start, integrationMin + (integrationMin > 0 ? flipMin : 0));
        if (integrationMin === 0) flipMin = 0;
        short = integrationMin < PLANET_SLOT_MIN;
        cut = short;
        waitMin = minutesBetween(earliest, start);
        altitude = bodyAltAz(source.body, after(start, integrationMin / 2), site).altitude;
      } else {
        if (source.kind !== 'fixed') throw new Error('unreachable: planets are handled above');
        const moonAlt = bodyAltAz('Moon', start, site).altitude;
        const m = exposureFor(
          si.exposureTarget,
          { train: { focalRatio: si.optics?.focalRatio, imageScale: si.optics?.imageScale }, camera: si.camera as ProfileCamera, filter: si.filter },
          { bortle },
          {
            moonIllumination: moonIllumination(start),
            moonSeparationDeg: moonSeparation(source.raHours, source.decDeg, start, site),
            moonUp: moonAlt > 0,
            usableMinutes: remaining,
            acquisitionStart: start,
            transitTime: nextMeridianTransit(source.raHours, source.decDeg, start, site),
          },
          { preset: item.mode, ...(item.overrides ? { overrides: item.overrides } : {}) },
        );
        if (!m.ok) {
          return { w, start, end: start, waitMin: 0, delayedMin: 0, subSeconds, subCount, integrationMin, leftMin: remaining, short: false, aim, cut: false, flipMin, peakAt, peakHeld, altitude, unplannable: WARNING_TEXT.gearIncomplete };
        }
        subSeconds = m.subSeconds;
        subCount = m.subCount;
        integrationMin = m.integrationMin;
        end = m.finish ?? start;
        aim = [m.modeRangeMin[0], m.modeRangeMin[1]];
        short = m.integrationMin < m.modeRangeMin[0];
        cut = m.warnings.some((x) => x.code === 'limited-by-usable-time');
        flipMin = m.warnings.some((x) => x.code === 'meridian-flip') ? m.overhead.meridianFlipMin : 0;
        waitMin = minutesBetween(earliest, start);
      }
      const delayedMin = waitMin > EDGE_TOLERANCE_MIN || !last ? 0 : minutesBetween(w.start, start);
      return { w, start, end, waitMin: Math.max(0, waitMin), delayedMin, subSeconds, subCount, integrationMin, leftMin: remaining, short, aim, cut, flipMin, peakAt, peakHeld, altitude };
    };

    if (source.kind !== 'planet' && (!si.optics || !si.camera)) {
      return idle(none(WARNING_TEXT.noExposure), opensAt);
    }
    const firstTry = attemptIn(fitting[0]);
    if (firstTry.unplannable) return idle(none(firstTry.unplannable), opensAt);
    // The first window is too short for the mode: take the first later window that reaches the aim, and say so.
    let chosen = firstTry;
    if (source.kind === 'planet') {
      // A planet has no mode to satisfy: of all the windows that fit, take the one where the slot is highest. A window that
      // leaves under half a slot is taken only when no window leaves more; the first such sliver stays.
      const clears = (x: Attempt): boolean => x.leftMin >= PLANET_MIN_USEFUL_MIN;
      for (const later of fitting.slice(1)) {
        const a = attemptIn(later);
        if (a.integrationMin <= 0) continue;
        if (clears(a) && (!clears(chosen) || a.altitude > chosen.altitude)) chosen = a;
      }
    } else if (firstTry.short) {
      for (const later of fitting.slice(1)) {
        const a = attemptIn(later);
        if (!a.short) {
          chosen = a;
          break;
        }
      }
      // No window gives the mode its minimum; if this one gives no subs at all, the later one with the most light is better than nothing.
      if (chosen === firstTry && firstTry.subCount === 0) {
        for (const later of fitting.slice(1)) {
          const a = attemptIn(later);
          if (!a.unplannable && a.integrationMin > chosen.integrationMin) {
            chosen = a;
            }
        }
      }
    }
    const { w, start, end, waitMin } = chosen;

    // The order search reads only times and light; the sentences and the other windows they name are for the page.
    if (!lean) {
      if (source.kind === 'planet') {
        if (chosen.short) warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: WARNING_TEXT.cutShort });
      } else {
        if (chosen.subCount === 0) warnings.push({ code: 'no-time', severity: 'warning', label: 'No time', text: WARNING_TEXT.noTimeLeft });
        if (chosen.cut && chosen.aim) {
          warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: WARNING_TEXT.cutShort });
        }
      }
      if (chosen.flipMin > 0) warnings.push({ code: 'flip', severity: 'note', label: 'Meridian flip', text: WARNING_TEXT.flip(chosen.flipMin) });
    }

    const runs = end.getTime() > start.getTime();
    const altitudes = runs && !lean ? slotAltitudes(source, site, start, end, horizon, minAltitude) : null;
    if (altitudes?.start.belowLimit) warnings.push({ code: 'low-start', severity: 'warning', label: 'Low start', text: WARNING_TEXT.lowStart });
    if (altitudes?.end.belowLimit) warnings.push({ code: 'low-end', severity: 'warning', label: 'Low end', text: WARNING_TEXT.lowEnd });
    const slot: Slot = {
      id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
      start, end, waitMin, changeover: change, subSeconds: chosen.subSeconds, subCount: chosen.subCount, integrationMin: chosen.integrationMin, window: w, altitudes, warnings, label: 'estimate',
    };
    // A slot that runs makes the changes in front of it real; one without time makes none.
    if (!runs) return { ...idle(slot, opensAt) };
    return {
      slot,
      opensAt,
      ran: true,
      next: { cursor: end, last: si },
      filterChange: last !== null && last.item.filterId !== item.filterId,
      trainChange: last !== null && last.item.trainId !== item.trainId,
      middleAltitude: lean ? altAzOf(source, site, new Date(start.getTime() + (end.getTime() - start.getTime()) / 2)).altitude : null,
    };
  };

  const place = (si: SlotInput, state: ScheduleState, lean = false): Placement => {
    if (!lean) return placeOnce(si, state, false);
    let memo = leanMemo.get(si);
    if (!memo) leanMemo.set(si, (memo = new Map()));
    const key = `${state.cursor.getTime()}|${state.last ? `${state.last.item.trainId}/${state.last.item.filterId}` : '-'}`;
    let p = memo.get(key);
    if (!p) memo.set(key, (p = placeOnce(si, state, true)));
    return p.ran ? p : { ...p, next: state };
  };

  return { startsAt, startNote, initial: { cursor: startsAt, last: null }, place, windows: windowsOf };
}

/** `windowsFor` that remembers each target (by where it is, not by object), for the many plans built for one night, site, horizon and minimum. */
export function makeWindowLookup(input: Pick<BuildInput, 'site' | 'night' | 'horizon' | 'minAltitude'>): (source: TargetSource) => TimeWindow[] {
  const found = new Map<string, TimeWindow[]>();
  return (source) => {
    const key = source.kind === 'fixed' ? `${source.raHours},${source.decDeg}` : source.body;
    let w = found.get(key);
    if (!w) found.set(key, (w = windowsFor(source, input)));
    return w;
  };
}

/** A target's usable windows between the night's start and end (above the horizon and the minimum altitude). */
export function windowsFor(source: TargetSource, input: Pick<BuildInput, 'site' | 'night' | 'horizon' | 'minAltitude'>): TimeWindow[] {
  const { site, night, horizon, minAltitude } = input;
  const common = { horizon, minAltitude, start: night.start as Date, end: night.end as Date, stepMinutes: 5 };
  return (
    source.kind === 'fixed'
      ? usableWindows({ ...common, raHours: source.raHours, decDeg: source.decDeg, site })
      : usableWindowsOnTrack({ ...common, altAzAt: (d) => bodyAltAz(source.body, d, site) })
  ).windows;
}

const clampDate = (d: Date, lo: Date, hi: Date): Date => (d.getTime() < lo.getTime() ? lo : d.getTime() > hi.getTime() ? hi : d);

/**
 * Where a planet is highest inside [from, to]: its meridian crossing when that falls inside, else the end of the span
 * where it is higher (it is still climbing at the close, or already falling at the open).
 */
function peakTime(body: CardBody, from: Date, to: Date, site: Site): Date {
  const transit = nextBodyTransit(body, from, site);
  if (transit.getTime() <= to.getTime()) return transit;
  return bodyAltAz(body, from, site).altitude >= bodyAltAz(body, to, site).altitude ? from : to;
}
