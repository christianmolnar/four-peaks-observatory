'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import type { CatalogIndex } from '@/planner/catalog/search';
import { MODE_ORDER } from '@/planner/exposure';
import { presetLabel } from './rowExposure';
import type { ExposureMode } from '@/planner/exposure';
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
import { EXACT_MAX_SLOTS, orderKey, suggestOrderSteps } from '@/planner/itinerary/suggest';
import type { OrderSuggestion } from '@/planner/itinerary/suggest';
import { itineraryToCsv, itineraryToJson, makeCsvTime } from '@/planner/export';
import { slotInputFor } from '@/planner/itinerary/resolve';
import type { Profile } from '@/planner/profile';
import NightTimeline from './NightTimeline';
import WrapSelect from './WrapSelect';
import WrapText from './WrapText';
import { download } from './download';

export interface ItinerarySectionProps {
  profile: Profile;
  /** The open plan's targets as slots, in the plan's order, all on the plan's train and its filter. */
  items: ItineraryItem[];
  /** The plan's "imaging can start at"; null: when the night starts. */
  startTime: string | null;
  /** The slots (target ids) whose Custom numbers do not work, each with the plain reason naming the number that fails: they are scheduled with the preset's own numbers, and the slot says so. */
  presetUsed?: ReadonlyMap<string, string>;
  /** Targets of the plan past the first MAX_SLOTS: the timeline schedules no more, and says so. */
  unscheduled: number;
  /** A change made here: the slots in their new order and the new start time. The plan keeps them. */
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
  report?: MutableRefObject<ItineraryReport | null>;
}

/** What the print sheet and the exports need of the timeline. */
export interface ItineraryReport {
  plan: ItineraryPlan;
}


const fieldBox = 'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal focus:outline-none focus:ring-2 focus:ring-sky-400';
const field = `${fieldBox} text-sm`;
const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 aria-disabled:opacity-40';

/** How long the order search works before it lets the page paint and take input. */
const SEARCH_SLICE_MS = 10;

/** What the advice box says when the order is already the best the search found. */
export const unchangedAdviceText = (exhaustive: boolean): string =>
  exhaustive
    ? 'Your order is already the best: the most light, and the targets as high as they can be. Nothing to move.'
    : `Best order found. With more than ${EXACT_MAX_SLOTS} targets not every order is tried, so a better one may exist. Nothing better turned up.`;

