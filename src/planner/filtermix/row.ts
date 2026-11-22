import { emissionProfileFor } from '../catalog/emission';
import { filterMix } from './index';
import type { MixFilter, MixLine, MixResult } from './index';
import { narrowbandPlan } from './narrowband-hours';
import type { NbResult } from './narrowband-hours';

/** What a plan row shows for its filter mix: a plain message (never a made-up number) or the mix. */
export type RowMix = { kind: 'message'; text: string } | MixResult;

export interface RowMixInput {
  /** A solar-system body. */
  body: boolean;
  /** The catalog target (its id and type), or null when it is not in the catalog. */
  target: { id: string; type: string } | null;
  /** What the row's exposure gives: the planned light and the night's usable time, or why it has none. */
  light: { kind: 'ok'; minutes: number; usableMinutes: number } | { kind: 'none'; reason: string };
  /** The filters of the setup (and any the user added to the mix). */
  filters: readonly MixFilter[];
  /** Said when `filters` is empty: why there are none (no filter in the setup, or a smart scope's built-in one). */
  noFilters: string;
  /** The narrowband minutes recommended from the user's gear and the filters ticked. When any ticked filter has minutes, the mix is the broadband time plus those. */
  narrowband?: RowNarrowband;
}

export interface RowNarrowband {
  result: NbResult;
  /** Filter ids ticked in the panel. */
  ticked: ReadonlySet<string>;
  /** The broadband time the recommendation was worked out for, whole minutes. */
  broadbandMin: number;
}

export const SOLAR_MIX_TEXT = 'No filter mix for solar-system bodies.';
export const NOT_IN_CATALOG_MIX_TEXT = 'Not in the catalog, so no filter mix.';
export const NOT_UP_MIX_TEXT = 'Not up tonight, so no filter mix.';
export const TOO_LITTLE_LIGHT_MIX_TEXT = 'Under a minute of light: nothing to split.';
export const NO_PROFILE_MIX_TEXT = 'No emission profile for this type, so no filter mix.';

const BROADBAND_SLOT = 'Broadband (no narrowband filter)';

/**
 * The mix when narrowband filters are ticked: the broadband time as planned, plus each ticked filter's minutes. Null when no ticked filter has minutes, so
 * the usual mix stands.
 */
export function narrowbandMix(nb: RowNarrowband): Extract<MixResult, { kind: 'mix' }> | null {
  const byId = new Map(nb.result.filters.map((f) => [f.filterId, f]));
  const ticked = narrowbandPlan(nb.result, nb.ticked).filter((p) => p.minutes > 0);
  if (ticked.length === 0) return null;
  const broad: MixLine = { filterId: null, name: BROADBAND_SLOT, minutes: nb.broadbandMin, verdict: 'broadband', reason: '', adds: [], shared: [], coveredBy: [] };
  const lines: MixLine[] = ticked.map((p) => {
    const f = byId.get(p.filterId) as NbResult['filters'][number];
    const chosen = f.minutes > 0 ? f.reason : `Ticked by you: ${p.minutes} min for ${p.lines.join(' and ')}.`;
    return {
      filterId: p.filterId,
      name: p.name,
      minutes: p.minutes,
      verdict: 'adds',
      reason: p.covered.length > 0 ? `${chosen} ${p.covered.join(' and ')} is already covered by another ticked filter and is not counted twice.` : chosen,
      ...(f.minutes > 0 && f.detail !== undefined ? { detail: f.detail } : {}),
      adds: p.lines,
      shared: [],
      coveredBy: [],
    };
  });
  const availableMin = nb.broadbandMin + lines.reduce((t, l) => t + l.minutes, 0);
  return {
    kind: 'mix',
    availableMin,
    lines: [broad, ...lines],
    headline: null,
    needed: nb.result.needed,
    uncovered: [],
    haMostlyNii: nb.result.haMostlyNii,
    confidence: nb.result.confidence,
    profileNote: nb.result.profileNote,
    narrowbandAdded: true,
  };
}

/**
 * The mix a row shows. The order of the checks is the order of what a person would fix first: a body or an unknown target has no mix at all; then no light
 * (the row's own planned light is the light to split); then the profile; then the filters.
 */
export function rowMix(input: RowMixInput): RowMix {
  if (input.body) return { kind: 'message', text: SOLAR_MIX_TEXT };
  if (input.target === null) return { kind: 'message', text: NOT_IN_CATALOG_MIX_TEXT };
  if (input.light.kind === 'none') return { kind: 'message', text: 'No planned light yet.' };
  if (!(input.light.usableMinutes > 0)) return { kind: 'message', text: NOT_UP_MIX_TEXT };
  if (!(Math.round(input.light.minutes) > 0)) return { kind: 'message', text: TOO_LITTLE_LIGHT_MIX_TEXT };
  const profile = emissionProfileFor(input.target.id, input.target.type);
  if (profile === null) return { kind: 'message', text: NO_PROFILE_MIX_TEXT };
  const added = input.narrowband === undefined ? null : narrowbandMix(input.narrowband);
  if (added !== null) return added;
  if (input.filters.length === 0) return { kind: 'message', text: input.noFilters };
  return filterMix({ profile, filters: input.filters, minutes: input.light.minutes });
}
