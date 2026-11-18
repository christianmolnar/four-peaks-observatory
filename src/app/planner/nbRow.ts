import { emissionProfileFor } from '@/planner/catalog/emission';
import { DEFAULT_READ_NOISE_CLASS, READ_NOISE_E, SB_CLASS_MU, UNKNOWN_SB_CLASS, surfaceBrightnessOf } from '@/planner/exposure';
import type { ExposureMode } from '@/planner/exposure';
import { narrowbandHours } from '@/planner/filtermix/narrowband-hours';
import type { NbResult } from '@/planner/filtermix/narrowband-hours';
import { NOT_UP_MIX_TEXT, TOO_LITTLE_LIGHT_MIX_TEXT } from '@/planner/filtermix/row';
import type { RowMixInput } from '@/planner/filtermix/row';
import type { ProfileFilter, ReadNoiseClass } from '@/planner/profile';
import type { PlanTargetRef } from '@/planner/state/plans';

/** The panel's most and least broadband hours a person may type. */
export const NB_HOURS_MIN = 0.25;
export const NB_HOURS_MAX = 48;
export const NB_HOURS_TEXT = `Broadband hours must be a number from ${NB_HOURS_MIN} to ${NB_HOURS_MAX}, for example 2 or 3.5.`;

/** What the train and camera of the open plan give the engine; a field absent is a number the gear does not hold. */
export interface NbGear {
  fRatio?: number;
  focalLengthMm?: number;
  pixelUm?: number;
  /** One-shot colour camera. false: mono, which this panel does not work out. Absent: taken as colour (the planner's cameras are). */
  colour?: boolean;
  readNoiseClass?: ReadNoiseClass;
}

/** One plan target as the page holds it: its id, a body when it is a solar-system one, the catalog target, and its plan entry. */
export interface NbRowTarget {
  id: string;
  body: unknown;
  target: { id: string; type: string; surfaceBrightness?: number } | undefined;
  ref: PlanTargetRef;
}

export interface NbRowInput {
  body: boolean;
  /** The catalog target (id, type, and its mean surface brightness when it has one), or null when it is not in the catalog. */
  target: { id: string; type: string; surfaceBrightness?: number } | null;
  /** The row's planned light: the default broadband time. */
  light: RowMixInput['light'];
  /** The open plan's train and camera, or why it has none (a smart scope, no setup). */
  gear: NbGear | { problem: string };
  bortle: number;
  bortleAssumed: boolean;
  knee: ExposureMode;
  /** Every filter in the user's gear. */
  filters: readonly ProfileFilter[];
  /** What the user typed in the broadband hours box; undefined until they type. */
  hoursText: string | undefined;
  /** The user's own ticks by filter id; a filter with minutes and no entry is ticked (the engine's recommendation). */
  ticks: ReadonlyMap<string, boolean> | undefined;
}

export type NbView =
  /** Nothing to show here: the mix line already says why the row has no mix (a body, an unknown target, no light). */
  | { kind: 'hidden' }
  | { kind: 'message'; text: string }
  | { kind: 'hours-error'; hoursText: string; error: string }
  | {
      kind: 'panel';
      result: NbResult;
      /** The broadband hours the numbers are for. */
      hours: number;
      /** What the box shows: the typed text, else the row's planned light. */
      hoursText: string;
      /** The filters ticked: those with minutes the user has not unticked. */
      ticked: ReadonlySet<string>;
      /** Inputs the planner assumed (a surface brightness, a read noise, a Bortle class), each said in words. */
      assumptions: string[];
    };

const hoursOf = (minutes: number): string => String(Math.round((minutes / 60) * 100) / 100);

/** The text of the box as a number of hours, or null when it is not one in range. */
export function readHours(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return n >= NB_HOURS_MIN && n <= NB_HOURS_MAX ? n : null;
}

const pos = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n > 0;

/** What the narrowband panel shows for one plan row. Pure: the same inputs give the same view. */
export function nbRowView(input: NbRowInput): NbView {
  if (input.body || input.target === null) return { kind: 'hidden' };
  if (input.light.kind === 'none') return { kind: 'hidden' };
  if (!(input.light.usableMinutes > 0)) return { kind: 'message', text: NOT_UP_MIX_TEXT };
  if (!(Math.round(input.light.minutes) > 0)) return { kind: 'message', text: TOO_LITTLE_LIGHT_MIX_TEXT };
  const profile = emissionProfileFor(input.target.id, input.target.type);
  if (profile === null) return { kind: 'hidden' };
  if ('problem' in input.gear) return { kind: 'message', text: input.gear.problem };
  const g = input.gear;
  if (g.colour === false) return { kind: 'message', text: 'This camera is mono. The panel works out minutes for a colour (one-shot colour) camera only, so it gives none.' };
  const missing = [pos(g.fRatio) ? null : 'the focal ratio', pos(g.focalLengthMm) ? null : 'the focal length', pos(g.pixelUm) ? null : 'the pixel size'].filter((x): x is string => x !== null);
  if (missing.length > 0) return { kind: 'message', text: `Gear numbers are missing (${missing.join(', ')}), so no narrowband minutes are worked out. Add them in Gear.` };
  if (input.filters.length === 0) return { kind: 'message', text: 'There are no filters in your gear yet, so there is nothing to recommend. Add them in Gear.' };

  const defaultText = hoursOf(input.light.minutes);
  const hoursText = input.hoursText ?? defaultText;
  const hours = readHours(hoursText);
  if (hours === null) return { kind: 'hours-error', hoursText, error: NB_HOURS_TEXT };

  const assumptions: string[] = [];
  const sb = input.target.surfaceBrightness;
  const mu =
    sb !== undefined
      ? sb
      : (() => {
          const cls = surfaceBrightnessOf({ type: input.target?.type });
          const used = cls === 'unknown' ? UNKNOWN_SB_CLASS : cls;
          assumptions.push(`The catalog has no surface brightness for this target; the ${used} class (${SB_CLASS_MU[used]} mag per square arcsecond) is assumed.`);
          return SB_CLASS_MU[used];
        })();
  const rnClass = g.readNoiseClass ?? DEFAULT_READ_NOISE_CLASS;
  if (g.readNoiseClass === undefined) assumptions.push(`The camera's read noise is not set; ${rnClass} (${READ_NOISE_E[rnClass]} e) is assumed.`);
  if (input.bortleAssumed) assumptions.push(`The site has no Bortle class set; class ${input.bortle} is assumed.`);

  const result = narrowbandHours({
    profile,
    surfaceBrightnessMu: mu,
    broadbandHours: hours,
    bortle: input.bortle,
    train: { fRatio: g.fRatio as number, pixelUm: g.pixelUm as number, focalLengthMm: g.focalLengthMm as number },
    readNoiseE: READ_NOISE_E[rnClass],
    knee: input.knee,
    filters: input.filters.map((f) => ({ id: f.id, name: f.name, bands: f.passbands, ratedMinFRatio: f.ratedMinFRatio })),
  });
  const ticked = new Set(result.filters.filter((f) => f.minutes > 0 && (input.ticks?.get(f.filterId) ?? true)).map((f) => f.filterId));
  return { kind: 'panel', result, hours, hoursText, ticked, assumptions };
}
