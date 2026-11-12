import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { GRID_MIN, GRID_MS, MERIDIAN_FLIP_MIN, MIN_FIT_MIN, analyseSubject, nightBounds, slotCrossesMeridian, validateInput } from './analysis';
import type { SubjectGrid } from './analysis';
import type { CampaignInput, CampaignNight, CampaignResult, CampaignSlot, CandidateFit, NightPacking, ShortReason, SubjectOutcome } from './types';

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

interface Option {
  subject: number;
  k: number;
  ell: number;
  flip: boolean;
  /** Steps from the start of the night to the end of the slot, flip included. */
  endStep: number;
  mean: number;
}

/** The slot an option stands for. */
function placementOf(o: Option, g: SubjectGrid, frame: Frame): Placement {
  const flipMin = o.flip ? MERIDIAN_FLIP_MIN : 0;
  const s = frame.t0 + o.k * GRID_MS;
  const e = s + (o.ell + flipMin) * MIN_MS;
  return { k: o.k, span: { s, e }, slot: { subjectId: g.subjectId, start: new Date(s), end: new Date(e), integrationMin: o.ell, flipMin, flip: o.flip, meanAltitude: o.mean } };
}

/** Every slot a subject can take: each 5-minute start, each length down from the requested one, clean or straddling as the transit decides. */
function optionsOf(g: SubjectGrid, subject: number, frame: Frame): Option[] {
  const want = g.subject.hoursPerNight * 60;
  const windows = g.windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  const out: Option[] = [];
  const prefix = [0];
  g.alt.forEach((a, i) => prefix.push(prefix[i] + a));
  for (let k = 0; ; k++) {
    const s = frame.t0 + k * GRID_MS;
    if (s >= frame.t1) break;
    const w = windows.find((x) => s >= x.s && s < x.e);
    if (!w) continue;
    const limit = Math.min(w.e, frame.t1);
    for (let ell = GRID_MIN; ell <= want; ell += GRID_MIN) {
      const flip = slotCrossesMeridian(g.transit, new Date(s), ell);
      const flipMin = flip ? MERIDIAN_FLIP_MIN : 0;
      const e = s + (ell + flipMin) * MIN_MS;
      if (e > limit) break;
      const last = Math.min(g.alt.length - 1, k + Math.floor(ell / GRID_MIN));
      const mean = (prefix[last + 1] - prefix[k]) / (last - k + 1);
      out.push({ subject, k, ell, flip, endStep: k + (ell + flipMin) / GRID_MIN, mean });
    }
  }
  return out;
}

/** What a night's plan is worth, in the order Christian ranked it: total minutes, subjects at full length, fewer flips, minutes for the subjects owed most, altitude-weighted minutes. */
interface Score {
  minutes: number;
  full: number;
  flips: number;
  owed: number;
  altitude: number;
}

const ZERO: Score = { minutes: 0, full: 0, flips: 0, owed: 0, altitude: 0 };
const beats = (a: Score, b: Score): boolean =>
  a.minutes !== b.minutes ? a.minutes > b.minutes
    : a.full !== b.full ? a.full > b.full
      : a.flips !== b.flips ? a.flips < b.flips
        : a.owed !== b.owed ? a.owed > b.owed : a.altitude > b.altitude;

/** Up to this many subjects the search over (time, subjects placed) is exact; above it only the best BEAM_WIDTH sets are kept at each step. */
export const EXACT_SUBJECTS_MAX = 6;
const BEAM_WIDTH = 96;

interface State {
  score: Score;
  /** The option placed to arrive here; null when arriving by letting a 5-minute step pass. */
  via: Option | null;
}

/**
 * The best plan for one night: dynamic programming over (grid step, set of subjects placed). Each subject takes at most
 * one slot, of any length from 5 minutes to the requested one, clean or straddling the transit, and the next slot starts
 * at least the slew time after the end of the one before (the next grid step, as slots end on the grid).
 * The score adds up slot by slot, so the best plan is found exactly (beam-pruned above EXACT_SUBJECTS_MAX subjects).
 */
