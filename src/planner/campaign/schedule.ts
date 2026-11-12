import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { GRID_MIN, GRID_MS, MERIDIAN_FLIP_MIN, MIN_FIT_MIN, analyseSubject, nightBounds, slotCrossesMeridian, validateInput } from './analysis';
import type { SubjectGrid } from './analysis';
import type { CampaignInput, CampaignNight, CampaignResult, CampaignSlot, CandidateFit, NightPacking, ShortReason, SubjectOutcome } from './types';

/** Up to this many subjects every order is tried; above it, the orders are improved by moving one subject at a time from a start order. */
export const EXACT_ORDER_MAX = 5;

/** Passes of one-subject moves above EXACT_ORDER_MAX subjects. */
const MAX_PASSES = 4;
const RULES: readonly FlipRule[] = ['clean-first', 'earliest-end'];
const MIN_MS = 60000;
const SLEW_MS = SLEW_CENTER_MIN * MIN_MS;

interface Span {
  s: number;
  e: number;
}

interface Placement {
  /** Index of the first 5-minute sample of the slot, from the start of the night. */
  k: number;
  slot: CampaignSlot;
  span: Span;
}

interface Frame {
  t0: number;
  t1: number;
}

/**
 * A slot of `ell` imaging minutes for this subject starting no earlier than `from`, in the room left, or null. A
 * straddling slot is tried only when no clean one of this length fits (`flips` narrows which kinds are tried). Starts are on a 5-minute grid from the start
 * of the night. `earliest` takes the first start that fits; otherwise the one with the highest mean altitude.
 */
function tryLength(g: SubjectGrid, frame: Frame, taken: readonly Span[], ell: number, from = frame.t0, earliest = false, flips: readonly boolean[] = [false, true]): Placement | null {
  const windows = g.windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  const transit = g.transit;
  for (const flip of flips) {
    const flipMin = flip ? MERIDIAN_FLIP_MIN : 0;
    const dur = (ell + flipMin) * MIN_MS;
    let best: { k: number; mean: number } | null = null;
    for (let k = 0; ; k++) {
      const s = frame.t0 + k * GRID_MS;
      const e = s + dur;
      if (e > frame.t1) break;
      if (s < from) continue;
      if (!windows.some((w) => s >= w.s && e <= w.e)) continue;
      if (!taken.every((o) => e + SLEW_MS <= o.s || s >= o.e + SLEW_MS)) continue;
      if (slotCrossesMeridian(transit, new Date(s), ell) !== flip) continue;
      const last = Math.min(g.alt.length - 1, k + Math.floor(ell / GRID_MIN));
      let sum = 0;
      for (let i = k; i <= last; i++) sum += g.alt[i];
      const mean = sum / (last - k + 1);
      if (best === null || mean > best.mean) best = { k, mean };
      if (earliest) break;
    }
    if (best) {
      const s = frame.t0 + best.k * GRID_MS;
      return {
        k: best.k,
        span: { s, e: s + dur },
        slot: { subjectId: g.subjectId, start: new Date(s), end: new Date(s + dur), integrationMin: ell, flipMin, flip, meanAltitude: best.mean },
      };
    }
  }
  return null;
}

/** The longest slot up to `wantMin` that fits, trying each length from the full one down in 5-minute steps. */
function placeLongest(g: SubjectGrid, frame: Frame, taken: readonly Span[], wantMin: number, floorMin = GRID_MIN, from = frame.t0, earliest = false): Placement | null {
  for (let ell = wantMin; ell >= floorMin; ell -= GRID_MIN) {
    const p = tryLength(g, frame, taken, ell, from, earliest);
    if (p) return p;
  }
  return null;
}

/** How a subject's slot is chosen when it could be clean or straddle the transit. */
type FlipRule = 'clean-first' | 'earliest-end';

/** The longest slot up to `wantMin` that starts no earlier than `from`, taking the earliest start; per `rule`, a clean slot first or whichever kind ends first (a clean one on a tie). */
function placeEarliest(g: SubjectGrid, frame: Frame, from: number, rule: FlipRule): Placement | null {
  const want = g.subject.hoursPerNight * 60;
  if (rule === 'clean-first') return placeLongest(g, frame, [], want, GRID_MIN, from, true);
  for (let ell = want; ell >= GRID_MIN; ell -= GRID_MIN) {
    const clean = tryLength(g, frame, [], ell, from, true, [false]);
    const flipped = tryLength(g, frame, [], ell, from, true, [true]);
    if (clean && flipped) return flipped.span.e < clean.span.e ? flipped : clean;
    if (clean || flipped) return clean ?? flipped;
  }
  return null;
}

interface Arrangement {
  /** By subject index. */
  placed: (Placement | null)[];
  minutes: number;
  /** Imaging minutes weighted by each subject's shortfall so far (all zero on a first night). */
  owed: number;
  flips: number;
  altitude: number;
}

