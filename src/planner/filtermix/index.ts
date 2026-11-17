import { judgeProfile } from '../catalog/emission';
import type { EmissionProfile } from '../catalog/emission';
import { EMISSION_LINES } from '../profile/lines';
import type { Passband } from '../profile/types';

/**
 * The per-target filter mix: which of the user's filters earn hours on a target, and how the planned light is split. Pure code, no model. The rules are the
 * research note's (emission and continuum content of deep-sky targets): gate, line need, new coverage, adds nothing, adds contrast only, hours split, the Ha band
 * NII note, the broadband slot for a continuum target, and the confidence label. The target's profile is physical line flux; hours are whole minutes that always add
 * up to the light given.
 */

/** A line is needed when its weight is at least this (the research's start value, decided 2026-11-17). */
export const W_MIN = 0.15;
/** Below this sum of Ha, OIII and SII, narrowband adds nothing. */
export const GATE_SUM = 0.2;
/** A filter that passes only lines already covered still earns hours when its band is at least this many times narrower (SNR per hour, band width as the proxy). */
export const BETTER_SNR = 1.25;
/** "Better contrast" is the plain wording when the band is at most this share of the covering band. */
export const CONTRAST_SHARE = 0.6;
/** From this continuum share a broadband slot always stays. */
export const BROADBAND_KEEP = 0.7;
/** A band this wide or wider is a broadband filter, not a narrowband one. */
export const BROAD_BAND_NM = 50;
/** Sky taken as 1 unit per this many nm of band when weighing a line's hours (a proxy for sky over signal). */
const SKY_REF_NM = 10;

export type MixLineName = 'Ha' | 'OIII' | 'SII';
const NEED_LINES: readonly MixLineName[] = ['Ha', 'OIII', 'SII'];

export interface MixFilter {
  id: string;
  name: string;
  /** Absent or empty: the passbands are not known, so the filter is not used in the mix. */
  bands?: readonly Passband[];
}

export type MixVerdict = 'adds' | 'contrast' | 'covered' | 'no-need' | 'gate' | 'skipped' | 'broadband';

export interface MixLine {
  /** The filter's id; null for the broadband slot without a filter. */
  filterId: string | null;
  name: string;
  /** Whole minutes of the light given to it; 0 when it earns none. */
  minutes: number;
  verdict: MixVerdict;
  /** One plain sentence or two. */
  reason: string;
  /** Needed lines this filter brings that no filter before it passes. */
  adds: MixLineName[];
  /** Lines of Ha, OIII and SII that it passes and an earlier filter passes too. */
  shared: MixLineName[];
  /** The filters that already cover it (verdicts covered and contrast). */
  coveredBy: string[];
}

export type MixResult =
  | {
      kind: 'mix';
      /** The light given, in whole minutes; the lines' minutes add up to it. */
      availableMin: number;
      lines: MixLine[];
      /** Said first when the mix is not the usual one (a target that gives off almost no emission). */
      headline: string | null;
      /** The lines this target needs, in the order Ha, OIII, SII. */
      needed: MixLineName[];
      /** Needed lines that no filter in the mix passes. */
      uncovered: MixLineName[];
      /** The Ha band here carries more nitrogen than hydrogen. */
      haMostlyNii: boolean;
      /** "Typical for this type, not measured" and its siblings. */
      confidence: string;
      /** The profile's own note, when it has one. */
      profileNote: string | null;
    }
  | { kind: 'none'; message: string; skipped: MixLine[] };

export interface MixInput {
  profile: EmissionProfile;
  filters: readonly MixFilter[];
  /** The planned light for the target, in minutes. */
  minutes: number;
}

const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const wide = (n: number): string => String(Math.round(n * 10) / 10);
const list = (xs: readonly string[]): string => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function confidenceLabel(p: Pick<EmissionProfile, 'confidence' | 'source'>): string {
  if (p.confidence === 'type-default') return 'Typical for this type, not measured';
  if (p.confidence === 'amateur') return `Amateur reports, not measured (${p.source})`;
  return `Measured (${p.source})`;
}

/** The width of the narrowest band of `bands` that passes the line (any line of that symbol), or null when none does. */
function widthAt(bands: readonly Passband[], symbol: string): number | null {
  let best: number | null = null;
  for (const b of bands) {
    const passes = EMISSION_LINES.some((l) => l.symbol === symbol && round(Math.abs(l.nm - b.centreNm)) <= round(b.widthNm / 2));
    if (passes && (best === null || b.widthNm < best)) best = b.widthNm;
  }
  return best;
}

