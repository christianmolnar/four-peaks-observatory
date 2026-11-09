import { CLOCK_RE } from './timeline';

/** Full-width digits and colon (an iPhone's or an East Asian keyboard's) as plain ones, and the ends trimmed: " ２１：３０ " is "21:30". */
const plain = (text: string): string =>
  text
    .replace(/[０-９]/g, (c) => String(c.charCodeAt(0) - 0xff10))
    .replace(/：/g, ':')
    .trim();

/** "21:30", "9:05", "2130", "905" and "0905" as "HH:MM"; null for anything else, including an hour or minute out of range. */
export function clockFromText(text: string): string | null {
  const m = /^(?:(\d{1,2}):(\d{2})|(\d{1,2})(\d{2}))$/.exec(plain(text));
  if (!m) return null;
  const clock = `${(m[1] ?? m[3]).padStart(2, '0')}:${m[2] ?? m[4]}`;
  return CLOCK_RE.test(clock) ? clock : null;
}

/** True while the text could still turn into a time by typing more: up to four digits, or hours, a colon and up to two digits. Empty counts. */
export function couldBecomeClock(text: string): boolean {
  return /^(?:\d{0,4}|\d{1,2}:\d{0,2})$/.test(plain(text));
}
