import { targetAltAz } from '../astro';
import { MERIDIAN_FLIP_MIN } from '../campaign/analysis';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { classifySky, transitMinute } from './facts';
import type { AiPlanInput, AiTarget, Night } from './facts';
import { isoOf, parseIso } from './instant';
import type { ModelPlan } from './schema';

export type ViolationKind =
  | 'unknown-target'
  | 'bad-time'
  | 'outside-night'
  | 'below-min-altitude'
  | 'blocked-by-horizon'
  | 'flip-in-slot'
  | 'exposure-mismatch'
  | 'overlap'
  | 'slew-gap'
  | 'duplicate-slot'
  | 'in-plan-and-cut'
  | 'duplicate-cut'
  | 'missing-target'
  | 'missing-exposure'
  | 'fits-flag'
  | 'empty-plan'
  | 'missing-verdict'
  | 'verdict-mismatch';

/** Not a violation: the plan stands, but something is probably left on the table. Reported next to `status`. */
export type WarningKind = 'cut-fits-free-time' | 'free-time-after-last';

export interface PlanWarning {
  kind: WarningKind;
  id?: string;
  message: string;
}

/** A usable stretch shorter than this is not worth a slot (the campaign engine's own minimum). */
export const MIN_USEFUL_SLOT_MIN = 30;

export interface Violation {
  kind: ViolationKind;
  id?: string;
  /** One concrete sentence, e.g. "t7 22:40-23:30 is below 25 deg at 23:10 (14.0 deg)". */
  message: string;
}

const MIN = 60000;

/**
 * Exact check of a returned plan, on real instants (ISO time with offset, so a clock change cannot blur a slot).
 * No model, no tolerance: altitude and horizon at every minute of every slot (both ends included), the whole-minute
 * meridian transit strictly inside a slot, the gap between slots, the night's bounds, that every target is in exactly
 * one of `plan` or `cut`, that a plan with a usable window is not empty, and that the last-target verdict is
 * present and its numbers agree with the last slot. Returns every violation found; empty means verified.
 */