interface Analysed {
  filter: MixFilter;
  bands: readonly Passband[];
  index: number;
  /** Width of the band that passes each of Ha, OIII and SII, or absent. */
  at: Partial<Record<MixLineName, number>>;
  nii: boolean;
}

function analyse(f: MixFilter, index: number): Analysed {
  const bands = f.bands ?? [];
  const at: Analysed['at'] = {};
  for (const L of NEED_LINES) {
    const w = widthAt(bands, L);
    if (w !== null) at[L] = w;
  }
  return { filter: f, bands, index, at, nii: widthAt(bands, 'NII') !== null };
}

const mean = (xs: number[]): number => xs.reduce((t, x) => t + x, 0) / xs.length;

/** Splits `total` whole units over weights, the largest remainders taking the leftovers; the parts always add up to `total`. */
function apportion(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((t, w) => t + w, 0);
  if (!(sum > 0) || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((t, p) => t + p, 0);
  const order = exact.map((e, i) => ({ i, r: e - Math.floor(e) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

const SKIPPED = 'Unknown passband, not used in the mix. Add its passbands in Gear.';

function skippedLine(f: MixFilter): MixLine {
  return { filterId: f.id, name: f.name, minutes: 0, verdict: 'skipped', reason: SKIPPED, adds: [], shared: [], coveredBy: [] };
}

/**
 * The mix for one target: the filters that earn hours, why each other does not, and the light split between them. Every filter in `filters` appears once
 * in `lines`. Returns a plain message and no hours when there is nothing to split (no light, no filter, no filter with known passbands).
 */
export function filterMix(input: MixInput): MixResult {
  const bad = judgeProfile(input.profile);
  if (bad.length > 0) return { kind: 'none', message: 'This target has no usable emission profile, so no filter mix is worked out.', skipped: [] };
  const total = Number.isFinite(input.minutes) ? Math.round(input.minutes) : 0;
  if (total <= 0) return { kind: 'none', message: 'There is no planned light to split between filters.', skipped: [] };
  if (input.filters.length === 0) return { kind: 'none', message: 'No filter is selected in the setup, so there is no mix to work out.', skipped: [] };

  const p = input.profile;
  const skipped = input.filters.filter((f) => (f.bands ?? []).length === 0).map(skippedLine);
  const usable = input.filters.map((f, i) => analyse(f, i)).filter((a) => a.bands.length > 0);
  if (usable.length === 0) {
    return { kind: 'none', message: 'No selected filter has known passbands, so no hours are split. Add the passbands in Gear.', skipped };
  }

  // Broadband filters (a band 50 nm or wider) take the broadband slot; the rest are judged line by line.
  const broad = usable.filter((a) => Math.max(...a.bands.map((b) => b.widthNm)) >= BROAD_BAND_NM);
  const narrow = usable.filter((a) => !broad.includes(a));
  const slotFilter = broad[0]?.filter ?? null;
  const slotName = slotFilter === null ? 'Broadband (no narrowband filter)' : `Broadband (${slotFilter.name})`;
  const confidence = confidenceLabel(p);
  const profileNote = p.note ?? null;
  const weight = (L: string): number => p.lines[L as keyof EmissionProfile['lines']] ?? 0;
  const pct = (L: MixLineName): string => `${Math.round(weight(L) * 100)}%`;

  const lineOf = (a: Analysed, rest: Omit<MixLine, 'filterId' | 'name'>): MixLine => ({ filterId: a.filter.id, name: a.filter.name, ...rest });
  const extraBroad = (): MixLine[] => broad.slice(1).map((a) => lineOf(a, { minutes: 0, verdict: 'covered', reason: `Adds nothing, covered by ${slotName}: both are broadband.`, adds: [], shared: [], coveredBy: [slotName] }));
  const slotLine = (minutes: number, reason: string): MixLine => ({ filterId: slotFilter?.id ?? null, name: slotName, minutes, verdict: 'broadband', reason, adds: [], shared: [], coveredBy: [] });
  const inOrder = (lines: MixLine[]): MixLine[] => {
    const rank = new Map(input.filters.map((f, i) => [f.id, i] as const));
    const [slot, others] = [lines.filter((l) => l.verdict === 'broadband'), lines.filter((l) => l.verdict !== 'broadband')];
    return [...slot, ...others.sort((a, b) => (rank.get(a.filterId ?? '') ?? 0) - (rank.get(b.filterId ?? '') ?? 0))];
  };
  const finish = (lines: MixLine[], extra: Omit<Extract<MixResult, { kind: 'mix' }>, 'kind' | 'availableMin' | 'lines' | 'confidence' | 'profileNote'>): MixResult => {
    const all = inOrder([...lines, ...skipped]);
    const sum = all.reduce((t, l) => t + l.minutes, 0);
    if (sum !== total) throw new Error(`The filter mix gives ${sum} min for ${total} min of light.`);
    return { kind: 'mix', availableMin: total, lines: all, confidence, profileNote, ...extra };
  };

  const haMostlyNii = (p.lines.NII ?? 0) > 0 && (p.lines.NII ?? 0) >= (p.lines.Ha ?? 0);
  const niiWords = 'On this target the Ha band mostly passes nitrogen (NII), not hydrogen.';

  // 1. Gate: almost no emission, so narrowband adds nothing.
  if (weight('Ha') + weight('OIII') + weight('SII') < GATE_SUM) {
    const headline = 'This target gives off almost no emission light, so narrowband filters add nothing. Shoot it broadband.';
    const lines = [
      slotLine(total, 'All of the light goes here: almost all of this target’s light is continuum.'),
      ...extraBroad(),
      ...narrow.map((a) => lineOf(a, { minutes: 0, verdict: 'gate', reason: 'Adds nothing: this target gives off almost no emission light for it to isolate.', adds: [], shared: [], coveredBy: [] })),
    ];
    return finish(lines, { headline, needed: [], uncovered: [], haMostlyNii: false });
  }

  // 2. Line need. Where the Ha band mostly passes nitrogen, Ha is not counted as a need (the hours there would be nitrogen hours).
  const needed = NEED_LINES.filter((L) => weight(L) >= W_MIN && !(L === 'Ha' && haMostlyNii));
  const passedNeeded = (a: Analysed) => needed.filter((L) => a.at[L] !== undefined);

  // Order: the filter bringing the most needed lines first, then the narrower bands, then the user's order. The verdicts then do not depend on the order given.
  const ranked = [...narrow].sort((a, b) => {
    const [na, nb] = [passedNeeded(a), passedNeeded(b)];
    if (na.length !== nb.length) return nb.length - na.length;
    const [ma, mb] = [na.length === 0 ? Infinity : mean(na.map((L) => a.at[L] as number)), nb.length === 0 ? Infinity : mean(nb.map((L) => b.at[L] as number))];
    return ma !== mb ? ma - mb : a.index - b.index;
  });

  const mixed: Analysed[] = [];
  const verdicts = new Map<Analysed, MixLine>();
  const coverOf = (L: MixLineName): Analysed[] => mixed.filter((m) => m.at[L] !== undefined);
  for (const a of ranked) {
    const mine = passedNeeded(a);
    const passesAll = NEED_LINES.filter((L) => a.at[L] !== undefined);
    const fresh = mine.filter((L) => coverOf(L).length === 0);
    const shared = passesAll.filter((L) => coverOf(L).length > 0);
    const weak = passesAll.filter((L) => !needed.includes(L) && !shared.includes(L));
    const weakText = weak.map((L) => (L === 'Ha' && haMostlyNii ? '' : `${L} is too weak here to need a filter (${pct(L)} of the strongest line, the cut is ${Math.round(W_MIN * 100)}%).`)).filter((s) => s !== '');
    const nii = a.at.Ha !== undefined && haMostlyNii ? [niiWords] : [];
    if (fresh.length > 0) {
      const names = [...new Set(shared.flatMap((L) => coverOf(L).map((m) => m.filter.name)))];
      const head = shared.length === 0 ? `Adds ${list(fresh)}.` : `${list(shared)} shared, ${list(fresh)} new. ${list(names)} already ${names.length > 1 ? 'pass' : 'passes'} the ${list(shared)}.`;
      mixed.push(a);
      verdicts.set(a, lineOf(a, { minutes: 0, verdict: 'adds', reason: [head, ...weakText, ...nii].join(' '), adds: fresh, shared, coveredBy: [] }));
      continue;
    }
    if (mine.length === 0) {
      const why = passesAll.length === 0 ? 'It passes none of Ha, OIII or SII.' : weakText.length > 0 || haMostlyNii ? [...weakText, ...nii].join(' ') : `${list(passesAll)} ${passesAll.length > 1 ? 'are' : 'is'} already covered.`;
      verdicts.set(a, lineOf(a, { minutes: 0, verdict: 'no-need', reason: `Adds nothing: it passes no line this target needs. ${why}`, adds: [], shared, coveredBy: [...new Set(shared.flatMap((L) => coverOf(L).map((m) => m.filter.name)))] }));
      continue;
    }
    // Every needed line it passes is already in the mix: better contrast, or nothing.
    const better = mine.filter((L) => {
      const best = Math.min(...coverOf(L).map((m) => m.at[L] as number));
      return best / (a.at[L] as number) >= BETTER_SNR;
    });
    const covering = [...new Set(mine.flatMap((L) => coverOf(L).map((m) => m.filter.name)))];
    if (better.length === 0) {
      verdicts.set(a, lineOf(a, { minutes: 0, verdict: 'covered', reason: `Adds nothing, covered by ${list(covering)} (${list(mine)}). ${[...weakText, ...nii].join(' ')}`.trim(), adds: [], shared, coveredBy: covering }));
      continue;
    }
    const clearly = better.some((L) => (a.at[L] as number) <= CONTRAST_SHARE * Math.min(...coverOf(L).map((m) => m.at[L] as number)));
    const widths = better.map((L) => `${L} band ${wide(a.at[L] as number)} nm against ${wide(Math.min(...coverOf(L).map((m) => m.at[L] as number)))} nm`);
    mixed.push(a);
    verdicts.set(a, lineOf(a, { minutes: 0, verdict: 'contrast', reason: `Same lines as ${list(covering)}, ${clearly ? 'better' : 'a little better'} contrast per hour (${list(widths)}). ${nii.join(' ')}`.trim(), adds: [], shared, coveredBy: covering }));
  }

  const uncovered = needed.filter((L) => coverOf(L).length === 0);
  const result = { headline: null, needed: [...needed], uncovered, haMostlyNii };

  // 3. Hours. Broadband first (a continuum target keeps its slot), then the rest over the filters that earn.
  if (mixed.length === 0) {
    const reason = needed.length === 0 ? 'All of the light goes here: no line of this target is strong enough to need a filter.' : 'All of the light goes here: no selected filter passes a line this target needs.';
    const lines = [slotLine(total, reason), ...extraBroad(), ...ranked.map((a) => verdicts.get(a) as MixLine)];
    return finish(lines, result);
  }
  const continuum = p.continuum;
  const broadMin = continuum >= BROADBAND_KEEP ? Math.round(total * continuum) : 0;
  const narrowMin = total - broadMin;

  // A line's importance is counted once: weight squared over (1 + sky), the sky taken as the band width over a reference. It is shared between the filters that pass it, the narrower band taking more.
  const score = new Map<Analysed, number>(mixed.map((m) => [m, 0]));
  for (const L of needed) {
    const passing = coverOf(L);
    if (passing.length === 0) continue;
    const bestWidth = Math.min(...passing.map((m) => m.at[L] as number));
    const importance = weight(L) ** 2 / (1 + bestWidth / SKY_REF_NM);
    const quality = passing.map((m) => 1 / (m.at[L] as number));
    const qSum = quality.reduce((t, q) => t + q, 0);
    passing.forEach((m, i) => score.set(m, (score.get(m) as number) + (importance * quality[i]) / qSum));
  }
  const parts = apportion(narrowMin, mixed.map((m) => score.get(m) as number));
  mixed.forEach((m, i) => {
    const v = verdicts.get(m) as MixLine;
    v.minutes = parts[i];
  });
  const lines: MixLine[] = [];
  if (broadMin > 0) lines.push(slotLine(broadMin, `A broadband slot stays: ${Math.round(continuum * 100)}% of this target’s light is continuum, which narrowband does not carry.`));
  lines.push(...extraBroad(), ...ranked.map((a) => verdicts.get(a) as MixLine));
  return finish(lines, result);
}

/** Whole minutes as "1 h 20 min" or "45 min": the row's own wording, passed in so the row and the export agree. */
export type MinutesText = (minutes: number) => string;

/** One line for the plan text: "M42: NB3-PM 2 h (adds OIII); NBZ II 0 min (covered by NB3-PM). Typical for this type, not measured." */
export function mixSummary(name: string, r: Extract<MixResult, { kind: 'mix' }>, fmt: MinutesText): string {
  const parts = r.lines.map((l) => `${l.name} ${fmt(l.minutes)}${l.verdict === 'skipped' ? ' (unknown passband, not used)' : l.verdict === 'adds' ? ` (adds ${list(l.adds)})` : l.verdict === 'contrast' ? ' (better contrast)' : l.verdict === 'covered' || l.verdict === 'no-need' || l.verdict === 'gate' ? ` (${l.verdict === 'covered' && l.coveredBy.length > 0 ? `covered by ${list(l.coveredBy)}` : 'adds nothing'})` : ''}`);
  return `${name} (${fmt(r.availableMin)} of light): ${parts.join('; ')}. ${r.confidence}.`;
}
