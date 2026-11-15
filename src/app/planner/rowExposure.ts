import { nextMeridianTransit } from '@/planner/astro';
import type { Site } from '@/planner/astro';
import { MODE_ORDER, exposureFor, marginalBenefit } from '@/planner/exposure';
import type { ExposureChoice, ExposureMode, ExposureOverrides, ExposureResult, ExposureWarning, MarginalRow } from '@/planner/exposure';
import type { PlanEntry } from '@/planner/plan';
import type { SlotInput } from '@/planner/itinerary';
import type { PlanTargetRef } from '@/planner/state/plans';

/** What the engine gives one plan row on the plan's night, site, train and Moon: the chosen numbers, the three presets beside them, and the inputs. */
export type RowExposure =
  | { kind: 'none'; reason: string }
  | { kind: 'missing'; reason: string }
  | { kind: 'ok'; chosen: ExposureResult; presets: Record<ExposureMode, ExposureResult>; marginal: MarginalRow[]; inputs: string; usableMinutes: number };

/** The preset a target's numbers start from: its own preset, or for a Custom target the preset it was changed from (Balanced when none is kept). */
export const baseOf = (ref: Pick<PlanTargetRef, 'preset' | 'base'>): ExposureMode => (ref.preset === 'custom' ? (ref.base ?? 'balanced') : ref.preset);

/** The engine's choice for a plan target: its preset, with its own numbers over it when it is Custom. */
export function choiceOf(ref: Pick<PlanTargetRef, 'preset' | 'base' | 'custom'>): ExposureChoice {
  return ref.preset === 'custom' ? { preset: baseOf(ref), overrides: ref.custom ?? {} } : { preset: ref.preset };
}

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
  to.custom = { ...to.custom, [field]: value } satisfies ExposureOverrides;
  return to;
}

/** Plain words for what differs from the preset ("sub length and number of subs"). */
const FIELD_WORDS: Record<keyof ExposureOverrides, string> = { subSeconds: 'sub length', subCount: 'number of subs', totalMin: 'total light' };

export const differsText = (r: ExposureResult): string => {
  const base = MODE_LABEL[r.mode];
  if (!r.custom) return `Custom: same as ${base} so far.`;
  const words = r.differs.map((d) => FIELD_WORDS[d.field]);
  return `Custom: differs from ${base} in ${words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0]}.`;
};

const MODE_LABEL: Record<ExposureMode, string> = { quick: 'Quick', balanced: 'Balanced', deep: 'Deep' };
export const presetLabel = (m: ExposureMode): string => MODE_LABEL[m];

/** The warnings a reader can act on, each with the one thing to change and the control that changes it. Every other code is a note. */
export const ACT_ON: Readonly<Record<string, { change: string; to: readonly ('date' | 'train' | 'filter')[] }>> = {
  'filter-rated-slower': { change: 'Pick a filter rated for this speed, or another train.', to: ['filter', 'train'] },
  'filter-uvir-missing': { change: 'Pick a filter that blocks UV/IR, or add a UV/IR cut filter to the train.', to: ['filter'] },
  'filter-visual-colour': { change: 'Pick an imaging filter instead.', to: ['filter'] },
  'moon-near': { change: 'Pick a night when the Moon is farther away or down, or a target farther from it.', to: ['date'] },
  'no-usable-time': { change: 'Pick another date or another target.', to: ['date'] },
  'limited-by-usable-time': { change: 'Pick a night with more usable time to reach the mode’s length.', to: ['date'] },
  'meridian-flip': { change: 'Plan a pause to flip and re-centre at the crossing; its time is already counted.', to: [] },
  'target-ou4': { change: 'Pick a brighter target for a short session, or plan many nights of narrowband.', to: [] },
  'short-session-faint': { change: 'Pick a brighter, more compact target for a short session, or choose Balanced or Deep Project.', to: [] },
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
  if (entry === null) return { kind: 'none', reason: 'Numbers appear once the catalog and the night have loaded.' };
  if (slot.source.kind !== 'fixed') return { kind: 'none', reason: 'No exposure numbers for the solar system.' };
  if (!slot.optics || !slot.camera) return { kind: 'missing', reason: 'This train has no optics numbers (a smart scope controls its own exposures), so no sub length or count can be computed.' };
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
  const chosen = run(choiceOf(ref));
  if (!chosen.ok) return { kind: 'missing', reason: `The profile lacks ${chosen.missing.join(', ')}, so no exposure can be computed.` };
  const presets = {} as Record<ExposureMode, ExposureResult>;
  for (const m of MODE_ORDER) {
    const r = run({ preset: m });
    if (!r.ok) return { kind: 'missing', reason: `The profile lacks ${r.missing.join(', ')}, so no exposure can be computed.` };
    presets[m] = r;
  }
  const cam = slot.camera;
  const inputs = [
    `f/${(slot.optics.focalRatio ?? 0).toFixed(2)}`,
    `${cam.pixelSizeUm ?? '?'} um pixels`,
    `read noise class ${cam.readNoiseClass ?? 'not set (medium assumed)'}`,
    `Bortle ${bortle}`,
    `Moon ${(entry.moonIllumination * 100).toFixed(0)}% lit and ${entry.moonSeparation.toFixed(0)} degrees away${entry.moonUp ? '' : ' (down)'}`,
    `${Math.round(entry.usableMinutes)} usable minutes`,
  ].join(', ');
  return { kind: 'ok', chosen, presets, marginal: marginalBenefit(entry.usableMinutes), inputs, usableMinutes: entry.usableMinutes };
}

/** The longest sub, the most subs, and the most light one plan row accepts: past these a number is a typing slip, not an exposure. */
export const MAX_SUB_S = 3600;
export const MAX_SUBS = 5000;
export const MAX_LIGHT_S = 24 * 3600;

export type NumberCheck = { ok: true; value: number } | { ok: false; message: string };

/** A typed sub length (seconds) or count: a plain message when it cannot be used, never a stored value. */
export function checkNumber(field: 'subSeconds' | 'subCount', text: string): NumberCheck {
  const t = text.trim();
  const what = field === 'subSeconds' ? 'sub length' : 'number of subs';
  if (t === '') return { ok: false, message: `Enter a ${what}.` };
  if (/^-/.test(t) || /^0+(\.0*)?$/.test(t)) return { ok: false, message: `The ${what} must be above 0.` };
  if (field === 'subSeconds') {
    if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, message: 'Enter the sub length in seconds as a number, for example 120.' };
    const v = Number(t);
    if (v > MAX_SUB_S) return { ok: false, message: `A sub of ${v} s is longer than ${MAX_SUB_S} s (1 hour): too long for one sub.` };
    return { ok: true, value: v };
  }
  if (!/^\d+$/.test(t)) return { ok: false, message: 'Enter the number of subs as a whole number, for example 30.' };
  const v = Number(t);
  if (v > MAX_SUBS) return { ok: false, message: `${v} subs is more than ${MAX_SUBS}: too many for one plan.` };
  return { ok: true, value: v };
}

/** "Deep Project: 120 s x 30 (60 min)" for a saved exposure, in the words the row line uses. */
export function exposureSummary(f: { preset: PlanTargetRef['preset']; base?: ExposureMode; subSeconds: number; subCount: number }): string {
  const name = f.preset === 'custom' ? `Custom (from ${presetLabel(f.base ?? 'balanced')})` : presetLabel(f.preset);
  return `${name}, ${f.subSeconds} s × ${f.subCount} (${minutesText((f.subSeconds * f.subCount) / 60)})`;
}
