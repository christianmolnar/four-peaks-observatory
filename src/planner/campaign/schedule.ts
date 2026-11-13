import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { GRID_MIN, GRID_MS, MERIDIAN_FLIP_MIN, analyseSubject, nightBounds, slotCrossesMeridian, usefulRangeOf, validateInput } from './analysis';
import { MIN_SLOT_MIN } from './constants';
import type { SubjectGrid } from './analysis';
import type { CampaignInput, CampaignNight, CampaignResult, CampaignSlot, CandidateFit, CutEntry, CutLine, NightCutLine, NightPacking, ShortCode, ShortReason, SubjectOutcome, SubjectResult } from './types';

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
  /** 1 when this slot makes a target that was below its minUseful useful. */
  reach: number;
}

/** How much integration a subject can take tonight: `lo` to `hi` minutes, both 0 when it is done. `reach`: the slot makes it useful. */
interface Take {
  lo: number;
  hi: number;
  reach: boolean;
}

/**
 * A target below its minUseful takes at least the rest of it in one slot (a smaller slot would be a token that may never
 * add up), and up to maxUseful. A useful one takes MIN_SLOT_MIN or more, up to maxUseful. The cap `hoursPerNight` limits
 * the length but never below the minUseful a target still needs.
 */
function takeOf(s: CampaignInput['subjects'][number], got: number): Take {
  const { minMin, maxMin } = usefulRangeOf(s);
  if (got >= maxMin) return { lo: 0, hi: 0, reach: false };
  const cap = s.hoursPerNight === undefined ? Infinity : s.hoursPerNight * 60;
  if (got < minMin) {
    const lo = minMin - got;
    return { lo, hi: Math.min(maxMin - got, Math.max(cap, lo)), reach: true };
  }
  const hi = Math.min(maxMin - got, cap);
  return { lo: Math.min(MIN_SLOT_MIN, hi), hi, reach: false };
}

/** The slot an option stands for. */
function placementOf(o: Option, g: SubjectGrid, frame: Frame): Placement {
  const flipMin = o.flip ? MERIDIAN_FLIP_MIN : 0;
  const s = frame.t0 + o.k * GRID_MS;
  const e = s + (o.ell + flipMin) * MIN_MS;
  return { k: o.k, span: { s, e }, slot: { subjectId: g.subjectId, start: new Date(s), end: new Date(e), integrationMin: o.ell, flipMin, flip: o.flip, meanAltitude: o.mean } };
}

/** Every slot a subject can take: each 5-minute start, each length it may take, clean or straddling as the transit decides. */
function optionsOf(g: SubjectGrid, subject: number, frame: Frame, take: Take): Option[] {
  const windows = g.windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  const out: Option[] = [];
  if (take.hi <= 0) return out;
  const prefix = [0];
  g.alt.forEach((a, i) => prefix.push(prefix[i] + a));
  for (let k = 0; ; k++) {
    const s = frame.t0 + k * GRID_MS;
    if (s >= frame.t1) break;
    const w = windows.find((x) => s >= x.s && s < x.e);
    if (!w) continue;
    const limit = Math.min(w.e, frame.t1);
    for (let ell = take.lo; ell <= take.hi; ell += GRID_MIN) {
      const flip = slotCrossesMeridian(g.transit, new Date(s), ell);
      const flipMin = flip ? MERIDIAN_FLIP_MIN : 0;
      const e = s + (ell + flipMin) * MIN_MS;
      if (e > limit) break;
      const last = Math.min(g.alt.length - 1, k + Math.floor(ell / GRID_MIN));
      const mean = (prefix[last + 1] - prefix[k]) / (last - k + 1);
      out.push({ subject, k, ell, flip, endStep: k + (ell + flipMin) / GRID_MIN, mean, reach: take.reach ? 1 : 0 });
    }
  }
  return out;
}

