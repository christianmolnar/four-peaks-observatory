import { judgeProfile } from '../catalog/emission';
import type { EmissionProfile } from '../catalog/emission';
import {
  BORTLE_SQM,
  FILTER_PEAK_THROUGHPUT,
  MAX_SUB_S,
  MIN_SUB_S,
  MIN_TOTAL_MIN,
  PRESETS,
  REF_BANDWIDTH_NM,
  SNR_ELEMENT_ARCSEC,
  edgeShiftNm,
  skyLimitedSeconds,
  skyRate,
} from '../exposure';
import type { ExposureMode } from '../exposure';
import { EMISSION_LINES } from '../profile/lines';
import type { Passband } from '../profile/types';
import { BETTER_SNR, BROAD_BAND_NM, GATE_SUM, W_MIN, confidenceLabel } from './index';
import type { MixLineName } from './index';

/**
 * How many minutes of narrowband to add to a given time of broadband, and with which of the user's filters. Pure code, no model. The method and every
 * constant are in the research note (~/Token/research/fourpeaks-narrowband-hours.md; its python script is the reference this file is tested against): the
 * signal-to-noise squared per hour of each filter band against the same line in broadband, a match rule (the narrowband band as clean as the broadband
 * nebula) and the planner's own diminishing-returns knee as the cap. A colour (one-shot colour) camera only.
 *
 * Beyond the note: the beam's blue shift at the edge of the cone (the planner's own `edgeShiftNm`) takes a share of the line signal of a band the line sits
 * near the edge of, so a narrow band on fast optics loses light and the ranking of filters moves with the f-ratio. No special case: the share is geometry.
 */

/** A band that passes both OIII lines carries the 4959 line as well, as this share of the 5007 line (the atomic ratio, about one third). */
const OIII_4959_SHARE = 0.34;
/** Hurdle for a narrowband band to be worth its hours: its signal-to-noise per hour over the same line in broadband. Same value as the mix's `BETTER_SNR`. */
export const GAIN_HURDLE = BETTER_SNR;
/** Minutes are given in steps of this many. */
const STEP_MIN = 5;
const OIII_MAIN_NM = 500.7;
const OIII_SECOND_NM = 495.9;

export const HONESTY_LINE = 'Estimate; band centres not verified.';
const BASIS_SNR_ONLY = 'Counts signal-to-noise only: it cannot see colour separation, real sky spectra or the filter’s true transmission, so “does not help” means no signal-to-noise gain, not no contrast gain.';
const BASIS_PASSBANDS = 'Band widths from the vendor; centres and leakage not verified.';
const BASIS_ESTIMATE = 'Estimated from sky and band width, not measured on your rig.';
const BASIS_SKY = 'The sky is taken as flat across the bands and moonless.';
const BASIS_RULES = 'The match rule (narrowband as clean as the broadband nebula) and the 1.25 hurdle are planner choices, not measured.';

/** Said for a galaxy whose profile is for its HII knots only. */
export const KNOTS_HEADLINE = 'Only the star-forming knots gain from narrowband; the disk is broadband light.';

export type NbVerdict = 'recommend' | 'no-help' | 'cannot-judge' | 'no-narrowband';

export interface NbFilterInput {
  id: string;
  name: string;
  /** Absent or empty: the passbands are not known. */
  bands?: readonly Passband[];
  /** The maker's fastest rated focal ratio; when the train is at least this slow the beam shift is taken as covered. */
  ratedMinFRatio?: number;
}

export interface NbTrain {
  fRatio: number;
  pixelUm: number;
  focalLengthMm: number;
}

export interface NbInput {
  profile: EmissionProfile;
  /** Mean surface brightness of the target, mag per square arcsecond. */
  surfaceBrightnessMu: number;
  /** Broadband hours already planned (or asked for). */
  broadbandHours: number;
  /** Bortle class 1 to 9. */
  bortle: number;
  train: NbTrain;
  readNoiseE: number;
  knee: ExposureMode;
  filters: readonly NbFilterInput[];
}

