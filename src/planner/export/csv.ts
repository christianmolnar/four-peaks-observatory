import { seasonLabel } from '../plan';
import type { PlanEntry } from '../plan';

export const CSV_HEADER = [
  'Rank',
  'Name',
  'Type',
  'Planet',
  'Season',
  'In season',
  'Fit',
  'Usable windows',
  'Usable hours',
  'Peak altitude (deg)',
  'Peak time',
  'Moon lit (%)',
  'Moon separation (deg)',
  'Score',
  'Captured',
  'Why recommended',
] as const;

/** RFC 4180 field: quoted when it holds a comma, quote or line break; quotes doubled. */
export function csvField(value: string | number): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvOptions {
  /** Formats an instant for the sheet (time zone is the caller's choice). */
  formatTime: (d: Date) => string;
  /** Ids of targets the user has marked captured. */
  captured?: ReadonlySet<string>;
}

/** One header row, then one row per entry in list order. Lines end with CRLF. */
export function planToCsv(entries: readonly PlanEntry[], options: CsvOptions): string {
  const { formatTime, captured } = options;
  const rows = entries.map((e, i) =>
    [
      i + 1,
      e.name,
      e.type,
      e.isPlanet ? 'yes' : 'no',
      seasonLabel(e.seasonMonths),
      e.inSeason === null ? '' : e.inSeason ? 'yes' : 'no',
      e.fit,
      e.windows.map((w) => `${formatTime(w.start)} to ${formatTime(w.end)}`).join('; '),
      (e.usableMinutes / 60).toFixed(2),
      e.peakAltitude.toFixed(1),
      formatTime(e.peakTime),
      (e.moonIllumination * 100).toFixed(0),
      e.moonSeparation.toFixed(0),
      e.score.total,
      captured?.has(e.id) ? 'yes' : 'no',
      e.why,
    ]
      .map(csvField)
      .join(','),
  );
  return [CSV_HEADER.map(csvField).join(','), ...rows].join('\r\n') + '\r\n';
}
