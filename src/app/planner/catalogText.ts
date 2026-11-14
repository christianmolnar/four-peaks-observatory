import { compass } from '@/planner/plan';
import type { PlanEntry } from '@/planner/plan';
import { DEFAULT_MIN_FRAME_PERCENT } from '@/planner/plan/rank';

/** "planetary-nebula" as "Planetary nebula". */
export function typeLabel(type: string): string {
  const t = type.replace(/-/g, ' ');
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}

/** The catalog designation of an id: "ngc224" as "NGC 224", "m31" as "M31", "eso351-030" as "ESO 351-030"; "" for an id that is only a slug ("leo-triplet"). */
export function designationOf(id: string): string {
  const m = /^(m|ngc|ic|c|mel|cr|b)(\d+[a-z]*)$/.exec(id);
  if (m !== null) return m[1] === 'm' ? `M${m[2]}` : `${m[1].toUpperCase()} ${m[2]}`;
  const eso = /^([a-z]+)(\d+-\d+)$/.exec(id);
  return eso === null ? '' : `${eso[1].toUpperCase()} ${eso[2]}`;
}

const arc = (n: number): string => `${Number(n.toFixed(n < 10 ? 1 : 0))}′`;

/** "178′ × 63′", or "" when the catalog has no size. */
export function sizeText(size: { major: number; minor: number } | undefined): string {
  if (size === undefined) return '';
  return size.major === size.minor ? arc(size.major) : `${arc(size.major)} × ${arc(size.minor)}`;
}

/** What one target does on the chosen night, in words, from its entry in the one scoring: up and when best, or not up. */
export function nightStatus(entry: PlanEntry, nightWord: string, formatTime: (d: Date) => string): string {
  if (entry.usableMinutes > 0) {
    const fit = entry.fit === 'too-large' ? ' Larger than this frame.' : '';
    return `Up ${nightWord}: clear ${(entry.usableMinutes / 60).toFixed(1)} h, peak ${entry.peakAltitude.toFixed(0)}° ${compass(entry.peakAzimuth)} at ${formatTime(entry.peakTime)}. Score ${Math.round(entry.score.total)}.${fit}`;
  }
  return `Not up ${nightWord}: it peaks at ${entry.peakAltitude.toFixed(0)}° ${compass(entry.peakAzimuth)}, never clear of your horizon and minimum altitude.`;
}

/** "A, B and C"; with `more` left out: "A, B, C and 12 more". */
export function nameList(names: readonly string[], more = 0): string {
  if (more > 0) return `${names.join(', ')} and ${more} more`;
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The night's first usable minute to its last, "18:50–03:37"; the detail lists every window when there are several. */
export function upRange(e: Pick<PlanEntry, 'windows'>, formatTime: (d: Date) => string): string {
  if (e.windows.length === 0) return 'never clear';
  return `${formatTime(e.windows[0].start)}–${formatTime(e.windows[e.windows.length - 1].end)}`;
}

/** "86° N at 23:40". */
export function peakText(e: Pick<PlanEntry, 'peakAltitude' | 'peakAzimuth' | 'peakTime'>, formatTime: (d: Date) => string): string {
  return `${e.peakAltitude.toFixed(0)}° ${compass(e.peakAzimuth)} at ${formatTime(e.peakTime)}`;
}

/**
 * The short reason shown in a row: the facts that tell this target from the next one (hours clear, share of the frame,
 * brightness for its kind, the Moon), not a sentence every row shares. The full reason is in the detail.
 */
export function rowWhy(e: PlanEntry): string {
  const parts = [`${(e.usableMinutes / 60).toFixed(1)} h clear`];
  if (e.percentOfFrame !== null) parts.push(`fills ${e.percentOfFrame < 10 ? e.percentOfFrame.toFixed(1) : e.percentOfFrame.toFixed(0)}% of the frame`);
  if (e.score.brightness >= 5) parts.push('bright for its kind');
  else if (e.score.brightness <= -5) parts.push('faint for its kind');
  if (!e.moonUp) parts.push('Moon down');
  else if (e.score.moon <= -5) parts.push(`Moon ${e.moonSeparation.toFixed(0)}° away`);
  return parts.join(', ');
}

/** Why a target is in the "does not fit" group: its size against the frame, in the same numbers the note uses. */
export function fitReason(e: Pick<PlanEntry, 'fit' | 'percentOfFrame'>, size: { major: number; minor: number } | undefined, field: { long: number; short: number }): string {
  const frame = sizeText({ major: field.long, minor: field.short });
  const own = sizeText(size);
  if (e.fit === 'too-large') return `Larger than this frame: ${own} vs your ${frame}`;
  return `Smaller than this frame can use: ${own} is under ${DEFAULT_MIN_FRAME_PERCENT}% of your ${frame}`;
}
