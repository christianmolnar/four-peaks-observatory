import { lineNote } from '@/planner/filtermix';
import type { MixLine } from '@/planner/filtermix';
import type { RowMix } from '@/planner/filtermix/row';
import { minutesText } from './rowExposure';

/**
 * The "Filters" lines under one slot of the AI plan: the same mix the plan row shows after Use this plan (one function, the same light), as a few plain
 * lines. The AI does not set or judge any of it. A slot with no mix says why in one line; nothing is made up.
 */
export default function AiSlotMix({ index, mix }: { index: number; mix: RowMix }) {
  return (
    <div className="mt-2 border-t border-p-line/15 pt-2 text-sm font-normal text-p-t1/90" data-testid={`ai-slot-mix-${index}`}>
      {mix.kind === 'message' ? (
        <p className="break-words">Filters: {mix.text}</p>
      ) : mix.kind === 'none' ? (
        <>
          <p className="break-words">Filters: {mix.message}</p>
          <Lines lines={mix.skipped} />
        </>
      ) : (
        <>
          <p className="text-p-t1">Filters (light after Use this plan: {minutesText(mix.availableMin)})</p>
          {mix.headline !== null && <p className="mt-1 break-words">{mix.headline}</p>}
          <Lines lines={mix.lines} />
          {mix.uncovered.length > 0 && <p className="mt-1 break-words">This target needs {mix.uncovered.join(' and ')}, which none of the selected filters passes.</p>}
          <p className="mt-1 break-words text-p-t1/70">{mix.confidence}</p>
        </>
      )}
    </div>
  );
}

function Lines({ lines }: { lines: readonly MixLine[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {lines.map((l) => {
        const note = lineNote(l);
        return (
          <li key={l.filterId ?? 'broadband'} data-verdict={l.verdict} className="break-words">
            <span className="text-p-t1">{l.name}</span>
            {l.verdict !== 'skipped' && <>: {minutesText(l.minutes)}</>}
            {note !== null && <span className="text-p-t1/80"> ({note})</span>}
          </li>
        );
      })}
    </ul>
  );
}
