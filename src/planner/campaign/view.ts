import type { Site } from '../astro';
import { modeForMinutes } from '../ai/view';
import type { ExposureRig } from '../exposure';
import type { HorizonPoint } from '../horizon';
import { MAX_NOTE_CHARS, WARNING_TEXT } from '../itinerary';
import type { ItineraryItem, ItineraryPlan, Slot, SlotInput } from '../itinerary';
import { clockOf, slotAltitudes } from '../itinerary/timeline';
import type { CampaignInput, CampaignNight, CampaignSubject } from './types';

/** One fixed target of My plan, as the page knows it (`type` and `surfaceBrightness` are the catalog's, and with the rig they give the useful range). */
export interface CampaignTargetIn {
  id: string;
  name: string;
  raHours: number;
  decDeg: number;
  type?: string;
  /** The catalog's mean surface brightness, mag per square arcsec. Absent when the catalog has none. */
  surfaceBrightness?: number;
}

/** The rig and sky the useful ranges are worked out for (the page's chosen train and Bortle class). */
export interface CampaignExposure {
  rig: ExposureRig;
  bortle: number;
}

/** The two per-target limits the engine takes; absent means none. */
export interface TargetLimits {
  hoursPerNight?: number;
  useful?: { minMin: number; maxMin: number };
}

export interface CampaignForm {
  targets: readonly CampaignTargetIn[];
  exposure: CampaignExposure;
  limits: Readonly<Record<string, TargetLimits>>;
  site: Site;
  timeZone: string;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** The chosen night, the evening the first night starts. */
  startDate: string;
  nights: number;
}

/** One subject from a target of My plan, carrying what the exposure engine needs to give its useful range. */
export function subjectOf(t: CampaignTargetIn, exposure: CampaignExposure, limits: TargetLimits = {}): CampaignSubject {
  return {
    id: t.id,
    name: t.name,
    targets: [{ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg }],
    ...(t.type === undefined ? {} : { type: t.type }),
    ...(t.surfaceBrightness === undefined ? {} : { surfaceBrightnessMu: t.surfaceBrightness }),
    exposure,
    ...(limits.hoursPerNight === undefined ? {} : { hoursPerNight: limits.hoursPerNight }),
    ...(limits.useful === undefined ? {} : { useful: limits.useful }),
  };
}

/** The engine's input from what the page holds: My plan in its order, one subject per target, nothing the user did not choose. */
export function campaignInputOf(form: CampaignForm): CampaignInput {
  const subjects = form.targets.map((t) => subjectOf(t, form.exposure, form.limits[t.id]));
  return { subjects, site: form.site, timeZone: form.timeZone, horizon: form.horizon, minAltitude: form.minAltitude, startDate: form.startDate, nights: form.nights };
}

/**
 * One night's slots as the manual itinerary holds them: one item per slot in time order, on the chosen train and filter, each in
 * the mode whose range holds the slot's minutes (the same helper the AI plan's apply uses), and the first slot's clock time as the
 * itinerary's start. The engine's own times and exact lengths are not kept: the itinerary times each slot again itself.
 */
export function itineraryFromNight(night: CampaignNight, number: number, trainId: string, filterId: string | null, timeZone: string): { items: ItineraryItem[]; startTime: string | null } {
  const items = night.slots.map((s, i): ItineraryItem => {
    const note = `From the several-night plan, night ${number}, slot ${i + 1} of ${night.slots.length}. The itinerary times it again with its own estimate.`;
    return { id: `s${i + 1}`, targetId: s.subjectId, trainId, filterId, mode: modeForMinutes(s.integrationMin), note: note.length <= MAX_NOTE_CHARS ? note : note.slice(0, MAX_NOTE_CHARS) };
  });
  return { items, startTime: night.slots.length > 0 ? clockOf(night.slots[0].start, timeZone) : null };
}

/** The night's slots as an `ItineraryPlan`, so the page's own night graph draws them. Times and minutes are the engine's. */
export function timelinePlanOfNight(night: CampaignNight, items: readonly ItineraryItem[], inputs: readonly SlotInput[], site: Site, horizon: readonly HorizonPoint[] | null, minAltitude: number): ItineraryPlan {
  const slots = night.slots.map((s, i): Slot => {
    const input = inputs[i];
    return {
      id: items[i].id,
      name: input.name,
      trainName: input.trainName,
      filterName: input.filterName,
      mode: items[i].mode,
      note: items[i].note,
      start: s.start,
      end: s.end,
      waitMin: 0,
      changeover: { minutes: 0, parts: [] },
      subSeconds: null,
      subCount: null,
      integrationMin: s.integrationMin,
      window: null,
      altitudes: input.problem ? null : slotAltitudes(input.source, site, s.start, s.end, horizon, minAltitude),
      warnings: [],
      // The type requires it; the night graph never draws it.
      label: 'estimate',
    };
  });
  return {
    startsAt: slots[0]?.start ?? new Date(0),
    startNote: null,
    slots,
    totals: { integrationMin: slots.reduce((n, s) => n + s.integrationMin, 0), changeoverMin: 0, waitMin: 0, filterChanges: 0, trainChanges: 0, ends: slots.length > 0 ? slots[slots.length - 1].end : null },
  };
}

const round = (x: number): number => Math.round(x);

/** The itinerary's own low-altitude words for a slot that starts or ends under the limit (the engine places slots above it, so this is empty unless the two disagree). */
export function lowAltitudeNotes(slot: Slot): string[] {
  const a = slot.altitudes;
  if (a === null) return [];
  return [
    ...(a.start.belowLimit ? [WARNING_TEXT.lowStart] : []),
    ...(a.end.belowLimit ? [WARNING_TEXT.lowEnd] : []),
  ];
}