export function checkPlan(input: AiPlanInput, night: Night, plan: ModelPlan): Violation[] {
  const out: Violation[] = [];
  const tz = input.timeZone;
  const clock = (d: Date): string => isoOf(d, tz);
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  const add = (kind: ViolationKind, message: string, id?: string): void => void out.push({ kind, id, message });

  const timed: { id: string; start: Date; end: Date }[] = [];
  for (const slot of plan.plan) {
    const t = byId.get(slot.id);
    if (!t) { add('unknown-target', `"${slot.id}" is in the plan but is not one of the targets.`, slot.id); continue; }
    const label = `${slot.id} ${slot.start}-${slot.end}`;
    const a = parseIso(slot.start, tz);
    const b = parseIso(slot.end, tz);
    if (!a.ok || !b.ok) { add('bad-time', `${label}: ${(!a.ok ? a : (b as { error: string })).error}.`, slot.id); continue; }
    const start = a.at;
    const end = b.at;
    if (end.getTime() <= start.getTime()) { add('bad-time', `${label} ends at or before it starts.`, slot.id); continue; }
    const entry: Timed = { id: slot.id, start, end };
    timed.push(entry);

    if (start.getTime() < night.start.getTime() || end.getTime() > night.end.getTime()) {
      add('outside-night', `${label} is outside the night (${clock(night.start)}-${clock(night.end)}).`, slot.id);
      continue;
    }

    // Altitude and horizon at 1-minute samples, both ends included.
    const bad: Record<'low' | 'blocked', { first: Date; alt: number; n: number } | null> = { low: null, blocked: null };
    const sample = (d: Date): void => {
      const p = targetAltAz(t.raHours, t.decDeg, d, input.site);
      const f = classifySky(p.altitude, p.azimuth, input.horizon, input.minAltitude);
      if (f === 'ok') return;
      const b = bad[f];
      if (b) b.n++;
      else bad[f] = { first: d, alt: p.altitude, n: 1 };
    };
    for (let ms = start.getTime(); ms < end.getTime(); ms += MIN) sample(new Date(ms));
    sample(end);
    if (bad.low) add('below-min-altitude', `${label} is below ${input.minAltitude} deg at ${clock(bad.low.first)} (${bad.low.alt.toFixed(1)} deg), for ${bad.low.n} min of the slot.`, slot.id);
    if (bad.blocked) add('blocked-by-horizon', `${label} is behind a blocked horizon zone at ${clock(bad.blocked.first)} (${bad.blocked.alt.toFixed(1)} deg), for ${bad.blocked.n} min of the slot.`, slot.id);

    const transit = transitMinute(t, night, input.site);
    const slotMin = (end.getTime() - start.getTime()) / MIN;
    if (spansTransit(transit, start, end)) {
      if (!input.allowFlips) {
        add('flip-in-slot', `${label} has the meridian transit at ${clock(transit)} inside it, so a flip would fall mid-slot; flips are not allowed (end the slot at the transit, or start one there).`, slot.id);
      } else {
        entry.flip = true;
        if (slotMin <= MERIDIAN_FLIP_MIN) add('flip-in-slot', `${label} spans the transit at ${clock(transit)} but is only ${slotMin} min; the flip takes ${MERIDIAN_FLIP_MIN} min, leaving no imaging time.`, slot.id);
      }
    }
    const imaging = slotMin - (entry.flip ? MERIDIAN_FLIP_MIN : 0);
    if (slot.exposureMinutes !== undefined && slot.exposureMinutes > imaging) {
      add('exposure-mismatch', `${label}: exposureMinutes ${slot.exposureMinutes} is more than the ${imaging} min of imaging time (${slotMin} min slot${entry.flip ? ` minus the ${MERIDIAN_FLIP_MIN} min flip` : ''}).`, slot.id);
    }
  }

  const sorted = [...timed].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const gap = (b.start.getTime() - a.end.getTime()) / MIN;
    if (gap < 0) add('overlap', `${a.id} ${clock(a.start)}-${clock(a.end)} overlaps ${b.id} ${clock(b.start)}-${clock(b.end)}.`, b.id);
    else if (gap < SLEW_CENTER_MIN) add('slew-gap', `${a.id} ends ${clock(a.end)} and ${b.id} starts ${clock(b.start)}: ${gap} min, the slew needs ${SLEW_CENTER_MIN}.`, b.id);
  }

  const planned = new Set<string>();
  for (const s of plan.plan) {
    if (!byId.has(s.id)) continue;
    if (planned.has(s.id)) add('duplicate-slot', `${s.id} has more than one slot; each target gets exactly one.`, s.id);
    planned.add(s.id);
  }
  const cut = new Set<string>();
  for (const id of plan.cut) {
    if (!byId.has(id)) { add('unknown-target', `"${id}" is in the cut list but is not one of the targets.`, id); continue; }
    if (cut.has(id)) add('duplicate-cut', `${id} is in the cut list more than once.`, id);
    cut.add(id);
    if (planned.has(id)) add('in-plan-and-cut', `${id} is in both the plan and the cut list.`, id);
  }
  const exposed = new Set<string>();
  for (const e of plan.exposures) {
    if (!byId.has(e.id)) add('unknown-target', `"${e.id}" has an exposure but is not one of the targets.`, e.id);
    exposed.add(e.id);
  }
  for (const t of input.targets) {
    if (!planned.has(t.id) && !cut.has(t.id)) add('missing-target', `${t.id} is in neither the plan nor the cut list.`, t.id);
    if (!exposed.has(t.id)) add('missing-exposure', `${t.id} has no exposure time.`, t.id);
  }
  if (plan.fitsAll !== (plan.cut.length === 0)) {
    add('fits-flag', `fitsAll is ${plan.fitsAll} but the cut list has ${plan.cut.length} target(s); fitsAll must be true exactly when the cut list is empty.`);
  }
  if (plan.plan.length === 0) {
    const best = bestUsableRun(input, night, [], input.targets);
    if (best) add('empty-plan', `The plan has no slot, but ${best.id} is usable for ${best.minutes} min (${clock(best.start)}-${clock(best.end)}). Plan at least one slot.`, best.id);
  }
  checkVerdict(plan, timed, add);
  return out;
}

/** A planned slot on real instants; `flip` is set when it spans its target's transit and flips are allowed. */
type Timed = { id: string; start: Date; end: Date; flip?: boolean };

const spansTransit = (transit: Date, start: Date, end: Date): boolean => transit.getTime() > start.getTime() && transit.getTime() < end.getTime();

/** How many slots span their target's transit (each one is a flip). Slots that do not parse or name no target are not counted. */
export function countFlips(input: AiPlanInput, night: Night, plan: ModelPlan): number {
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  let n = 0;
  for (const s of plan.plan) {
    const t = byId.get(s.id);
    const a = parseIso(s.start, input.timeZone);
    const b = parseIso(s.end, input.timeZone);
    if (t && a.ok && b.ok && b.at.getTime() > a.at.getTime() && spansTransit(transitMinute(t, night, input.site), a.at, b.at)) n++;
  }
  return n;
}

/** The last slot in time, as a verdict must describe it. */
function lastSlot(timed: readonly Timed[]): Timed | undefined {
  return [...timed].sort((a, b) => a.start.getTime() - b.start.getTime()).at(-1);
}

