'use client';

import { useId } from 'react';
import { narrowbandPlan } from '@/planner/filtermix/narrowband-hours';
import { Fold } from './PlanRowExposure';
import { minutesText } from './rowExposure';
import type { NbView } from './nbRow';

const TITLE = 'Narrowband filters';
/** The beam-edge line shows only when the beam loses more than 5% of the line; at 95% or more it says nothing. */
const BEAM_SHOWN_BELOW = 0.95;
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
          <p className="break-words text-sm font-normal text-p-t1" data-testid={`nb-message-${idBase}`}>{view.text}</p>
        ) : (
          <div className="space-y-2 text-sm font-normal text-p-t1">
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
  const whole = narrowbandPlan(result, view.ticked);
  const plan = whole.filter((p) => p.minutes > 0);
  const coveredOnly = new Map(whole.filter((p) => p.minutes === 0).map((p) => [p.filterId, p.covered]));
  const added = plan.reduce((t, p) => t + p.minutes, 0);
  const noneJudged = result.filters.every((f) => f.verdict === 'cannot-judge');
  return (
    <>
      {noneJudged ? (
        <p className="break-words" data-testid={`nb-none-${idBase}`}>No narrowband filters</p>
      ) : (
      <ul className="space-y-2">
        {result.filters.map((f) => {
          const tickable = f.standaloneMin > 0;
          const recommended = f.minutes > 0;
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
                  <span className="font-medium">{f.name}</span>: {recommended ? minutesText(f.minutes) : tickable ? `not recommended, ${minutesText(f.standaloneMin)} on its own` : f.verdict === 'cannot-judge' ? 'cannot judge' : f.verdict === 'no-narrowband' ? 'no narrowband' : 'does not help'}
                  {f.gain !== null && f.verdict !== 'no-narrowband' && <span className="text-p-t1/70"> (gain {f.gain >= 10 ? Math.round(f.gain) : Math.round(f.gain * 10) / 10}×)</span>}
                </span>
              </label>
              {view.ticked.has(f.filterId) && coveredOnly.has(f.filterId) && (
                <p className="break-words pl-7 text-p-t1/70" data-testid={`nb-adds-nothing-${idBase}-${f.filterId}`}>
                  Adds nothing: {(coveredOnly.get(f.filterId) ?? []).join(' and ')} already covered.
                </p>
              )}
              {f.beam !== undefined && f.beam.share < BEAM_SHOWN_BELOW && <p className="break-words pl-7 text-p-t1/70" data-testid={`nb-beam-${idBase}-${f.filterId}`}>At f/{f.beam.fRatio.toFixed(1)} about {Math.round(f.beam.share * 100)}% of the beam still sees the line.</p>}
            </li>
          );
        })}
      </ul>
      )}
      <p data-testid={`nb-total-${idBase}`}>
        Broadband {minutesText(Math.round(view.hours * 60))}{added > 0 ? ` plus ${plan.map((p) => `${p.name} ${minutesText(p.minutes)}`).join(' plus ')} = ${minutesText(Math.round(view.hours * 60) + added)}` : '; no narrowband ticked'}.
      </p>
    </>
  );
}
