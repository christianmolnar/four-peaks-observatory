'use client';

import { Fold } from './PlanRowExposure';
import type { RowMix } from '@/planner/filtermix/row';
import { minutesText } from './rowExposure';

/**
 * The "Filter mix" part of a plan row, folded by default: the row's planned light split between the filters of the setup (hours per filter, one plain line each),
 * which filters add nothing and why, and how sure the target's emission numbers are. A row with no mix says why in one plain line; nothing is made up.
 */
export default function PlanRowMix({ id, mix }: { id: string; mix: RowMix }) {
  return (
    <div className="mt-1" data-testid={`plan-mix-${id}`}>
      <Fold id={`plan-mix-fold-${id}`} title="Filter mix">
        {mix.kind === 'message' ? (
          <p className="break-words text-sm font-normal text-p-t1/90" data-testid={`plan-mix-message-${id}`}>{mix.text}</p>
        ) : mix.kind === 'none' ? (
          <div className="space-y-2 text-sm font-normal text-p-t1/90">
            <p className="break-words" data-testid={`plan-mix-message-${id}`}>{mix.message}</p>
            <MixLines lines={mix.skipped} />
          </div>
        ) : (
          <div className="space-y-2 text-sm font-normal text-p-t1/90">
            {mix.headline !== null && <p className="break-words font-medium text-p-t1" data-testid={`plan-mix-headline-${id}`}>{mix.headline}</p>}
            <p data-testid={`plan-mix-light-${id}`}>{mixLightText(mix)}</p>
            <MixLines lines={mix.lines} />
            {mix.uncovered.length > 0 && (
              <p className="break-words" data-testid={`plan-mix-uncovered-${id}`}>
                This target needs {mix.uncovered.join(' and ')}, which none of the selected filters passes.
              </p>
            )}
            {mix.profileNote !== null && <p className="break-words text-p-t1/70">{mix.profileNote}</p>}
            <p className="break-words text-p-t1/70" data-testid={`plan-mix-confidence-${id}`}>{mix.confidence}</p>
          </div>
        )}
      </Fold>
    </div>
  );
}

/** The line above the mix: the row's planned light, or (with narrowband ticked) the broadband time, each ticked filter's minutes and the total. */
export function mixLightText(mix: Extract<RowMix, { kind: 'mix' }>): string {
  if (mix.narrowbandAdded !== true) return `Light to split: ${minutesText(mix.availableMin)} (this row’s planned light).`;
  const broad = mix.lines.filter((l) => l.verdict === 'broadband');
  const adds = mix.lines.filter((l) => l.verdict !== 'broadband');
  return `Light: ${[...broad, ...adds].map((l) => `${l.filterId === null ? 'broadband' : l.name} ${minutesText(l.minutes)}`).join(' plus ')} = ${minutesText(mix.availableMin)}.`;
}

function MixLines({ lines }: { lines: readonly { filterId: string | null; name: string; minutes: number; verdict: string; reason: string }[] }) {
  return (
    <ul className="space-y-2">
      {lines.map((l) => (
        <li key={l.filterId ?? 'broadband'} data-verdict={l.verdict}>
          <p className="break-words text-p-t1">
            <span className="font-medium">{l.name}</span>
            {l.verdict !== 'skipped' && <>: {minutesText(l.minutes)}</>}
          </p>
          <p className="break-words text-p-t1/80">{l.reason}</p>
        </li>
      ))}
    </ul>
  );
}
