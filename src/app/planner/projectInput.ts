import { enterText } from '@/planner/profile';
import type { GearLimit } from '@/planner/profile';

/** What a typed box holds: a number in range, an allowed blank, or one sentence saying what is wrong (never a raw value, a path, NaN or Infinity). */
export type BoxResult = { ok: true; value: number | null } | { ok: false; message: string };

const WHOLE = /^\d+$/;
const DECIMAL = /^\d+(?:\.\d+)?$/;
const NEGATIVE = /^-\d+(?:\.\d+)?$/;

/** The text as the user typed it, cut short and on one line, so a pasted block never fills the page. */
const shown = (t: string): string => {
  const one = t.replace(/\s+/g, ' ');
  return one.length > 20 ? `${one.slice(0, 20)}…` : one;
};

/**
 * Reads a box of text as a number inside `limit` (the project's own limits). Digits only: no sign, no exponent, no thousands separator, no unit.
 * `blank: true` lets an empty box mean "none" (value null). Every refusal is `Label: what is wrong. Enter ...`.
 */
export function readBox(limit: GearLimit, text: string, label: string, opts: { blank?: boolean } = {}): BoxResult {
  const t = text.trim();
  const refuse = (what: string): BoxResult => ({ ok: false, message: `${label}: ${what}. ${enterText(limit)}` });
  if (t === '') return opts.blank === true ? { ok: true, value: null } : refuse('type a number');
  if (NEGATIVE.test(t)) return refuse(`${shown(t)} is below the lowest allowed number`);
  const whole = limit.whole === true;
  if (!(whole ? WHOLE : DECIMAL).test(t)) {
    return refuse(DECIMAL.test(t) ? `${shown(t)} is not a whole number` : 'that is not a number written with digits only');
  }
  const n = Number(t);
  if (!Number.isFinite(n) || n > limit.max) return refuse(`${shown(t)} is above the highest allowed number`);
  if (n < limit.min) return refuse(`${shown(t)} is below the lowest allowed number`);
  return { ok: true, value: n };
}
