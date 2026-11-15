'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AstronomicalNight, Site } from '@/planner/astro';
import { MAX_NIGHTS, usefulRangeOf } from '@/planner/campaign';
import type { CampaignInput, CampaignNight, CampaignResult, SubjectResult } from '@/planner/campaign';
import { isCancelled, startCampaign } from '@/planner/campaign/run';
import type { CampaignRun, CampaignRunOptions } from '@/planner/campaign/run';
import { campaignInputOf, itineraryFromNight, lowAltitudeNotes, timelinePlanOfNight } from '@/planner/campaign/view';
import type { CampaignTargetIn, TargetLimits } from '@/planner/campaign/view';
import type { HorizonPoint } from '@/planner/horizon';
import { MAX_SLOTS, TREND_TEXT } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { slotInputFor } from '@/planner/itinerary/resolve';
import type { SlotTarget } from '@/planner/itinerary/resolve';
import type { Profile, TrainEntry } from '@/planner/profile';
import { nightDateText } from './catalogText';
import DisclosureChevron from './DisclosureChevron';
import NightTimeline from './NightTimeline';
import WrapSelect from './WrapSelect';

const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 aria-disabled:opacity-40';
const field = 'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';

export const DEFAULT_NIGHTS = 3;

export interface CampaignBase {
  site: Site;
  timeZone: string;
  horizon: readonly HorizonPoint[] | null;
  minAltitude: number;
  /** The chosen evening: the first night. */
  date: string;
}

export interface CampaignPanelProps {
  /** Everything of the plan the page already chose; null when the page cannot plan (no site or train). */
  base: CampaignBase | null;
  /** My plan's fixed targets in the user's priority order. */
  targets: readonly CampaignTargetIn[];
  /** Why there is nothing to plan yet, in words for the user; null when there is. */
  blocked: string | null;
  /** What My plan holds that this plan leaves out (planets, targets not in the catalog); empty when nothing. */
  leftOutNote: string;
  profile: Profile;
  train: TrainEntry;
  siteName: string;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  /** For tests: stands in for the browser's Worker. */
  createWorker?: CampaignRunOptions['createWorker'];
  /** Moves the page's Evening of, which is how a used night's date reaches the itinerary's clocks. */
  onUseDate: (date: string) => void;
  /** Offers a night to the itinerary; answers true when it took it, false when the user kept their own. */
  onApply: (items: ItineraryItem[], startTime: string | null, label: string) => Promise<boolean>;
}

type Run = 'idle' | 'loading' | 'cancelled' | 'superseded' | 'error';

/** What one limit box holds, as typed. */
interface LimitText {
  hours: string;
  min: string;
  max: string;
}
const NO_TEXT: LimitText = { hours: '', min: '', max: '' };

interface Done {
  id: number;
  input: CampaignInput;
  result: CampaignResult;
  /** What the run was made from, part by part, to say what changed since. */
  parts: Record<string, string>;
  trainId: string;
  filterId: string | null;
  names: ReadonlyMap<string, string>;
}

const PART_LABELS: Record<string, string> = {
  night: 'the first night',
  nights: 'the number of nights',
  site: 'the site',
  train: 'the train',
  plan: 'My plan',
  limits: 'a limit',
  sky: 'the horizon or minimum altitude',
};

const DECIDED_TEXT =
  'Code decided all of this: fixed rules, run in your browser. Nothing here comes from an AI, there is no cost and no sign-in. The rules: make as many targets useful as each night holds, keeping your order when they cannot all fit; spend any time left lengthening targets toward their most useful length; then avoid meridian flips and prefer higher altitude. A target that cannot reach a useful length is cut and named, not given a token slot.';