/** What one needed line gets from one filter. */
export interface NbLine {
  line: MixLineName;
  /** The signal-to-noise gain E of this band over the same line in broadband. */
  gain: number;
  /** Minutes at which the narrowband is as clean as the broadband nebula. */
  matchMin: number;
  /** Minutes at which one more half hour adds under the knee's share. */
  kneeMin: number;
  /** Whole minutes (0 when the line does not help on this filter). */
  minutes: number;
}

export interface NbFilterResult {
  filterId: string;
  name: string;
  verdict: NbVerdict;
  /** Whole minutes in steps of 5, 0 or at least 30. */
  minutes: number;
  /** What shows beside the filter: one short sentence, or empty when its label ("does not help", "no narrowband") says it. */
  reason: string;
  /** What the reason leaves out, for the row's fold. Absent when there is nothing more to say. */
  detail?: string;
  /** The gain E of the line that sets the minutes (else the best of its lines); null when the filter is not judged. */
  gain: number | null;
  /** The needed lines this filter was given, with their numbers. */
  lines: NbLine[];
  /**
   * What this filter would add run on its own for every needed line it passes (the lines with minutes), whether or not the plan gives it those lines.
   * The user may tick a filter the plan does not recommend; these are the minutes it then adds.
   */
  standaloneLines: NbLine[];
  /** The longest of the stand-alone lines, whole minutes; 0 when none of its lines earns minutes. */
  standaloneMin: number;
  /** What is unverified in this filter's numbers. */
  basis: string[];
}

export interface NbResult {
  /** Almost no emission: no narrowband at all. */
  gate: boolean;
  headline: string | null;
  filters: NbFilterResult[];
  /** The lines this target needs, in the order Ha, OIII, SII. */
  needed: MixLineName[];
  haMostlyNii: boolean;
  confidence: string;
  profileNote: string | null;
  /** The most light one filter's narrowband can earn before the knee, minutes, before taking off the broadband's share. */
  capMin: number;
  /** The knee's stop share: another half hour adding less than this share of the line's signal-to-noise is not worth it (0.1 at Balanced). */
  kneeGain: number;
  broadbandMin: number;
  /** Signal-to-noise per resolution element of the broadband stack on the whole nebula. */
  broadbandSnr: number;
  basis: string[];
}

const NEED_LINES: readonly MixLineName[] = ['Ha', 'OIII', 'SII'];
const NO_MOON = { moonIllumination: 0, moonSeparationDeg: 180, moonUp: false } as const;
const round = (n: number): number => Math.round(n * 1e6) / 1e6;
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const list = (xs: readonly string[]): string => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const times = (n: number): string => `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10}`;
const sentences = (xs: readonly string[]): string => `${xs.join('. ')}.`;

/** The nearest lines of a symbol that a band passes at normal incidence. */
const passedLines = (b: Passband, symbol: string): number[] =>
  EMISSION_LINES.filter((l) => l.symbol === symbol && round(Math.abs(l.nm - b.centreNm)) <= round(b.widthNm / 2)).map((l) => l.nm);

/**
 * The share of the beam (by area) in which a line still falls inside a flat-topped band. At the edge of the cone the band moves blue by `shiftNm`; the shift
 * grows with the square of the ray's distance from the axis, and the area with the same square, so the share is linear in the room the line has.
 */
function beamShare(lineNm: number, b: Passband, shiftNm: number): number {
  const d = lineNm - b.centreNm;
  const room = (edge: number): number => clamp(edge / shiftNm, 0, 1);
  return room(b.widthNm / 2 - d) - room(-b.widthNm / 2 - d);
}

interface BandCalc {
  filter: NbFilterInput;
  band: Passband;
  /** Which of Ha, OIII and SII the band passes. */
  passes: MixLineName[];
  /** SNR squared per second per pixel of the band's line signal. */
  rate: number;
  gain: number;
  /** The smallest share of the beam, across the lines the band passes, that still sees its line. */
  share: number;
}

const isBroad = (bands: readonly Passband[]): boolean => Math.max(...bands.map((b) => b.widthNm)) >= BROAD_BAND_NM;

