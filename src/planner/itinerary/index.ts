import { bodyAltAz, moonIllumination, moonSeparation, nextMeridianTransit } from '../astro';
import type { AstronomicalNight, Site } from '../astro';
import { AUTOFOCUS_MIN, MODE_ORDER, planExposure } from '../exposure';
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

/**
 * Lays the slots out in the order given, one after the other. Each starts when the one before is done and the changeover
 * is over, or when its target clears the horizon, whichever is later; its light is planned by the exposure module for the
 * time left in that window. Warns when a slot waits, starts after its window opened (the slots before took the time), is
 * cut short by its window closing, crosses the meridian, or has no usable time left. Pure: same input, same plan.
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

  for (const si of input.slots) {
    const { item } = si;
    const warnings: SlotWarning[] = [];
    const none = (why: string, code: SlotWarningCode = 'problem', changeover: Changeover = { minutes: 0, parts: [] }): Slot => {
      warnings.push({ code, severity: 'warning', label: code === 'no-time' ? 'No time' : 'Problem', text: why });
      return {
        id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
        start: cursor, end: cursor, waitMin: 0, changeover, subSeconds: null, subCount: null, integrationMin: 0, window: null, warnings, label: 'estimate',
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
    const w = windows.find((x) => x.end.getTime() > earliest.getTime() + EDGE_TOLERANCE_MIN * 60000);
    if (!w) {
      slots.push(none(`No usable time left for ${si.name} tonight: its window ${windows.length === 0 ? 'never opens' : `closed at ${formatTime(windows[windows.length - 1].end)}`}, and the slots before end ${formatTime(cursor)}.`, 'no-time'));
      continue;
    }
    const start = w.start.getTime() > earliest.getTime() ? w.start : earliest;
    const waitMin = Math.max(0, minutesBetween(earliest, start));
    const remaining = minutesBetween(start, w.end);

    if (last) {
      filterChanges += last.item.filterId !== item.filterId ? 1 : 0;
      trainChanges += last.item.trainId !== item.trainId ? 1 : 0;
    }
    if (waitMin > EDGE_TOLERANCE_MIN) {
      warnings.push({ code: 'waits', severity: 'note', label: 'Waits', text: `Waits ${round(waitMin)} min for ${si.name} to clear the horizon (its window opens ${formatTime(w.start)}).` });
    }
    // The slots before took part of this window. That only matters when it leaves too little (see cut-short below).
    const delayedMin = waitMin > EDGE_TOLERANCE_MIN || !last ? 0 : minutesBetween(w.start, start);
    const overlapWarning = (): SlotWarning => ({
      code: 'overlap',
      severity: 'warning',
      label: 'Overlaps window',
      text: `Overlaps its usable window: the slot before ends ${formatTime(cursor)}, ${round(delayedMin)} min after ${si.name}'s window opened (${formatTime(w.start)}), and the window closes ${formatTime(w.end)}.`,
    });

    let end = start;
    let subSeconds: number | null = null;
    let subCount: number | null = null;
    let integrationMin = 0;
    if (si.source.kind === 'planet') {
      integrationMin = Math.min(PLANET_SLOT_MIN, remaining);
      end = after(start, integrationMin);
      if (integrationMin < PLANET_SLOT_MIN) {
        if (delayedMin > EDGE_TOLERANCE_MIN) warnings.push(overlapWarning());
        warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: `The window closes ${formatTime(w.end)}, so the planet slot is cut to ${round(integrationMin)} min (planned ${PLANET_SLOT_MIN}).` });
      }
    } else if (!si.optics || !si.camera) {
      slots.push(none(`${si.name} cannot be planned on ${si.trainName}: it has no optics numbers (a smart scope controls its own exposures).`));
      continue;
    } else {
      const src = si.source;
      if (src.kind !== 'fixed') throw new Error('unreachable: planets are handled above');
      const moonAlt = bodyAltAz('Moon', start, site).altitude;
      const report = planExposure({
        target: si.exposureTarget,
        train: { focalRatio: si.optics.focalRatio, imageScale: si.optics.imageScale },
        camera: si.camera,
        filter: si.filter,
        sky: { bortle, moonIllumination: moonIllumination(start), moonSeparationDeg: moonSeparation(src.raHours, src.decDeg, start, site), moonUp: moonAlt > 0 },
        usableMinutes: remaining,
        acquisitionStart: start,
        transitTime: nextMeridianTransit(src.raHours, src.decDeg, start, site),
      });
      if (!report.ok) {
        slots.push(none(`${si.name} on ${si.trainName}: the profile lacks ${report.missing.join(', ')}, so no exposure can be planned.`));
        continue;
      }
      const m = report.modes[item.mode];
      subSeconds = m.subSeconds;
      subCount = m.subCount;
      integrationMin = m.integrationMin;
      end = m.finish ?? start;
      if (m.subCount === 0) {
        warnings.push({ code: 'no-time', severity: 'warning', label: 'No time', text: `${round(remaining)} min is left in ${si.name}'s window, too little for one sub.` });
      }
      if (m.warnings.some((x) => x.code === 'limited-by-usable-time')) {
        if (delayedMin > EDGE_TOLERANCE_MIN) warnings.push(overlapWarning());
        warnings.push({ code: 'cut-short', severity: 'note', label: 'Cut short', text: `The window closes ${formatTime(w.end)}, so light is cut to ${m.integrationMin} min (the mode aims for ${m.modeRangeMin[0]} to ${m.modeRangeMin[1]}).` });
      }
      if (m.warnings.some((x) => x.code === 'meridian-flip')) {
        warnings.push({ code: 'flip', severity: 'note', label: 'Meridian flip', text: `${si.name} crosses the meridian during this slot: a flip adds ${m.overhead.meridianFlipMin} min.` });
      }
    }
    slots.push({
      id: item.id, name: si.name, trainName: si.trainName, filterName: si.filterName, mode: item.mode, note: item.note,
      start, end, waitMin, changeover: change, subSeconds, subCount, integrationMin, window: w, warnings, label: 'estimate',
    });
    if (end.getTime() > start.getTime()) {
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
  return { slots, why: whyThisOrder(opens, totals, formatTime), totals };
}

function whyThisOrder(opens: { name: string; at: Date | null }[], totals: ItineraryPlan['totals'], formatTime: (d: Date) => string): string {
  if (opens.length === 0) return 'Add targets to build a schedule.';
  const timed = opens.filter((o): o is { name: string; at: Date } => o.at !== null);
  const plural = (n: number, word: string) => `${n} ${word} ${n === 1 ? 'change' : 'changes'}`;
  const changes = `${plural(totals.filterChanges, 'filter')}, ${plural(totals.trainChanges, 'train')}, ${round(totals.changeoverMin)} min of changeover, ${round(totals.waitMin)} min of waiting (estimate)`;
  if (timed.length < 2) return `One slot to place. ${changes}.`;
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].at.getTime() < timed[i - 1].at.getTime()) {
      return `Your order, not the order the targets clear the horizon: ${timed[i].name} opens ${formatTime(timed[i].at)}, before ${timed[i - 1].name} at ${formatTime(timed[i - 1].at)}. ${changes}.`;
    }
  }
  return `Ordered by when each target clears the horizon (${timed.map((o) => `${o.name} ${formatTime(o.at)}`).join(', ')}). ${changes}.`;
}
