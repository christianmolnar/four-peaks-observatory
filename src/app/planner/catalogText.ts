import { compass, fitLabel } from '@/planner/plan';
import type { PlanEntry, ScoreParts } from '@/planner/plan';
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

/** A whole number for a degree reading, never "-0": a planet a hair below the horizon reads 0°, not -0°. */
const whole = (n: number): string => String(Math.round(n) + 0);

/** "Sat 21 Nov": the night's date for headings and sentences. Always English, so it reads the same in every browser. */
export function nightDateText(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).formatToParts(new Date(`${iso}T00:00:00Z`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
}

/** The date `days` after `iso` (YYYY-MM-DD), by calendar. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const arc = (n: number): string => `${Number(n.toFixed(n < 10 ? 1 : 0))}′`;

/** "178′ × 63′", or "" when the catalog has no size. */
export function sizeText(size: { major: number; minor: number } | undefined): string {
  if (size === undefined) return '';
  return size.major === size.minor ? arc(size.major) : `${arc(size.major)} × ${arc(size.minor)}`;
}

/** The fit in the words the page uses; the files keep `fitLabel`'s. */
export function fitWords(e: Pick<PlanEntry, 'fit' | 'isPlanet'>): string {
  return e.fit === 'fits' ? '' : e.fit === 'too-large' ? 'Too big' : fitLabel(e);
}

/** What one target does on the chosen night, in words, from its entry in the one scoring: up and when best, or not up. */
export function nightStatus(entry: PlanEntry, nightWord: string, formatTime: (d: Date) => string): string {
  if (entry.usableMinutes > 0) {
    const fit = entry.fit === 'too-large' ? ' Too big.' : '';
    return `Up ${nightWord}: clear ${(entry.usableMinutes / 60).toFixed(1)} h, peak ${whole(entry.peakAltitude)}° ${compass(entry.peakAzimuth)} at ${formatTime(entry.peakTime)}. Score ${Math.round(entry.score.total)}.${fit}`;
  }
  return `Never up ${nightWord}: peaks ${whole(entry.peakAltitude)}° ${compass(entry.peakAzimuth)}.`;
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
  return `${whole(e.peakAltitude)}° ${compass(e.peakAzimuth)} at ${formatTime(e.peakTime)}`;
}

/**
 * What a row shows under Clear: the hours the target is clear.
 */
export function rowWhy(e: PlanEntry): string {
  return `${(e.usableMinutes / 60).toFixed(1)} h`;
}

/** Why a target is in the "does not fit" group: its size against the frame, in the same numbers the note uses. */
export function fitReason(e: Pick<PlanEntry, 'fit' | 'percentOfFrame'>, size: { major: number; minor: number } | undefined, field: { long: number; short: number }): string {
  const frame = sizeText({ major: field.long, minor: field.short });
  const own = sizeText(size);
  // Round or squat objects can fit the long side and still miss the short one: say which side.
  if (e.fit === 'too-large' && size !== undefined && size.major <= field.long) {
    return `Too big (short side): ${arc(size.minor)} vs ${arc(field.short)}`;
  }
  if (e.fit === 'too-large') return `Too big: ${own} vs ${frame}`;
  return `Too small: ${own} vs ${frame}`;
}

const PART_LABELS: readonly [keyof Omit<ScoreParts, 'total'>, string, boolean][] = [
  ['usable', 'usable', true],
  ['altitude', 'altitude', true],
  ['season', 'season', false],
  ['moon', 'Moon', true],
  ['fit', 'fit', true],
  ['brightness', 'brightness', false],
  ['framing', 'framing', false],
  ['size', 'size', false],
];

/**
 * Whole numbers for the parts of a score that add up to `target` (largest remainder), so the line a reader
 * checks with a calculator is right. Returned in the order given.
 */
function wholeParts(values: readonly number[], target: number): number[] {
  const floors = values.map(Math.floor);
  let missing = target - floors.reduce((a, b) => a + b, 0);
  const byRemainder = values.map((v, i) => ({ i, r: v - floors[i] })).sort((a, b) => b.r - a.r);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    floors[i] += 1;
    missing -= 1;
  }
  return floors;
}

/**
 * The terms of the scorer's own breakdown and what they come to, as one line: "usable 50, altitude 30, Moon 0, fit 0,
 * brightness 10, framing 10 = 100". The terms are the scorer's; nothing is recomputed here except the cap it applies:
 * a sum over 100 is said to be capped, and a target with no clear time scores 0 whatever its parts.
 */
export function scorePartsText(score: ScoreParts): string {
  const shown = PART_LABELS.filter(([key, , always]) => always || score[key] !== 0);
  const sum = PART_LABELS.reduce((s, [key]) => s + score[key], 0);
  // The scorer rounds the sum to one decimal before the row rounds it to a whole number: do the same, so the line and the row agree.
  const wholeSum = Math.round(Math.round(sum * 10) / 10);
  const points = wholeParts(shown.map(([key]) => score[key]), wholeSum);
  const sumText = String(wholeSum + 0);
  const terms = shown.map(([, label], i) => `${label} ${points[i] + 0}`).join(', ');
  const total = String(Math.round(score.total));
  const outcome =
    score.total === 0 && sum > 0.05
      ? `${sumText}, but 0 because no time is clear`
      : wholeSum > Number(total)
        ? `${sumText}, capped at ${total}`
        : wholeSum < Number(total)
          ? `${sumText}, raised to ${total}`
          : total;
  return `${terms} = ${outcome}`;
}
