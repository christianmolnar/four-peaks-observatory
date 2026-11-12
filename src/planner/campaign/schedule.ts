import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { GRID_MIN, GRID_MS, MERIDIAN_FLIP_MIN, MIN_FIT_MIN, analyseSubject, nightBounds, slotCrossesMeridian, validateInput } from './analysis';
import type { SubjectGrid } from './analysis';
import type { CampaignInput, CampaignNight, CampaignResult, CampaignSlot, CandidateFit, NightPacking, ShortReason, SubjectOutcome } from './types';

/** Up to this many subjects every order is tried; above it, one order: the subject with the least usable time first. */
export const EXACT_ORDER_MAX = 5;

const MIN_MS = 60000;
const SLEW_MS = SLEW_CENTER_MIN * MIN_MS;

interface Span {
  s: number;
  e: number;
}

interface Placement {
  slot: CampaignSlot;
  span: Span;
}

interface Frame {
  t0: number;
  t1: number;
}

/** The best slot of `ell` imaging minutes for this subject in the room left, or null. A straddling slot is tried only when no clean one of this length fits. */
function tryLength(g: SubjectGrid, frame: Frame, taken: readonly Span[], ell: number): Placement | null {
  const windows = g.windows.map((w) => ({ s: w.start.getTime(), e: w.end.getTime() }));
  const transit = g.transit;
  for (const flip of [false, true]) {
    const flipMin = flip ? MERIDIAN_FLIP_MIN : 0;
    const dur = (ell + flipMin) * MIN_MS;
    let best: { k: number; mean: number } | null = null;
    for (let k = 0; ; k++) {
      const s = frame.t0 + k * GRID_MS;
      const e = s + dur;
      if (e > frame.t1) break;
      if (!windows.some((w) => s >= w.s && e <= w.e)) continue;
      if (!taken.every((o) => e + SLEW_MS <= o.s || s >= o.e + SLEW_MS)) continue;
      if (slotCrossesMeridian(transit, new Date(s), ell) !== flip) continue;
      const last = Math.min(g.alt.length - 1, k + Math.floor(ell / GRID_MIN));
      let sum = 0;
      for (let i = k; i <= last; i++) sum += g.alt[i];
      const mean = sum / (last - k + 1);
      if (best === null || mean > best.mean) best = { k, mean };
    }
    if (best) {
      const s = frame.t0 + best.k * GRID_MS;
      return {
        span: { s, e: s + dur },
        slot: { subjectId: g.subjectId, start: new Date(s), end: new Date(s + dur), integrationMin: ell, flipMin, flip, meanAltitude: best.mean },
      };
    }
  }
  return null;
}

/** The longest slot up to `wantMin` that fits, trying each length from the full one down in 5-minute steps. */
function placeLongest(g: SubjectGrid, frame: Frame, taken: readonly Span[], wantMin: number, floorMin = GRID_MIN): Placement | null {
  for (let ell = wantMin; ell >= floorMin; ell -= GRID_MIN) {
    const p = tryLength(g, frame, taken, ell);
    if (p) return p;
  }
  return null;
}

interface Arrangement {
  /** By subject index. */
  placed: (Placement | null)[];
  minutes: number;
  flips: number;
  altitude: number;
}

function arrange(grids: readonly SubjectGrid[], frame: Frame, order: readonly number[]): Arrangement {
  const placed: (Placement | null)[] = grids.map(() => null);
  const taken: Span[] = [];
  let minutes = 0;
  let flips = 0;
  let altitude = 0;
  for (const i of order) {
    const p = placeLongest(grids[i], frame, taken, grids[i].subject.hoursPerNight * 60);
    if (!p) continue;
    placed[i] = p;
    taken.push(p.span);
    minutes += p.slot.integrationMin;
    flips += p.slot.flip ? 1 : 0;
    altitude += p.slot.integrationMin * p.slot.meanAltitude;
  }
  return { placed, minutes, flips, altitude };
}

/** More imaging minutes, then fewer flips, then higher altitude-weighted minutes. A tie keeps the earlier order. */
const better = (a: Arrangement, b: Arrangement): boolean =>
  a.minutes !== b.minutes ? a.minutes > b.minutes : a.flips !== b.flips ? a.flips < b.flips : a.altitude > b.altitude;