/**
 * What a night's plan is worth, compared in this order: targets made useful (`reached`), then those targets by list
 * order (`prio`: earlier is worth more than every later one together), then minutes placed, then minutes weighted by the
 * target's value (lengthening goes to the higher value first), then fewer flips, then altitude-weighted minutes. Every part is a sum over slots, so
 * the best plan to any (time, set) cell extends to the best plan overall.
 */
interface Score {
  reached: number;
  prio: number;
  minutes: number;
  weighted: number;
  flips: number;
  altitude: number;
}

const ZERO: Score = { reached: 0, prio: 0, minutes: 0, weighted: 0, flips: 0, altitude: 0 };
const beats = (a: Score, b: Score): boolean =>
  a.reached !== b.reached ? a.reached > b.reached
    : a.prio !== b.prio ? a.prio > b.prio
      : a.minutes !== b.minutes ? a.minutes > b.minutes
        : a.weighted !== b.weighted ? a.weighted > b.weighted
          : a.flips !== b.flips ? a.flips < b.flips : a.altitude > b.altitude;

/** Up to this many subjects the search over (time, subjects placed) is exact; above it only the best BEAM_WIDTH sets are kept at each step. */
export const EXACT_SUBJECTS_MAX = 7;
const BEAM_WIDTH = 96;

interface State {
  score: Score;
  /** The option placed to arrive here; null only for the empty start. */
  via: Option | null;
  prev: State | null;
}

/**
 * The best plan for one night: dynamic programming over (grid step, set of subjects placed). Each subject takes at most
 * one slot, of any length it may take, clean or straddling the transit, and the next slot starts at least the slew time
 * after the end of the one before (the next grid step, as slots end on the grid). The score adds up slot by slot and is
 * compared in lexicographic order, so keeping the best plan per cell is exact (beam-pruned above EXACT_SUBJECTS_MAX subjects).
 */
function bestPlan(grids: readonly SubjectGrid[], takes: readonly Take[], frame: Frame): (Placement | null)[] {
  const n = grids.length;
  const steps = Math.floor((frame.t1 - frame.t0) / GRID_MS);
  const value = grids.map((g, i) => g.subject.value ?? n - i);
  const options = grids.flatMap((g, i) => optionsOf(g, i, frame, takes[i]));
  const byStart: Option[][] = Array.from({ length: steps + 2 }, () => []);
  for (const o of options) byStart[o.k].push(o);
  // rows[t]: mask -> the best way to have placed `mask`, with the next slot not starting before step t.
  const rows: Map<number, State>[] = Array.from({ length: steps + 2 }, () => new Map<number, State>());
  rows[0].set(0, { score: ZERO, via: null, prev: null });
  const scratch: Score = { ...ZERO };
  for (let t = 0; t <= steps; t++) {
    let row = rows[t];
    if (n > EXACT_SUBJECTS_MAX && row.size > BEAM_WIDTH) {
      const ranked = [...row.entries()].sort(([ma, a], [mb, b]) => (beats(a.score, b.score) ? -1 : beats(b.score, a.score) ? 1 : ma - mb));
      row = new Map(ranked.slice(0, BEAM_WIDTH));
      rows[t] = row;
    }
    for (const [mask, st] of row) {
      // Letting a step pass keeps the same state: nothing is copied, and the walk back sees only placements.
      const next = rows[t + 1].get(mask);
      if (!next || beats(st.score, next.score)) rows[t + 1].set(mask, st);
      for (const o of byStart[t]) {
        if (mask & (1 << o.subject)) continue;
        const f = st.score;
        scratch.reached = f.reached + o.reach;
        scratch.prio = f.prio + (o.reach ? Math.pow(2, n - 1 - o.subject) : 0);
        scratch.minutes = f.minutes + o.ell;
        scratch.weighted = f.weighted + o.ell * value[o.subject];
        scratch.flips = f.flips + (o.flip ? 1 : 0);
        scratch.altitude = f.altitude + o.ell * o.mean;
        const tt = Math.min(o.endStep + 1, steps + 1);
        const m2 = mask | (1 << o.subject);
        const cur = rows[tt].get(m2);
        if (!cur || beats(scratch, cur.score)) rows[tt].set(m2, { score: { ...scratch }, via: o, prev: st });
      }
    }
  }
  let best: State | null = null;
  for (const st of rows[steps + 1].values()) if (best === null || beats(st.score, best.score)) best = st;
  const placed: (Placement | null)[] = grids.map(() => null);
  for (let st = best; st; st = st.prev) {
    if (st.via) placed[st.via.subject] = placementOf(st.via, grids[st.via.subject], frame);
  }
  return placed;
}

