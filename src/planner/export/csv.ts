import { fitLabel, seasonLabel } from '../plan';
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

/** Writes an instant as "2026-12-15 20:17 MST" in `timeZone` (IANA name; absent: the viewer's zone), so a sheet row stands alone. */
export function makeCsvTime(timeZone?: string): (d: Date) => string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  });
  return (d) => {
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} ${p.timeZoneName}`;
  };
}

/** Instant in the viewer's zone. */
export const formatCsvTime = makeCsvTime();

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
      fitLabel(e),
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
