import type { ItineraryPlan, Slot } from '../itinerary';
import { TREND_TEXT } from '../itinerary';
import { csvField } from './csv';

export const ITINERARY_CSV_HEADER = [
  'Slot',
  'Target',
  'Train',
  'Filter',
  'Mode',
  'Start',
  'End',
  'Light (min)',
  'Start altitude (deg)',
  'Start direction',
  'Middle altitude (deg)',
  'Middle direction',
  'End altitude (deg)',
  'End direction',
  'Trend',
  'Warnings',
  'Note',
] as const;

const deg = (x: number): string => x.toFixed(1);

/** One header row, then one row per slot in order; a slot with no time has blank start, end and altitudes. Lines end with CRLF. */
export function itineraryToCsv(plan: ItineraryPlan, formatTime: (d: Date) => string): string {
  const rows = plan.slots.map((s: Slot, i) => {
    const a = s.altitudes;
    const timed = a !== null;
    return [
      i + 1,
      s.name,
      s.trainName,
      s.filterName,
      s.mode,
      timed ? formatTime(s.start) : '',
      timed ? formatTime(s.end) : '',
      s.integrationMin.toFixed(1),
      a ? deg(a.start.altitude) : '',
      a ? a.start.direction : '',
      a ? deg(a.middle.altitude) : '',
      a ? a.middle.direction : '',
      a ? deg(a.end.altitude) : '',
      a ? a.end.direction : '',
      a ? TREND_TEXT[a.trend] : '',
      s.warnings.map((w) => w.text).join(' '),
      s.note,
    ]
      .map(csvField)
      .join(',');
  });
  return [ITINERARY_CSV_HEADER.map(csvField).join(','), ...rows].join('\r\n') + '\r\n';
}

/** The itinerary as JSON text: the start time and, per slot, instants (ISO 8601, UTC) and the three altitudes. */
export function itineraryToJson(plan: ItineraryPlan): string {
  const point = (p: { at: Date; altitude: number; azimuth: number; direction: string }) => ({
    at: p.at.toISOString(),
    altitudeDeg: Math.round(p.altitude * 10) / 10,
    azimuthDeg: Math.round(p.azimuth * 10) / 10,
    direction: p.direction,
  });
  return `${JSON.stringify(
    {
      startsAt: plan.startsAt.toISOString(),
      startNote: plan.startNote,
      slots: plan.slots.map((s, i) => ({
        slot: i + 1,
        target: s.name,
        train: s.trainName,
        filter: s.filterName,
        mode: s.mode,
        start: s.altitudes ? s.start.toISOString() : null,
        end: s.altitudes ? s.end.toISOString() : null,
        lightMin: Math.round(s.integrationMin * 10) / 10,
        altitudes: s.altitudes ? { start: point(s.altitudes.start), middle: point(s.altitudes.middle), end: point(s.altitudes.end), trend: s.altitudes.trend } : null,
        warnings: s.warnings.map((w) => w.text),
        note: s.note,
      })),
    },
    null,
    2,
  )}\n`;
}