interface WhyNot {
  reason: ShortReason;
  needMin: number | null;
}

/** The short form of "does not fit" when the night is simply out of time; else the reason's own text (the time is there but not where the target is clear). */
const cutText = (name: string, needMin: number | null, leftMin: number, reason: ShortReason | null): string | null =>
  needMin !== null && needMin > leftMin ? `${name}: needs ${needMin} min, ${leftMin} left` : (reason?.text ?? null);

/** Why a target that still needs `need` minutes got no slot tonight, and what it would take in the room left. */
function whyNot(g: SubjectGrid, frame: Frame, taken: readonly Span[], need: number, leftMin: number, slewMin: number): WhyNot {
  if (g.windows.length === 0 && g.noWindowReason) return { reason: g.noWindowReason, needMin: null };
  const name = g.subject.name;
  const alone = tryLength(g, frame, [], need)?.slot;
  if (alone) {
    const needMin = alone.integrationMin + alone.flipMin + slewMin;
    const fit = placeLongest(g, frame, taken, need - GRID_MIN, GRID_MIN)?.slot.integrationMin ?? 0;
    const text = needMin > leftMin
      ? `${name}: does not fit; needs ${needMin} min, ${leftMin} left tonight.`
      : `${name}: does not fit; needs ${needMin} min and ${leftMin} min are left, but only ${fit} min of imaging fits in its clear time around the other slots.`;
    return { reason: { code: 'no-room', text }, needMin };
  }
  const longestWindow = Math.max(...g.windows.map((w) => (w.end.getTime() - w.start.getTime()) / MIN_MS));
  if (longestWindow >= need) {
    return {
      reason: longestWindow < need + MERIDIAN_FLIP_MIN
        ? { code: 'flip-cuts-slot', text: `${name}: needs ${need} min; its ${Math.round(longestWindow)} min of clear time holds that only without the ${MERIDIAN_FLIP_MIN} min meridian flip it needs.` }
        : { code: 'window-too-short', text: `${name}: needs ${need} min; its ${Math.round(longestWindow)} min of clear time would hold it, but slots start on a ${GRID_MIN} min grid and that loses the edge of the window.` },
      needMin: null,
    };
  }
  return { reason: { code: 'window-too-short', text: `${name}: needs ${need} min; its longest clear time tonight is ${Math.round(longestWindow)} min.` }, needMin: null };
}

function cutLineOf(input: CampaignInput, got: readonly number[], fits: readonly boolean[], why: readonly (WhyNot | null)[], leftMin: number): NightCutLine {
  const entries: CutEntry[] = [];
  input.subjects.forEach((s, i) => {
    if (got[i] >= usefulRangeOf(s).minMin) return;
    entries.push({ subjectId: s.id, fits: fits[i], needMin: why[i]?.needMin ?? null, reason: why[i]?.reason ?? null });
  });
  const first = entries.findIndex((e) => !e.fits);
  const lastFit = first < 0 ? entries.filter((e) => e.fits).pop() : entries.slice(0, first).filter((e) => e.fits).pop();
  const cut = first < 0 ? null : entries[first];
  const name = cut ? (input.subjects.find((s) => s.id === cut.subjectId)?.name ?? cut.subjectId) : '';
  return {
    entries, leftMin, lastFitId: lastFit?.subjectId ?? null, firstCutId: cut?.subjectId ?? null,
    text: cut ? cutText(name, cut.needMin, leftMin, cut.reason) : null,
  };
}

