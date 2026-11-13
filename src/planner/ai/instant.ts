import { zoneOffsetMs } from '../plan';

/** "2026-10-31T01:30-06:00": a local date and clock to the minute plus the UTC offset. The offset is what makes a repeated or skipped clock hour unambiguous. */
export const ISO_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d[+-]([01]\d):[0-5]\d$/;
/** The same pattern as JSON-schema text for the prompt. */
export const ISO_PATTERN = '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])T([01]\\d|2[0-3]):[0-5]\\d[+-]([01]\\d):[0-5]\\d$';

const MIN = 60000;

/** The instant as local time with its UTC offset, to the minute (rounded down). */
export function isoOf(d: Date, timeZone: string): string {
  const off = Math.round(zoneOffsetMs(d, timeZone) / MIN);
  const whole = Math.floor(d.getTime() / MIN) * MIN;
  const local = new Date(whole + off * MIN).toISOString().slice(0, 16);
  const a = Math.abs(off);
  return `${local}${off < 0 ? '-' : '+'}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** The instant `s` names, or why it names none: a bad format, or a local time/offset pair that `timeZone` never has (a skipped hour, or the wrong offset). */
export function parseIso(s: string, timeZone: string): { ok: true; at: Date } | { ok: false; error: string } {
  if (!ISO_RE.test(s)) return { ok: false, error: `"${s}" is not a local ISO time with offset like 2026-10-31T01:30-06:00` };
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return { ok: false, error: `"${s}" is not a real date` };
  const at = new Date(ms);
  const back = isoOf(at, timeZone);
  if (back !== s) return { ok: false, error: `"${s}" is not a time that exists in ${timeZone} (that instant reads ${back} there; a skipped clock hour or a wrong offset)` };
  return { ok: true, at };
}
