import { BAND_EDGE_NM, GEAR_LIMITS, MAX_PASSBANDS, badNumber, enterText, inRange, rangeProblem, rangeText } from './limits';
import { lineNear } from './lines';
import type { Passband } from './types';

/**
 * A filter's passbands: the one place they are judged (gear profile, import, library entry, model reply, correction, backup, the form's boxes),
 * the one place the two sums are derived from them, and the words and boxes for them. Wavelengths in nm.
 */

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (n: number) => String(round(n));

/** The two numbers the exposure engine reads, from the bands: the total width and the narrowest band. */
export function bandSums(bands: readonly Passband[]): { passbandWidthNm: number; narrowestBandNm: number } {
  return { passbandWidthNm: round(bands.reduce((t, b) => t + b.widthNm, 0)), narrowestBandNm: Math.min(...bands.map((b) => b.widthNm)) };
}

type Judged = { bands: Passband[] } | { problems: string[] };

/**
 * Judges a list of passbands and rebuilds it clean (a fresh object per band holding only centreNm and widthNm, so an extra or prototype key is never copied).
 * Refuses, in plain words: not a list, more than MAX_PASSBANDS, a centre or width that is not a number in range, a total or narrowest width outside its
 * range, edges (centre plus or minus half the width) outside BAND_EDGE_NM, a width above its own centre, bands that overlap or repeat. An empty list is no bands.
 */
export function judgePassbands(raw: unknown): Judged {
  if (!Array.isArray(raw)) return { problems: ['The passbands must be a list of centre and width pairs.'] };
  if (raw.length === 0) return { bands: [] };
  if (raw.length > MAX_PASSBANDS) return { problems: [`A filter has at most ${MAX_PASSBANDS} passbands.`] };
  const problems: string[] = [];
  const bands: Passband[] = [];
  const named = (i: number) => (raw.length > 1 ? `Passband ${i + 1}` : 'Passband');
  raw.forEach((b: unknown, i) => {
    if (typeof b !== 'object' || b === null || Array.isArray(b)) return void problems.push('Each passband needs a centre and a width in nm.');
    const get = (k: string) => (Object.prototype.hasOwnProperty.call(b, k) ? (b as Record<string, unknown>)[k] : undefined);
    const centre = get('centreNm');
    const width = get('widthNm');
    const centreOk = inRange(GEAR_LIMITS.passbandCentreNm, centre);
    const widthOk = inRange(GEAR_LIMITS.bandWidthNm, width);
    if (!centreOk) problems.push(`${named(i)} centre: ${badNumber(GEAR_LIMITS.passbandCentreNm, centre)}. ${enterText(GEAR_LIMITS.passbandCentreNm)}`);
    if (!widthOk) problems.push(`${named(i)} width: ${badNumber(GEAR_LIMITS.bandWidthNm, width)}. ${enterText(GEAR_LIMITS.bandWidthNm)}`);
    if (centreOk && widthOk) bands.push({ centreNm: centre, widthNm: width });
  });
  if (problems.length > 0) return { problems };
  // The values a filter derives from its bands, and the wavelengths the edges reach, are judged here so every path refuses what the Gear form could not hold.
  const sums = bandSums(bands);
  if (!inRange(GEAR_LIMITS.passbandWidthNm, sums.passbandWidthNm)) problems.push(rangeProblem('Total passband width', GEAR_LIMITS.passbandWidthNm, String(sums.passbandWidthNm)));
  if (!inRange(GEAR_LIMITS.narrowestBandNm, sums.narrowestBandNm)) problems.push(rangeProblem('Narrowest band', GEAR_LIMITS.narrowestBandNm, String(sums.narrowestBandNm)));
  for (const b of bands) {
    const lo = round(b.centreNm - b.widthNm / 2);
    const hi = round(b.centreNm + b.widthNm / 2);
    if (lo < BAND_EDGE_NM.min || hi > BAND_EDGE_NM.max) problems.push(`Passband ${num(b.centreNm)} nm, ${num(b.widthNm)} nm wide: its edges reach ${lo.toLocaleString('en-US')} to ${hi.toLocaleString('en-US')} nm, outside ${rangeText(BAND_EDGE_NM)}. Check the centre and the width.`);
    else if (b.widthNm > b.centreNm) problems.push(`Passband ${num(b.centreNm)} nm, ${num(b.widthNm)} nm wide: a passband cannot be wider than its own centre wavelength. Check the centre and the width.`);
  }
  const byEdge = [...bands].sort((a, b) => a.centreNm - b.centreNm);
  for (let i = 1; i < byEdge.length; i++) {
    const a = byEdge[i - 1];
    const b = byEdge[i];
    if (round(b.centreNm - b.widthNm / 2) < round(a.centreNm + a.widthNm / 2)) problems.push(`Passbands ${num(a.centreNm)} nm and ${num(b.centreNm)} nm overlap. Each passband must cover its own wavelengths; merge them into one or change a centre or width.`);
  }
  return problems.length > 0 ? { problems } : { bands };
}

/** "Ha 656 nm, 10 nm wide": the line's symbol first when the centre is near a known emission line. */
export function bandText(b: Passband): string {
  const line = lineNear(b.centreNm);
  return `${line ? `${line.symbol} ` : ''}${num(b.centreNm)} nm, ${num(b.widthNm)} nm wide`;
}

