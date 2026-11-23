import { nextMeridianTransit } from '@/planner/astro';
import type { Site } from '@/planner/astro';
import { MAX_SUBS, MAX_SUB_S, MIN_CUSTOM_SUB_S, MODE_ORDER, exposureFor, filterWarnings, marginalBenefit } from '@/planner/exposure';
import type { ExposureChoice, ExposureMode, ExposureOverrides, ExposureResult, ExposureWarning, MarginalRow } from '@/planner/exposure';
import { filterSub } from '@/planner/filtermix/subs';
import type { PlanEntry } from '@/planner/plan';
import type { ProfileFilter } from '@/planner/profile';
import type { SlotInput } from '@/planner/itinerary';
import type { PlanTargetRef } from '@/planner/state/plans';

/** What the engine gives one plan row on the plan's night, site, train and Moon: the chosen numbers, the three presets beside them, and the inputs. */
export type RowExposure =
  | { kind: 'none'; reason: string }
  | { kind: 'missing'; reason: string }
  | {
      kind: 'ok';
      chosen: ExposureResult;
      presets: Record<ExposureMode, ExposureResult>;
      marginal: MarginalRow[];
      inputs: string;
      usableMinutes: number;
      /**
       * Set when the row is Custom and its stored numbers give an unusable result on this night (more than MAX_SUBS subs, or no subs).
       * The rule: such a custom value is never scheduled; `chosen` is then the base preset's own numbers (so the row, the timeline, print and CSV agree),
       * and this is the plain reason. The stored value stays stored: the user may move the night back.
       */
      customUnusable: string | null;
      /** What the engine would give if the row's sub length or count were this number (the row's other own numbers kept); null when it cannot compute. */
      withNumber: (field: 'subSeconds' | 'subCount', value: number) => ExposureResult | null;
      /** One filter's line of the plan row for the minutes the plan gives it (null: the broadband line, behind the train's filter if it has one; the result is null when the plan gives it no minutes): its sub length and count at its own bandwidth, and the UV/IR warning when it applies. */
      forFilter: (filter: ProfileFilter | null, minutes: number) => { subs: string; warning: string | null } | null;
    };

/** The stored custom numbers that are inside the limits: a number typed on a row replaces the custom value, so a stored one outside the limits is not carried along. */
const keepUsable = (c: ExposureOverrides): ExposureOverrides => {
  const out: ExposureOverrides = { ...c };
  if (out.subSeconds !== undefined && (out.subSeconds < MIN_CUSTOM_SUB_S || out.subSeconds > MAX_SUB_S)) delete out.subSeconds;
  if (out.subCount !== undefined && (!Number.isInteger(out.subCount) || out.subCount < 1 || out.subCount > MAX_SUBS)) delete out.subCount;
  return out;
};

/** The preset a target's numbers start from: its own preset, or for a Custom target the preset it was changed from (Balanced when none is kept). */
export const baseOf = (ref: Pick<PlanTargetRef, 'preset' | 'base'>): ExposureMode => (ref.preset === 'custom' ? (ref.base ?? 'balanced') : ref.preset);

/** The engine's choice for a plan target: its preset, with its own numbers over it when it is Custom. */
export function choiceOf(ref: Pick<PlanTargetRef, 'preset' | 'base' | 'custom'>): ExposureChoice {
  return ref.preset === 'custom' ? { preset: baseOf(ref), overrides: ref.custom ?? {} } : { preset: ref.preset };
}

/** The short reason a stored custom value is outside the limits (a sub under MIN_CUSTOM_SUB_S or over MAX_SUB_S, a count over MAX_SUBS or that is not a whole number), or null. */
export function storedProblem(c: ExposureOverrides | undefined): string | null {
  if (c === undefined) return null;
  if (c.subSeconds !== undefined && c.subSeconds < MIN_CUSTOM_SUB_S) return `Sub under ${MIN_CUSTOM_SUB_S} s`;
  if (c.subSeconds !== undefined && c.subSeconds > MAX_SUB_S) return `Sub over ${MAX_SUB_S} s`;
  if (c.subCount !== undefined && (!Number.isInteger(c.subCount) || c.subCount < 1)) return 'Subs: whole number';
  if (c.subCount !== undefined && c.subCount > MAX_SUBS) return `Max ${MAX_SUBS} subs`;
  return null;
}

/** The warning for a custom value that is not used: the preset takes its place. The number that fails is in `storedProblem` and `resultProblem`. */
export const NOT_USED_TEXT = 'Custom not used';

