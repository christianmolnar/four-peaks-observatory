import { lineNote } from '@/planner/filtermix';
import type { MixLine } from '@/planner/filtermix';
import type { RowMix } from '@/planner/filtermix/row';
import NarrowbandPanel from './NarrowbandPanel';
import type { NbView } from './nbRow';
import { minutesText } from './rowExposure';
import { mixLightText } from './PlanRowMix';

/** What one slot of the AI plan shows under it: the filter mix it will have once the plan is used, and the narrowband panel for the same light. */
export interface AiSlotView {
  mix: RowMix;
  nb: NbView;
}

/**
 * The "Filters" lines under one slot of the AI plan: the same mix the plan row shows after Use this plan (one function, the same light), as a few plain
 * lines. The AI does not set or judge any of it. A slot with no mix says why in one line; nothing is made up.
 */
export default function AiSlotMix({ index, targetId, slot, onNbHours, onNbTick }: { index: number; targetId: string; slot: AiSlotView; onNbHours: (id: string, text: string) => void; onNbTick: (id: string, filterId: string, on: boolean) => void }) {
  const mix = slot.mix;
  return (
    <div className="mt-2 border-t border-p-line/15 pt-2 text-sm font-normal text-p-t1" data-testid={`ai-slot-mix-${index}`}>
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
          {mix.narrowbandAdded === true && <p className="mt-1 break-words">{mixLightText(mix)}</p>}
          <Lines lines={mix.lines} />
          {mix.uncovered.length > 0 && <p className="mt-1 break-words">No filter for {mix.uncovered.join(', ')}</p>}
        </>
      )}
      <NarrowbandPanel idBase={`ai-${targetId}`} view={slot.nb} onHours={(t) => onNbHours(targetId, t)} onTick={(f, on) => onNbTick(targetId, f, on)} />
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
            {note !== null && <span className="text-p-t1/70"> ({note})</span>}
          </li>
        );
      })}
    </ul>
  );
}