function* permutations(xs: readonly number[]): Generator<number[]> {
  if (xs.length <= 1) {
    yield [...xs];
    return;
  }
  for (let i = 0; i < xs.length; i++) for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) yield [xs[i], ...rest];
}

function bestArrangement(grids: readonly SubjectGrid[], frame: Frame): Arrangement {
  const idx = grids.map((_, i) => i);
  if (grids.length > EXACT_ORDER_MAX) {
    return arrange(grids, frame, [...idx].sort((a, b) => grids[a].usableMin - grids[b].usableMin || a - b));
  }
  let best: Arrangement | null = null;
  for (const order of permutations(idx)) {
    const a = arrange(grids, frame, order);
    if (best === null || better(a, best)) best = a;
  }
  return best as Arrangement;
}

function shortReason(g: SubjectGrid, frame: Frame, got: number): ShortReason {
  if (g.windows.length === 0 && g.noWindowReason) return g.noWindowReason;
  const alone = placeLongest(g, frame, [], g.subject.hoursPerNight * 60)?.slot.integrationMin ?? 0;
  const name = g.subject.name;
  return alone > got
    ? { code: 'no-room', text: `${name}: ${got} of ${g.subject.hoursPerNight * 60} min; the other subjects take the rest of its window (${alone} min alone).` }
    : { code: 'window-too-short', text: `${name}: ${got} of ${g.subject.hoursPerNight * 60} min; that is all the clear time it has tonight.` };
}

function emptyNight(date: string, input: CampaignInput, reason: ShortReason | null): CampaignNight {
  const outcomes: SubjectOutcome[] = input.subjects.map((s) => ({ subjectId: s.id, requestedMin: s.hoursPerNight * 60, gotMin: 0, slot: null, reason }));
  return {
    date, start: null, end: null, subjects: [], slots: [], outcomes,
    packing: { nightMin: 0, usedMin: 0, slewMin: 0, leftMin: 0, next: [] },
  };
}

export function scheduleNight(input: CampaignInput, index: number): CampaignNight {
  const b = nightBounds(input, index);
  if (!b.start || !b.end) return emptyNight(b.date, input, b.reason);
  const frame: Frame = { t0: b.start.getTime(), t1: b.end.getTime() };
  const grids = input.subjects.map((s) => analyseSubject(input, s, b.start as Date, b.end as Date));
  const arr = bestArrangement(grids, frame);
  const taken = arr.placed.flatMap((p) => (p ? [p.span] : []));

  const outcomes = grids.map((g, i): SubjectOutcome => {
    const p = arr.placed[i];
    const requestedMin = g.subject.hoursPerNight * 60;
    const gotMin = p?.slot.integrationMin ?? 0;
    return { subjectId: g.subjectId, requestedMin, gotMin, slot: p?.slot ?? null, reason: gotMin >= requestedMin ? null : shortReason(g, frame, gotMin) };
  });
  const slots = arr.placed.flatMap((p) => (p ? [p.slot] : [])).sort((x, y) => x.start.getTime() - y.start.getTime());

  const nightMin = (frame.t1 - frame.t0) / MIN_MS;
  const usedMin = slots.reduce((a, s) => a + s.integrationMin + s.flipMin, 0);
  const slewMin = Math.max(0, slots.length - 1) * SLEW_CENTER_MIN;
  const asked = [
    ...grids.filter((_, i) => outcomes[i].gotMin === 0),
    ...(input.candidates ?? []).map((s) => analyseSubject(input, s, b.start as Date, b.end as Date)),
  ];
  const next = asked.map((g): CandidateFit => {
    const p = placeLongest(g, frame, taken, Math.floor(nightMin / GRID_MIN) * GRID_MIN, MIN_FIT_MIN);
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

/** The whole campaign: every night scheduled on its own. Pure and deterministic. */
export function planCampaign(input: CampaignInput): CampaignResult {
  validateInput(input);
  const nights = Array.from({ length: input.nights }, (_, i) => scheduleNight(input, i));
  const perSubject = input.subjects.map((s, i) => ({
    subjectId: s.id,
    requestedMin: s.hoursPerNight * 60 * input.nights,
    gotMin: nights.reduce((a, n) => a + (n.outcomes[i]?.gotMin ?? 0), 0),
  }));
  return { nights, perSubject };
}