function Chip({ severity, label }: { severity: 'warning' | 'note'; label: string }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${severity === 'warning' ? 'border-orange-300/60 text-orange-200' : 'border-sky-300/50 text-sky-200'}`}>
      {severity === 'warning' ? 'Warning' : 'Note'}: {label.toLowerCase()}
    </span>
  );
}

function Detail({
  heading,
  changeover,
  window: win,
  warnings,
}: {
  heading: string;
  changeover: { label: string; minutes: number }[];
  window: string;
  warnings: { severity: 'warning' | 'note'; text: string }[];
}) {
  const total = changeover.reduce((s, p) => s + p.minutes, 0);
  return (
    <div>
      <h3 className="text-white font-normal text-base mb-2">{heading}</h3>
      <p className="text-white/90 font-normal text-sm">
        {changeover.length === 0 ? 'Before this slot: nothing (setup happens before the first slot and is not counted).' : `Before this slot: ${changeover.map((p) => `${p.label} ${p.minutes} min`).join(', ')}; ${total} min in all (estimate).`}
      </p>
      <p className="text-white/90 font-normal text-sm mt-1">{win}</p>
      <ul className="mt-2 space-y-2">
        {warnings.length === 0 && <li className="text-sm font-normal text-white/70">No warnings for this slot.</li>}
        {warnings.map((w) => (
          <li key={w.text} className="text-sm font-normal text-white/90">
            <span className={`mr-2 rounded border px-1.5 py-0.5 text-xs font-medium ${w.severity === 'warning' ? 'border-orange-300/60 text-orange-200' : 'border-sky-300/50 text-sky-200'}`}>
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
 * The slots, their order, their presets and the start time belong to the plan; this shows the times and takes edits (a preset, a note, the
 * start, a removal, the suggested order) back to it. Subs and counts come from the exposure module; every time and number here is an
 * estimate.
 */
export default function ItinerarySection({ profile, items, startTime, presetUsed, unscheduled, onChange, catalog, site, night, horizon, minAltitude, bortle, formatTime, nightWord, timeZone, report }: ItinerarySectionProps) {
  // What is being typed in the start box; null: show the plan's start time.
  const [startDraft, setStartDraft] = useState<string | null>(null);
  // The start box complains when it is left or Enter is pressed, or when the text can no longer become a time; not on a half-typed "2".
  const [startChecked, setStartChecked] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const focusNext = useRef<string | null>(null);
  const startBox = useRef<HTMLInputElement>(null);
  const selectStart = useRef(false);

  const commit = (next: ItineraryItem[], focusId: string | null = null, nextStart: string | null = startTime) => {
    focusNext.current = focusId;
    onChange(next, nextStart);
  };
  // After "Use night start" the box text is selected, so the next digit replaces it instead of adding to it.
  useEffect(() => {
    if (selectStart.current) startBox.current?.select();
    selectStart.current = false;
  }, [startTime, startDraft]);
  useEffect(() => {
    if (focusNext.current) document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  }, [items]);

  /** "21:30", "2130", "905" or "9:05" become a saved 24 h time; empty goes back to the night start; anything else is left in the box with a message. */
  const startError = startDraft !== null && startDraft.trim() !== '' && clockFromText(startDraft) === null && (startChecked || !couldBecomeClock(startDraft));
  const changeStart = (text: string, typed: boolean) => {
    // Any three-digit value typed or deleted while the box has focus ("213" on the way to 2130, or left by a Backspace from 2130) is
    // held: it is saved when the box is left or Enter is pressed. A pasted three-digit value is saved at once, as are four digits and colon forms.
    const holdThirdDigit = typed && isThreeDigits(text);
    setStartDraft(text);
    setStartChecked(false);
    if (text.trim() === '') return commit([...items], null, null);
    const clock = clockFromText(text);
    if (clock && !holdThirdDigit) commit([...items], null, clock);
  };
  /** Leaving the box or pressing Enter: a time that works shows the saved value again; one that does not stays in the box with its message. */
  const settleStart = () => {
    if (startDraft === null || startDraft.trim() === '' || clockFromText(startDraft) !== null) {
      const clock = startDraft === null ? null : clockFromText(startDraft);
      if (clock && clock !== startTime) commit([...items], null, clock);
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
  // The order advice: the search covers every order up to 8 slots, in small steps between frames so typing and taps never wait
  // for it. A note does not change the order, so the search is keyed on the slots without their notes and does not run again
  // when only a note changes. `adviceFor` changes exactly when the search has to run again; advice made for an older one is not shown.
  const searchKey = orderKey(items);
  const adviceFor = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchKey stands for the items, minus notes
    [searchKey, site, night, horizon, minAltitude, bortle, startAt, formatTime, profile, windows],
  );
  const [advice, setAdvice] = useState<{ for: object; value: OrderSuggestion } | null>(null);
  useEffect(() => {
    if (!buildInput || !plan || items.length < 2) return;
    const steps = suggestOrderSteps(buildInput, { currentPlan: plan });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The search starts after the page has painted and takes turns with it, about 10 ms at a time, so typing and taps never wait for it.
    const run = () => {
      const until = performance.now() + SEARCH_SLICE_MS;
      for (;;) {
        const r = steps.next();
        if (r.done) return setAdvice({ for: adviceFor, value: r.value });
        if (performance.now() >= until) break;
      }
      timer = setTimeout(run, 0);
    };
    timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- adviceFor stands for everything the search reads
  }, [adviceFor]);
  const suggestion = items.length >= 2 && advice?.for === adviceFor ? advice.value : null;
  useEffect(() => {
    if (report) report.current = plan ? { plan } : null;
  }, [report, plan]);

  const update = (id: string, patch: Partial<ItineraryItem>) => commit(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const useOrder = () => {
    if (!suggestion?.changed) return;
    const byId = new Map(items.map((i) => [i.id, i]));
    commit(suggestion.order.map((id) => byId.get(id) as ItineraryItem), 'it-order-advice');
  };
  const remove = (id: string) => {
    commit(items.filter((i) => i.id !== id), 'it-start');
    if (detailId === id) setDetailId(null);
  };

  if (night.kind !== 'normal' || plan === null) {
    return <p className="text-white/90 font-normal text-sm">There is no astronomical night on this date, so there is nothing to schedule.</p>;
  }

  const shown: Slot[] = plan.slots;
  const detailSlot = shown.find((s) => s.id === detailId) ?? shown[0];
  const longestName = shown.reduce((n, s) => (s.name.length > n.length ? s.name : n), 'Orion Nebula');
  const worst = worstCaseWarningTexts(longestName);
  const totals = plan.totals;

  return (
    <div>
      <p className="text-white/80 font-normal text-sm">
        Slots run in the order below, one after the other. Each starts when the one before is done and the changeover is over, or when its target clears your horizon, whichever is later. Times, subs and overhead are estimates for {nightWord}, not predictions. Setup (30 minutes) happens before the first slot and is not counted.
      </p>

      {unscheduled > 0 && (
        <p className="mt-2 text-white/90 font-normal text-sm" data-testid="timeline-unscheduled">
          The timeline schedules the first {MAX_SLOTS} targets of the plan; {unscheduled} more {unscheduled === 1 ? 'is' : 'are'} not scheduled.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="it-start" className="block text-white/90 font-normal text-sm mb-1">Imaging can start at</label>
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
        <button type="button" className={btn44} disabled={startTime === null} onMouseDown={(e) => e.preventDefault() /* keep focus in the start box, so a held value is not saved on the way */} onClick={() => { selectStart.current = document.activeElement === startBox.current; setStartDraft(null); commit(items, null, null); }}>
          Use night start
        </button>
      </div>
      <p id="it-start-hint" className="mt-1 text-white/70 font-normal text-xs" data-testid="itinerary-start-hint">
        24-hour time, such as 2130 or 21:30. Setup (30 min) is done before this time. Default: when the astronomical night starts, {formatTime(night.start as Date)}. Times are in the site&apos;s time zone.
      </p>
      {startError && (
        <p role="status" className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm" data-testid="itinerary-start-error">
          Type the start as 24-hour hours and minutes, such as 2130 or 21:30. The plan keeps the last time that worked.
        </p>
      )}
      {plan.startNote && (
        <p role="status" className="mt-2 bg-orange-400/15 border border-orange-300/40 rounded px-3 py-2 text-orange-100 font-normal text-sm" data-testid="itinerary-start-note">
          {plan.startNote}
        </p>
      )}
      <p className="mt-4 text-white font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid="itinerary-why">
        <span className="text-white/70">Why this order: </span>
        {plan.why}
      </p>
      <p className="text-white/80 font-normal text-sm min-h-10 max-md:min-h-[7.5rem]" data-testid="itinerary-totals">
        {shown.length === 0
          ? 'No slots yet.'
          : `Light ${lightMinutes(plan)} min, changeover ${Math.round(totals.changeoverMin)} min, waiting ${Math.round(totals.waitMin)} min; ${totals.filterChanges} filter ${totals.filterChanges === 1 ? 'change' : 'changes'}, ${totals.trainChanges} train ${totals.trainChanges === 1 ? 'change' : 'changes'}; ${totals.ends ? `ends ${formatTime(totals.ends)}` : 'nothing scheduled'}. All estimates.`}
      </p>

      <div id="it-order-advice" tabIndex={-1} aria-live="polite" className="mt-3 rounded-lg border border-white/15 bg-black/40 p-4 focus:outline-none focus:ring-2 focus:ring-sky-400" data-testid="order-advice">
        <h3 className="text-white font-normal text-base mb-1">Suggested order</h3>
        {items.length < 2 ? (
          <p className="text-white/90 font-normal text-sm">Add two or more targets to the plan to get advice on their order.</p>
        ) : suggestion === null ? (
          <p className="text-white/90 font-normal text-sm" data-testid="order-advice-searching">Looking for a better order...</p>
        ) : !suggestion.changed ? (
          <p className="text-white/90 font-normal text-sm" data-testid="order-advice-unchanged">{unchangedAdviceText(suggestion.searched.exhaustive)}</p>
        ) : (
          <>
            <ol className="space-y-1 text-white font-normal text-sm">
              {suggestion.steps.map((st, k) => (
                <li key={st.id}>
                  {k === 0 ? 'Put' : 'Then'} {st.name}{k === 0 ? ' first' : ''}: {st.reason}.
                </li>
              ))}
            </ol>
            <p className="mt-2 text-white/80 font-normal text-sm" data-testid="order-advice-gain">
              {suggestion.improves === 'light'
                ? suggestion.suggestedLightMin > suggestion.currentLightMin
                  ? `Light: ${suggestion.currentLightMin} min now, ${suggestion.suggestedLightMin} min in this order.`
                  : `Light is about the same (${suggestion.currentLightMin} min), a little more in this order.`
                : suggestion.improves === 'altitude'
                  ? `Same light (${suggestion.currentLightMin} min), with the targets higher in the sky.`
                  : `Same light (${suggestion.currentLightMin} min) and height; this order ends ${suggestion.suggestedEnds ? formatTime(suggestion.suggestedEnds) : 'sooner'} instead of ${suggestion.currentEnds ? formatTime(suggestion.currentEnds) : 'later'}.`}
            </p>
            {!suggestion.searched.exhaustive && <p className="mt-1 text-white/80 font-normal text-sm">Best order found. With more than {EXACT_MAX_SLOTS} targets not every order is tried.</p>}
            <button type="button" className={`${btn44} mt-2`} onClick={useOrder}>
              Use this order
            </button>
            <p className="mt-1 text-white/70 font-normal text-xs">Your order stays until you press the button.</p>
          </>
        )}
      </div>

      <div className="mt-4">
        <h3 className="text-white font-normal text-base mb-2">Night graph</h3>
        <NightTimeline plan={plan} inputs={inputs} night={night} site={site} horizon={horizon} minAltitude={minAltitude} formatTime={formatTime} nightWord={nightWord} />
      </div>

      {shown.length === 0 ? (
        <p className="mt-2 text-white/90 font-normal text-sm">No targets in the plan yet. Add one from Find a target.</p>
      ) : (
        <ol className="mt-2 space-y-3" aria-label="Night timeline, in order">
          {shown.map((s, k) => {
            const it = items[k];
            const timed = s.end.getTime() > s.start.getTime();
            return (
              <li key={s.id} className="rounded-lg border border-white/15 bg-black/50 p-4" data-testid={`slot-${s.id}`}>
                <div className="flex flex-col md:flex-row md:flex-wrap items-baseline justify-between gap-x-4">
                  <h3 className="text-white font-normal text-base">
                    {k + 1}. {s.name}
                  </h3>
                  <p className="text-white text-sm tabular-nums" data-testid={`slot-time-${k}`}>
                    {timed ? `${formatTime(s.start)} to ${formatTime(s.end)}` : 'no time'} <span className="text-white/70 text-xs">(estimate)</span>
                  </p>
                </div>
                <div className="mt-2 max-w-xs">
                  {it.overrides !== undefined || presetUsed?.has(s.id) ? (
                    // A Custom target keeps its own numbers; they are edited on the target's row in the plan, never here.
                    <p className="text-white/90 text-sm" data-testid={`it-custom-${s.id}`}>
                      Exposure preset for {s.name}: Custom (started from {presetLabel(it.mode)}). Change it on this target&apos;s row in the plan.
                      {it.overrides === undefined && (
                        <>
                          <br />
                          <span className="text-orange-200 text-xs" data-testid={`it-preset-used-${s.id}`}>
                            {presetUsed?.get(s.id)}
                          </span>
                        </>
                      )}
                    </p>
                  ) : (
                    <div>
                      <label htmlFor={`it-mode-${s.id}`} className="block text-white/70 text-xs mb-0.5">Exposure preset for {s.name}</label>
                      <WrapSelect id={`it-mode-${s.id}`} className="w-full" value={it.mode} onChange={(e) => update(s.id, { mode: e.target.value as ExposureMode })}>
                        {MODE_ORDER.map((m) => (
                          <option key={m} value={m}>{presetLabel(m)}</option>
                        ))}
                      </WrapSelect>
                    </div>
                  )}
                </div>
                <p className="mt-2 text-white/90 font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid={`slot-light-${k}`}>
                  {s.subSeconds !== null && s.subCount !== null
                    ? `Light: ${s.subSeconds} s x ${s.subCount} subs = ${Math.round(s.integrationMin * 10) / 10} min (estimate).`
                    : timed
                      ? `${s.name === 'Moon' ? 'Moon' : 'Solar system'}: short video clips, about ${Math.round(s.integrationMin)} min (estimate). See the checklist in the Solar system row of the list.`
                      : 'No imaging is planned for this slot.'}{' '}
                  {k > 0 && timed ? `Before it: ${s.changeover.minutes} min (estimate).` : ''}
                </p>
                <p className="mt-1 text-white/90 font-normal text-sm min-h-10 max-md:min-h-[5rem]" data-testid={`slot-altitude-${k}`}>
                  {s.altitudes
                    ? `Altitude: ${Math.round(s.altitudes.start.altitude)}° ${s.altitudes.start.direction} at the start, ${Math.round(s.altitudes.middle.altitude)}° ${s.altitudes.middle.direction} in the middle, ${Math.round(s.altitudes.end.altitude)}° ${s.altitudes.end.direction} at the end; ${TREND_TEXT[s.altitudes.trend]}.`
                    : 'Altitude: none, the slot has no time.'}
                </p>
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
                    <label htmlFor={`it-note-${s.id}`} className="block text-white/70 text-xs mb-0.5">Note for {s.name}</label>
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
                    <button type="button" className={btn44} aria-label={`Remove ${s.name}`} onClick={() => remove(s.id)}>
                      Remove
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
        <div className="mt-4 grid rounded-lg border border-white/15 bg-black/40 p-4" role="region" aria-label="Slot details" data-testid="slot-detail">
          <div className="[grid-area:1/1]" aria-live="polite">
            <Detail
              heading={`Slot ${shown.indexOf(detailSlot) + 1} details: ${detailSlot.name}`}
              changeover={shown.indexOf(detailSlot) === 0 ? [] : detailSlot.changeover.parts}
              window={detailSlot.window ? `Usable window ${formatTime(detailSlot.window.start)} to ${formatTime(detailSlot.window.end)} (computed).` : 'This target has no usable window left for this slot (computed).'}
              warnings={detailSlot.warnings}
            />
          </div>
          <div className="[grid-area:1/1] invisible" aria-hidden="true" inert>
            <Detail
              heading={`Slot 8 details: ${longestName}`}
              changeover={[
                { label: 'slew and centre', minutes: 88 },
                { label: 'train change', minutes: 88 },
                { label: 'filter change', minutes: 88 },
                { label: 'refocus', minutes: 88 },
              ]}
              window="Usable window 88:88 to 88:88 (computed)."
              warnings={worst}
            />
          </div>
        </div>
      )}
    </div>
  );
}