function checkVerdict(plan: ModelPlan, timed: readonly Timed[], add: (k: ViolationKind, m: string, id?: string) => void): void {
  const last = lastSlot(timed);
  const v = plan.lastTarget;
  if (!last) {
    if (v) add('verdict-mismatch', `lastTarget is given (${v.id}) but the plan has no valid slot; omit it.`, v.id);
    return;
  }
  if (!v) { add('missing-verdict', `lastTarget is missing: describe the last slot (${last.id}) with leftoverMinutes, subSeconds, frames, usefulness and reason.`, last.id); return; }
  const slotMinutes = (last.end.getTime() - last.start.getTime()) / MIN;
  // Frames come from the imaging time: the slot minus the flip when the slot spans the transit.
  const minutes = slotMinutes - (last.flip ? MERIDIAN_FLIP_MIN : 0);
  if (v.id !== last.id) add('verdict-mismatch', `lastTarget is ${v.id} but the last slot in time is ${last.id}.`, last.id);
  if (v.leftoverMinutes !== slotMinutes) add('verdict-mismatch', `lastTarget.leftoverMinutes is ${v.leftoverMinutes} but the last slot (${last.id}) is ${slotMinutes} min long.`, last.id);
  if (v.frames * v.subSeconds > minutes * 60) add('verdict-mismatch', `lastTarget: ${v.frames} frames x ${v.subSeconds} s is ${v.frames * v.subSeconds} s, more than the ${minutes * 60} s ${last.flip ? 'of imaging time' : 'slot'}.`, last.id);
  const expected = Math.floor((minutes * 60) / v.subSeconds);
  if (v.frames > expected || v.frames < expected - 1) add('verdict-mismatch', `lastTarget: ${v.frames} frames is wrong for ${minutes} min of imaging time${last.flip ? ` (${slotMinutes} min slot minus the ${MERIDIAN_FLIP_MIN} min flip)` : ''} at ${v.subSeconds} s subs; should be ${expected} (floor of minutes x 60 / subSeconds, one less is allowed).`, last.id);
  if (v.frames < 1 && v.usefulness !== 'not_useful') add('verdict-mismatch', `lastTarget has 0 frames, so usefulness must be not_useful.`, last.id);
  const exposure = plan.exposures.find((e) => e.id === v.id);
  if (exposure && exposure.subSeconds !== v.subSeconds) add('verdict-mismatch', `lastTarget.subSeconds is ${v.subSeconds} but the exposure entry for ${v.id} says ${exposure.subSeconds}.`, last.id);
}

/** Maximal runs of whole minutes in [from, to] where the target is usable; split at its transit minute unless flips are allowed (a slot may then span it). */
function usableRuns(input: AiPlanInput, night: Night, t: AiTarget, from: number, to: number): [number, number][] {
  const transit = transitMinute(t, night, input.site).getTime();
  const split = !input.allowFlips;
  const raw: [number, number][] = [];
  let open: number | null = null;
  const end = Math.floor(to / MIN) * MIN;
  for (let ms = Math.ceil(from / MIN) * MIN; ms <= end; ms += MIN) {
    const p = targetAltAz(t.raHours, t.decDeg, new Date(ms), input.site);
    const ok = classifySky(p.altitude, p.azimuth, input.horizon, input.minAltitude) === 'ok';
    if (ok && open === null) open = ms;
    if (!ok && open !== null) { raw.push([open, ms - MIN]); open = null; }
  }
  if (open !== null) raw.push([open, end]);
  return raw.flatMap(([a, b]): [number, number][] => (split && a < transit && transit < b ? [[a, transit], [transit, b]] : [[a, b]])).filter(([a, b]) => b > a);
}

/** The longest usable stretch of any of `targets` inside the night, minus nothing but the given busy slots (with slew on both sides). */
function bestUsableRun(input: AiPlanInput, night: Night, busy: readonly Timed[], targets: readonly AiTarget[]): { id: string; start: Date; end: Date; minutes: number } | null {
  const slew = SLEW_CENTER_MIN * MIN;
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const gaps: [number, number][] = [];
  let lo = Math.ceil(night.start.getTime() / MIN) * MIN;
  for (const s of sorted) {
    gaps.push([lo, s.start.getTime() - slew]);
    lo = Math.max(lo, s.end.getTime() + slew);
  }
  gaps.push([lo, Math.floor(night.end.getTime() / MIN) * MIN]);
  let best: { id: string; start: Date; end: Date; minutes: number } | null = null;
  for (const t of targets) {
    for (const [a, b] of gaps) {
      if (b - a < MIN_USEFUL_SLOT_MIN * MIN) continue;
      const transit = transitMinute(t, night, input.site).getTime();
      for (const [s, e] of usableRuns(input, night, t, a, b)) {
        const minutes = (e - s) / MIN - (input.allowFlips && s < transit && transit < e ? MERIDIAN_FLIP_MIN : 0);
        if (minutes >= MIN_USEFUL_SLOT_MIN && (!best || minutes > best.minutes)) best = { id: t.id, start: new Date(s), end: new Date(e), minutes };
      }
    }
  }
  return best;
}

