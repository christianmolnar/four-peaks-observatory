'use client';

import { useId } from 'react';
import { GAIN_HURDLE, HONESTY_LINE } from '@/planner/filtermix/narrowband-hours';
import { Fold } from './PlanRowExposure';
import { minutesText } from './rowExposure';
import type { NbView } from './nbRow';

const TITLE = 'Filters from your gear that could help most';
const box = 'min-h-11 w-24 rounded border border-p-line/30 bg-p-bg/60 px-2 text-sm font-normal text-p-t1';

/**
 * The narrowband panel of one target: every filter of the user's gear, the minutes of narrowband it would add to the broadband time (or "does not help",
 * or "cannot judge"), one plain reason, and a box to tick. The numbers all come from the engine; this file only lays them out. Closed by default.
 */
export default function NarrowbandPanel({ idBase, view, onHours, onTick }: { idBase: string; view: NbView; onHours: (text: string) => void; onTick: (filterId: string, on: boolean) => void }) {
  const uid = useId();
  if (view.kind === 'hidden') return null;
  return (
    <div className="mt-1" data-testid={`nb-${idBase}`}>
      <Fold id={`nb-fold-${idBase}`} title={TITLE}>
        {view.kind === 'message' ? (
          <p className="break-words text-sm font-normal text-p-t1/90" data-testid={`nb-message-${idBase}`}>{view.text}</p>
        ) : (
          <div className="space-y-2 text-sm font-normal text-p-t1/90">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${uid}-hours`} className="text-p-t1">Broadband hours</label>
              <input
                id={`${uid}-hours`}
                data-testid={`nb-hours-${idBase}`}
                className={box}
                inputMode="decimal"
                autoComplete="off"
                value={view.hoursText}
                aria-invalid={view.kind === 'hours-error'}
                aria-describedby={view.kind === 'hours-error' ? `${uid}-err` : undefined}
                onChange={(e) => onHours(e.target.value)}
              />
              <span className="text-p-t1/70">(starts at this row’s planned light)</span>
            </div>
            {view.kind === 'hours-error' ? (
              <p id={`${uid}-err`} role="alert" className="break-words text-p-warn-text" data-testid={`nb-hours-error-${idBase}`}>{view.error}</p>
            ) : (
              <Result idBase={idBase} view={view} onTick={onTick} />
            )}
          </div>
        )}
      </Fold>
    </div>
  );
}

function Result({ idBase, view, onTick }: { idBase: string; view: Extract<NbView, { kind: 'panel' }>; onTick: (filterId: string, on: boolean) => void }) {
  const { result } = view;
  const added = result.filters.filter((f) => view.ticked.has(f.filterId)).reduce((t, f) => t + f.minutes, 0);
  return (
    <>
      {result.headline !== null && <p className="break-words font-medium text-p-t1" data-testid={`nb-headline-${idBase}`}>{result.headline}</p>}
      <ul className="space-y-2">
        {result.filters.map((f) => {
          const tickable = f.minutes > 0;
          return (
            <li key={f.filterId} data-verdict={f.verdict} data-testid={`nb-filter-${idBase}-${f.filterId}`}>
              <label className="flex min-h-11 max-w-full items-start gap-2 break-words text-p-t1">
                <input
                  type="checkbox"
                  className="mt-2.5 h-5 w-5 shrink-0 accent-p-focus"
                  data-testid={`nb-tick-${idBase}-${f.filterId}`}
                  checked={tickable && view.ticked.has(f.filterId)}
                  disabled={!tickable}
                  onChange={(e) => onTick(f.filterId, e.target.checked)}
                />
                <span className="min-w-0 pt-2.5">
                  <span className="font-medium">{f.name}</span>: {tickable ? minutesText(f.minutes) : f.verdict === 'cannot-judge' ? 'cannot judge' : f.verdict === 'no-narrowband' ? 'no narrowband' : 'does not help'}
                  {f.gain !== null && f.verdict !== 'no-narrowband' && <span className="text-p-t1/70"> (signal-to-noise gain about {f.gain >= 10 ? Math.round(f.gain) : Math.round(f.gain * 10) / 10} times)</span>}
                </span>
              </label>
              <p className="break-words pl-7 text-p-t1/80">{f.reason}</p>
              {f.verdict !== 'cannot-judge' && f.basis.some((b) => /beam edge/.test(b)) && <p className="break-words pl-7 text-p-t1/70">{f.basis.filter((b) => /beam edge/.test(b)).join(' ')}</p>}
            </li>
          );
        })}
      </ul>
      {result.filters.some((f) => f.minutes > 0) && (
        <p className="break-words text-p-t1/80" data-testid={`nb-state-${idBase}`}>
          {view.inPlan
            ? 'The ticked filters are in this row’s filter mix and in the minutes a new project starts from.'
            : 'These ticks are suggestions. Nothing is added to the plan until you change a tick or the broadband hours; then the ticked filters go into the filter mix and a new project’s minutes.'}
        </p>
      )}
      <p data-testid={`nb-total-${idBase}`}>
        Broadband {minutesText(Math.round(view.hours * 60))}{added > 0 ? ` plus ${minutesText(added)} of narrowband ticked = ${minutesText(Math.round(view.hours * 60) + added)}` : '; no narrowband ticked'}.
      </p>
      {view.assumptions.map((a) => (
        <p key={a} className="break-words text-p-t1/70">{a}</p>
      ))}
      {result.profileNote !== null && <p className="break-words text-p-t1/70">{result.profileNote}</p>}
      <p className="break-words text-p-t1/70" data-testid={`nb-confidence-${idBase}`}>{result.confidence}</p>
      <p className="break-words text-p-t1/70" data-testid={`nb-honesty-${idBase}`}>{HONESTY_LINE}</p>
      <Fold id={`nb-how-${idBase}`} title="How this is worked out" level={1}>
        <div className="space-y-2 text-p-t1/80">
          <p className="break-words">
            For each line this target needs, the filter band’s signal-to-noise per hour is compared with the same line in the broadband stack. The minutes are the shorter of two: the time at which the narrowband is as clean as the broadband nebula, and the time past which another half hour adds under {Math.round(result.kneeGain * 100)}%.
          </p>
          <p className="break-words">
            More than about {minutesText(Math.round(result.capMin))} of one filter stops paying, less the broadband’s own share. A filter must be at least {GAIN_HURDLE} times better than broadband and earn at least 30 minutes to count; a single-band filter takes a line from a dual-band one only when its band is at least {GAIN_HURDLE} times better.
          </p>
          <p className="break-words">The match rule and the {GAIN_HURDLE} hurdle are planner choices, not measurements. On a fast beam the band shift is worked out from the planner’s own formula.</p>
          <p className="break-words">The broadband stack alone reaches a signal-to-noise of about {Math.round(result.broadbandSnr)} per 2.5 arcsecond element on the whole nebula.</p>
        </div>
      </Fold>
    </>
  );
}
