import { bodyAltAz, moonIllumination, moonSeparation, nextMeridianTransit } from '../astro';
import { nextBodyTransit } from '../astro/bodies';
import type { CardBody } from '../astro/bodies';
import type { AstronomicalNight, Site } from '../astro';
import { AUTOFOCUS_MIN, MERIDIAN_FLIP_MIN, MODE_ORDER, planExposure } from '../exposure';
import type { ExposureMode, ExposureTarget } from '../exposure';
import { usableWindows, usableWindowsOnTrack } from '../horizon';
import type { HorizonPoint, TimeWindow } from '../horizon';
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

export * from './constants';

/** Refocus after a change is the exposure module's autofocus time. */
export const REFOCUS_AFTER_CHANGE_MIN = AUTOFOCUS_MIN;

// ------------------------------------------------------------------ saved form

export const ITINERARY_VERSION = 1;
export const ITINERARY_KEY = 'fpo-planner-itinerary-v1';

export interface ItineraryItem {
  /** Unique within the itinerary; the same target may appear twice. */
  id: string;
  targetId: string;
  trainId: string;
  /** Library filter for this slot; null: no filter. */
  filterId: string | null;
  mode: ExposureMode;
  note: string;
}

export interface Itinerary {
  version: typeof ITINERARY_VERSION;
  items: ItineraryItem[];
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
  if (input.version !== ITINERARY_VERSION) throw new ItineraryError('$.version', `must be ${ITINERARY_VERSION}, found ${JSON.stringify(input.version)}`);
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
    if (!MODE_ORDER.includes(raw.mode as ExposureMode)) throw new ItineraryError(`${at}.mode`, `must be one of ${MODE_ORDER.join(', ')}`);
    if (typeof raw.note !== 'string') throw new ItineraryError(`${at}.note`, 'must be a string');
    if (raw.note.length > MAX_NOTE_CHARS) throw new ItineraryError(`${at}.note`, `at most ${MAX_NOTE_CHARS} characters`);
    return { id: raw.id as string, targetId: raw.targetId as string, trainId: raw.trainId as string, filterId: raw.filterId as string | null, mode: raw.mode as ExposureMode, note: raw.note };
  });
  return { version: ITINERARY_VERSION, items };
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

export function serializeItinerary(items: readonly ItineraryItem[]): string {
  return JSON.stringify(validateItinerary({ version: ITINERARY_VERSION, items }));
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
  /** Set when the item points at something missing from the catalog or profile; the slot shows it and takes no time. */
  problem?: string;
}

export type SlotWarningCode = 'waits' | 'overlap' | 'cut-short' | 'flip' | 'no-time' | 'problem';

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
  warnings: SlotWarning[];
  label: 'estimate';
}

export interface ItineraryPlan {
  slots: Slot[];
  /** One sentence on why the slots are in this order. */
  why: string;
  totals: { integrationMin: number; changeoverMin: number; waitMin: number; filterChanges: number; trainChanges: number; ends: Date | null };
}

export interface BuildInput {
  site: Site;
  night: AstronomicalNight;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  bortle: number;
  slots: readonly SlotInput[];
  formatTime: (d: Date) => string;
}

