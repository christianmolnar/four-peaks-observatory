import type { TimeWindow } from '../horizon';
import { altAzOf } from '../plan';
import { buildItinerary, changeoverBetween, windowsFor } from './index';
import type { BuildInput } from './index';

/** What the order search needs to know about one slot, whatever order it ends up in. */
export interface OrderCandidate {
  id: string;
  name: string;
  trainId: string;
  filterId: string | null;
  /** Its usable windows tonight, in time order. */
  windows: readonly TimeWindow[];
  /** Minutes of imaging the slot wants when it has room (its length when planned alone). 0: it cannot be planned. */
  durationMin: number;
  /** Altitude in degrees at an instant. */
  altitudeAt: (when: Date) => number;
}

export interface OrderStep {
  id: string;
  name: string;
  /** One short reason for this place in the order. */
  reason: string;
}

export interface OrderSuggestion {
  /** Slot ids in the suggested order; slots that cannot be planned keep their relative order at the end. */
  order: string[];
  /** False when the order given is already the best found: nothing to apply. */
  changed: boolean;
  /** Minutes of imaging if the slots run in the order given, and in the suggested order. */
  currentLightMin: number;
  suggestedLightMin: number;
  steps: OrderStep[];
}

export const MAX_ORDER_CANDIDATES = 9;
const ALT_STEP_MS = 5 * 60000;

interface Score {
  /** Minutes of imaging, to a tenth of a minute (integer tenths, so equal plans compare equal). */
  light: number;
  /** Imaging minutes weighted by the target's altitude at the middle of each slot, to the nearest degree-minute. */
  altitude: number;
  /** Minute the last slot ends, since the start (earlier is better); whole minutes. */
  finish: number;
}

/**
 * Proposes the order that gets the most imaging done. The method, in plain words:
 *
 * 1. Every order of the slots is tried (at most 9 slots, so at most 362,880 orders; the page allows 8).
 * 2. Each order is run through the same rule the itinerary uses: a slot starts when the one before is done and the
 *    changeover (`changeoverBetween`: slew, train, filter, refocus) is over, or when its window opens, whichever is
 *    later; it images for its length or until its window closes. A slot whose window has closed gets nothing and costs nothing.
 * 3. Orders are compared by: (a) most minutes of imaging, so a target that sets early goes first and nothing is
 *    pushed outside its window when another order avoids it; (b) then higher altitude, the minutes weighted by the
 *    target's altitude at the middle of its slot; (c) then the earlier finish, which is less waiting and fewer changeovers.
 * 4. Orders are tried in the order of the list given and one replaces the best only if it is strictly better, so ties go to
 *    the order the user already has, and the answer never flips between runs. No randomness, no network.
 *
 * Slots with no length (cannot be planned) are not moved; they follow the others in their own order.
 * Pure: same input, same answer.
 */
export function suggestOrder(candidates: readonly OrderCandidate[], start: Date, formatTime: (d: Date) => string): OrderSuggestion {
  const live = candidates.filter((c) => c.durationMin > 0);
  const dead = candidates.filter((c) => c.durationMin <= 0);
  if (live.length > MAX_ORDER_CANDIDATES) throw new RangeError(`suggestOrder handles at most ${MAX_ORDER_CANDIDATES} slots, found ${live.length}`);

  // Altitudes are looked up on a 5 minute grid and remembered: orders share most instants.
  const cache = live.map(() => new Map<number, number>());
  const altitude = (i: number, ms: number): number => {
    const key = Math.round(ms / ALT_STEP_MS);
    let a = cache[i].get(key);
    if (a === undefined) {
      a = live[i].altitudeAt(new Date(key * ALT_STEP_MS));
      cache[i].set(key, a);
    }
    return a;
  };

  const run = (order: readonly number[]): Score => {
    let cursor = start.getTime();
    let prev: OrderCandidate | null = null;
    let light = 0;
    let weighted = 0;
    for (const i of order) {
      const c = live[i];
      const earliest = cursor + (prev ? changeoverBetween(prev, c).minutes * 60000 : 0);
      for (const w of c.windows) {
        if (w.end.getTime() <= earliest) continue;
        const from = Math.max(earliest, w.start.getTime());
        const minutes = Math.min(c.durationMin, (w.end.getTime() - from) / 60000);
        if (minutes <= 0) continue;
        light += minutes;
        weighted += minutes * altitude(i, from + (minutes * 60000) / 2);
        cursor = from + minutes * 60000;
        prev = c;
        break;
      }
    }
    return { light: Math.round(light * 10), altitude: Math.round(weighted), finish: Math.round((cursor - start.getTime()) / 60000) };
  };
  const better = (a: Score, b: Score): boolean =>
    a.light !== b.light ? a.light > b.light : a.altitude !== b.altitude ? a.altitude > b.altitude : a.finish < b.finish;

  const identity = live.map((_, i) => i);
  const currentScore = run(identity);
  let best = identity;
  let bestScore = currentScore;
  // Lexicographic walk over all orders: pick each place from the unused indexes in ascending order.
  const used = new Array<boolean>(live.length).fill(false);
  const path: number[] = [];
  const walk = (): void => {
    if (path.length === live.length) {
      const s = run(path);
      if (better(s, bestScore)) {
        best = [...path];
        bestScore = s;
      }
      return;
    }
    for (let i = 0; i < live.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(i);
      walk();
      path.pop();
      used[i] = false;
    }
  };
  walk();

  const chosen = best.map((i) => live[i]);
  const steps = chosen.map((c, k): OrderStep => ({ id: c.id, name: c.name, reason: reasonFor(c, k, chosen, formatTime) }));
  return {
    order: [...chosen, ...dead].map((c) => c.id),
    changed: better(bestScore, currentScore),
    currentLightMin: currentScore.light / 10,
    suggestedLightMin: bestScore.light / 10,
    steps,
  };
}

const closesAt = (c: OrderCandidate): number => c.windows[c.windows.length - 1]?.end.getTime() ?? Infinity;
const opensAt = (c: OrderCandidate): number => c.windows[0]?.start.getTime() ?? -Infinity;

/** One short reason for a slot's place: it sets first, it rises last, or it fills the time between. */
function reasonFor(c: OrderCandidate, k: number, order: readonly OrderCandidate[], formatTime: (d: Date) => string): string {
  const later = order.slice(k + 1);
  const earlier = order.slice(0, k);
  if (later.length > 0 && later.every((o) => closesAt(c) < closesAt(o))) return `its window closes first, at ${formatTime(new Date(closesAt(c)))}`;
  if (earlier.length > 0 && later.length === 0 && earlier.every((o) => opensAt(c) > opensAt(o))) return `it clears the horizon last, at ${formatTime(new Date(opensAt(c)))}`;
  return later.length === 0 ? 'it fits the time that is left' : `it is clear from ${formatTime(new Date(opensAt(c)))} and fits before the rest`;
}

/**
 * The candidates for the slots of a schedule input: each slot's usable windows, and its length when planned alone from the
 * start (so a slot that gets no time in the current order still has a length). A slot that cannot be planned alone has length 0.
 */
export function orderCandidates(input: BuildInput): OrderCandidate[] {
  return input.slots.map((si) => {
    const solo = buildItinerary({ ...input, slots: [si] }).slots[0];
    return {
      id: si.item.id,
      name: si.name,
      trainId: si.item.trainId,
      filterId: si.item.filterId,
      windows: si.problem ? [] : windowsFor(si.source, input),
      durationMin: (solo.end.getTime() - solo.start.getTime()) / 60000,
      altitudeAt: (when) => altAzOf(si.source, input.site, when).altitude,
    };
  });
}