function check(input: NbInput): void {
  const bad = (what: string): never => {
    throw new RangeError(`narrowbandHours: ${what}`);
  };
  const pos = (n: number): boolean => Number.isFinite(n) && n > 0;
  if (!pos(input.broadbandHours)) bad(`broadbandHours must be a positive number: ${input.broadbandHours}`);
  if (!Number.isInteger(input.bortle) || !Object.hasOwn(BORTLE_SQM, input.bortle)) bad(`bortle must be a whole number from 1 to 9: ${input.bortle}`);
  if (!pos(input.train.fRatio)) bad(`train.fRatio must be positive: ${input.train.fRatio}`);
  if (!pos(input.train.pixelUm)) bad(`train.pixelUm must be positive: ${input.train.pixelUm}`);
  if (!pos(input.train.focalLengthMm)) bad(`train.focalLengthMm must be positive: ${input.train.focalLengthMm}`);
  if (!pos(input.readNoiseE)) bad(`readNoiseE must be positive: ${input.readNoiseE}`);
  if (!Number.isFinite(input.surfaceBrightnessMu)) bad(`surfaceBrightnessMu must be a number: ${input.surfaceBrightnessMu}`);
  if (!Object.hasOwn(PRESETS, input.knee)) bad(`knee must be quick, balanced or deep: ${input.knee}`);
  const problems = judgeProfile(input.profile);
  if (problems.length > 0) bad(`the emission profile is not usable: ${problems.join(' ')}`);
}

/**
 * Minutes of narrowband per filter for one target. Every filter of the user's gear appears once, in the order given: judged (minutes or "does not help"),
 * or "cannot judge" when its passbands are unknown or it is a broadband filter. Throws RangeError for an input that is not a number the maths can use.
 */
