import { nextMeridianTransit, targetAltAz } from '../astro';
import { SLEW_CENTER_MIN } from '../itinerary/constants';
import { clockOf, clockToInstant } from '../itinerary/timeline';
import { classifySky } from './facts';
import type { AiPlanInput, Night } from './facts';
import type { ModelPlan } from './schema';

export type ViolationKind =
  | 'unknown-target'
  | 'bad-time'
  | 'outside-night'
  | 'below-min-altitude'
  | 'blocked-by-horizon'
  | 'flip-in-slot'
  | 'overlap'
  | 'slew-gap'
  | 'duplicate-slot'
  | 'in-plan-and-cut'
  | 'duplicate-cut'
  | 'missing-target'
  | 'missing-exposure'
  | 'fits-flag';

export interface Violation {
  kind: ViolationKind;
  id?: string;
  /** One concrete sentence, e.g. "m42 22:40-23:30 is below 25 deg at 23:10 (14.0 deg)". */
  message: string;
}

const MIN = 60000;
const toMinutes = (c: string): number => Number(c.slice(0, 2)) * 60 + Number(c.slice(3));

/**
 * Exact check of a returned plan. No model, no tolerance: altitude and horizon at every minute of every slot
 * (both ends included), the meridian transit strictly inside a slot, the gap between slots, the night's bounds,
 * and that every target is in exactly one of `plan` or `cut`. Returns every violation found; empty means verified.
 */
export function checkPlan(input: AiPlanInput, night: Night, plan: ModelPlan): Violation[] {
  const out: Violation[] = [];
  const tz = input.timeZone;
  const clock = (d: Date): string => clockOf(d, tz);
  // A clock reading means the one instant in the 24 h that ends at dawn: a reading before dusk is then before the night, not tomorrow.
  const at = (c: string): Date => clockToInstant(c, new Date(night.end.getTime() - 18 * 3600000), tz);
  const byId = new Map(input.targets.map((t) => [t.id, t]));
  const add = (kind: ViolationKind, message: string, id?: string): void => void out.push({ kind, id, message });

  const timed: { id: string; start: Date; end: Date }[] = [];
  for (const slot of plan.plan) {
    const t = byId.get(slot.id);
    if (!t) { add('unknown-target', `"${slot.id}" is in the plan but is not one of the targets.`, slot.id); continue; }
    const start = at(slot.start);
    // The end is the next time that clock reads after the start, so a slot that runs past dawn is caught as outside the night.
    const end = new Date(start.getTime() + (((toMinutes(slot.end) - toMinutes(slot.start)) % 1440) + 1440) % 1440 * MIN);
    const label = `${slot.id} ${slot.start}-${slot.end}`;
    if (slot.end === slot.start) { add('bad-time', `${label} has the same start and end time.`, slot.id); continue; }
    timed.push({ id: slot.id, start, end });

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

    const transit = nextMeridianTransit(t.raHours, t.decDeg, night.start, input.site);
    if (transit.getTime() > start.getTime() && transit.getTime() < end.getTime()) {
      add('flip-in-slot', `${label} has the meridian transit at ${clock(transit)} inside it, so a flip would fall mid-slot.`, slot.id);
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
  return out;
}