/** The sentences of the slot warnings, in one place so the page can reserve room for the longest of each. */
export const WARNING_TEXT = {
  waits: (name: string, waitMin: number, opens: string): string => `Waits ${waitMin} min for ${name} to clear the horizon (its window opens ${opens}).`,
  overlap: (name: string, prevEnds: string, lateMin: number, opened: string, closes: string): string =>
    `Overlaps its usable window: the slot before ends ${prevEnds}, ${lateMin} min after ${name}'s window opened (${opened}), and the window closes ${closes}.`,
  cutShort: (closes: string, lightMin: number, aimLow: number, aimHigh: number, later?: { opens: string; closes: string; lightMin: number }): string =>
    `The window closes ${closes}, so light is cut to ${lightMin} min (the mode aims for ${aimLow} to ${aimHigh}).` +
    (later
      ? ` A later window, ${later.opens} to ${later.closes}, would give ${later.lightMin} min${later.lightMin < aimLow ? `, still under the ${aimLow} the mode needs` : ''}; the slot keeps this one.`
      : ''),
  planetCut: (closes: string, minutes: number): string => {
    // 19.7 rounds to the planned 20: say "just under" then, so "cut to 20 (planned 20)" never appears.
    const shown = round(minutes) >= PLANET_SLOT_MIN ? `just under ${PLANET_SLOT_MIN}` : round(minutes);
    return `The window closes ${closes}, so the slot is cut to ${shown} min (planned ${PLANET_SLOT_MIN}).`;
  },
  flip: (name: string, flipMin: number): string => `${name} crosses the meridian during this slot: a flip adds ${flipMin} min.`,
  /** The slot sits in a later window because the planet is higher there, not because the earlier one was not clear. */
  planetWaitsHigher: (name: string, waitMin: number, opens: string): string => `Waits ${waitMin} min for ${name}'s window that opens ${opens}: the planet is higher there than in the earlier window.`,
  planetWaits: (name: string, waitMin: number, highest: string): string => `Waits ${waitMin} min so the slot is centred on ${name}'s highest point (${highest}), not on the moment its window opens.`,
  /** The slot is as high as it gets in its window, but the night's peak is not inside it. */
  planetWaitsClamped: (name: string, waitMin: number, at: string): string => `Waits ${waitMin} min so the slot is at the highest ${name} reaches in this window (${at}), not on the moment its window opens.`,
  laterWindow: (name: string, firstOpens: string, firstCloses: string, firstLightMin: number, waitMin: number, opens: string, closes: string): string =>
    `Skips its short first window (${firstOpens} to ${firstCloses}, ${firstLightMin} min of light) and waits ${waitMin} min for the window ${opens} to ${closes}, which suits the mode better.`,
  noTimeNever: (name: string): string => `No usable time left for ${name} tonight: its window never opens.`,
  /** Nothing ran before: the window closes as the night starts. */
  noTimeAtStart: (name: string, closedAt: string, nightStart: string): string => `No usable time left for ${name} tonight: its window closes at ${closedAt}, as the night starts (${nightStart}).`,
  /** The slots before were still running when the window closed. */
  noTimeSlots: (name: string, closedAt: string, slotsEnd: string): string => `No usable time left for ${name} tonight: its window closed at ${closedAt}, and the slots before end ${slotsEnd}.`,
  /** The slots before ended in time; the changeover after them ran past the close. */
  noTimeChangeover: (name: string, closedAt: string, slotsEnd: string, changeover: string, minutes: number, changeoverEnds: string): string =>
    `No usable time left for ${name} tonight: its window closed at ${closedAt}. The slots before end ${slotsEnd}, then the changeover (${changeover}; ${minutes} min in all) runs to ${changeoverEnds}, after the window closed.`,
  tooLittle: (minutes: number, name: string): string => `${minutes} min is left in ${name}'s window, too little for one sub.`,
} as const;

/** The longest each warning text can be for a target called `name` (times as 88:88, minutes as 888): what the page reserves. */
export function worstCaseWarningTexts(name: string): { severity: 'warning' | 'note'; label: string; text: string }[] {
  return [
    { severity: 'warning', label: 'Overlaps window', text: WARNING_TEXT.overlap(name, '88:88', 888, '88:88', '88:88') },
    { severity: 'note', label: 'Cut short', text: WARNING_TEXT.cutShort('88:88', 888, 888, 888, { opens: '88:88', closes: '88:88', lightMin: 888 }) },
    { severity: 'note', label: 'Meridian flip', text: WARNING_TEXT.flip(name, 88) },
    { severity: 'note', label: 'Waits', text: WARNING_TEXT.laterWindow(name, '88:88', '88:88', 888, 888, '88:88', '88:88') },
  ];
}

const minutesBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 60000;
const after = (d: Date, min: number): Date => new Date(d.getTime() + min * 60000);
const round = (x: number): number => Math.round(x);

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
  const { site, night, horizon, minAltitude, bortle, formatTime } = input;
  if (night.kind !== 'normal' || !night.start || !night.end) throw new RangeError('buildItinerary needs a normal astronomical night');
  const nightStart = night.start;
  const nightEnd = night.end;
  const slots: Slot[] = [];
  let cursor = nightStart;
  let last: SlotInput | null = null;
  const opens: { name: string; at: Date | null }[] = [];
  let filterChanges = 0;
  let trainChanges = 0;
  const tolMs = EDGE_TOLERANCE_MIN * 60000;

  for (const si of input.slots) {
    const { item } = si;
    const warnings: SlotWarning[] = [];
    const none = (why: string, code: SlotWarningCode = 'problem'): Slot => {
      warnings.push({ code, severity: 'warning', label: code === 'no-time' ? 'No time' : 'Problem', text: why });
      return {
        id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
        start: cursor, end: cursor, waitMin: 0, changeover: { minutes: 0, parts: [] }, subSeconds: null, subCount: null, integrationMin: 0, window: null, warnings, label: 'estimate',
      };
    };
    if (si.problem) {
      opens.push({ name: si.name, at: null });
      slots.push(none(si.problem));
      continue;
    }

    const common = { horizon, minAltitude, start: nightStart, end: nightEnd, stepMinutes: 5 };
    const source = si.source;
    const { windows } =
      source.kind === 'fixed'
        ? usableWindows({ ...common, raHours: source.raHours, decDeg: source.decDeg, site })
        : usableWindowsOnTrack({ ...common, altAzAt: (d) => bodyAltAz(source.body, d, site) });
    opens.push({ name: si.name, at: windows[0]?.start ?? null });

    const change = last ? changeoverBetween(last.item, item) : { minutes: 0, parts: [] };
    const earliest = after(cursor, change.minutes);
    const fitting = windows.filter((x) => x.end.getTime() > earliest.getTime() + tolMs);
    if (fitting.length === 0) {
      slots.push(none(noTimeText(si.name, windows, cursor, earliest, change, formatTime, last === null), 'no-time'));
      continue;
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
        const report = planExposure({
          target: si.exposureTarget,
          train: { focalRatio: si.optics?.focalRatio, imageScale: si.optics?.imageScale },
          camera: si.camera as ProfileCamera,
          filter: si.filter,
          sky: { bortle, moonIllumination: moonIllumination(start), moonSeparationDeg: moonSeparation(source.raHours, source.decDeg, start, site), moonUp: moonAlt > 0 },
          usableMinutes: remaining,
          acquisitionStart: start,
          transitTime: nextMeridianTransit(source.raHours, source.decDeg, start, site),
        });
        if (!report.ok) {
          return { w, start, end: start, waitMin: 0, delayedMin: 0, subSeconds, subCount, integrationMin, leftMin: remaining, short: false, aim, cut: false, flipMin, peakAt, peakHeld, altitude, unplannable: `${si.name} on ${si.trainName}: the profile lacks ${report.missing.join(', ')}, so no exposure can be planned.` };
        }
        const m = report.modes[item.mode];
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
      slots.push(none(`${si.name} cannot be planned on ${si.trainName}: it has no optics numbers (a smart scope controls its own exposures).`));
      continue;
    }
    const firstTry = attemptIn(fitting[0]);
    if (firstTry.unplannable) {
      slots.push(none(firstTry.unplannable));
      continue;
    }
    // The first window is too short for the mode: take the first later window that reaches the aim, and say so.
    let chosen = firstTry;
    let skipped: Attempt | null = null;
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
          skipped = firstTry;
          break;
        }
      }
      // No window gives the mode its minimum; if this one gives no subs at all, the later one with the most light is better than nothing.
      if (chosen === firstTry && firstTry.subCount === 0) {
        for (const later of fitting.slice(1)) {
          const a = attemptIn(later);
          if (!a.unplannable && a.integrationMin > chosen.integrationMin) {
            chosen = a;
            skipped = firstTry;
          }
        }
      }
    }
    const { w, start, end, waitMin, delayedMin } = chosen;

    if (skipped) {
      warnings.push({
        code: 'waits',
        severity: 'note',
        label: 'Waits',
        text: WARNING_TEXT.laterWindow(si.name, formatTime(skipped.w.start), formatTime(skipped.w.end), round(skipped.integrationMin), round(waitMin), formatTime(w.start), formatTime(w.end)),
      });
    } else if (waitMin > EDGE_TOLERANCE_MIN) {
      warnings.push({
        code: 'waits',
        severity: 'note',
        label: 'Waits',
        text: chosen.peakAt
          ? chosen.peakHeld
            ? WARNING_TEXT.planetWaits(si.name, round(waitMin), formatTime(chosen.peakAt))
            : WARNING_TEXT.planetWaitsClamped(si.name, round(waitMin), formatTime(chosen.peakAt))
          : chosen.w !== firstTry.w
            ? WARNING_TEXT.planetWaitsHigher(si.name, round(waitMin), formatTime(w.start))
            : WARNING_TEXT.waits(si.name, round(waitMin), formatTime(w.start)),
      });
    }
    // The slots before took part of this window. That only matters when it leaves too little for the mode.
    if (chosen.short && delayedMin > EDGE_TOLERANCE_MIN) {
      warnings.push({
        code: 'overlap',
        severity: 'warning',
        label: 'Overlaps window',
        text: WARNING_TEXT.overlap(si.name, formatTime(cursor), round(delayedMin), formatTime(w.start), formatTime(w.end)),
      });
    }
    if (source.kind === 'planet') {
      if (chosen.short) warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: WARNING_TEXT.planetCut(formatTime(w.end), round(chosen.integrationMin)) });
    } else {
      if (chosen.subCount === 0) warnings.push({ code: 'no-time', severity: 'warning', label: 'No time', text: WARNING_TEXT.tooLittle(round(minutesBetween(chosen.start, w.end)), si.name) });
      if (chosen.cut && chosen.aim) {
        // A later window that would give more light, taken or not, is named.
        let better: Attempt | null = null;
        for (const other of fitting) {
          if (other.start.getTime() <= w.start.getTime()) continue;
          const a = attemptIn(other);
          if (!a.unplannable && a.integrationMin > chosen.integrationMin && (!better || a.integrationMin > better.integrationMin)) better = a;
        }
        const later = better ? { opens: formatTime(better.w.start), closes: formatTime(better.w.end), lightMin: round(better.integrationMin) } : undefined;
        warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: WARNING_TEXT.cutShort(formatTime(w.end), chosen.integrationMin, chosen.aim[0], chosen.aim[1], later) });
      }
    }
    if (chosen.flipMin > 0) warnings.push({ code: 'flip', severity: 'note', label: 'Meridian flip', text: WARNING_TEXT.flip(si.name, chosen.flipMin) });

    slots.push({
      id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
      start, end, waitMin, changeover: change, subSeconds: chosen.subSeconds, subCount: chosen.subCount, integrationMin: chosen.integrationMin, window: w, warnings, label: 'estimate',
    });
    // A slot that runs makes the changes in front of it real; one without time makes none.
    if (end.getTime() > start.getTime()) {
      if (last) {
        filterChanges += last.item.filterId !== item.filterId ? 1 : 0;
        trainChanges += last.item.trainId !== item.trainId ? 1 : 0;
      }
      cursor = end;
      last = si;
    }
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
  return { slots, why: whyThisOrder(opens, formatTime), totals };
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