/**
 * Warnings for a plan with no violations. Exact, no judgment of value: a cut target that would fit the free time
 * (with slew) for at least MIN_USEFUL_SLOT_MIN, and free night time after the last slot that its target could use.
 */
export function planWarnings(input: AiPlanInput, night: Night, plan: ModelPlan): PlanWarning[] {
  const out: PlanWarning[] = [];
  const tz = input.timeZone;
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  const busy: Timed[] = [];
  for (const s of plan.plan) {
    const a = parseIso(s.start, tz);
    const b = parseIso(s.end, tz);
    if (a.ok && b.ok && byId.has(s.id)) busy.push({ id: s.id, start: a.at, end: b.at });
  }
  if (busy.length === 0) return out;
  for (const id of plan.cut) {
    const t = byId.get(id);
    const run = t && bestUsableRun(input, night, busy, [t]);
    if (run) out.push({ kind: 'cut-fits-free-time', id, message: `${id} is cut, but it is usable for ${run.minutes} min in free night time (${isoOf(run.start, tz)}-${isoOf(run.end, tz)}) after the slew gaps.` });
  }
  const last = lastSlot(busy)!;
  const t = byId.get(last.id)!;
  const nightEnd = Math.floor(night.end.getTime() / MIN) * MIN;
  const transit = transitMinute(t, night, input.site).getTime();
  // Without flips a slot that ends at the transit cannot grow past it (the flip would fall inside), so the transit is the limit.
  const limit = !input.allowFlips && transit >= last.end.getTime() ? Math.min(transit, nightEnd) : nightEnd;
  let reach = last.end.getTime();
  while (reach + MIN <= limit) {
    const p = targetAltAz(t.raHours, t.decDeg, new Date(reach + MIN), input.site);
    if (classifySky(p.altitude, p.azimuth, input.horizon, input.minAltitude) !== 'ok') break;
    reach += MIN;
  }
  const freeMin = (nightEnd - last.end.getTime()) / MIN;
  const more = (reach - last.end.getTime()) / MIN;
  const flip = input.allowFlips ? null : afterTransitWarning(input, t, last, transit, nightEnd);
  if (flip) out.push({ kind: 'free-time-after-last', id: last.id, message: flip });
  else if (freeMin >= MIN_USEFUL_SLOT_MIN && more >= 1) {
    out.push({ kind: 'free-time-after-last', id: last.id, message: `${last.id} is the last slot and ends ${isoOf(last.end, tz)}, but ${freeMin} min of night remain and it stays usable ${more} more min (to ${isoOf(new Date(reach), tz)}); the last target takes all the observable time left.` });
  }
  return out;
}

/**
 * A last slot that ends at or before its transit leaves the time after the flip unused. From the transit, find the first
 * usable minute (the transit itself may be blocked, for example by a horizon zone on the meridian), then the usable run
 * from there to the night end or the next unusable minute. When that run is at least MIN_USEFUL_SLOT_MIN and longer
 * than the slot, the message says to start the slot there; otherwise null.
 */
function afterTransitWarning(input: AiPlanInput, t: AiTarget, last: Timed, transit: number, nightEnd: number): string | null {
  if (transit < last.end.getTime() || transit > nightEnd) return null;
  const usable = (ms: number): boolean => {
    const p = targetAltAz(t.raHours, t.decDeg, new Date(ms), input.site);
    return classifySky(p.altitude, p.azimuth, input.horizon, input.minAltitude) === 'ok';
  };
  let from = transit;
  while (from <= nightEnd && !usable(from)) from += MIN;
  if (from > nightEnd) return null;
  let to = from;
  while (to + MIN <= nightEnd && usable(to + MIN)) to += MIN;
  const run = (to - from) / MIN;
  const slotMin = (last.end.getTime() - last.start.getTime()) / MIN;
  if (run < MIN_USEFUL_SLOT_MIN || run <= slotMin) return null;
  const tz = input.timeZone;
  const where = from === transit ? 'start at the transit' : `the transit is unusable until ${isoOf(new Date(from), tz)}; start there`;
  return `${last.id} is the last slot (${slotMin} min) and ends at or before its transit ${isoOf(new Date(transit), tz)}, but it is usable ${run} min after the transit (${isoOf(new Date(from), tz)} to ${isoOf(new Date(to), tz)}); ${where} to take the time after the flip.`;
}
