import { nextMeridianTransit, targetAltAz } from '../astro';
import { checkPlan } from './check';
import { nightOf } from './facts';
import { isoOf } from './instant';
import type { AiPlanInput, Night } from './facts';
import type { ModelPlan } from './schema';

/** Shared test fixtures for the AI night plan suites. Nothing but tests imports this. */

export const MIN = 60000;
export const TZ = 'America/Phoenix';

/** Three targets that are well placed on 2026-12-10 from a Phoenix-area site (ids are the only handles the code uses). */
export const INPUT: AiPlanInput = {
  targets: [
    { id: 't1', name: 'Target One', raHours: 1.0, decDeg: 30 },
    { id: 't2', name: 'Target Two', raHours: 5.6, decDeg: -5.4 },
    { id: 't3', name: 'Target Three', raHours: 8.5, decDeg: 20 },
  ],
  site: { latitude: 33.6115, longitude: -111.719, elevationM: 0 },
  timeZone: TZ,
  horizon: null,
  minAltitude: 25,
  date: '2026-12-10',
};

export const night = (input: AiPlanInput = INPUT): Night => nightOf(input);
/** An instant as the plan and facts write it: ISO local time with UTC offset, in `tz` (default Phoenix). */
export const clock = (d: Date | number, tz: string = TZ): string => isoOf(new Date(d), tz);

/**
 * A plan with the given slots (ISO times), every target either in the plan or cut, exposures 60 min with 120 s subs,
 * fitsAll consistent, and a consistent verdict for the last slot in time.
 */
export function planOf(input: AiPlanInput, slots: [string, string, string][], over: Partial<ModelPlan> = {}): ModelPlan {
  const planned = new Set(slots.map((s) => s[0]));
  const cut = input.targets.map((t) => t.id).filter((id) => !planned.has(id));
  const last = [...slots].sort((a, b) => Date.parse(a[1]) - Date.parse(b[1])).at(-1);
  const minutes = last ? (Date.parse(last[2]) - Date.parse(last[1])) / MIN : 0;
  const lastTarget = last ? { id: last[0], leftoverMinutes: minutes, subSeconds: 120, frames: Math.floor((minutes * 60) / 120), usefulness: 'useful' as const, reason: 'Enough frames to stack.' } : undefined;
  return {
    exposures: input.targets.map((t) => ({ id: t.id, minutes: 60, subSeconds: 120 })),
    plan: slots.map(([id, start, end]) => ({ id, start, end })),
    cut,
    fitsAll: cut.length === 0,
    ...(lastTarget ? { lastTarget } : {}),
    ...over,
  };
}

/** First start (whole minute, at or after `from`) where `id` can image `len` minutes with no violation, searched with the exact check itself. */
export function earliestSlot(input: AiPlanInput, id: string, from: number, len: number): { start: number; end: number } {
  const n = night(input);
  for (let t = Math.ceil(from / MIN) * MIN; t + len * MIN <= n.end.getTime(); t += MIN) {
    const probe = planOf(input, [[id, clock(t, input.timeZone), clock(t + len * MIN, input.timeZone)]]);
    const own = checkPlan(input, n, probe).filter((v) => v.id === id && v.kind !== 'missing-target' && v.kind !== 'verdict-mismatch');
    if (own.length === 0) return { start: t, end: t + len * MIN };
  }
  throw new Error(`no ${len} min slot for ${id}`);
}

/** All three targets back to back, 60 min each, 5 min apart; passes the check. */
export function validSlots(input: AiPlanInput = INPUT, len = 60): [string, string, string][] {
  const out: [string, string, string][] = [];
  let cursor = night(input).start.getTime();
  for (const t of input.targets) {
    const s = earliestSlot(input, t.id, cursor, len);
    out.push([t.id, clock(s.start, input.timeZone), clock(s.end, input.timeZone)]);
    cursor = s.end + 5 * MIN;
  }
  return out;
}

/** First minute in the night where `id` is under `limit` degrees and a `len` minute slot from there stays in the night. */
export function lowMinute(input: AiPlanInput, id: string, limit: number, len: number): number {
  const t = input.targets.find((x) => x.id === id)!;
  const n = night(input);
  for (let ms = Math.ceil(n.start.getTime() / MIN) * MIN; ms + len * MIN <= n.end.getTime(); ms += MIN) {
    if (targetAltAz(t.raHours, t.decDeg, new Date(ms), input.site).altitude < limit) return ms;
  }
  throw new Error(`${id} never under ${limit}`);
}

export const transitOf = (input: AiPlanInput, id: string): number => {
  const t = input.targets.find((x) => x.id === id)!;
  return nextMeridianTransit(t.raHours, t.decDeg, night(input).start, input.site).getTime();
};
