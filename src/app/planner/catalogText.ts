import { compass } from '@/planner/plan';
import type { PlanEntry } from '@/planner/plan';

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
    return `Up ${nightWord}: clear ${(entry.usableMinutes / 60).toFixed(1)} h, peak ${entry.peakAltitude.toFixed(0)}° ${compass(entry.peakAzimuth)} at ${formatTime(entry.peakTime)}. Score ${entry.score.total}.${fit}`;
  }
  return `Not up ${nightWord}: it peaks at ${entry.peakAltitude.toFixed(0)}° ${compass(entry.peakAzimuth)}, never clear of your horizon and minimum altitude.`;
}
