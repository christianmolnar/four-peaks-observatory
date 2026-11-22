'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { CatalogIndex } from '@/planner/catalog/search';
import { presetLabel } from './rowExposure';
import { MAX_SUBS, SETUP_MIN } from '@/planner/exposure/constants';
import type { HorizonPoint } from '@/planner/horizon';
import {
  MAX_NOTE_CHARS,
  MAX_SLOTS,
  TREND_TEXT,
  buildItinerary,
  clockOf,
  clockToInstant,
  lightMinutes,
  makeWindowLookup,
  worstCaseWarningTexts,
} from '@/planner/itinerary';
import type { ItineraryItem, ItineraryPlan, Slot } from '@/planner/itinerary';
import { clockFromText, couldBecomeClock, isThreeDigits } from '@/planner/itinerary/clock-text';
import { itineraryToCsv, itineraryToJson, makeCsvTime } from '@/planner/export';
import { slotInputFor } from '@/planner/itinerary/resolve';
import type { Profile } from '@/planner/profile';
import NightTimeline from './NightTimeline';
import Collapsible from './Collapsible';
import { Fold } from './PlanRowExposure';
import WrapText from './WrapText';
import { download } from './download';

export interface PlanTimelineProps {
  profile: Profile;
  /** The open plan's targets as slots, in the plan's order, all on the plan's train and its filter. */
  items: ItineraryItem[];
  /** The plan's "imaging can start at"; null: when the night starts. */
  startTime: string | null;
  /** The slots (target ids) whose Custom numbers do not work, each with the plain reason naming the number that fails: they are scheduled with the preset's own numbers, and the slot says so. */
  presetUsed?: ReadonlyMap<string, string>;
  /** What each target's own row plans for the whole night (sub length and count): a slot that plans something else says why. */
  rowNumbers?: ReadonlyMap<string, { subSeconds: number; subCount: number; lengthenedForCap: boolean }>;
  /** Targets of the plan past the first MAX_SLOTS: the timeline schedules no more, and says so. */
  unscheduled: number;
  /** A change made here (a note, the start time): the slots as they are and the start time. The plan keeps them. */
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
  /** "tonight" or "that night (date)", from the page. */
  nightWord: string;
  /** IANA zone of the site (or the browser): the start time is a clock time in it. */
  timeZone?: string;
  /** The page's print sheet reads the current timeline from here; written on every change, so it never causes a render. */
  report?: MutableRefObject<PlanTimelineReport | null>;
  /** Told the plan each time it is built (null when there is none): the plan rail shows the timeline's own numbers. */
  onPlan?: (plan: ItineraryPlan | null) => void;
}

/** What the print sheet and the exports need of the timeline. */
export interface PlanTimelineReport {
  plan: ItineraryPlan;
}


const fieldBox = 'bg-p-bg/60 border border-p-line/30 rounded px-2 py-1 text-p-t1 font-normal';
const field = `${fieldBox} text-sm`;
const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40 aria-disabled:opacity-40';

/** A slot whose sub length differs from what the target's own row plans for the whole night. */
const differsFromRow = (s: Slot, row: { subSeconds: number } | undefined): boolean => row !== undefined && s.subSeconds !== null && s.subSeconds !== row.subSeconds;

/** Why a slot's sub differs from its row's, in one line: the numbers of both, and the 500-sub cap only when that is the cause. Any other cause (the Moon at the slot's start, its altitude) gets no cause. */
export function slotSubReason(s: Slot, row: { subSeconds: number; subCount: number; lengthenedForCap: boolean }): string {
  const rowText = `Row plans ${row.subSeconds} s × ${row.subCount}`;
  const slotText = `this slot ${s.subSeconds} s × ${s.subCount}`;
  // The cause is named only when it is known (the row was held to MAX_SUBS for the whole night and this slot needs no such stretch).
  if (row.lengthenedForCap && s.subSeconds !== null && s.subSeconds < row.subSeconds) return `${rowText}, held to ${MAX_SUBS} subs; ${slotText}.`;
  return `${rowText}; ${slotText}.`;
}