const STATUS_WORD: Record<SubjectResult['status'], string> = { full: 'Full', useful: 'Useful', cut: 'Cut' };

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Reads the limit boxes: the limits the engine takes, and a message for every box it would refuse. */
export function readLimits(texts: Readonly<Record<string, LimitText>>, ids: readonly string[]): { limits: Record<string, TargetLimits>; errors: Record<string, string> } {
  const limits: Record<string, TargetLimits> = {};
  const errors: Record<string, string> = {};
  for (const id of ids) {
    const t = texts[id] ?? NO_TEXT;
    const out: TargetLimits = {};
    const hours = t.hours.trim();
    if (hours !== '') {
      const h = Number(hours);
      // The engine's own rule: positive, a whole number of 5-minute steps.
      if (!Number.isFinite(h) || h <= 0 || (h * 60) % 5 !== 0) errors[id] = 'Hours per night must be more than 0 and a multiple of 5 minutes, such as 2 or 1.5.';
      else out.hoursPerNight = h;
    }
    const lo = t.min.trim();
    const hi = t.max.trim();
    if (lo !== '' || hi !== '') {
      const a = Number(lo);
      const b = Number(hi);
      if (lo === '' || hi === '') errors[id] = 'Fill in both the least and the most useful minutes, or leave both empty.';
      else if (![a, b].every((x) => Number.isInteger(x) && x > 0 && x % 5 === 0) || a > b) errors[id] = 'Useful minutes must be whole multiples of 5, with the least no more than the most.';
      else out.useful = { minMin: a, maxMin: b };
    }
    if (out.hoursPerNight !== undefined || out.useful !== undefined) limits[id] = out;
  }
  return { limits, errors };
}

