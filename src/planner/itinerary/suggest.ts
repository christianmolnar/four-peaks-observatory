import type { TimeWindow } from '../horizon';
import { buildItinerary, lightMinutes, makeScheduler, makeWindowLookup } from './index';
import type { BuildInput, ItineraryItem, ItineraryPlan, ScheduleState, SlotInput } from './index';

export interface OrderStep {
  id: string;
  name: string;
  /** One short reason for this place in the order. */
  reason: string;
}

export interface OrderSuggestion {
  /** Slot ids in the suggested order; slots with no usable time tonight keep their relative order at the end. The current order when nothing better was found. */
  order: string[];
  /** False when no better order was found: nothing to apply. */
  changed: boolean;
  /** "Light" of the page's plan for the order as it is now, and for the suggested order; the same figure as the totals line (`lightMinutes`). */
  currentLightMin: number;
  suggestedLightMin: number;
  steps: OrderStep[];
  /** Why the suggested order is better, when `changed`: the first of light, altitude and finish that differs. */
  improves: 'light' | 'altitude' | 'finish' | null;
  /** When the last slot ends in the current and in the suggested order (null: nothing is scheduled). */
  currentEnds: Date | null;
  suggestedEnds: Date | null;
  /** How the search went: slot placements tried, and whether every order was covered (or ruled out) so the answer is the best there is. */
  searched: { placements: number; exhaustive: boolean };
}

/** What orders are compared on. Larger light, then larger altitude, then smaller finish, is better. */
export interface Rank {
  /** Minutes of light in tenths of a minute (integers, so equal plans compare equal). */
  light: number;
  /** Light minutes weighted by the target's altitude at the middle of each slot, to the nearest degree-minute. */
  altitude: number;
  /** Minutes from the start to the end of the last slot (smaller is better). */
  finish: number;
}

/** The rank of a plan the page would show, read off the plan itself. */
export function rankOf(plan: ItineraryPlan): Rank {
  let weighted = 0;
  for (const s of plan.slots) if (s.altitudes) weighted += s.integrationMin * s.altitudes.middle.altitude;
  return {
    light: Math.round(plan.totals.integrationMin * 10),
    altitude: Math.round(weighted),
    finish: plan.totals.ends ? Math.round((plan.totals.ends.getTime() - plan.startsAt.getTime()) / 60000) : 0,
  };
}

/** Positive when `a` is the better rank, negative when `b` is, 0 when they tie. */
export function compareRank(a: Rank, b: Rank): number {
  return a.light !== b.light ? a.light - b.light : a.altitude !== b.altitude ? a.altitude - b.altitude : b.finish - a.finish;
}

/** What the order search depends on: ids, targets, trains, filters and modes in order, but not notes. Equal keys give equal advice. */
export function orderKey(items: readonly ItineraryItem[]): string {
  return JSON.stringify(items.map((i) => [i.id, i.targetId, i.trainId, i.filterId, i.mode]));
}

/** Up to this many live slots the search is exact: every order is covered or ruled out by a sound merge. The page holds at most `MAX_SLOTS` (8). `suggestOrder`'s `exactMax` option overrides it (the tests compare the exact search with the old beam). */
export const EXACT_MAX_SLOTS = 8;
/** Above `exactMax` live slots the search keeps only this many of the best partial orders after each slot. */
export const BEAM_WIDTH = 40;
/** The step search hands control back after about this many slot placements (a few milliseconds), so a page can keep typing and taps responsive. */
export const PLACEMENTS_PER_STEP = 150;

/**
 * Proposes the order that gets the most imaging done. The method, in plain words:
 *
 * 1. The score of an order is the plan the page itself builds for it (`makeScheduler`, the same code `buildItinerary`
 *    runs), compared on: (a) most minutes of light, (b) then higher altitude, the light minutes weighted by the target's
 *    altitude at the middle of its slot, (c) then the earlier finish.
 * 2. Slots that have no usable time even alone (a problem, or the window never opens) are left out of the search and
 *    follow the others in their own order.
 * 3. Slots are placed one at a time. Two partial orders over the same slots that leave the schedule in the same place (the
 *    same moment, and the same train and filter on the telescope) have exactly the same futures, so only the one with more
 *    light so far (then higher altitude) is kept. That merge loses nothing: the answer is the best order there is, for up to
 *    `EXACT_MAX_SLOTS` live slots (`searched.exhaustive` is true). Above it the search keeps only the best `BEAM_WIDTH`
 *    partial orders after each slot, so the answer is good but not proven best (`searched.exhaustive` is false).
 * 4. The user's current order is the one to beat, and it is replaced only by a strictly better order: ties keep what the
 *    user has, and the answer is the same on every run. No randomness, no network.
 * 5. Before anything is offered, the best order and the current one are both built with `buildItinerary` and compared on
 *    those plans. If the best is not strictly better there, nothing is offered. The light printed in the advice is the
 *    `lightMinutes` of those two plans, the figure of the totals line.
 *
 * `suggestOrder` runs the whole search at once. `suggestOrderSteps` is the same search as a generator that pauses every
 * `PLACEMENTS_PER_STEP` placements; the page drives it between frames so a big search never blocks it.
 */
