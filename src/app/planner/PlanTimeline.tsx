'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { CatalogIndex } from '@/planner/catalog/search';
import { minutesText } from './rowExposure';
import type { HorizonPoint } from '@/planner/horizon';
import {
  buildItinerary,
  clockOf,
  clockToInstant,
  lightMinutes,
  makeWindowLookup,
} from '@/planner/itinerary';
import type { ItineraryItem, ItineraryPlan } from '@/planner/itinerary';
import { clockFromText, couldBecomeClock, isThreeDigits } from '@/planner/itinerary/clock-text';
import { itineraryToCsv, itineraryToJson, makeCsvTime } from '@/planner/export';
import { slotInputFor } from '@/planner/itinerary/resolve';
import type { Profile } from '@/planner/profile';
import NightTimeline from './NightTimeline';
import Collapsible from './Collapsible';
import { download } from './download';

export interface PlanTimelineProps {
  profile: Profile;
  /** The open plan's targets as slots, in the plan's order, all on the plan's train and its filter. */
  items: ItineraryItem[];
  /** The plan's start time; null: when the night starts. */
  startTime: string | null;
  /** Targets of the plan past the first MAX_SLOTS: the timeline schedules no more, and says so. */
  unscheduled: number;
  /** A change made here (the start time): the slots as they are and the start time. The plan keeps them. */
  onChange: (items: ItineraryItem[], startTime: string | null) => void;
  /** The bundled catalog, for finding the slots' targets; null until it has loaded (or when it failed). */
  catalog: CatalogIndex | null;
  site: Site;
  night: AstronomicalNight;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** Sky darkness of the chosen site (Bortle 1 to 9); set once in the site editor. */
  bortle: number;
  formatTime: (d: Date) => string;
  /** IANA zone of the site (or the browser): the start time is a clock time in it. */
  timeZone?: string;
  /** The page's print sheet reads the current timeline from here; written on every change, so it never causes a render. */
  report?: MutableRefObject<PlanTimelineReport | null>;
  /** Told the plan each time it is built (null when there is none): the cards and the plan rail show the timeline's own numbers. */
  onPlan?: (plan: ItineraryPlan | null) => void;
}

/** What the print sheet and the exports need of the timeline. */
export interface PlanTimelineReport {
  plan: ItineraryPlan;
}

const fieldBox = 'bg-p-bg/60 border border-p-line/30 rounded px-2 py-1 text-p-t1 font-normal';
const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40 aria-disabled:opacity-40';

/**
 * The open plan's night, as the header of the plan: the totals, the start time, and the Night graph. The slots themselves are the plan's cards;
 * they read this timeline's plan (`onPlan`). The slots, their order and their presets belong to the plan; the start time is the one edit that
 * lives here. Subs and counts come from the exposure module; every time and number is an estimate.
 */
