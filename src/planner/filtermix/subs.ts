import { exposureFor } from '../exposure';
import type { ExposureMode, ExposureRig, ExposureTarget } from '../exposure';
import type { ProfileFilter } from '../profile';

/** The night the sub is worked out for: the row's Moon. Its usable window is not an input: a filter's minutes may run over several nights. */
export interface SubNight {
  moonIllumination: number;
  moonSeparationDeg: number;
  moonUp: boolean;
}

/** More usable minutes than any plan holds, so the exposure engine never cuts a filter's minutes to one night. */
const NO_WINDOW_MIN = 1_000_000;

/** What the engine's own missing keys are called in a sentence. */
const MISSING_WORDS: Record<string, string> = {
  'train.focalRatio': 'the focal ratio',
  'train.imageScale': 'the image scale',
  'camera.pixelSizeUm': 'the pixel size',
};

/** One filter's configuration for a plan row's minutes: the sub length for that filter's bandwidth, and the number of subs that fill the minutes. */
export type FilterSub =
  | {
      kind: 'ok';
      subSeconds: number;
      /** The engine's own count: the minutes over the sub, rounded up (never above MAX_SUBS). */
      subCount: number;
      /** The minutes the plan gives this filter; the number the row shows as its total. */
      minutes: number;
    }
  | { kind: 'missing'; text: string };

/**
 * The sub length and the number of subs of one filter (null: no filter) for the minutes the plan gives it, from the exposure engine with that filter's
 * bandwidth and the row's f-ratio, pixel size, read noise class, Bortle class and Moon. The minutes are not changed.
 * Missing inputs (focal ratio, pixel size) give the words of what is missing, never a number.
 */
export function filterSub(input: { target: ExposureTarget; rig: ExposureRig; filter: ProfileFilter | null; bortle: number; night: SubNight; preset: ExposureMode; minutes: number }): FilterSub {
  const { target, rig, filter, bortle, night, preset, minutes } = input;
  const r = exposureFor(target, { ...rig, filter }, { bortle }, { ...night, usableMinutes: NO_WINDOW_MIN, acquisitionStart: null, transitTime: null }, { preset, overrides: { totalMin: minutes } });
  if (!r.ok) return { kind: 'missing', text: `not worked out: ${r.missing.map((m) => MISSING_WORDS[m] ?? m).join(' and ')} ${r.missing.length > 1 ? 'are' : 'is'} not set` };
  return { kind: 'ok', subSeconds: r.subSeconds, subCount: r.subCount, minutes };
}