export function suggestOrder(input: BuildInput, options: { currentPlan?: ItineraryPlan; exactMax?: number } = {}): OrderSuggestion {
  const steps = suggestOrderSteps(input, options);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

export function* suggestOrderSteps(input: BuildInput, options: { currentPlan?: ItineraryPlan; exactMax?: number } = {}): Generator<void, OrderSuggestion> {
  const { exactMax = EXACT_MAX_SLOTS } = options;
  const slots = input.slots;
  // One window lookup for all the plans of this call (the current plan, the search and the best plan).
  const shared: BuildInput = input.windows ? input : { ...input, windows: makeWindowLookup(input) };
  const scheduler = makeScheduler(shared);
  const currentPlan = options.currentPlan ?? buildItinerary(shared);
  const currentLight = lightMinutes(currentPlan);
  let nodes = 0;
  const unchanged = (exhaustive: boolean): OrderSuggestion => ({
    order: slots.map((s) => s.item.id),
    changed: false,
    currentLightMin: currentLight,
    suggestedLightMin: currentLight,
    steps: [],
    improves: null,
    currentEnds: currentPlan.totals.ends,
    suggestedEnds: currentPlan.totals.ends,
    searched: { placements: nodes, exhaustive },
  });
  if (slots.length < 2) return unchanged(true);

  // Which slots can get time at all: placed alone at the start.
  const live: SlotInput[] = [];
  const dead: SlotInput[] = [];
  for (const si of slots) (scheduler.place(si, scheduler.initial, true).ran ? live : dead).push(si);
  if (live.length < 2) return unchanged(true);

  /** Light, altitude-weighted light and the state after a run of slots. */
  interface Partial {
    order: SlotInput[];
    state: ScheduleState;
    light: number;
    weighted: number;
  }
  const extend = (p: Partial, si: SlotInput): Partial => {
    nodes++;
    const q = scheduler.place(si, p.state, true);
    if (!q.ran) return { order: [...p.order, si], state: p.state, light: p.light, weighted: p.weighted };
    return { order: [...p.order, si], state: q.next, light: p.light + q.slot.integrationMin, weighted: p.weighted + q.slot.integrationMin * (q.middleAltitude as number) };
  };
  const rankOfPartial = (p: Partial): Rank => ({
    light: Math.round(p.light * 10),
    altitude: Math.round(p.weighted),
    finish: Math.round((p.state.cursor.getTime() - scheduler.startsAt.getTime()) / 60000),
  });

  // The incumbent: the current order of the live slots.
  const root: Partial = { order: [], state: scheduler.initial, light: 0, weighted: 0 };
  let best = live.reduce(extend, root);
  let bestRank = rankOfPartial(best);

  // Slots whose windows close first are tried first, so ties among equal orders go to the sensible one.
  const closes = (si: SlotInput): number => {
    const w = scheduler.windows(si);
    return w.length > 0 ? w[w.length - 1].end.getTime() : Infinity;
  };
  const tryFirst = [...live].sort((a, b) => closes(a) - closes(b));
  const index = new Map(tryFirst.map((si, k) => [si, k] as const));

  const exhaustive = live.length <= exactMax;
  let layer = new Map<string, Partial>([['', root]]);
  let sinceStep = 0;
  for (let depth = 0; depth < live.length; depth++) {
    const next = new Map<string, Partial>();
    for (const p of layer.values()) {
      const used = new Set(p.order);
      for (const si of tryFirst) {
        if (used.has(si)) continue;
        if (sinceStep >= PLACEMENTS_PER_STEP) {
          sinceStep = 0;
          yield;
        }
        sinceStep++;
        const q = extend(p, si);
        const last = q.state.last;
        const key = `${q.order.map((x) => index.get(x)).sort((x, y) => (x as number) - (y as number)).join()}|${last ? `${last.item.trainId}/${last.item.filterId}` : '-'}|${q.state.cursor.getTime()}`;
        const old = next.get(key);
        if (!old || compareRank(rankOfPartial(q), rankOfPartial(old)) > 0) next.set(key, q);
      }
    }
    layer = next;
    // Over the exact limit, partial orders are ranked on what they have so far; a later finish is only a tie-break.
    if (!exhaustive && layer.size > BEAM_WIDTH) {
      layer = new Map([...layer].sort(([, a], [, b]) => compareRank(rankOfPartial(b), rankOfPartial(a))).slice(0, BEAM_WIDTH));
    }
  }
  for (const p of layer.values()) {
    const r = rankOfPartial(p);
    if (compareRank(r, bestRank) > 0) {
      best = p;
      bestRank = r;
    }
  }

  // The check that counts: both orders built by buildItinerary itself.
  const offered = [...best.order, ...dead];
  if (offered.every((si, k) => si === slots[k])) return unchanged(exhaustive);
  const bestPlan = buildItinerary({ ...shared, slots: offered });
  if (compareRank(rankOf(bestPlan), rankOf(currentPlan)) <= 0) return unchanged(exhaustive);

  const a = rankOf(bestPlan);
  const b = rankOf(currentPlan);
  const chosen = best.order;
  const names = namesIn(chosen);
  const windowsOf = new Map(chosen.map((si) => [si, scheduler.windows(si)] as const));
  return {
    order: offered.map((si) => si.item.id),
    changed: true,
    currentLightMin: currentLight,
    suggestedLightMin: lightMinutes(bestPlan),
    improves: a.light !== b.light ? 'light' : a.altitude !== b.altitude ? 'altitude' : 'finish',
    currentEnds: currentPlan.totals.ends,
    suggestedEnds: bestPlan.totals.ends,
    steps: chosen.map((si, k): OrderStep => ({ id: si.item.id, name: names[k], reason: reasonFor(si, k, chosen, windowsOf, input.formatTime) })),
    searched: { placements: nodes, exhaustive },
  };
}

const closesAt = (w: readonly TimeWindow[]): number => w[w.length - 1]?.end.getTime() ?? Infinity;
const opensAt = (w: readonly TimeWindow[]): number => w[0]?.start.getTime() ?? -Infinity;

/**
 * The names of the slots in an order. A target in two slots (Mars on two trains) gets the train in brackets, then the filter
 * and the mode if that is not enough, then "first" or "second" if the two are the same in everything.
 */
function namesIn(order: readonly SlotInput[]): string[] {
  const count = (name: string): number => order.filter((o) => o.name === name).length;
  const parts = (si: SlotInput): string[][] => [[si.trainName], [si.trainName, si.filterName], [si.trainName, si.filterName, si.item.mode]];
  return order.map((si, k) => {
    if (count(si.name) === 1) return si.name;
    const same = order.filter((o) => o.name === si.name);
    for (let level = 0; level < 3; level++) {
      const label = parts(si)[level].join(', ');
      if (same.filter((o) => parts(o)[level].join(', ') === label).length === 1) return `${si.name} (${label})`;
    }
    return `${si.name} (${['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][same.indexOf(si)] ?? k + 1})`;
  });
}

/** One short reason for a slot's place: it sets first, it rises last, it fills the time between, or it fits the time that is left. */
function reasonFor(si: SlotInput, k: number, order: readonly SlotInput[], windows: ReadonlyMap<SlotInput, TimeWindow[]>, formatTime: (d: Date) => string): string {
  const w = windows.get(si) as TimeWindow[];
  const later = order.slice(k + 1);
  const earlier = order.slice(0, k);
  if (later.length > 0 && later.every((o) => closesAt(w) < closesAt(windows.get(o) as TimeWindow[]))) return `its window closes ${earlier.length === 0 ? 'first' : 'before the ones after it'}, at ${formatTime(new Date(closesAt(w)))}`;
  if (earlier.length > 0 && later.length === 0 && earlier.every((o) => opensAt(w) > opensAt(windows.get(o) as TimeWindow[]))) return `it clears the horizon last, at ${formatTime(new Date(opensAt(w)))}`;
  if (later.length === 0) return 'it fits the time that is left';
  return earlier.length === 0 ? `it is clear from ${formatTime(new Date(opensAt(w)))} and fits before the rest` : `it is clear from ${formatTime(new Date(opensAt(w)))} and fits in between`;
}
