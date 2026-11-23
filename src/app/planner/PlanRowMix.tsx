'use client';

import { Fold } from './PlanRowExposure';
import type { RowMix } from '@/planner/filtermix/row';
import { minutesText } from './rowExposure';

/**
 * The "Filter mix" part of a plan row, folded by default: the row's planned light split between the filters of the setup (hours per filter, one plain line each),
 * which filters add nothing. A row with no mix says why in one plain line; nothing is made up.
 */
export type LineExtra = (filterId: string | null, minutes: number) => { subs: string; warning: string | null } | null;

export default function PlanRowMix({ id, mix, extra }: { id: string; mix: RowMix; extra?: LineExtra }) {
  return (
    <div className="mt-1" data-testid={`plan-mix-${id}`}>
      <Fold id={`plan-mix-fold-${id}`} title="Filter mix">
        {mix.kind === 'message' ? (
          <p className="break-words text-sm font-normal text-p-t1" data-testid={`plan-mix-message-${id}`}>{mix.text}</p>
        ) : mix.kind === 'none' ? (
          <div className="space-y-2 text-sm font-normal text-p-t1">
            <p className="break-words" data-testid={`plan-mix-message-${id}`}>{mix.message}</p>
            <MixLines lines={mix.skipped} />
          </div>
        ) : (
          <div className="space-y-2 text-sm font-normal text-p-t1">
            <p data-testid={`plan-mix-light-${id}`}>{mixLightText(mix)}</p>
            <MixLines lines={mix.lines} extra={extra} />
            {mix.uncovered.length > 0 && (
              <p className="break-words" data-testid={`plan-mix-uncovered-${id}`}>
                No filter for {mix.uncovered.join(', ')}
              </p>
            )}
          </div>
        )}
      </Fold>
    </div>
  );
}

/** The line above the mix: the row's planned light, or (with narrowband ticked) the broadband time, each ticked filter's minutes and the total. */
export function mixLightText(mix: Extract<RowMix, { kind: 'mix' }>): string {
  if (mix.narrowbandAdded !== true) return `Light: ${minutesText(mix.availableMin)}.`;
  const broad = mix.lines.filter((l) => l.verdict === 'broadband');
  const adds = mix.lines.filter((l) => l.verdict !== 'broadband');
  return `Light: ${[...broad, ...adds].map((l) => `${l.filterId === null ? 'broadband' : l.name} ${minutesText(l.minutes)}`).join(' plus ')} = ${minutesText(mix.availableMin)}.`;
}

function MixLines({ lines, extra }: { lines: readonly { filterId: string | null; name: string; minutes: number; verdict: string }[]; extra?: LineExtra }) {
  return (
    <ul className="space-y-2">
      {lines.map((l) => {
        const more = l.verdict === 'skipped' || extra === undefined ? null : extra(l.filterId, l.minutes);
        return (
        <li key={l.filterId ?? 'broadband'} data-verdict={l.verdict}>
          <p className="break-words text-p-t1">
            <span className="font-medium">{l.name}</span>
            {l.verdict !== 'skipped' && <>: {minutesText(l.minutes)}</>}
          </p>
          {more !== null && <p className="break-words text-p-t1" data-testid="plan-mix-subs">{more.subs}</p>}
          {more?.warning != null && <p className="break-words rounded border border-p-warn/40 bg-p-warn-fill/10 p-2 text-p-t1" data-testid="plan-mix-uvir">{more.warning}</p>}
        </li>
        );
      })}
    </ul>
  );
}