function emptyNight(date: string, input: CampaignInput, got: readonly number[], reason: ShortReason | null): CampaignNight {
  const owes = (i: number): boolean => got[i] < usefulRangeOf(input.subjects[i]).minMin;
  const outcomes: SubjectOutcome[] = input.subjects.map((s, i) => ({ subjectId: s.id, gotMin: 0, slot: null, reason: owes(i) ? reason : null }));
  const entries: CutEntry[] = input.subjects.flatMap((s, i) => (owes(i) ? [{ subjectId: s.id, fits: false, needMin: null, reason }] : []));
  return {
    date, start: null, end: null, subjects: [], slots: [], outcomes,
    packing: { nightMin: 0, usedMin: 0, slewMin: 0, leftMin: 0, next: [] },
    cutLine: { entries, leftMin: 0, lastFitId: null, firstCutId: entries[0]?.subjectId ?? null, text: reason?.text ?? null },
  };
}

/**
 * One night. `got[i]` is the imaging minutes target i already has from earlier nights (absent: none). The plan makes as
 * many targets useful as the night holds (list order breaks ties), spends the rest of the night lengthening targets toward
 * their maxUseful (higher value first), then takes fewer flips and higher altitude. A target at maxUseful is left out.
 */
export function scheduleNight(input: CampaignInput, index: number, got: readonly number[] = []): CampaignNight {
  const have = input.subjects.map((_, i) => got[i] ?? 0);
  const b = nightBounds(input, index);
  if (!b.start || !b.end) return emptyNight(b.date, input, have, b.reason);
  const frame: Frame = { t0: b.start.getTime(), t1: b.end.getTime() };
  const grids = input.subjects.map((s) => analyseSubject(input, s, b.start as Date, b.end as Date));
  const takes = input.subjects.map((s, i) => takeOf(s, have[i]));
  const placed = bestPlan(grids, takes, frame);
  const taken = placed.flatMap((p) => (p ? [p.span] : []));
  const slots = placed.flatMap((p) => (p ? [p.slot] : [])).sort((x, y) => x.start.getTime() - y.start.getTime());

  const nightExact = (frame.t1 - frame.t0) / MIN_MS;
  const nightMin = Math.round(nightExact);
  const usedMin = slots.reduce((a, s) => a + s.integrationMin + s.flipMin, 0);
  const slewMin = Math.max(0, slots.length - 1) * SLEW_CENTER_MIN;
  const leftMin = nightMin - usedMin - slewMin;

  const why = grids.map((g, i): WhyNot | null => {
    const { minMin } = usefulRangeOf(g.subject);
    return placed[i] || have[i] >= minMin ? null : whyNot(g, frame, taken, minMin - have[i], leftMin, slots.length > 0 ? SLEW_CENTER_MIN : 0);
  });
  const outcomes = grids.map((g, i): SubjectOutcome => ({ subjectId: g.subjectId, gotMin: placed[i]?.slot.integrationMin ?? 0, slot: placed[i]?.slot ?? null, reason: why[i]?.reason ?? null }));
  const asked = (input.candidates ?? []).map((s) => analyseSubject(input, s, b.start as Date, b.end as Date));
  const next = asked.map((g): CandidateFit => {
    const p = placeLongest(g, frame, taken, Math.floor(nightExact / GRID_MIN) * GRID_MIN, MIN_SLOT_MIN);
    if (p) return { subjectId: g.subjectId, fitMin: p.slot.integrationMin, flip: p.slot.flip, reason: null };
    const reason: ShortReason = g.windows.length === 0 && g.noWindowReason
      ? g.noWindowReason
      : placeLongest(g, frame, [], MIN_SLOT_MIN, MIN_SLOT_MIN)
        ? { code: 'no-room', text: `${g.subject.name}: no gap of ${MIN_SLOT_MIN} min is left in its window.` }
        : { code: 'window-too-short', text: `${g.subject.name}: its clear time tonight is under ${MIN_SLOT_MIN} min.` };
    return { subjectId: g.subjectId, fitMin: 0, flip: false, reason };
  });
  const packing: NightPacking = { nightMin, usedMin, slewMin, leftMin, next };
  return {
    date: b.date, start: b.start, end: b.end,
    subjects: grids.map(({ subjectId, windows, usableMin, transit, unavoidableFlip }) => ({ subjectId, windows, usableMin, transit, unavoidableFlip })),
    slots, outcomes, packing, cutLine: cutLineOf(input, have, placed.map((p) => p !== null), why, leftMin),
  };
}