export function narrowbandHours(input: NbInput): NbResult {
  check(input);
  const p = input.profile;
  const { fRatio, pixelUm, focalLengthMm } = input.train;
  const rn = input.readNoiseE;
  const B = input.broadbandHours;
  const sqm = BORTLE_SQM[input.bortle];
  const sky = { bortle: input.bortle, ...NO_MOON };
  const T = FILTER_PEAK_THROUGHPUT;
  const w = (L: string): number => p.lines[L as keyof EmissionProfile['lines']] ?? 0;
  const c = p.continuum;

  // The broadband stack: sky S and object O in e per pixel per second over the reference band; the sub is the sky-limited length, clamped.
  const S = skyRate({ pixelUm, fRatio, bandwidthNm: REF_BANDWIDTH_NM, sky });
  const O = S * 10 ** (0.4 * (sqm - input.surfaceBrightnessMu));
  const sub = (skyE: number): number => clamp(skyLimitedSeconds(rn, skyE), MIN_SUB_S, MAX_SUB_S);
  const rateO = (O * O) / (O + S + (rn * rn) / sub(S));
  const pixelsPerElement = (SNR_ELEMENT_ARCSEC / ((206.264806 * pixelUm) / focalLengthMm)) ** 2;
  const broadbandSnr = Math.sqrt(pixelsPerElement * rateO * B * 3600);

  // Line fluxes: the emission share of the object, split by weight (NII counts for the Ha band's signal).
  const wSum = w('Ha') + w('OIII') + w('SII') + w('NII');
  const flux = (L: string): number => (wSum > 0 ? ((1 - c) * O * w(L)) / wSum : 0);

  // The Ha band mostly passes nitrogen: Ha is not a need there.
  const haMostlyNii = w('NII') > 0 && w('NII') >= w('Ha');
  const gate = w('Ha') + w('OIII') + w('SII') < GATE_SUM;
  const needed = gate ? [] : NEED_LINES.filter((L) => w(L) >= W_MIN && !(L === 'Ha' && haMostlyNii));

  // Planner choice, not a measurement: knots are a small part of the frame, so more time on them pays less overall. A knots-only profile always uses the quick knee cap, whatever the user's preset.
  const g = PRESETS[p.knotsOnly === true ? 'quick' : input.knee].maxNextHalfHourGain;
  const capHours = 0.5 / ((1 + g) ** 2 - 1);
  const confidence = confidenceLabel(p);
  const headline = gate ? 'This target gives off almost no emission light, so no narrowband filter helps. Shoot it broadband.' : p.knotsOnly === true ? KNOTS_HEADLINE : null;
  const baseBasis = [BASIS_SNR_ONLY, BASIS_PASSBANDS, BASIS_ESTIMATE, BASIS_SKY, BASIS_RULES, ...(p.confidence === 'measured' ? [] : [`Line shares: ${confidence.toLowerCase()}.`])];

  // ---- every band of every judgeable filter
  const usable = input.filters.filter((f) => (f.bands ?? []).length > 0 && !isBroad(f.bands as readonly Passband[]));
  const calcs: BandCalc[] = [];
  for (const f of usable) {
    const shifted = !(f.ratedMinFRatio !== undefined && fRatio >= f.ratedMinFRatio);
    for (const band of f.bands as readonly Passband[]) {
      const at = (nm: number): number => (shifted ? beamShare(nm, band, edgeShiftNm(fRatio, nm)) : 1);
      let full = 0;
      let seen = 0;
      let share = 1;
      const passes: MixLineName[] = [];
      const take = (L: string, flux_: number, lines: number[]): void => {
        if (lines.length === 0) return;
        const s = Math.max(...lines.map(at));
        full += flux_;
        seen += flux_ * s;
        share = Math.min(share, s);
      };
      for (const L of NEED_LINES) if (passedLines(band, L).length > 0) passes.push(L);
      take('Ha', flux('Ha'), passedLines(band, 'Ha'));
      take('NII', flux('NII'), passedLines(band, 'NII'));
      take('SII', flux('SII'), passedLines(band, 'SII'));
      const oiii = passedLines(band, 'OIII');
      if (oiii.includes(OIII_MAIN_NM)) take('OIII', flux('OIII'), [OIII_MAIN_NM]);
      if (oiii.includes(OIII_SECOND_NM)) take('OIII', flux('OIII') * OIII_4959_SHARE, [OIII_SECOND_NM]);
      const sigFull = T * full;
      const sig = T * seen;
      const bandSky = T * skyRate({ pixelUm, fRatio, bandwidthNm: band.widthNm, sky });
      const cont = (T * c * O * band.widthNm) / REF_BANDWIDTH_NM;
      const rate = sig > 0 ? (sig * sig) / (sig + bandSky + cont + (rn * rn) / sub(bandSky)) : 0;
      const rateBroad = sigFull > 0 ? (sigFull * sigFull) / (O + S + (rn * rn) / sub(S)) : 0;
      calcs.push({ filter: f, band, passes, rate, gain: rateBroad > 0 ? rate / rateBroad : 0, share });
    }
  }
  const bandsOf = (f: NbFilterInput): BandCalc[] => calcs.filter((x) => x.filter === f);
  const bandFor = (f: NbFilterInput, L: MixLineName): BandCalc | null => {
    const mine = bandsOf(f).filter((x) => x.passes.includes(L));
    return mine.length === 0 ? null : mine.reduce((a, b) => (b.gain > a.gain ? b : a));
  };

  // ---- minutes per assigned line, then per filter (the bands of one filter run at once, so its minutes are the longest of its lines)
  const lineNumbers = (L: MixLineName, b: BandCalc): NbLine => {
    const matchMin = b.rate > 0 ? ((B * rateO) / b.rate) * 60 : Number.POSITIVE_INFINITY;
    const kneeMin = b.gain > 0 ? (capHours - B / b.gain) * 60 : Number.NEGATIVE_INFINITY;
    const t = Math.min(matchMin, kneeMin);
    const helps = b.gain >= GAIN_HURDLE && t >= MIN_TOTAL_MIN;
    return { line: L, gain: b.gain, matchMin, kneeMin, minutes: helps ? Math.round(Math.max(t, MIN_TOTAL_MIN) / STEP_MIN) * STEP_MIN : 0 };
  };
  const nbMinutes = (n: number): string => `${n} min`;
  const hurdleNote = (l: NbLine): string =>
    l.gain < GAIN_HURDLE
      ? `${l.line} gains only ${times(l.gain)}×, under the ${GAIN_HURDLE}× bar`
      : l.kneeMin <= 0
        ? `Broadband already carries ${l.line} well enough (under ${Math.round(g * 100)}% per extra half hour)`
        : `${l.line} would need under ${MIN_TOTAL_MIN} min, too little to be worth the setup`;

  // ---- which filter takes each needed line. Joint across the lines and independent of the order the gear is listed in. A filter is eligible for a line when its
  // band's gain E is within GAIN_HURDLE of the best band for that line (a band that is clearly better, GAIN_HURDLE times or more, leaves the others out). Then the
  // filter eligible for the most still-unassigned lines takes them all (one filter that passes several needed lines at a comparable gain beats splitting them
  // across two); a tie goes to the higher mean gain, then to the name.
  const bestGain = new Map<MixLineName, number>(needed.map((L) => [L, Math.max(0, ...usable.map((f) => bandFor(f, L)?.gain ?? 0))]));
  const eligible = (f: NbFilterInput, L: MixLineName): BandCalc | null => {
    const b = bandFor(f, L);
    return b !== null && b.gain > 0 && b.gain * GAIN_HURDLE >= (bestGain.get(L) as number) ? b : null;
  };
  const taker = new Map<MixLineName, { filter: NbFilterInput; band: BandCalc }>();
  const left = new Set<MixLineName>(needed);
  while (left.size > 0) {
    const picks = usable
      .map((f) => ({ f, got: [...left].flatMap((L) => { const b = eligible(f, L); return b === null ? [] : [{ L, b }]; }) }))
      .filter((c) => c.got.length > 0)
      .map((c) => ({ ...c, mean: c.got.reduce((t, x) => t + x.b.gain, 0) / c.got.length }));
    if (picks.length === 0) break;
    const win = picks.reduce((a, b) => {
      if (b.got.length !== a.got.length) return b.got.length > a.got.length ? b : a;
      if (b.mean !== a.mean) return b.mean > a.mean ? b : a;
      return `${b.f.name}\u0000${b.f.id}` < `${a.f.name}\u0000${a.f.id}` ? b : a;
    });
    for (const { L, b } of win.got) {
      taker.set(L, { filter: win.f, band: b });
      left.delete(L);
    }
  }

  // A line whose taker earns no minutes goes to the gear filter that does earn them for it (at least MIN_TOTAL_MIN): the most minutes, then the higher gain, then the name.
  for (const L of needed) {
    const cur = taker.get(L);
    if (cur !== undefined && lineNumbers(L, cur.band).minutes > 0) continue;
    const earners = usable.flatMap((f) => {
      const b = bandFor(f, L);
      return b === null ? [] : [{ f, b, n: lineNumbers(L, b) }];
    }).filter((x) => x.n.minutes > 0);
    if (earners.length === 0) continue;
    const win = earners.reduce((x, y) => {
      if (y.n.minutes !== x.n.minutes) return y.n.minutes > x.n.minutes ? y : x;
      if (y.b.gain !== x.b.gain) return y.b.gain > x.b.gain ? y : x;
      return `${y.f.name}\u0000${y.f.id}` < `${x.f.name}\u0000${x.f.id}` ? y : x;
    });
    taker.set(L, { filter: win.f, band: win.b });
  }

  const results: NbFilterResult[] = input.filters.map((f): NbFilterResult => {
    const none = { filterId: f.id, name: f.name, minutes: 0, gain: null, lines: [] as NbLine[], standaloneLines: [] as NbLine[], standaloneMin: 0 };
    const bands = f.bands ?? [];
    if (bands.length === 0) return { ...none, verdict: 'cannot-judge', reason: 'Cannot judge: passbands unknown. Add them in Gear.', basis: ['Passbands unknown.'] };
    if (isBroad(bands)) return { ...none, verdict: 'cannot-judge', reason: 'Cannot judge: a broadband filter.', detail: `A band ${BROAD_BAND_NM} nm or wider is not a narrowband addition, so it gets no minutes.`, basis: ['Broadband filter: not sized by this method.'] };
    if (gate) return { ...none, verdict: 'no-narrowband', reason: '', detail: 'Almost no emission light.', basis: baseBasis };
    if (needed.length === 0) {
      const why = haMostlyNii ? 'No line strong enough: the Ha band mostly passes nitrogen.' : `No line reaches ${Math.round(W_MIN * 100)}% of the strongest.`;
      return { ...none, verdict: 'no-help', reason: '', detail: why, basis: baseBasis };
    }
    const own = needed.filter((L) => taker.get(L)?.filter === f);
    const basis = [...baseBasis];
    const mine = bandsOf(f);
    if (mine.some((b) => b.share < 1)) {
      const least = Math.min(...mine.filter((b) => b.passes.length > 0).map((b) => b.share));
      basis.push(`At f/${fRatio.toFixed(1)} the beam edge shifts the band toward blue (the planner’s own formula, the band taken as centred on its line at normal incidence): about ${Math.round(least * 100)}% of the beam still sees the line on the narrowest-margin band.`);
    }
    if (f.ratedMinFRatio !== undefined && fRatio >= f.ratedMinFRatio) basis.push(`The maker rates it for f/${f.ratedMinFRatio} and slower; its shift is taken as covered.`);
    const passing = needed.filter((L) => bandFor(f, L) !== null);
    const standaloneLines = passing.map((L) => lineNumbers(L, bandFor(f, L) as BandCalc)).filter((l) => l.minutes > 0);
    const standaloneMin = Math.max(0, ...standaloneLines.map((l) => l.minutes));
    const alone = { standaloneLines, standaloneMin };
    if (own.length === 0) {
      if (passing.length === 0) return { ...none, verdict: 'no-help', reason: '', detail: `Passes no needed line (${list(needed)}).`, basis };
      const mineNums = passing.map((L) => lineNumbers(L, bandFor(f, L) as BandCalc));
      const topGain = Math.max(...mineNums.map((l) => l.gain));
      const taken = (L: MixLineName): { filter: NbFilterInput; band: BandCalc } | undefined => taker.get(L);
      const takerRuns = (L: MixLineName): boolean => {
        const t = taken(L);
        return t !== undefined && lineNumbers(L, t.band).minutes > 0;
      };
      const base = { ...none, ...alone, gain: topGain, lines: [] as NbLine[] };
      const runs = mineNums.filter((l) => takerRuns(l.line));
      const rest = mineNums.filter((l) => !takerRuns(l.line));
      const parts: string[] = [];
      if (runs.length > 0) {
        const compare = runs.map((l) => {
          const t = taken(l.line) as { filter: NbFilterInput; band: BandCalc };
          const r = Math.round((l.gain / t.band.gain) * 100) / 100;
          if (r === 1) return `Same as ${t.filter.name} for ${l.line}`;
          const how = l.gain / t.band.gain >= 1.05 ? 'A little better than' : l.gain / t.band.gain > 0.95 ? 'Same as' : 'Weaker than';
          return `${how} ${t.filter.name} for ${l.line} (${r}×)`;
        });
        parts.push(...compare);
      }
      // A line this filter could earn minutes for always has a running taker (the assignment gives it to a filter that earns them), so a line left here earns none.
      for (const l of rest) parts.push(hurdleNote(l));
      return { ...base, verdict: 'no-help', reason: '', detail: sentences(parts), basis };
    }
    const lines = own.map((L) => lineNumbers(L, (taker.get(L) as { band: BandCalc }).band));
    const total = Math.max(...lines.map((l) => l.minutes));
    const best = lines.reduce((a, b) => (b.minutes > a.minutes || (b.minutes === a.minutes && b.gain > a.gain) ? b : a));
    if (total > 0) {
      const gains = lines.filter((l) => l.minutes > 0).map((l) => `${l.line} ${times(l.gain)}×`);
      const first = `Adds ${list(lines.filter((l) => l.minutes > 0).map((l) => l.line))}.`;
      const knee = best.kneeMin < best.matchMin;
      const second = knee
        ? `Enough at ${nbMinutes(total)}: more stops paying (under ${Math.round(g * 100)}% per extra half hour). ${list(gains)} broadband.`
        : `${nbMinutes(total)} makes this line as clean as the broadband nebula. ${list(gains)} broadband.`;
      const dual = lines.filter((l) => l.minutes > 0).length > 1 ? ' Both bands run at once.' : '';
      const others = needed.filter((L) => !own.includes(L) && bandFor(f, L) !== null);
      const runsFor = (L: MixLineName): boolean => {
        const t = taker.get(L);
        return t !== undefined && lineNumbers(L, t.band).minutes > 0;
      };
      const taken = others.filter(runsFor);
      const idle = others.filter((L) => !runsFor(L)).map((L) => hurdleNote(lineNumbers(L, bandFor(f, L) as BandCalc)));
      const gave = taken.length > 0 ? ` ${list(taken)} goes to ${list([...new Set(taken.map((L) => (taker.get(L) as { filter: NbFilterInput }).filter.name))])}, which runs for it.` : '';
      const idleText = idle.length > 0 ? ` ${sentences(idle)}` : '';
      return { filterId: f.id, name: f.name, verdict: 'recommend', minutes: total, reason: first, detail: `${second}${dual}${gave}${idleText}`, gain: best.gain, lines, ...alone, basis };
    }
    const notes = lines.map(hurdleNote);
    return { filterId: f.id, name: f.name, verdict: 'no-help', minutes: 0, reason: '', detail: sentences(notes), gain: best.gain, lines, ...alone, basis };
  });

  return {
    gate,
    headline,
    filters: results,
    needed: [...needed],
    haMostlyNii,
    confidence,
    profileNote: p.note ?? null,
    capMin: capHours * 60,
    kneeGain: g,
    broadbandMin: B * 60,
    broadbandSnr,
    basis: [BASIS_SNR_ONLY, BASIS_PASSBANDS, BASIS_ESTIMATE, BASIS_SKY, BASIS_RULES],
  };
}