/** The plain line naming the emission lines the bands are centred near ("Centred near Ha (hydrogen-alpha, 656.3 nm)."), or '' when none is. */
export function bandsLineNote(bands: readonly Passband[]): string {
  const names: string[] = [];
  for (const b of bands) {
    const line = lineNear(b.centreNm);
    const text = line ? `${line.symbol} (${line.name}, ${line.nm} nm)` : '';
    if (text !== '' && !names.includes(text)) names.push(text);
  }
  if (names.length === 0) return '';
  return `Centred near ${names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}.`;
}

/** The form's band boxes: row 1 to MAX_PASSBANDS, each a centre and a width. */
export const bandKey = (row: number, part: 'Centre' | 'Width'): string => `band${row}${part}`;
export const BAND_BOX_KEYS: readonly string[] = Array.from({ length: MAX_PASSBANDS }, (_, i) => [bandKey(i + 1, 'Centre'), bandKey(i + 1, 'Width')]).flat();
export const isBandBox = (key: string): boolean => BAND_BOX_KEYS.includes(key);

/** Every band box as text: the bands' numbers, the rest empty. */
export function bandsToTexts(bands: readonly Passband[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 1; i <= MAX_PASSBANDS; i++) {
    const b = bands?.[i - 1];
    out[bandKey(i, 'Centre')] = b ? num(b.centreNm) : '';
    out[bandKey(i, 'Width')] = b ? num(b.widthNm) : '';
  }
  return out;
}

/** True when `texts` has any band box (a caller that has none is not editing the bands). */
export const hasBandBoxes = (texts: Record<string, string>): boolean => BAND_BOX_KEYS.some((k) => texts[k] !== undefined);

/**
 * The bands the boxes hold. A row with both boxes empty is no band; one box empty, a text that is not a number, or any value the judge refuses is a
 * plain problem naming the row.
 */
export function bandsFromTexts(texts: Record<string, string>): { bands: Passband[] } | { problem: string } {
  const raw: Passband[] = [];
  for (let i = 1; i <= MAX_PASSBANDS; i++) {
    const c = (texts[bandKey(i, 'Centre')] ?? '').trim();
    const w = (texts[bandKey(i, 'Width')] ?? '').trim();
    if (c === '' && w === '') continue;
    if (c === '' || w === '') return { problem: `Passband ${i}: enter both the centre and the width, or remove the row.` };
    const cn = Number(c);
    const wn = Number(w);
    if (!Number.isFinite(cn) || !inRange(GEAR_LIMITS.passbandCentreNm, cn)) return { problem: rangeProblem(`Passband ${i} centre`, GEAR_LIMITS.passbandCentreNm, c) };
    if (!Number.isFinite(wn) || !inRange(GEAR_LIMITS.bandWidthNm, wn)) return { problem: rangeProblem(`Passband ${i} width`, GEAR_LIMITS.bandWidthNm, w) };
    raw.push({ centreNm: cn, widthNm: wn });
  }
  const r = judgePassbands(raw);
  return 'problems' in r ? { problem: r.problems[0] } : { bands: r.bands };
}

/** The row number (1 to MAX_PASSBANDS) of the last band row that holds anything; 0 when none does. */
export function filledRows(texts: Record<string, string>): number {
  for (let i = MAX_PASSBANDS; i >= 1; i--) if ((texts[bandKey(i, 'Centre')] ?? '').trim() !== '' || (texts[bandKey(i, 'Width')] ?? '').trim() !== '') return i;
  return 0;
}

/**
 * The form holds the bands and the sums the user typed; the sums shown and saved are worked out from that (withDerivedSums), so they can never be left over from bands
 * that are gone. While any band row holds anything the sums are the bands' (or none while a row is half-filled or refused); with no band rows they are the user's.
 */
export const sumsFollowBands = (texts: Record<string, string>): boolean => filledRows(texts) > 0;

/** The boxes a form starts from: a filter that has bands holds no sums of its own (its saved sums are the bands'). */
export function formTexts(texts: Record<string, string>): Record<string, string> {
  return sumsFollowBands(texts) ? { ...texts, passbandWidthNm: '', narrowestBandNm: '' } : texts;
}

/** The boxes as shown and saved: with band rows, the two sums are the good bands' sums, or empty while the rows are not good bands; with none, the typed sums. */
export function withDerivedSums(texts: Record<string, string>): Record<string, string> {
  if (!sumsFollowBands(texts)) return texts;
  const r = bandsFromTexts(texts);
  if (!('bands' in r)) return { ...texts, passbandWidthNm: '', narrowestBandNm: '' };
  const s = bandSums(r.bands);
  return { ...texts, passbandWidthNm: num(s.passbandWidthNm), narrowestBandNm: num(s.narrowestBandNm) };
}

/** The boxes with row `row` (1-based) removed and the rows after it moved up one. The typed sums are left as they are. */
export function withoutBandRow(texts: Record<string, string>, row: number): Record<string, string> {
  const out = { ...texts };
  for (let i = row; i <= MAX_PASSBANDS; i++) {
    out[bandKey(i, 'Centre')] = i < MAX_PASSBANDS ? (texts[bandKey(i + 1, 'Centre')] ?? '') : '';
    out[bandKey(i, 'Width')] = i < MAX_PASSBANDS ? (texts[bandKey(i + 1, 'Width')] ?? '') : '';
  }
  return out;
}