/** One edit of a plan target's exposure, as the fields to store. `custom` and `base` are removed when the target is back on a preset. */
export function withPreset(ref: PlanTargetRef, next: ExposureMode | 'custom'): PlanTargetRef {
  const out: PlanTargetRef = { ...ref, preset: next };
  delete out.favorite;
  if (next === 'custom') {
    out.base = baseOf(ref);
    out.custom = ref.preset === 'custom' ? (ref.custom ?? {}) : {};
  } else {
    delete out.custom;
    delete out.base;
  }
  return out;
}

/** The target with its sub length or count changed: it becomes Custom (from the preset it was on), keeping any other number it already had. */
export function withNumber(ref: PlanTargetRef, field: 'subSeconds' | 'subCount', value: number): PlanTargetRef {
  const to = withPreset(ref, 'custom');
  to.custom = { ...keepUsable(to.custom ?? {}), [field]: value } satisfies ExposureOverrides;
  return to;
}

/** The line beside "Back to <preset>". */
export const differsText = (): string => 'Custom';

const MODE_LABEL: Record<ExposureMode, string> = { quick: 'Quick', balanced: 'Balanced', deep: 'Deep' };
export const presetLabel = (m: ExposureMode): string => MODE_LABEL[m];

/** The warnings a reader can act on, each with the controls that change it (none for a warning whose text already says what to do). Every other code is a note. */
export const ACT_ON: Readonly<Record<string, readonly ('date' | 'train' | 'filter')[]>> = {
  'filter-rated-slower': ['filter', 'train'],
  'filter-uvir-missing': ['filter'],
  'filter-visual-colour': ['filter'],
  'moon-near': ['date'],
  'no-usable-time': ['date'],
  'limited-by-usable-time': ['date'],
  'meridian-flip': [],
};

/** The warnings split: the ones to act on, and the notes (everything else). */
export function splitWarnings(warnings: readonly ExposureWarning[]): { act: ExposureWarning[]; notes: ExposureWarning[] } {
  return { act: warnings.filter((w) => w.code in ACT_ON), notes: warnings.filter((w) => !(w.code in ACT_ON)) };
}

/** Whole minutes as "1 h 20 min" or "45 min". */
export const minutesText = (m: number): string => {
  const t = Math.round(m);
  return t < 60 ? `${t} min` : `${Math.floor(t / 60)} h${t % 60 === 0 ? '' : ` ${t % 60} min`}`;
};

/**
 * The engine's numbers for one plan row. `slot` is the row resolved the way the timeline resolves a slot (train, camera, filter, target);
 * `entry` is the target scored for the night. A row with no engine numbers says why.
 */