/** The no-time sentence: why no window of this target is left, naming a changeover when that is what ran past the close. */
function noTimeText(name: string, windows: readonly TimeWindow[], cursor: Date, earliest: Date, change: Changeover, formatTime: (d: Date) => string, nothingBefore: boolean): string {
  if (windows.length === 0) return WARNING_TEXT.noTimeNever(name);
  const closed = windows[windows.length - 1].end;
  if (nothingBefore) return WARNING_TEXT.noTimeAtStart(name, formatTime(closed), formatTime(cursor));
  if (cursor.getTime() + EDGE_TOLERANCE_MIN * 60000 >= closed.getTime()) return WARNING_TEXT.noTimeSlots(name, formatTime(closed), formatTime(cursor));
  return WARNING_TEXT.noTimeChangeover(name, formatTime(closed), formatTime(cursor), change.parts.map((p) => `${p.label} ${p.minutes} min`).join(', '), change.minutes, formatTime(earliest));
}

/** One short sentence on the order. The numbers of changes and waiting are in `totals`, not here, so this stays one line. */
function whyThisOrder(opens: { name: string; at: Date | null }[], formatTime: (d: Date) => string): string {
  if (opens.length === 0) return 'Add targets to build a schedule.';
  const timed = opens.filter((o): o is { name: string; at: Date } => o.at !== null);
  if (timed.length === 0) return opens.length === 1 ? 'The slot has no usable window tonight.' : 'No slot has a usable window tonight.';
  if (timed.length < 2) return opens.length === 1 ? 'One slot to place.' : `Only ${timed[0].name} has a usable window tonight.`;
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].at.getTime() < timed[i - 1].at.getTime()) {
      return `Your order: ${timed[i].name} opens at ${formatTime(timed[i].at)}, before ${timed[i - 1].name} at ${formatTime(timed[i - 1].at)}.`;
    }
  }
  return 'Ordered by when each target clears the horizon.';
}