export default function PlanTimeline({ profile, items, startTime, unscheduled, onChange, catalog, site, night, horizon, minAltitude, bortle, formatTime, timeZone, report, onPlan }: PlanTimelineProps) {
  // What is being typed in the start box; null: show the plan's start time.
  const [startDraft, setStartDraft] = useState<string | null>(null);
  // The start box complains when it is left or Enter is pressed, or when the text can no longer become a time; not on a half-typed "2".
  const [startChecked, setStartChecked] = useState(false);
  const startBox = useRef<HTMLInputElement>(null);
  const selectStart = useRef(false);

  const commit = (next: ItineraryItem[], nextStart: string | null = startTime) => onChange(next, nextStart);
  // After "Use night start" the box text is selected, so the next digit replaces it instead of adding to it.
  useEffect(() => {
    if (selectStart.current) startBox.current?.select();
    selectStart.current = false;
  }, [startTime, startDraft]);

  /** "21:30", "2130", "905" or "9:05" become a saved 24 h time; empty goes back to the night start; anything else is left in the box with a message. */
  const startError = startDraft !== null && startDraft.trim() !== '' && clockFromText(startDraft) === null && (startChecked || !couldBecomeClock(startDraft));
  const changeStart = (text: string, typed: boolean) => {
    // Any three-digit value typed or deleted while the box has focus ("213" on the way to 2130, or left by a Backspace from 2130) is
    // held: it is saved when the box is left or Enter is pressed. A pasted three-digit value is saved at once, as are four digits and colon forms.
    const holdThirdDigit = typed && isThreeDigits(text);
    setStartDraft(text);
    setStartChecked(false);
    if (text.trim() === '') return commit([...items], null);
    const clock = clockFromText(text);
    if (clock && !holdThirdDigit) commit([...items], clock);
  };
  /** Leaving the box or pressing Enter: a time that works shows the saved value again; one that does not stays in the box with its message. */
  const settleStart = () => {
    if (startDraft === null || startDraft.trim() === '' || clockFromText(startDraft) !== null) {
      const clock = startDraft === null ? null : clockFromText(startDraft);
      if (clock && clock !== startTime) commit([...items], clock);
      setStartDraft(null);
      setStartChecked(false);
    } else setStartChecked(true);
  };


  const inputs = useMemo(() => items.map((i) => slotInputFor(i, profile, catalog?.targets ?? [])), [items, profile, catalog]);
  const startAt = useMemo(() => (startTime && night.start ? clockToInstant(startTime, night.start, timeZone) : null), [startTime, night, timeZone]);
  // Each target's usable windows, found once per site, night, horizon and minimum: the plan, the order search and later changes all share them.
  const windows = useMemo(() => (night.kind === 'normal' ? makeWindowLookup({ site, night, horizon, minAltitude }) : null), [site, night, horizon, minAltitude]);
  const buildInput = useMemo(
    () => (night.kind === 'normal' && windows ? { site, night, horizon, minAltitude, bortle, slots: inputs, startAt, formatTime, windows } : null),
    [site, night, horizon, minAltitude, bortle, inputs, startAt, formatTime, windows],
  );
  const plan = useMemo(() => (buildInput ? buildItinerary(buildInput) : null), [buildInput]);
  useEffect(() => {
    if (report) report.current = plan ? { plan } : null;
    onPlan?.(plan);
  }, [report, plan, onPlan]);

  if (night.kind !== 'normal' || plan === null) {
    return <p className="text-p-warn-text font-normal text-sm">No astronomical night</p>;
  }

  const totals = plan.totals;
  const chip = 'rounded bg-p-warn/15 px-2 py-0.5 text-sm text-p-warn-text';

  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-p-t1 font-normal text-sm tabular-nums" data-testid="itinerary-totals">
        {plan.slots.length === 0 ? (
          'No slots'
        ) : (
          <>
            <span>Light {minutesText(lightMinutes(plan))}</span>
            <span>Changeover {Math.round(totals.changeoverMin)} min</span>
            <span>Waiting {Math.round(totals.waitMin)} min</span>
            {totals.ends && <span>Ends {formatTime(totals.ends)}</span>}
          </>
        )}
        <span className="text-p-t2" data-testid="timeline-estimate">Estimates</span>
      </p>
      {unscheduled > 0 && (
        <p className="mt-2 text-p-t1 font-normal text-sm" data-testid="timeline-unscheduled">
          <span className={chip}>{unscheduled} {unscheduled === 1 ? 'target' : 'targets'} not scheduled</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="it-start" className="block text-p-t2 font-normal text-sm mb-1">Start</label>
          <input
            id="it-start"
            ref={startBox}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="HH:MM"
            maxLength={12}
            aria-invalid={startError}
            className={`${fieldBox} min-h-11 w-40 text-base`}
            value={startDraft ?? startTime ?? clockOf(night.start as Date, timeZone)}
            onChange={(e) => {
              const inputType = (e.nativeEvent as InputEvent).inputType ?? '';
              changeStart(e.target.value, document.activeElement === e.target && !/^insertFromPaste|^insertFromDrop/.test(inputType));
            }}
            onBlur={settleStart}
            onKeyDown={(e) => {
              if (e.key === 'Enter') settleStart();
            }}
          />
        </div>
        <button type="button" className={btn44} disabled={startTime === null} onMouseDown={(e) => e.preventDefault() /* keep focus in the start box, so a held value is not saved on the way */} onClick={() => { selectStart.current = document.activeElement === startBox.current; setStartDraft(null); commit(items, null); }}>
          Use night start
        </button>
      </div>
      {startError && (
        <p role="status" className="mt-2" data-testid="itinerary-start-error">
          <span className={chip}>Use 24-hour time</span>
        </p>
      )}
      {plan.startNote && (
        <p role="status" className="mt-2" data-testid="itinerary-start-note">
          <span className={chip}>{plan.startNote}</span>
        </p>
      )}

      <div className="mt-3">
        <Collapsible id="night-graph" title="Night graph">
          <NightTimeline plan={plan} inputs={inputs} night={night} site={site} horizon={horizon} minAltitude={minAltitude} formatTime={formatTime} />
        </Collapsible>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btn44} disabled={plan.slots.length === 0} onClick={() => download('fpo-planner-itinerary.csv', itineraryToCsv(plan, makeCsvTime(timeZone)), 'text/csv;charset=utf-8', true)}>
          Export timeline (CSV)
        </button>
        <button type="button" className={btn44} disabled={plan.slots.length === 0} onClick={() => download('fpo-planner-itinerary.json', itineraryToJson(plan), 'application/json')}>
          Export timeline (JSON)
        </button>
      </div>
    </div>
  );
}