/** One ticked filter's share of the plan. */
export interface NbPlanLine {
  filterId: string;
  name: string;
  /** What the filter adds once lines an earlier ticked filter already covers are left out. */
  minutes: number;
  /** The lines that count for this filter. */
  lines: MixLineName[];
  /** Lines this filter passes that an earlier ticked filter already covers, so they are not added twice. */
  covered: MixLineName[];
}

/**
 * The narrowband time of the ticked filters. A recommended filter adds the minutes of the lines it was given; a ticked filter that is not recommended adds its
 * stand-alone minutes. A line two ticked filters both pass is counted once, for the recommended filter first, then for the filter covering the most of the remaining lines (a tie goes to the higher gain, then the name); a filter
 * left with no new line adds nothing.
 */
export function narrowbandPlan(result: NbResult, ticked: ReadonlySet<string>): NbPlanLine[] {
  const chosen = result.filters.filter((f) => ticked.has(f.filterId) && (f.minutes > 0 || f.standaloneMin > 0));
  const done = new Set<MixLineName>();
  const fresh = new Map<NbFilterResult, NbLine[]>();
  const ownOf = (f: NbFilterResult): NbLine[] => (f.minutes > 0 ? f.lines : f.standaloneLines).filter((l) => l.minutes > 0);
  // Recommended filters hold disjoint lines, so they come first. The rest share what is left: the filter covering the most uncovered lines takes them all;
  // a tie goes to the higher mean gain, then to the name (the rule the recommendation uses).
  for (const f of chosen.filter((c) => c.minutes > 0)) {
    fresh.set(f, ownOf(f));
    for (const l of ownOf(f)) done.add(l.line);
  }
  const rest = chosen.filter((c) => c.minutes === 0);
  for (;;) {
    const picks = rest
      .filter((f) => !fresh.has(f))
      .map((f) => ({ f, got: ownOf(f).filter((l) => !done.has(l.line)) }))
      .filter((c) => c.got.length > 0)
      .map((c) => ({ ...c, mean: c.got.reduce((t, l) => t + l.gain, 0) / c.got.length }));
    if (picks.length === 0) break;
    const win = picks.reduce((a, b) => {
      if (b.got.length !== a.got.length) return b.got.length > a.got.length ? b : a;
      if (b.mean !== a.mean) return b.mean > a.mean ? b : a;
      return `${b.f.name}\u0000${b.f.filterId}` < `${a.f.name}\u0000${a.f.filterId}` ? b : a;
    });
    fresh.set(win.f, win.got);
    for (const l of win.got) done.add(l.line);
  }
  return chosen.map((f): NbPlanLine => {
    const mine = fresh.get(f) ?? [];
    return {
      filterId: f.filterId,
      name: f.name,
      minutes: Math.max(0, ...mine.map((l) => l.minutes)),
      lines: mine.map((l) => l.line),
      covered: ownOf(f).filter((l) => !mine.includes(l)).map((l) => l.line),
    };
  });
}