/** Which reason to show for a target cut on every night: the one closest to fitting. */
const REASON_RANK: Record<ShortCode, number> = {
  'no-room': 0, 'flip-cuts-slot': 1, 'window-too-short': 2, 'blocked-by-horizon': 3, 'below-min-altitude': 4,
  'start-after-dawn': 5, 'polar-night': 6, 'no-astronomical-night': 7,
};

/** The whole campaign, a night at a time; targets cut on a night roll to the next, and a target at maxUseful drops out. Pure and deterministic. */
export function planCampaign(input: CampaignInput): CampaignResult {
  validateInput(input);
  const nights: CampaignNight[] = [];
  const got = input.subjects.map(() => 0);
  const used = input.subjects.map(() => 0);
  for (let n = 0; n < input.nights; n++) {
    const night = scheduleNight(input, n, got);
    night.outcomes.forEach((o, i) => { got[i] += o.gotMin; used[i] += o.gotMin > 0 ? 1 : 0; });
    nights.push(night);
  }
  const perSubject = input.subjects.map((s, i): SubjectResult => {
    const { minMin, maxMin } = usefulRangeOf(s);
    const status = got[i] >= maxMin ? 'full' : got[i] >= minMin ? 'useful' : 'cut';
    const reasons = nights.flatMap((n) => (n.outcomes[i].reason ? [n.outcomes[i].reason as ShortReason] : []));
    const reason = status === 'cut' ? (reasons.sort((a, b) => REASON_RANK[a.code] - REASON_RANK[b.code])[0] ?? null) : null;
    return { subjectId: s.id, minUsefulMin: minMin, maxUsefulMin: maxMin, totalMin: got[i], nightsUsed: used[i], status, reason };
  });
  return { nights, perSubject, cutLine: campaignCutLine(input, perSubject, nights) };
}

function campaignCutLine(input: CampaignInput, per: readonly SubjectResult[], nights: readonly CampaignNight[]): CutLine {
  const cutIds = per.filter((p) => p.status === 'cut').map((p) => p.subjectId);
  const first = per.findIndex((p) => p.status === 'cut');
  if (first < 0) return { lastFitId: null, firstCutId: null, needMin: null, leftMin: null, text: null, cutIds };
  const id = per[first].subjectId;
  const lastFit = per.slice(0, first).filter((p) => p.status !== 'cut').pop();
  // The night where it came closest to fitting: the most room left over what it needs.
  let best: { date: string; needMin: number; leftMin: number; reason: ShortReason | null } | null = null;
  for (const n of nights) {
    const e = n.cutLine.entries.find((x) => x.subjectId === id);
    if (e && e.needMin !== null && (best === null || n.cutLine.leftMin - e.needMin > best.leftMin - best.needMin)) best = { date: n.date, needMin: e.needMin, leftMin: n.cutLine.leftMin, reason: e.reason };
  }
  const name = input.subjects[first].name;
  return {
    lastFitId: lastFit?.subjectId ?? null, firstCutId: id, needMin: best?.needMin ?? null, leftMin: best?.leftMin ?? null,
    text: best ? `${cutText(name, best.needMin, best.leftMin, best.reason)} (${best.date})` : (per[first].reason?.text ?? `${name}: cut.`),
    cutIds,
  };
}
