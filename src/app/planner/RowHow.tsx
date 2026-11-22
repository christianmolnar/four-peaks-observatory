import { GAIN_HURDLE, HONESTY_DETAIL, KNOTS_HEADLINE } from '@/planner/filtermix/narrowband-hours';
import type { RowMix } from '@/planner/filtermix/row';
import type { NbView } from './nbRow';
import { minutesText } from './rowExposure';

/**
 * The explanation of a plan row's filter mix and narrowband minutes, for the row's one fold ("How this is worked out"): the detail beside each filter,
 * the emission note, how the narrowband minutes are found, and how sure the numbers are. The numbers themselves stay in the Filter mix and Narrowband
 * folds; nothing here is a number the row needs.
 */
export default function RowHow({ id, mix, nb }: { id: string; mix: RowMix; nb: NbView }) {
  const panel = nb.kind === 'panel' ? nb : null;
  const lines = mix.kind === 'mix' ? mix.lines : mix.kind === 'none' ? mix.skipped : [];
  // One line per filter: the mix and the narrowband panel can both say the same thing about a filter.
  const details = [...new Set([
    ...lines.filter((l) => l.detail !== undefined).map((l) => `${l.name}: ${l.detail}`),
    ...(panel?.result.filters ?? []).filter((f) => f.detail !== undefined).map((f) => `${f.name}: ${f.detail}`),
  ])];
  const notes = [...new Set([mix.kind === 'mix' ? mix.profileNote : null, panel?.result.profileNote ?? null].filter((n): n is string => n !== null))];
  const confidence = mix.kind === 'mix' ? mix.confidence : (panel?.result.confidence ?? null);
  const result = panel?.result ?? null;
  if (details.length === 0 && notes.length === 0 && confidence === null && result === null) return null;
  return (
    <div className="space-y-1" data-testid={`row-how-${id}`}>
      {details.map((d) => (
        <p key={d} className="break-words">{d}</p>
      ))}
      {notes.map((n) => (
        <p key={n} className="break-words">{n}</p>
      ))}
      {result !== null && (
        <>
          <p className="break-words">
            Narrowband minutes: the sooner of matching the broadband nebula or gaining under {Math.round(result.kneeGain * 100)}% per extra half hour. More than about {minutesText(Math.round(result.capMin))} of one filter stops paying, less the broadband’s own share.
          </p>
          <p className="break-words">A filter must beat broadband by {GAIN_HURDLE}× and earn 30 min to count. These rules are planner choices, not measurements.</p>
          {result.headline === KNOTS_HEADLINE && <p className="break-words">Galaxy knots are small, so more time pays less: the quick preset’s stop is used.</p>}
          {result.filters.some((f) => f.beam !== undefined) && <p className="break-words">Beam edge: the band is taken as centred on its line at normal incidence; the shift is from the planner’s own formula.</p>}
          {result.filters.some((f) => f.standaloneMin > 0) && <p className="break-words" data-testid={`nb-twice-${id}`}>A line is counted once, for the best filter first.</p>}
          <p className="break-words">Broadband alone reaches signal-to-noise about {Math.round(result.broadbandSnr)} on the nebula.</p>
          <p className="break-words">{HONESTY_DETAIL}</p>
        </>
      )}
      {confidence !== null && <p className="break-words" data-testid={`plan-mix-confidence-${id}`}>{confidence}</p>}
    </div>
  );
}
