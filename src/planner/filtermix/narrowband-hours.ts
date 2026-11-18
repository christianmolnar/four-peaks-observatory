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

export const HONESTY_LINE =
  'Counts signal-to-noise only; band widths from the vendor, centres and leakage not verified; estimated from sky and band width, not measured on your rig.';
const BASIS_SNR_ONLY = 'Counts signal-to-noise only: it cannot see colour separation, real sky spectra or the filter’s true transmission, so “does not help” means no signal-to-noise gain, not no contrast gain.';
const BASIS_PASSBANDS = 'Band widths from the vendor; centres and leakage not verified.';
const BASIS_ESTIMATE = 'Estimated from sky and band width, not measured on your rig.';
const BASIS_SKY = 'The sky is taken as flat across the bands and moonless.';
const BASIS_RULES = 'The match rule (narrowband as clean as the broadband nebula) and the 1.25 hurdle are planner choices, not measured.';

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
  /** One plain sentence or two. */
  reason: string;
  /** The gain E of the line that sets the minutes (else the best of its lines); null when the filter is not judged. */
  gain: number | null;
  /** The needed lines this filter was given, with their numbers. */
  lines: NbLine[];
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

  const g = PRESETS[input.knee].maxNextHalfHourGain;
  const capHours = 0.5 / ((1 + g) ** 2 - 1);
  const confidence = confidenceLabel(p);
  const headline = gate ? 'This target gives off almost no emission light, so no narrowband filter helps. Shoot it broadband.' : null;
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

  // ---- which filter takes each needed line. The planner's order first (most needed lines, then the better band); a line moves to another filter only when
  // that filter's band has at least GAIN_HURDLE times the gain E (a band that collects more of the line but also more sky does not count).
  const meanGain = (f: NbFilterInput): number => {
    const bs = needed.map((L) => bandFor(f, L)).filter((b): b is BandCalc => b !== null);
    return bs.length === 0 ? 0 : bs.reduce((t, b) => t + b.gain, 0) / bs.length;
  };
  const count = (f: NbFilterInput): number => needed.filter((L) => bandFor(f, L) !== null).length;
  const order = [...usable].sort((a, b) => count(b) - count(a) || meanGain(b) - meanGain(a) || usable.indexOf(a) - usable.indexOf(b));
  const taker = new Map<MixLineName, { filter: NbFilterInput; band: BandCalc }>();
  for (const L of needed) {
    const first = order.find((f) => bandFor(f, L) !== null);
    if (first === undefined) continue;
    let chosen = { filter: first, band: bandFor(first, L) as BandCalc };
    for (const f of usable) {
      const b = bandFor(f, L);
      if (b !== null && b.gain >= GAIN_HURDLE * chosen.band.gain && b.gain > 0) chosen = { filter: f, band: b };
    }
    taker.set(L, chosen);
  }

  // ---- minutes per assigned line, then per filter (the bands of one filter run at once, so its minutes are the longest of its lines)
  const lineNumbers = (L: MixLineName, b: BandCalc): NbLine => {
    const matchMin = b.rate > 0 ? ((B * rateO) / b.rate) * 60 : Number.POSITIVE_INFINITY;
    const kneeMin = b.gain > 0 ? (capHours - B / b.gain) * 60 : Number.NEGATIVE_INFINITY;
    const t = Math.min(matchMin, kneeMin);
    const helps = b.gain >= GAIN_HURDLE && t >= MIN_TOTAL_MIN;
    return { line: L, gain: b.gain, matchMin, kneeMin, minutes: helps ? Math.round(Math.max(t, MIN_TOTAL_MIN) / STEP_MIN) * STEP_MIN : 0 };
  };
  const nbMinutes = (n: number): string => `${n} min`;

  const results: NbFilterResult[] = input.filters.map((f): NbFilterResult => {
    const none = { filterId: f.id, name: f.name, minutes: 0, gain: null, lines: [] as NbLine[] };
    const bands = f.bands ?? [];
    if (bands.length === 0) return { ...none, verdict: 'cannot-judge', reason: 'Cannot judge: passbands unknown. Add them in Gear to see what this filter would add.', basis: ['Passbands unknown.'] };
    if (isBroad(bands)) return { ...none, verdict: 'cannot-judge', reason: `Cannot judge: a broadband filter (a band ${BROAD_BAND_NM} nm or wider) is not a narrowband addition, so it gets no minutes here.`, basis: ['Broadband filter: not sized by this method.'] };
    if (gate) return { ...none, verdict: 'no-narrowband', reason: 'No narrowband: this target gives off almost no emission light for a filter to isolate.', basis: baseBasis };
    if (needed.length === 0) {
      const why = haMostlyNii ? 'its Ha band mostly passes nitrogen, and the other lines are too weak' : `no line reaches ${Math.round(W_MIN * 100)}% of the strongest`;
      return { ...none, verdict: 'no-help', reason: `Does not help: no line of this target is strong enough to need a filter (${why}).`, basis: baseBasis };
    }
    const own = needed.filter((L) => taker.get(L)?.filter === f);
    const basis = [...baseBasis];
    const mine = bandsOf(f);
    if (mine.some((b) => b.share < 1)) {
      const least = Math.min(...mine.filter((b) => b.passes.length > 0).map((b) => b.share));
      basis.push(`At f/${Number(fRatio.toFixed(2))} the beam edge shifts the band toward blue (the planner’s own formula, the band taken as centred on its line at normal incidence): about ${Math.round(least * 100)}% of the beam still sees the line on the narrowest-margin band.`);
    }
    if (f.ratedMinFRatio !== undefined && fRatio >= f.ratedMinFRatio) basis.push(`The maker rates it for f/${f.ratedMinFRatio} and slower; its shift is taken as covered.`);
    if (own.length === 0) {
      const passing = needed.filter((L) => bandFor(f, L) !== null);
      if (passing.length === 0) return { ...none, verdict: 'no-help', reason: `Does not help: it passes no line this target needs (${list(needed)}).`, basis };
      const by = [...new Set(passing.map((L) => (taker.get(L) as { filter: NbFilterInput }).filter.name))];
      return { ...none, verdict: 'no-help', reason: `Does not help: ${list(passing)} ${passing.length > 1 ? 'are' : 'is'} better collected by ${list(by)}.`, basis };
    }
    const lines = own.map((L) => lineNumbers(L, (taker.get(L) as { band: BandCalc }).band));
    const total = Math.max(...lines.map((l) => l.minutes));
    const best = lines.reduce((a, b) => (b.minutes > a.minutes || (b.minutes === a.minutes && b.gain > a.gain) ? b : a));
    if (total > 0) {
      const gains = lines.filter((l) => l.minutes > 0).map((l) => `${l.line} ${times(l.gain)} times`);
      const first = `Adds ${list(lines.filter((l) => l.minutes > 0).map((l) => l.line))}: the signal-to-noise per hour is ${list(gains)} that of broadband.`;
      const knee = best.kneeMin < best.matchMin;
      const second = knee
        ? `More than ${nbMinutes(total)} stops paying: another half hour adds under ${Math.round(g * 100)}%.`
        : `${nbMinutes(total)} makes this line as clean as the broadband nebula.`;
      const dual = lines.filter((l) => l.minutes > 0).length > 1 ? ' Both bands run at once.' : '';
      const taken = needed.filter((L) => !own.includes(L) && bandFor(f, L) !== null && taker.get(L) !== undefined);
      const gave = taken.length > 0 ? ` ${list(taken)} goes to ${list([...new Set(taken.map((L) => (taker.get(L) as { filter: NbFilterInput }).filter.name))])}, a clearly better band for it.` : '';
      return { filterId: f.id, name: f.name, verdict: 'recommend', minutes: total, reason: `${first} ${second}${dual}${gave}`, gain: best.gain, lines, basis };
    }
    const notes = lines.map((l) =>
      l.gain < GAIN_HURDLE
        ? `${l.line} gains only ${times(l.gain)} times over broadband, under the ${GAIN_HURDLE} times hurdle`
        : l.kneeMin <= 0
          ? `broadband already carries ${l.line} well enough (more narrowband adds under ${Math.round(g * 100)}% per half hour)`
          : `${l.line} would need under ${MIN_TOTAL_MIN} min, too little to be worth the setup`,
    );
    return { filterId: f.id, name: f.name, verdict: 'no-help', minutes: 0, reason: `Does not help: ${list(notes)}.`, gain: best.gain, lines, basis };
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
    broadbandMin: B * 60,
    broadbandSnr,
    basis: [BASIS_SNR_ONLY, BASIS_PASSBANDS, BASIS_ESTIMATE, BASIS_SKY, BASIS_RULES],
  };
}