export default function CampaignPanel({ base, targets, blocked, leftOutNote, profile, train, siteName, catalogTargets, formatTime, createWorker, onUseDate, onApply }: CampaignPanelProps) {
  const [nights, setNights] = useState(DEFAULT_NIGHTS);
  const [texts, setTexts] = useState<Record<string, LimitText>>({});
  const [run, setRun] = useState<Run>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  // Which night was offered to the itinerary, and what came of it. Null: not offered yet.
  const [applyNote, setApplyNote] = useState<{ night: number; kind: 'applied' | 'kept' } | null>(null);
  // The date a used night moved Evening of to. The result stays tied to its own first night, so that move is not a change the user made.
  const [movedTo, setMovedTo] = useState<string | null>(null);
  // The run in flight and the inputs it was made from. A new run, or null, makes any earlier answer ignored.
  const flight = useRef<{ run: CampaignRun; key: string } | null>(null);
  const doneCount = useRef(0);

  const ids = useMemo(() => targets.map((t) => t.id), [targets]);
  const { limits, errors } = useMemo(() => readLimits(texts, ids), [texts, ids]);
  const limitsProblem = Object.keys(errors).length > 0;

  const input = useMemo(
    (): CampaignInput | null =>
      base === null || blocked !== null || limitsProblem
        ? null
        : campaignInputOf({ targets, limits, site: base.site, timeZone: base.timeZone, horizon: base.horizon, minAltitude: base.minAltitude, startDate: base.date, nights }),
    [base, blocked, limitsProblem, targets, limits, nights],
  );
  const parts = useMemo((): Record<string, string> | null => {
    if (base === null || blocked !== null) return null;
    return {
      night: base.date,
      nights: String(nights),
      site: JSON.stringify([base.site, base.timeZone]),
      train: JSON.stringify([train.id, train.kind === 'optical' ? (train.filterId ?? null) : null]),
      plan: ids.join(','),
      limits: JSON.stringify(limits),
      sky: JSON.stringify([base.horizon, base.minAltitude]),
    };
  }, [base, blocked, nights, train, ids, limits]);
  const key = parts === null ? null : JSON.stringify(parts);

  // The inputs change while the plan is being made: that answer would be for a night the page no longer shows. Stop and say so.
  useEffect(() => {
    const f = flight.current;
    if (f && f.key !== key) {
      f.run.cancel();
      flight.current = null;
      setRun('superseded');
    }
  }, [key]);
  useEffect(() => () => flight.current?.run.cancel(), []);

  // Focus follows the work: the Plan button goes disabled when planning starts, so Cancel takes focus; when it ends Cancel is gone,
  // so focus goes back to the Plan button (unless the user already moved it somewhere else).
  const planButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasLoading = useRef(false);
  const loading = run === 'loading';
  useEffect(() => {
    if (loading) {
      cancelButton.current?.focus();
    } else if (wasLoading.current) {
      const a = document.activeElement;
      if (a === null || a === document.body || a === planButton.current) planButton.current?.focus();
    }
    wasLoading.current = loading;
  }, [loading]);

  const disabledReason = blocked ?? (limitsProblem ? 'A limit below is not valid yet. Fix it, or empty it, to plan.' : null) ?? (base === null ? 'The site or train is not ready.' : null);

  const send = () => {
    if (input === null || parts === null || key === null) return;
    flight.current?.run.cancel();
    const started = startCampaign(input, { createWorker });
    flight.current = { run: started, key };
    const current = () => flight.current?.run === started;
    setRun('loading');
    setProblem(null);
    setDone(null);
    setApplyNote(null);
    setMovedTo(null);
    const snapshot = { input, parts, trainId: train.id, filterId: train.kind === 'optical' ? (train.filterId ?? null) : null, names: new Map(targets.map((t) => [t.id, t.name])) };
    started.result.then(
      (result) => {
        if (!current()) return;
        flight.current = null;
        setDone({ id: ++doneCount.current, result, ...snapshot });
        setRun('idle');
      },
      (e: unknown) => {
        if (isCancelled(e) || !current()) return;
        console.error('Several-night plan failed:', e);
        flight.current = null;
        setProblem('The several-night plan could not be made. Nothing was changed. Try again.');
        setRun('error');
      },
    );
  };

  const cancel = () => {
    flight.current?.run.cancel();
    flight.current = null;
    setRun('cancelled');
  };

  const stale = done !== null && parts !== null ? Object.keys(PART_LABELS).filter((k) => done.parts[k] !== parts[k] && !(k === 'night' && parts[k] === movedTo)) : done !== null ? Object.keys(PART_LABELS) : [];
  const firstNight = base === null ? '' : nightDateText(base.date);
  const status = loading
    ? `Planning ${plural(nights, 'night', 'nights')} from ${firstNight}. This runs in your browser and takes a few seconds.`
    : run === 'cancelled'
      ? 'Cancelled. Nothing was changed.'
      : run === 'superseded'
        ? 'You changed something while the plan was being made, so its answer was dropped. Plan again to use your new choices.'
        : done !== null
          ? `Plan ready for ${plural(done.result.nights.length, 'night', 'nights')}: ${summaryOf(done.result)}`
          : '';

  const section = 'bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6';
  return (
    <section aria-labelledby="campaign-heading" className={section}>
      <h2 id="campaign-heading" tabIndex={-1} className="text-xl font-light text-white tracking-[0.15em] mb-3 scroll-mt-24 focus:outline-none">
        PLAN SEVERAL NIGHTS
      </h2>
      <p className="text-white/80 font-normal text-sm">
        Spreads My plan over several nights in your order of priority: what does not fit one night rolls to the next, until each target has a useful amount of light or the nights run out. The first night is the evening chosen above, and the site, train, horizon and minimum altitude are the ones chosen above; there is nothing to set again here except the number of nights and, if you want them, the limits per target. The Moon and planets (solar system) are not included.
      </p>

      <div className="mt-3 max-w-xs">
        <label htmlFor="campaign-nights" className="block text-white/90 font-normal text-sm mb-1">Number of nights</label>
        <WrapSelect id="campaign-nights" className="w-full" value={String(nights)} onChange={(e) => setNights(Number(e.target.value))}>
          {Array.from({ length: MAX_NIGHTS }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </WrapSelect>
      </div>

      {base !== null && blocked === null && (
        <p className="mt-2 text-white/70 font-normal text-sm" data-testid="campaign-inputs">
          Will plan {plural(nights, 'night', 'nights')} from {firstNight} at {siteName}, with {train.name}, minimum altitude {base.minAltitude}°{base.horizon && base.horizon.length > 1 ? ', and your horizon' : ''}, for {plural(targets.length, 'target', 'targets')} from My plan.
        </p>
      )}
      {leftOutNote !== '' && <p className="mt-1 text-white/70 font-normal text-sm" data-testid="campaign-left-out-note">{leftOutNote}</p>}

      {targets.length > 0 && (
        <details className="group mt-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded text-sm font-normal text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400 [&::-webkit-details-marker]:hidden">
            <DisclosureChevron />
            Limits per target (optional)
          </summary>
          <div className="mt-2 space-y-3" data-testid="campaign-limits">
            <p className="text-white/70 font-normal text-sm">
              Leave a box empty to use the default. The useful range is the least and the most minutes of light a target is worth; its default comes from the type of object.
            </p>
            {targets.map((t) => {
              const text = texts[t.id] ?? NO_TEXT;
              const range = usefulRangeOf({ id: t.id, name: t.name, targets: [t], ...(t.type === undefined ? {} : { type: t.type }) });
              const set = (patch: Partial<LimitText>) => setTexts((prev) => ({ ...prev, [t.id]: { ...(prev[t.id] ?? NO_TEXT), ...patch } }));
              const err = errors[t.id];
              return (
                <div key={t.id} className="rounded border border-white/15 p-3" data-testid={`campaign-limit-${t.id}`}>
                  <p className="text-white font-normal text-sm break-words">{t.name}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label htmlFor={`campaign-hours-${t.id}`} className="block text-white/90 font-normal text-sm mb-1">Hours per night, at most</label>
                      <input id={`campaign-hours-${t.id}`} inputMode="decimal" className={`${field} min-h-11 w-full`} value={text.hours} placeholder="no limit" onChange={(e) => set({ hours: e.target.value })} aria-invalid={err !== undefined} aria-describedby={err ? `campaign-err-${t.id}` : undefined} />
                    </div>
                    <div>
                      <label htmlFor={`campaign-min-${t.id}`} className="block text-white/90 font-normal text-sm mb-1">Useful from (min)</label>
                      <input id={`campaign-min-${t.id}`} inputMode="numeric" className={`${field} min-h-11 w-full`} value={text.min} placeholder={String(range.minMin)} onChange={(e) => set({ min: e.target.value })} aria-invalid={err !== undefined} aria-describedby={err ? `campaign-err-${t.id}` : undefined} />
                    </div>
                    <div>
                      <label htmlFor={`campaign-max-${t.id}`} className="block text-white/90 font-normal text-sm mb-1">Full at (min)</label>
                      <input id={`campaign-max-${t.id}`} inputMode="numeric" className={`${field} min-h-11 w-full`} value={text.max} placeholder={String(range.maxMin)} onChange={(e) => set({ max: e.target.value })} aria-invalid={err !== undefined} aria-describedby={err ? `campaign-err-${t.id}` : undefined} />
                    </div>
                  </div>
                  {err && (
                    <p id={`campaign-err-${t.id}`} className="mt-2 text-orange-200 font-normal text-sm">
                      {err}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button ref={planButton} type="button" className={btn44} onClick={send} disabled={disabledReason !== null || loading} aria-describedby={disabledReason !== null ? 'campaign-reason' : undefined}>
          Plan {plural(nights, 'night', 'nights')}
        </button>
        {loading && (
          <button ref={cancelButton} type="button" className={btn44} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {disabledReason !== null && (
        <p id="campaign-reason" className="mt-2 text-white/80 font-normal text-sm" data-testid="campaign-reason">
          {disabledReason}
        </p>
      )}

      <p aria-live="polite" aria-busy={loading} className="mt-3 min-h-6 text-white font-normal text-sm" data-testid="campaign-status">
        {status}
      </p>
      {run === 'error' && problem !== null && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="campaign-problem">
          <span className="min-w-0 break-words">{problem}</span>
          <button type="button" className={btn44} onClick={send} disabled={disabledReason !== null}>
            Retry
          </button>
        </div>
      )}

      {done !== null && (
        <Result
          key={done.id}
          done={done}
          stale={stale}
          profile={profile}
          train={train}
          catalogTargets={catalogTargets}
          formatTime={formatTime}
          applyNote={applyNote}
          currentDate={base?.date ?? ''}
          onUseDate={(date) => {
            setMovedTo(date);
            onUseDate(date);
          }}
          onApply={(night, items, startTime, date) =>
            void onApply(items, startTime, `night ${night} of the several-night plan`).then((applied) => {
              if (applied) {
                setMovedTo(date);
                onUseDate(date);
              }
              setApplyNote({ night, kind: applied ? 'applied' : 'kept' });
            })
          }
        />
      )}
    </section>
  );
}

/** "3 of 4 targets reach a useful length (1 of them full), 1 cut." */
function summaryOf(result: CampaignResult): string {
  const total = result.perSubject.length;
  const full = result.perSubject.filter((p) => p.status === 'full').length;
  const useful = result.perSubject.filter((p) => p.status !== 'cut').length;
  const cut = total - useful;
  return `${useful} of ${plural(total, 'target', 'targets')} reach a useful length${full > 0 ? ` (${full} full)` : ''}, ${cut} cut.`;
}

const minutesOn = (n: CampaignNight): number => n.slots.reduce((a, s) => a + s.integrationMin, 0);

function Result({
  done,
  stale,
  profile,
  train,
  catalogTargets,
  formatTime,
  applyNote,
  currentDate,
  onUseDate,
  onApply,
}: {
  done: Done;
  stale: string[];
  profile: Profile;
  train: TrainEntry;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  applyNote: { night: number; kind: 'applied' | 'kept' } | null;
  currentDate: string;
  onUseDate: (date: string) => void;
  onApply: (night: number, items: ItineraryItem[], startTime: string | null, date: string) => void;
}) {
  const { result, names, input } = done;
  const nameOf = (id: string) => names.get(id) ?? id;
  const [open, setOpen] = useState<readonly number[]>([0]);
  const cut = result.cutLine;
  const subjects = new Map(input.subjects.map((s) => [s.id, s]));

  return (
    <div className="mt-3 space-y-4" data-testid="campaign-result">
      {stale.length > 0 && (
        <p role="status" className="rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="campaign-stale">
          Out of date: you changed {stale.map((k) => PART_LABELS[k]).join(' and ')} after this plan was made. Plan again to match.
        </p>
      )}
      <p className="rounded border border-sky-300/40 px-3 py-2 text-white/90 font-normal text-sm" data-testid="campaign-decided">
        {DECIDED_TEXT}
      </p>

      <div>
        <h3 className="text-white font-normal text-base mb-2">Your targets over {plural(result.nights.length, 'night', 'nights')}</h3>
        <ol className="space-y-2" aria-label="Targets, in your order of priority" data-testid="campaign-targets">
          {result.perSubject.map((p) => {
            const range = usefulRangeOf(subjects.get(p.subjectId) as CampaignInput['subjects'][number]);
            const isFirstCut = cut.firstCutId === p.subjectId;
            return (
              <li key={p.subjectId} className="space-y-2">
                {isFirstCut && (
                  <p className="rounded border border-orange-300/50 bg-orange-400/10 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="campaign-cut-line">
                    <span className="font-medium">Cut line.</span> {cut.lastFitId === null ? '' : 'Targets above this line get a useful amount of light; from here down, some do not. '}{cut.text ?? ''}
                  </p>
                )}
                <div className="rounded border border-white/15 p-3 text-sm font-normal text-white/90" data-testid={`campaign-target-${p.subjectId}`}>
                  <p className="text-white break-words">
                    {nameOf(p.subjectId)} <span className="text-white/70">({STATUS_WORD[p.status]})</span>
                  </p>
                  <p className="tabular-nums">
                    {p.totalMin} min of light over {plural(p.nightsUsed, 'night', 'nights')}
                  </p>
                  <p className="text-white/80">
                    {p.status === 'full'
                      ? `Full: it reached its most useful length (${range.maxMin} min).`
                      : p.status === 'useful'
                        ? `Useful: enough to process (from ${range.minMin} min); more would help up to ${range.maxMin} min.`
                        : `Cut: it never reached ${range.minMin} min, the least that is useful. ${p.reason?.text ?? ''}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        {cut.firstCutId === null && (
          <p className="mt-2 text-white/90 font-normal text-sm" data-testid="campaign-no-cut">
            Nothing is cut: every target reaches a useful length.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-white font-normal text-base mb-2">Night by night</h3>
        <ol className="space-y-2" aria-label="Nights, in order">
          {result.nights.map((n, i) => {
            const isOpen = open.includes(i);
            const bodyId = `campaign-night-${i + 1}`;
            return (
              <li key={n.date} className="rounded border border-white/15" data-testid={`campaign-night-${i + 1}`}>
                <h4 className="text-white font-normal text-sm">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={bodyId}
                    onClick={() => setOpen(isOpen ? open.filter((x) => x !== i) : [...open, i])}
                    className="flex min-h-11 w-full items-start gap-2 rounded px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
                  >
                    <span aria-hidden="true" className="w-4 shrink-0 text-white/70">{isOpen ? '▾' : '▸'}</span>
                    <span className="min-w-0 break-words">
                      Night {i + 1}, {nightDateText(n.date)}
                      <span className="text-white/70">
                        {n.start === null ? ' · no usable darkness' : ` · ${plural(n.slots.length, 'target', 'targets')}, ${minutesOn(n)} min of light`}
                      </span>
                    </span>
                  </button>
                </h4>
                <div id={bodyId} hidden={!isOpen} className="px-3 pb-3">
                  {isOpen && (
                    <NightBody
                      night={n}
                      number={i + 1}
                      done={done}
                      profile={profile}
                      train={train}
                      catalogTargets={catalogTargets}
                      formatTime={formatTime}
                      applyNote={applyNote?.night === i + 1 ? applyNote.kind : null}
                      stale={stale.length > 0}
                      currentDate={currentDate}
                      onUseDate={onUseDate}
                      onApply={onApply}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function NightBody({
  night,
  number,
  done,
  profile,
  train,
  catalogTargets,
  formatTime,
  applyNote,
  stale,
  currentDate,
  onUseDate,
  onApply,
}: {
  night: CampaignNight;
  number: number;
  done: Done;
  profile: Profile;
  train: TrainEntry;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  applyNote: 'applied' | 'kept' | null;
  stale: boolean;
  currentDate: string;
  onUseDate: (date: string) => void;
  onApply: (night: number, items: ItineraryItem[], startTime: string | null, date: string) => void;
}) {
  const { input, names } = done;
  const nameOf = (id: string) => names.get(id) ?? id;
  const dark = night.start !== null && night.end !== null;
  const offer = useMemo(() => itineraryFromNight(night, number, done.trainId, done.filterId, input.timeZone ?? ''), [night, number, done.trainId, done.filterId, input.timeZone]);
  const inputs = useMemo(() => offer.items.map((it) => slotInputFor(it, profile, catalogTargets)), [offer, profile, catalogTargets]);
  const plan = useMemo(() => timelinePlanOfNight(night, offer.items, inputs, input.site, input.horizon, input.minAltitude), [night, offer, inputs, input]);
  const graphNight: AstronomicalNight | null = dark ? { kind: 'normal', start: night.start, end: night.end } : null;
  const notScheduled = night.outcomes.filter((o) => o.slot === null);

  const applyBlock = !dark
    ? 'This night has no usable darkness, so there is nothing to use.'
    : train.kind !== 'optical'
      ? 'Pick an optical train at the top of the page: a smart scope plans its own exposures.'
      : night.slots.length === 0
        ? 'This night has no slots.'
        : night.slots.length > MAX_SLOTS
          ? `An itinerary holds at most ${MAX_SLOTS} slots and this night has ${night.slots.length}.`
          : stale
            ? 'This plan is out of date. Plan again first.'
            : null;
  const noteId = `campaign-apply-note-${number}`;

  if (!dark) {
    return (
      <p className="text-white/90 font-normal text-sm" data-testid={`campaign-night-${number}-dark`}>
        No usable darkness on {nightDateText(night.date)}: {(night.outcomes.find((o) => o.reason !== null)?.reason?.text ?? night.cutLine.text ?? 'there is no astronomical night on this date.').replace(/\d{4}-\d{2}-\d{2}/g, nightDateText)}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-white/90 font-normal text-sm" data-testid={`campaign-night-${number}-dark`}>
        Dark from {formatTime(night.start as Date)} to {formatTime(night.end as Date)} ({night.packing.nightMin} min): {night.packing.usedMin} min in slots, {night.packing.slewMin} min of slewing and centring between them, {night.packing.leftMin} min free.
      </p>
      {night.slots.length === 0 ? (
        <p className="text-white/90 font-normal text-sm">No target is scheduled this night.</p>
      ) : (
        <ol className="space-y-2" aria-label={`Night ${number}, in time order`}>
          {night.slots.map((s, i) => {
            const slot = plan.slots[i];
            const notes = lowAltitudeNotes(slot);
            return (
              <li key={s.subjectId} className="rounded border border-white/15 p-3 text-sm font-normal text-white/90" data-testid={`campaign-slot-${number}-${i}`}>
                <p className="text-white break-words">
                  {i + 1}. {nameOf(s.subjectId)} <span className="tabular-nums">{formatTime(s.start)} to {formatTime(s.end)}</span> <span className="text-white/70">({s.integrationMin} min of light)</span>
                </p>
                <p className="text-white/80">
                  Averages {Math.round(s.meanAltitude)}° up
                  {slot.altitudes ? `: ${Math.round(slot.altitudes.start.altitude)}° ${slot.altitudes.start.direction} to ${Math.round(slot.altitudes.end.altitude)}° ${slot.altitudes.end.direction}, ${TREND_TEXT[slot.altitudes.trend]}.` : '.'}
                </p>
                {s.flip && (
                  <p className="mt-1">
                    <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-xs font-medium text-sky-200">Note</span>
                    The target crosses the meridian during this slot, so the mount flips: {s.flipMin} min of the slot are for the flip.
                  </p>
                )}
                {notes.map((t) => (
                  <p key={t} className="mt-1">
                    <span className="mr-2 rounded border border-orange-300/60 px-1.5 py-0.5 text-xs font-medium text-orange-200">Warning</span>
                    {t}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
      {notScheduled.length > 0 && (
        <div>
          <p className="text-white font-normal text-sm">Not scheduled this night</p>
          <ul className="mt-1 space-y-1" data-testid={`campaign-night-${number}-left`}>
            {notScheduled.map((o) => (
              <li key={o.subjectId} className="text-sm font-normal text-white/90 break-words">
                <span className="text-white">{nameOf(o.subjectId)}.</span> {o.reason?.text ?? 'It already has its most useful length.'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {night.cutLine.text !== null && (
        <p className="text-white/90 font-normal text-sm" data-testid={`campaign-night-${number}-cut`}>
          <span className="text-white/70">This night&apos;s cut line: </span>
          {night.cutLine.text}
        </p>
      )}

      {graphNight !== null && night.slots.length > 0 && (
        <div>
          <p className="text-white font-normal text-sm mb-2">Night graph</p>
          <NightTimeline plan={plan} inputs={inputs} night={graphNight} site={input.site} horizon={input.horizon} minAltitude={input.minAltitude} formatTime={formatTime} nightWord={nightDateText(night.date)} idPrefix={`campaign-timeline-${number}`} />
        </div>
      )}

      <div>
        <button type="button" className={btn44} onClick={() => onApply(number, offer.items, offer.startTime, night.date)} disabled={applyBlock !== null} aria-describedby={noteId} data-testid={`campaign-apply-${number}`}>
          Use night {number} as my itinerary
        </button>
        <p id={noteId} className="mt-1 text-white/70 font-normal text-xs" data-testid={noteId}>
          {applyBlock ??
            (applyNote === 'applied'
              ? `Done: your itinerary below now holds this night’s order, first start time and, for each slot, the closest exposure mode to its length. It does not keep the plan’s slot times or exact lengths: the itinerary times each slot again with its own estimate, so its times will not match the ones above. ${
                  night.date === currentDate
                    ? `Evening of at the top of the page is now ${nightDateText(night.date)}, so the itinerary describes this night.`
                    : `Evening of at the top of the page is ${currentDate ? nightDateText(currentDate) : 'not set'}, and the itinerary is timed on that evening, not on ${nightDateText(night.date)}.`
                }`
              : applyNote === 'kept'
                ? 'Your itinerary was left as it was.'
                : `This replaces your night itinerary below with this night’s order, first start time and, for each slot, the closest exposure mode to its length. The plan’s slot times and exact lengths are not kept: the itinerary times each slot again with its own estimate, so its times will not match the ones above.${night.date !== currentDate ? ` It also sets Evening of at the top of the page to ${nightDateText(night.date)}, so the itinerary describes this night.` : ''}`)}
        </p>
        {applyNote === 'applied' && night.date !== currentDate && (
          <button type="button" className={`${btn44} mt-2`} onClick={() => onUseDate(night.date)} data-testid={`campaign-use-date-${number}`}>
            Set Evening of to {nightDateText(night.date)}
          </button>
        )}
      </div>
    </div>
  );
}