/**
 * Slots go in time order, the order given, each at its earliest fit after the one before (so the order leaves no gap
 * that a later subject could have used). Then, last slot first, each slot moves later to its best-altitude start that
 * still keeps the slew gap to the next slot, the same length and the same flip status.
 */
function arrange(grids: readonly SubjectGrid[], frame: Frame, order: readonly number[], deficit: readonly number[], rule: FlipRule): Arrangement {
  const placed: (Placement | null)[] = grids.map(() => null);
  const seq: number[] = [];
  let from = frame.t0;
  for (const i of order) {
    const p = placeEarliest(grids[i], frame, from, rule);
    if (!p) continue;
    placed[i] = p;
    seq.push(i);
    from = p.span.e + SLEW_MS;
  }
  for (let j = seq.length - 1; j >= 0; j--) {
    const i = seq[j];
    const cur = placed[i] as Placement;
    const limit = j === seq.length - 1 ? frame.t1 : (placed[seq[j + 1]] as Placement).span.s - SLEW_MS;
    const later = tryLength(grids[i], frame, [{ s: limit + SLEW_MS, e: Infinity }], cur.slot.integrationMin, cur.span.s, false, [cur.slot.flip]);
    if (later && later.slot.meanAltitude > cur.slot.meanAltitude) placed[i] = later;
  }
  let minutes = 0;
  let owed = 0;
  let flips = 0;
  let altitude = 0;
  placed.forEach((p, i) => {
    if (!p) return;
    minutes += p.slot.integrationMin;
    owed += p.slot.integrationMin * deficit[i];
    flips += p.slot.flip ? 1 : 0;
    altitude += p.slot.integrationMin * p.slot.meanAltitude;
  });
  return { placed, minutes, owed, flips, altitude };
}

/** More imaging minutes, then more minutes for the subjects owed the most, then fewer flips, then higher altitude-weighted minutes. A tie keeps the earlier order. */
const better = (a: Arrangement, b: Arrangement): boolean =>
  a.minutes !== b.minutes ? a.minutes > b.minutes
    : a.owed !== b.owed ? a.owed > b.owed
      : a.flips !== b.flips ? a.flips < b.flips : a.altitude > b.altitude;

function* permutations(xs: readonly number[]): Generator<number[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
}

/** Middle of the subject's usable time; subjects with none go last. */
const midpoint = (g: SubjectGrid): number =>
  g.windows.length === 0 ? Infinity : (g.windows[0].start.getTime() + g.windows[g.windows.length - 1].end.getTime()) / 2;