export function rowExposure(ref: PlanTargetRef, slot: SlotInput, entry: PlanEntry | null, site: Site, bortle: number): RowExposure {
  if (slot.problem) return { kind: 'none', reason: slot.problem };
  if (entry === null) return { kind: 'none', reason: 'Loading...' };
  if (slot.source.kind !== 'fixed') return { kind: 'none', reason: 'No exposure numbers' };
  if (!slot.optics || !slot.camera) return { kind: 'missing', reason: 'No exposure: add optics' };
  const start = entry.windows[0]?.start ?? null;
  const { raHours, decDeg } = slot.source;
  const night = {
    moonIllumination: entry.moonIllumination,
    moonSeparationDeg: entry.moonSeparation,
    moonUp: entry.moonUp,
    usableMinutes: entry.usableMinutes,
    acquisitionStart: start,
    transitTime: start === null ? null : nextMeridianTransit(raHours, decDeg, start, site),
  };
  const rig = { train: { focalRatio: slot.optics.focalRatio, imageScale: slot.optics.imageScale }, camera: slot.camera, filter: slot.filter };
  const run = (choice: ExposureChoice) => exposureFor(slot.exposureTarget, rig, { bortle }, night, choice);
  const presets = {} as Record<ExposureMode, ExposureResult>;
  for (const m of MODE_ORDER) {
    const r = run({ preset: m });
    if (!r.ok) return { kind: 'missing', reason: slot.gearNote ?? 'Gear incomplete' };
    presets[m] = r;
  }
  // A stored custom number outside the limits never reaches the engine (it throws on a count that is not whole): the preset's numbers are used.
  const stored = ref.preset === 'custom' ? storedProblem(ref.custom) : null;
  let problem: string | null = stored;
  let chosen = presets[baseOf(ref)];
  if (ref.preset === 'custom' && stored === null) {
    const own = run(choiceOf(ref));
    if (!own.ok) return { kind: 'missing', reason: slot.gearNote ?? 'Gear incomplete' };
    problem = resultProblem(own, entry.usableMinutes);
    if (problem === null) chosen = own;
  } else if (ref.preset !== 'custom') {
    chosen = presets[ref.preset];
  }
  const customUnusable = problem === null ? null : NOT_USED_TEXT;
  const cam = slot.camera;
  const inputs = [
    `f/${(slot.optics.focalRatio ?? 0).toFixed(2)}`,
    `${cam.pixelSizeUm ?? '?'} um pixels`,
    `read noise class ${cam.readNoiseClass ?? 'medium (assumed)'}`,
    `Bortle ${bortle}`,
    `Moon ${(entry.moonIllumination * 100).toFixed(0)}% at ${entry.moonSeparation.toFixed(0)}°${entry.moonUp ? '' : ' (down)'}`,
    `${Math.round(entry.usableMinutes)} usable minutes`,
  ].join(', ');
  const withNumber = (field: 'subSeconds' | 'subCount', value: number): ExposureResult | null => {
    const base = choiceOf(ref);
    const r = run({ preset: base.preset, overrides: { ...keepUsable(base.overrides ?? {}), [field]: value } });
    return r.ok ? r : null;
  };
  const forFilter = (filter: ProfileFilter | null, minutes: number) => {
    if (!(minutes > 0)) return null;
    // The broadband line (null) is the row's own light: it sits behind the train's filter, as the row's exposure does.
    const s = filterSub({ target: slot.exposureTarget, rig, filter: filter ?? slot.filter, bortle, night, preset: baseOf(ref), minutes });
    const warning = filter === null ? null : (filterWarnings(slot.optics?.focalRatio ?? 0, filter, cam).find((w) => w.code === 'filter-needs-uvir')?.text ?? null);
    return { subs: s.kind === 'ok' ? `Subs: ${s.subSeconds} s x ${s.subCount}, total ${minutesText(s.minutes)}` : `Subs: ${s.text}`, warning };
  };
  return { kind: 'ok', chosen, presets, marginal: marginalBenefit(entry.usableMinutes), inputs, usableMinutes: entry.usableMinutes, customUnusable, withNumber, forFilter };
}

/** The most light one plan row accepts. The longest sub, the shortest sub and the most subs are the engine's own (MAX_SUB_S, MIN_CUSTOM_SUB_S, MAX_SUBS). */
export const MAX_LIGHT_S = 24 * 3600;

export type NumberCheck = { ok: true; value: number } | { ok: false; message: string };

/** A typed sub length (seconds) or count: a plain message when it cannot be used, never a stored value. */
export function checkNumber(field: 'subSeconds' | 'subCount', text: string): NumberCheck {
  const t = text.trim();
  if (t === '') return { ok: false, message: field === 'subSeconds' ? 'Enter a sub length' : 'Enter a count' };
  if (/^-/.test(t) || /^0+(\.0*)?$/.test(t)) return { ok: false, message: 'Above 0' };
  if (field === 'subSeconds') {
    if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, message: 'Seconds, a number' };
    const v = Number(t);
    if (v < MIN_CUSTOM_SUB_S || v > MAX_SUB_S) return { ok: false, message: `Sub: ${MIN_CUSTOM_SUB_S} to ${MAX_SUB_S} s` };
    return { ok: true, value: v };
  }
  if (!/^\d+$/.test(t)) return { ok: false, message: 'Subs: whole number' };
  const v = Number(t);
  if (v > MAX_SUBS) return { ok: false, message: `Max ${MAX_SUBS} subs` };
  return { ok: true, value: v };
}

/**
 * The short reason the engine's numbers for a custom value cannot be used (more subs than a favorite or a plan holds, a sub that does not fit the night,
 * or more than a day of light), or null when they can.
 */
export function resultProblem(r: ExposureResult, usableMinutes: number): string | null {
  if (r.warnings.some((w) => w.code === 'count-capped')) return `Max ${MAX_SUBS} subs`;
  if (r.subCount < 1) return usableMinutes <= 0 ? 'Not up tonight' : 'Sub too long';
  if (r.subSeconds * r.subCount > MAX_LIGHT_S) return 'Over 24 hours';
  return null;
}