function bestPlan(grids: readonly SubjectGrid[], frame: Frame, deficit: readonly number[]): (Placement | null)[] {
  const n = grids.length;
  const steps = Math.floor((frame.t1 - frame.t0) / GRID_MS);
  const options = grids.flatMap((g, i) => optionsOf(g, i, frame));
  const byStart: Option[][] = Array.from({ length: steps + 2 }, () => []);
  for (const o of options) byStart[o.k].push(o);
  const masks = 1 << n;
  // table[t][mask]: the best way to have placed `mask`, with the next slot not starting before step t.
  const table: (State | null)[][] = Array.from({ length: steps + 2 }, () => new Array<State | null>(masks).fill(null));
  table[0][0] = { score: ZERO, via: null };
  const wants = grids.map((g) => g.subject.hoursPerNight * 60);
  const scratch: Score = { ...ZERO };
  const relax = (t: number, mask: number, from: Score, via: Option | null): void => {
    const cur = table[t][mask];
    if (via && cur && from.minutes + via.ell < cur.score.minutes) return;
    if (via) {
      scratch.minutes = from.minutes + via.ell;
      scratch.full = from.full + (via.ell >= wants[via.subject] ? 1 : 0);
      scratch.flips = from.flips + (via.flip ? 1 : 0);
      scratch.owed = from.owed + via.ell * deficit[via.subject];
      scratch.altitude = from.altitude + via.ell * via.mean;
    } else Object.assign(scratch, from);
    if (!cur || beats(scratch, cur.score)) table[t][mask] = { score: { ...scratch }, via };
  };
  for (let t = 0; t <= steps; t++) {
    const row = table[t];
    if (n > EXACT_SUBJECTS_MAX) {
      const live = row.flatMap((st, m) => (st ? [m] : []));
      if (live.length > BEAM_WIDTH) {
        live.sort((x, y) => (beats((row[x] as State).score, (row[y] as State).score) ? -1 : beats((row[y] as State).score, (row[x] as State).score) ? 1 : x - y));
        for (const m of live.slice(BEAM_WIDTH)) row[m] = null;
      }
    }
    for (let mask = 0; mask < masks; mask++) {
      const st = row[mask];
      if (!st) continue;
      relax(t + 1, mask, st.score, null);
      for (const o of byStart[t]) {
        if (mask & (1 << o.subject)) continue;
        const tt = Math.min(o.endStep + 1, steps + 1);
        const m2 = mask | (1 << o.subject);
        const cur = table[tt][m2];
        if (cur !== null && cur.score.minutes > st.score.minutes + o.ell) continue;
        relax(tt, m2, st.score, o);
      }
    }
  }
  // Walk back from the best final state.
  let mask = 0;
  let best: State | null = null;
  table[steps + 1].forEach((st, m) => {
    if (st && (best === null || beats(st.score, best.score))) {
      best = st;
      mask = m;
    }
  });
  const placed: (Placement | null)[] = grids.map(() => null);
  let t = steps + 1;
  while (t > 0 || mask !== 0) {
    const st = table[t][mask] as State;
    if (st.via === null) {
      t -= 1;
    } else {
      placed[st.via.subject] = placementOf(st.via, grids[st.via.subject], frame);
      mask &= ~(1 << st.via.subject);
      t = st.via.k;
    }
  }
  return placed;
}

function shortReason(g: SubjectGrid, frame: Frame, got: number): ShortReason {
  if (g.windows.length === 0 && g.noWindowReason) return g.noWindowReason;
  const wantMin = g.subject.hoursPerNight * 60;
  const aloneSlot = placeLongest(g, frame, [], wantMin)?.slot;
  const alone = aloneSlot?.integrationMin ?? 0;
  const name = g.subject.name;
  const longestWindow = Math.max(...g.windows.map((w) => (w.end.getTime() - w.start.getTime()) / MIN_MS));
  if (alone <= got && alone < wantMin && longestWindow >= wantMin) {
    return longestWindow < wantMin + MERIDIAN_FLIP_MIN
      ? { code: 'flip-cuts-slot', text: `${name}: ${got} of ${wantMin} min; its ${Math.round(longestWindow)} min of clear time holds ${wantMin} min only without the ${MERIDIAN_FLIP_MIN} min meridian flip it needs.` }
      : { code: 'window-too-short', text: `${name}: ${got} of ${wantMin} min; its ${Math.round(longestWindow)} min of clear time would hold it, but slots start on a ${GRID_MIN} min grid and that loses the edge of the window.` };
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
 * everyone everything, the subjects most behind win the tie between plans with the same total minutes, subjects at full length and flips. Absent: no one.
 */
export function scheduleNight(input: CampaignInput, index: number, deficit: readonly number[] = []): CampaignNight {
  const b = nightBounds(input, index);
  if (!b.start || !b.end) return emptyNight(b.date, input, b.reason);
  const frame: Frame = { t0: b.start.getTime(), t1: b.end.getTime() };
  const grids = input.subjects.map((s) => analyseSubject(input, s, b.start as Date, b.end as Date));
  const placed = bestPlan(grids, frame, input.subjects.map((_, i) => deficit[i] ?? 0));
  const taken = placed.flatMap((p) => (p ? [p.span] : []));

  const outcomes = grids.map((g, i): SubjectOutcome => {
    const p = placed[i];
    const requestedMin = g.subject.hoursPerNight * 60;
    const gotMin = p?.slot.integrationMin ?? 0;
    return { subjectId: g.subjectId, requestedMin, gotMin, slot: p?.slot ?? null, reason: gotMin >= requestedMin ? null : shortReason(g, frame, gotMin) };
  });
  const slots = placed.flatMap((p) => (p ? [p.slot] : [])).sort((x, y) => x.start.getTime() - y.start.getTime());

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