function bestArrangement(grids: readonly SubjectGrid[], frame: Frame, deficit: readonly number[]): Arrangement {
  const idx = grids.map((_, i) => i);
  const bestOfRules = (order: readonly number[]): Arrangement =>
    RULES.map((r) => arrange(grids, frame, order, deficit, r)).reduce((x, y) => (better(y, x) ? y : x));
  if (grids.length <= EXACT_ORDER_MAX) {
    let best: Arrangement | null = null;
    for (const order of permutations(idx)) {
      const a = bestOfRules(order);
      if (best === null || better(a, best)) best = a;
    }
    return best as Arrangement;
  }
  // Start from the time order of the subjects' usable windows, then move one subject to another position while that helps.
  let order = [...idx].sort((a, b) => midpoint(grids[a]) - midpoint(grids[b]) || a - b);
  let best = bestOfRules(order);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let from = 0; from < order.length; from++) {
      for (let to = 0; to < order.length; to++) {
        if (from === to) continue;
        const next = [...order];
        next.splice(to, 0, ...next.splice(from, 1));
        const a = bestOfRules(next);
        if (better(a, best)) {
          best = a;
          order = next;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

function shortReason(g: SubjectGrid, frame: Frame, got: number): ShortReason {
  if (g.windows.length === 0 && g.noWindowReason) return g.noWindowReason;
  const wantMin = g.subject.hoursPerNight * 60;
  const aloneSlot = placeLongest(g, frame, [], wantMin)?.slot;
  const alone = aloneSlot?.integrationMin ?? 0;
  const name = g.subject.name;
  const longestWindow = Math.max(...g.windows.map((w) => (w.end.getTime() - w.start.getTime()) / MIN_MS));
  if (alone <= got && aloneSlot?.flip && longestWindow >= wantMin) {
    return { code: 'flip-cuts-slot', text: `${name}: ${got} of ${wantMin} min; its ${Math.round(longestWindow)} min of clear time holds ${wantMin} min only without the ${MERIDIAN_FLIP_MIN} min meridian flip it needs.` };
  }
  return alone > got
    ? { code: 'no-room', text: `${name}: ${got} of ${wantMin} min; the other subjects take the rest of its window (${alone} min alone).` }
    : { code: 'window-too-short', text: `${name}: ${got} of ${wantMin} min; that is all the clear time it has tonight.` };
}

function emptyNight(date: string, input: CampaignInput, reason: ShortReason | null): CampaignNight {
  const outcomes: SubjectOutcome[] = input.subjects.map((s) => ({ subjectId: s.id, requestedMin: s.hoursPerNight * 60, gotMin: 0, slot: null, reason }));
  return {
    date, start: null, end: null, subjects: [], slots: [], outcomes,
    packing: { nightMin: 0, usedMin: 0, slewMin: 0, leftMin: 0, next: [] },
  };
}

/**
 * One night. `deficit[i]` is how many minutes subject i is behind from earlier nights: when the nights cannot give
 * everyone everything, the subjects most behind win the tie between arrangements with the same total. Absent: no one.
 */
export function scheduleNight(input: CampaignInput, index: number, deficit: readonly number[] = []): CampaignNight {
  const b = nightBounds(input, index);
  if (!b.start || !b.end) return emptyNight(b.date, input, b.reason);
  const frame: Frame = { t0: b.start.getTime(), t1: b.end.getTime() };
  const grids = input.subjects.map((s) => analyseSubject(input, s, b.start as Date, b.end as Date));
  const arr = bestArrangement(grids, frame, input.subjects.map((_, i) => deficit[i] ?? 0));
  const taken = arr.placed.flatMap((p) => (p ? [p.span] : []));

  const outcomes = grids.map((g, i): SubjectOutcome => {
    const p = arr.placed[i];
    const requestedMin = g.subject.hoursPerNight * 60;
    const gotMin = p?.slot.integrationMin ?? 0;
    return { subjectId: g.subjectId, requestedMin, gotMin, slot: p?.slot ?? null, reason: gotMin >= requestedMin ? null : shortReason(g, frame, gotMin) };
  });
  const slots = arr.placed.flatMap((p) => (p ? [p.slot] : [])).sort((x, y) => x.start.getTime() - y.start.getTime());

  const nightExact = (frame.t1 - frame.t0) / MIN_MS;
  const nightMin = Math.round(nightExact);
  const usedMin = slots.reduce((a, s) => a + s.integrationMin + s.flipMin, 0);
  const slewMin = Math.max(0, slots.length - 1) * SLEW_CENTER_MIN;
  const asked = [
    ...grids.filter((_, i) => outcomes[i].gotMin === 0),
    ...(input.candidates ?? []).map((s) => analyseSubject(input, s, b.start as Date, b.end as Date)),
  ];
  const next = asked.map((g): CandidateFit => {
    const p = placeLongest(g, frame, taken, Math.floor(nightExact / GRID_MIN) * GRID_MIN, MIN_FIT_MIN);
    if (p) return { subjectId: g.subjectId, fitMin: p.slot.integrationMin, flip: p.slot.flip, reason: null };
    const reason: ShortReason = g.windows.length === 0 && g.noWindowReason
      ? g.noWindowReason
      : placeLongest(g, frame, [], MIN_FIT_MIN, MIN_FIT_MIN)
        ? { code: 'no-room', text: `${g.subject.name}: no gap of ${MIN_FIT_MIN} min is left in its window.` }
        : { code: 'window-too-short', text: `${g.subject.name}: its clear time tonight is under ${MIN_FIT_MIN} min.` };
    return { subjectId: g.subjectId, fitMin: 0, flip: false, reason };
  });
  const packing: NightPacking = { nightMin, usedMin, slewMin, leftMin: nightMin - usedMin - slewMin, next };
  return { date: b.date, start: b.start, end: b.end, subjects: grids.map(({ subjectId, windows, usableMin, transit, unavoidableFlip }) => ({ subjectId, windows, usableMin, transit, unavoidableFlip })), slots, outcomes, packing };
}

/** The whole campaign, a night at a time; what a subject was short on earlier nights is carried to the next. Pure and deterministic. */
export function planCampaign(input: CampaignInput): CampaignResult {
  validateInput(input);
  const nights: CampaignNight[] = [];
  const deficit = input.subjects.map(() => 0);
  for (let n = 0; n < input.nights; n++) {
    const night = scheduleNight(input, n, deficit);
    night.outcomes.forEach((o, i) => { deficit[i] += o.requestedMin - o.gotMin; });
    nights.push(night);
  }
  const perSubject = input.subjects.map((s, i) => ({
    subjectId: s.id,
    requestedMin: s.hoursPerNight * 60 * input.nights,
    gotMin: nights.reduce((a, n) => a + (n.outcomes[i]?.gotMin ?? 0), 0),
  }));
  return { nights, perSubject };
}