/** The slot's altitude and compass direction at its start, middle and end, and the trend; said in Details, not on every slot. */
function altitudeText(s: Slot): string {
  if (!s.altitudes) return 'Altitude: none, the slot has no time.';
  const { start, middle, end, trend } = s.altitudes;
  return `Altitude ${Math.round(start.altitude)}° ${start.direction}, ${Math.round(middle.altitude)}° ${middle.direction}, ${Math.round(end.altitude)}° ${end.direction}; ${TREND_TEXT[trend]}.`;
}

function Chip({ severity, label }: { severity: 'warning' | 'note'; label: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-sm font-medium ${severity === 'warning' ? 'border-p-warn/60 text-p-warn-strong' : 'border-p-accent/50 text-p-info-strong'}`}>
      {severity === 'warning' ? 'Warning' : 'Note'}: {label.toLowerCase()}
    </span>
  );
}

function Detail({
  heading,
  changeover,
  window: win,
  altitude,
  warnings,
}: {
  heading: string;
  changeover: { label: string; minutes: number }[];
  window: string;
  altitude: string;
  warnings: { severity: 'warning' | 'note'; text: string }[];
}) {
  return (
    <div>
      <h3 className="text-p-t1 font-normal text-base mb-2">{heading}</h3>
      {changeover.length > 0 && <p className="text-p-t1 font-normal text-sm">Before this slot: {changeover.map((p) => `${p.label} ${p.minutes} min`).join(', ')}.</p>}
      <p className="text-p-t1 font-normal text-sm mt-1">{win}</p>
      <p className="text-p-t1 font-normal text-sm mt-1" data-testid="slot-altitude">{altitude}</p>
      <ul className="mt-2 space-y-2">
        {warnings.map((w) => (
          <li key={w.text} className="text-sm font-normal text-p-t1">
            <span className={`mr-2 rounded border px-1.5 py-0.5 text-sm font-medium ${w.severity === 'warning' ? 'border-p-warn/60 text-p-warn-strong' : 'border-p-accent/50 text-p-info-strong'}`}>
              {w.severity === 'warning' ? 'Warning' : 'Note'}
            </span>
            {w.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The open plan's night timeline: its targets in the plan's order, scheduled one after the other with the changeover between them.
 * The slots, their order, their presets and the start time belong to the plan (a preset is chosen on the target's row, the order by the
 * AI plan); this shows the times and takes the two edits that live here (a note, the start time) back to it. Subs and counts come from
 * the exposure module; every time and number here is an estimate (said once, above the slots).
 */
export default function PlanTimeline({ profile, items, startTime, presetUsed, rowNumbers, unscheduled, onChange, catalog, site, night, horizon, minAltitude, bortle, formatTime, nightWord, timeZone, report, onPlan }: PlanTimelineProps) {
  // What is being typed in the start box; null: show the plan's start time.
  const [startDraft, setStartDraft] = useState<string | null>(null);
  // The start box complains when it is left or Enter is pressed, or when the text can no longer become a time; not on a half-typed "2".
  const [startChecked, setStartChecked] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
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
  const update = (id: string, patch: Partial<ItineraryItem>) => commit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  if (night.kind !== 'normal' || plan === null) {
    return <p className="text-p-t1 font-normal text-sm">No astronomical night on this date.</p>;
  }

  const shown: Slot[] = plan.slots;
  const detailSlot = shown.find((s) => s.id === detailId) ?? shown[0];
  const longestName = shown.reduce((n, s) => (s.name.length > n.length ? s.name : n), 'Orion Nebula');
  const worst = worstCaseWarningTexts(longestName);
  const totals = plan.totals;

  return (
    <div>
      <p className="text-p-t1/70 font-normal text-sm" data-testid="timeline-estimate">
        All times are estimates for {nightWord}. Setup ({SETUP_MIN} min) comes first and is not counted.
      </p>
      <Fold id="timeline-how" title="How this is worked out">
        <p className="text-p-t1/70 font-normal text-sm">Each slot starts when the one before is done, or when its target clears your horizon, whichever is later.</p>
      </Fold>

      {unscheduled > 0 && (
        <p className="mt-2 text-p-t1 font-normal text-sm" data-testid="timeline-unscheduled">
          Only the first {MAX_SLOTS} targets are scheduled; {unscheduled} {unscheduled === 1 ? 'is' : 'are'} not.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="it-start" className="block text-p-t1 font-normal text-sm mb-1">Imaging can start at</label>
          <input
            id="it-start"
            ref={startBox}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="HH:MM"
            maxLength={12}
            aria-describedby="it-start-hint"
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
      <p id="it-start-hint" className="mt-1 text-p-t1/70 font-normal text-sm" data-testid="itinerary-start-hint">
        24-hour time, such as 21:30. Default: night start, {formatTime(night.start as Date)}.
      </p>
      {startError && (
        <p role="status" className="mt-2 bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm" data-testid="itinerary-start-error">
          Use 24-hour time, such as 21:30. The last good time is kept.
        </p>
      )}
      {plan.startNote && (
        <p role="status" className="mt-2 bg-p-warn-fill/15 border border-p-warn/40 rounded px-3 py-2 text-p-warn-text font-normal text-sm" data-testid="itinerary-start-note">
          {plan.startNote}
        </p>
      )}
      {plan.why !== null && (
        <p className="mt-4 text-p-t1 font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid="itinerary-why">
          {plan.why}
        </p>
      )}
      <p className="text-p-t1/70 font-normal text-sm min-h-10 max-md:min-h-[7.5rem]" data-testid="itinerary-totals">
        {shown.length === 0
          ? 'No slots yet.'
          : `Light ${lightMinutes(plan)} min · changeover ${Math.round(totals.changeoverMin)} · waiting ${Math.round(totals.waitMin)} · ${totals.ends ? `ends ${formatTime(totals.ends)}` : 'nothing scheduled'}`}
      </p>

      <div className="mt-4">
        <Collapsible id="night-graph" title="Night graph">
          <NightTimeline plan={plan} inputs={inputs} night={night} site={site} horizon={horizon} minAltitude={minAltitude} formatTime={formatTime} nightWord={nightWord} />
        </Collapsible>
      </div>

      {shown.length === 0 ? (
        <p className="mt-2 text-p-t1 font-normal text-sm">No targets in the plan yet. Add one from Find a target.</p>
      ) : (
        <ol className="mt-2 space-y-3" aria-label="Night timeline, in order">
          {shown.map((s, k) => {
            const it = items[k];
            const timed = s.end.getTime() > s.start.getTime();
            return (
              <li key={s.id} className="rounded-lg border border-p-line/15 bg-p-bg/50 p-4" data-testid={`slot-${s.id}`}>
                <div className="flex flex-col md:flex-row md:flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-p-t1 font-normal text-base">
                    {k + 1}. {s.name}
                  </h3>
                  <p className="text-p-t1 text-sm tabular-nums" data-testid={`slot-time-${k}`}>
                    {timed ? `${formatTime(s.start)} to ${formatTime(s.end)}` : 'no time'}
                  </p>
                </div>
                {/* The preset is chosen on the target's row; the slot says so only when the numbers are Custom or do not work tonight. */}
                {(presetUsed?.has(s.id) || it.overrides !== undefined) && (
                  <p className="mt-2 text-p-t1 text-sm" data-testid={`slot-preset-${s.id}`}>
                    {presetUsed?.has(s.id) ? (
                      // The Custom numbers do not work on this night: the reason names the number that fails.
                      <span className="text-p-warn-strong text-sm" data-testid={`it-preset-used-${s.id}`}>
                        {presetUsed.get(s.id)}
                      </span>
                    ) : (
                      <>Custom exposure (from {presetLabel(it.mode)}).</>
                    )}
                  </p>
                )}
                <p className="mt-2 text-p-t1 font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid={`slot-light-${k}`}>
                  {s.subSeconds !== null && s.subCount !== null
                    ? `${s.subSeconds} s × ${s.subCount} subs = ${Math.round(s.integrationMin * 10) / 10} min.`
                    : timed
                      ? `Short video clips, about ${Math.round(s.integrationMin)} min. See the Solar system checklist.`
                      : 'No imaging is planned for this slot.'}{' '}
                  {k > 0 && timed ? `Before it: ${s.changeover.minutes} min.` : ''}
                </p>
                {differsFromRow(s, rowNumbers?.get(s.id)) && (
                  <p className="mt-1 text-p-t1/70 font-normal text-sm" data-testid={`slot-why-sub-${s.id}`}>
                    {slotSubReason(s, rowNumbers!.get(s.id)!)}
                  </p>
                )}
                {/* The chips for the most that can appear together (three) are reserved invisibly, so a change of order or filter moves nothing. */}
                <div className="mt-1 grid">
                  <div className="[grid-area:1/1] flex flex-wrap items-start gap-2" data-testid={`slot-chips-${k}`}>
                    {s.warnings.map((w) => (
                      <Chip key={w.code} severity={w.severity} label={w.label} />
                    ))}
                  </div>
                  <div className="[grid-area:1/1] invisible flex flex-wrap items-start gap-2" aria-hidden="true">
                    {worst.map((w) => (
                      <Chip key={w.label} severity={w.severity} label={w.label} />
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  <div className="grow min-w-[12rem]">
                    <label htmlFor={`it-note-${s.id}`} className="block text-p-t1/70 text-sm mb-0.5">Note for {s.name}</label>
                    <WrapText
                      id={`it-note-${s.id}`}
                      maxLength={MAX_NOTE_CHARS}
                      className={`${field} min-h-11 w-full`}
                      value={it.note}
                      onChange={(e) => update(s.id, { note: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn44} aria-pressed={detailSlot?.id === s.id} aria-label={`Details for ${s.name}`} onClick={() => setDetailId(s.id)}>
                      Details
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn44} disabled={shown.length === 0} onClick={() => download('fpo-planner-itinerary.csv', itineraryToCsv(plan, makeCsvTime(timeZone)), 'text/csv;charset=utf-8', true)}>
          Export timeline (CSV)
        </button>
        <button type="button" className={btn44} disabled={shown.length === 0} onClick={() => download('fpo-planner-itinerary.json', itineraryToJson(plan), 'application/json')}>
          Export timeline (JSON)
        </button>
      </div>

      {detailSlot && (
        <div className="mt-4 grid rounded-lg border border-p-line/15 bg-p-bg/40 p-4" role="region" aria-label="Slot details" data-testid="slot-detail">
          <div className="[grid-area:1/1]" aria-live="polite">
            <Detail
              heading={`Slot ${shown.indexOf(detailSlot) + 1} details: ${detailSlot.name}`}
              changeover={shown.indexOf(detailSlot) === 0 ? [] : detailSlot.changeover.parts}
              window={detailSlot.window ? `Usable window ${formatTime(detailSlot.window.start)} to ${formatTime(detailSlot.window.end)}.` : 'No usable window left for this slot.'}
              altitude={altitudeText(detailSlot)}
              warnings={detailSlot.warnings}
            />
          </div>
          <div className="[grid-area:1/1] invisible" aria-hidden="true" inert>
            <Detail
              heading={`Slot 8 details: ${longestName}`}
              changeover={[
                { label: 'slew and centre', minutes: 88 },
                { label: 'setup change', minutes: 88 },
                { label: 'filter change', minutes: 88 },
                { label: 'refocus', minutes: 88 },
              ]}
              window="Usable window 88:88 to 88:88."
              altitude="Altitude 88° SSW, 88° SSW, 88° SSW; past peak, falling."
              warnings={worst}
            />
          </div>
        </div>
      )}
    </div>
  );
}
