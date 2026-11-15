'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_TARGETS } from '@/planner/ai/facts';
import type { AstronomicalNight } from '@/planner/astro';
import { MAX_SLOTS } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import { slotInputFor } from '@/planner/itinerary/resolve';
import type { SlotTarget } from '@/planner/itinerary/resolve';
import type { Profile, TrainEntry } from '@/planner/profile';
import { buildAiPlanBody, RequestTooLargeError } from '@/planner/ai/body';
import type { AiPlanForm, PlanTarget } from '@/planner/ai/body';
import type { AiPlanResult } from '@/planner/ai/plan';
import {
  NETWORK_PROBLEM,
  TIMEOUT_PROBLEM,
  UNREADABLE_PROBLEM,
  clockOfIso,
  itineraryFromAiPlan,
  minutesBetween,
  plainText,
  problemFor,
  readResult,
  timelinePlanOf,
} from '@/planner/ai/view';
import type { AiProblem } from '@/planner/ai/view';
import NightTimeline from './NightTimeline';

export const AI_PLAN_URL = '/api/planner/ai-plan';
/** A little over the route's own 120 s: when the page stops waiting. */
export const CLIENT_TIMEOUT_MS = 130_000;

const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40 aria-disabled:opacity-40';

export interface AiPlanPanelProps {
  /** Everything of the request except the targets; null when the page cannot plan (no night, no site). */
  base: Omit<AiPlanForm, 'targets'> | null;
  /** The open plan's fixed-position targets, in the plan's order. */
  targets: readonly PlanTarget[];
  /** Why there is nothing to send yet, in words for the user; null when there is. */
  blocked: string | null;
  /** What the open plan holds that the AI plan leaves out (planets, targets past the limit); empty when nothing. */
  leftOutNote: string;
  profile: Profile;
  train: TrainEntry;
  siteName: string;
  nightWord: string;
  night: AstronomicalNight | null;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  /** Shown only to the owner. */
  owner: boolean;
  /** For tests: stands in for the browser's fetch. */
  fetchPlan?: typeof fetch;
  /** Puts the AI plan's order, presets and first start into the open plan; answers true when the plan took it, false when the page refused it. */
  onApply: (items: ItineraryItem[], startTime: string | null) => Promise<boolean>;
}

type Run = 'idle' | 'loading' | 'cancelled' | 'superseded' | 'error';

interface Done {
  result: AiPlanResult;
  /** What the request was made from, part by part, to say what changed since. */
  parts: Record<string, string>;
  names: ReadonlyMap<string, string>;
  items: ItineraryItem[];
  startTime: string | null;
}

const UNREADABLE = Symbol('unreadable');

const PART_LABELS: Record<string, string> = { night: 'the night', site: 'the site', train: 'the train', plan: 'the plan', sky: 'the horizon or minimum altitude' };

/** The request as the page would send it now, split by what the user chose: the stale marker names what moved. */
function partsOf(form: AiPlanForm, train: TrainEntry): Record<string, string> {
  return {
    night: form.date,
    site: JSON.stringify([form.site, form.timeZone, form.bortle ?? null]),
    train: JSON.stringify([train.id, train.kind === 'optical' ? (train.filterId ?? null) : null, form.rig ?? null]),
    plan: form.targets.map((t) => t.id).join(','),
    sky: JSON.stringify([form.horizon, form.minAltitude]),
  };
}

const CHECKED_TEXT =
  'Checked by code against the sky facts: every slot is above your minimum altitude and clear of your horizon at every minute, no slots overlap, none crosses the meridian, and every target is either in the plan or left out. The AI decided the order, the times, how long each target gets and the reasons you read here; the code decides none of that, it only checks.';

const FRAMES_NOTE = 'Frame counts and sub lengths come from the exposure rules when you use this plan; they are not shown here.';

export default function AiPlanPanel({ base, targets, blocked, leftOutNote, profile, train, siteName, nightWord, night, catalogTargets, formatTime, owner, fetchPlan, onApply }: AiPlanPanelProps) {
  const [run, setRun] = useState<Run>('idle');
  const [problem, setProblem] = useState<AiProblem | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [review, setReview] = useState(false);
  // "applied": the open plan took the AI plan; "kept": the page refused it (said in a notice). Null: not offered yet.
  const [applyNote, setApplyNote] = useState<'applied' | 'kept' | null>(null);
  // The request in flight: its controller and the inputs it was made from. A new controller, or null, makes any earlier answer ignored.
  const flight = useRef<{ controller: AbortController; key: string } | null>(null);

  const form = useMemo((): AiPlanForm | null => (base !== null && blocked === null ? { ...base, targets } : null), [base, targets, blocked]);
  const prepared = useMemo((): { parts: Record<string, string>; key: string; tooLarge: string | null } | null => {
    if (form === null) return null;
    try {
      buildAiPlanBody(form, false);
    } catch (e) {
      if (e instanceof RequestTooLargeError) return { parts: {}, key: '', tooLarge: e.message };
      throw e;
    }
    const parts = partsOf(form, train);
    return { parts, key: JSON.stringify(parts), tooLarge: null };
  }, [form, train]);
  const key = prepared?.key ?? null;

  // The inputs change while the AI is working: that answer would be for a night the page no longer shows. Stop waiting for it and say so.
  useEffect(() => {
    const f = flight.current;
    if (f && f.key !== key) {
      f.controller.abort();
      flight.current = null;
      setRun('superseded');
    }
  }, [key]);
  useEffect(() => () => flight.current?.controller.abort(), []);

  // Focus follows the work: the Plan button goes disabled when planning starts, so Cancel takes focus; when it ends Cancel is gone,
  // so focus goes back to the Plan button (unless the user already moved it somewhere else).
  const planButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasLoading = useRef(false);
  const loadingNow = run === 'loading';
  useEffect(() => {
    if (loadingNow) {
      cancelButton.current?.focus();
    } else if (wasLoading.current) {
      const a = document.activeElement;
      if (a === null || a === document.body || a === planButton.current) planButton.current?.focus();
    }
    wasLoading.current = loadingNow;
  }, [loadingNow]);

  const disabledReason = blocked ?? prepared?.tooLarge ?? null;

  const send = async () => {
    if (form === null || prepared === null || prepared.tooLarge !== null) return;
    flight.current?.controller.abort();
    const controller = new AbortController();
    flight.current = { controller, key: prepared.key };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);
    const current = () => flight.current?.controller === controller;
    setRun('loading');
    setProblem(null);
    setDone(null);
    setApplyNote(null);
    const fail = (p: AiProblem) => {
      flight.current = null;
      setProblem(p);
      setRun('error');
    };
    try {
      const res = await (fetchPlan ?? fetch)(AI_PLAN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(buildAiPlanBody(form, owner && review)),
        signal: controller.signal,
      });
      if (!current()) return;
      if (!res.ok) {
        const message = await res.json().then((b: { error?: unknown }) => (typeof b?.error === 'string' ? b.error : ''), () => '');
        if (current()) fail(problemFor(res.status, res.headers.get('Retry-After'), message));
        return;
      }
      // A 200 that is not JSON (a proxy's HTML page) is an unreadable answer, not a failed connection.
      const json: unknown = await res.json().catch((e: unknown) => (controller.signal.aborted ? Promise.reject(e) : UNREADABLE));
      if (!current()) return;
      const result = json === UNREADABLE ? null : readResult(json);
      if (result === null) return fail(UNREADABLE_PROBLEM);
      const { items, startTime } = itineraryFromAiPlan(result, train.id, train.kind === 'optical' ? (train.filterId ?? null) : null);
      flight.current = null;
      setDone({ result, parts: prepared.parts, names: new Map(form.targets.map((t) => [t.id, t.name])), items, startTime });
      setRun('idle');
    } catch (e) {
      if (!current()) return;
      if (controller.signal.aborted && timedOut) fail(TIMEOUT_PROBLEM);
      else if (e instanceof RequestTooLargeError) fail({ text: e.message, retry: false });
      else fail(NETWORK_PROBLEM);
    } finally {
      clearTimeout(timer);
    }
  };

  const cancel = () => {
    flight.current?.controller.abort();
    flight.current = null;
    setRun('cancelled');
  };

  const loading = run === 'loading';
  const stale = done !== null && prepared !== null ? Object.keys(PART_LABELS).filter((k) => done.parts[k] !== prepared.parts[k]) : done !== null ? Object.keys(PART_LABELS) : [];
  const status =
    loading
      ? `Planning ${nightWord}. The AI can take a minute or two.`
      : run === 'cancelled'
        ? 'Cancelled. Nothing was changed.'
        : run === 'superseded'
          ? `You changed something while the AI was working, so its answer was dropped. Plan again to use your new choices.`
          : done !== null
            ? `Plan ready for ${nightWord}: ${done.result.plan.plan.length} ${done.result.plan.plan.length === 1 ? 'target' : 'targets'} planned, ${done.result.plan.cut.length} left out. ${done.result.status === 'verified' ? 'Checked by code.' : 'Not fully checked.'}`
            : '';

  const section = 'bg-black/70 rounded-lg border border-white/10 p-4 sm:p-6';
  return (
    <section aria-labelledby="ai-plan-heading" className={section}>
      <h2 id="ai-plan-heading" tabIndex={-1} className="text-xl font-light text-white tracking-[0.15em] mb-3 scroll-mt-24 focus:outline-none">
        PLAN MY NIGHT WITH AI
      </h2>
      <p className="text-white/80 font-normal text-sm">
        The AI picks the order, the times and how long each target gets, for the targets in the open plan, in the order they are listed. It uses the night, site, train, horizon and minimum altitude already chosen above; there is nothing to set again here. The Moon and planets (solar system) are not included.
      </p>
      {form !== null && (
        <p className="mt-2 text-white/70 font-normal text-sm" data-testid="ai-inputs">
          Will plan {nightWord} at {siteName}, with {train.name}, minimum altitude {form.minAltitude}°{form.horizon && form.horizon.length > 1 ? ', and your horizon' : ''}, for {Math.min(targets.length, MAX_TARGETS)} {targets.length === 1 ? 'target' : 'targets'} from the plan.
        </p>
      )}
      {leftOutNote !== '' && <p className="mt-1 text-white/70 font-normal text-sm" data-testid="ai-left-out-note">{leftOutNote}</p>}

      {owner && (
        <label className="mt-3 flex min-h-11 items-center gap-2 text-white/90 font-normal text-sm">
          <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="h-5 w-5 accent-sky-400" />
          Also ask the AI to review the plan (owner only; takes longer)
        </label>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button ref={planButton} type="button" className={btn44} onClick={() => void send()} disabled={disabledReason !== null || loading} aria-describedby={disabledReason !== null ? 'ai-plan-reason' : undefined}>
          Plan my night with AI
        </button>
        {loading && (
          <button ref={cancelButton} type="button" className={btn44} onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {disabledReason !== null && (
        <p id="ai-plan-reason" className="mt-2 text-white/80 font-normal text-sm" data-testid="ai-plan-reason">
          {disabledReason}
        </p>
      )}

      <p aria-live="polite" aria-busy={loading} className="mt-3 min-h-6 text-white font-normal text-sm" data-testid="ai-status">
        {status}
      </p>
      {run === 'error' && problem !== null && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-3 rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="ai-problem">
          <span className="min-w-0 break-words">{problem.text}</span>
          {problem.retry && (
            <button type="button" className={btn44} onClick={() => void send()} disabled={disabledReason !== null}>
              Retry
            </button>
          )}
        </div>
      )}

      {done !== null && (
        <Result
          done={done}
          stale={stale}
          profile={profile}
          train={train}
          base={base}
          night={night}
          catalogTargets={catalogTargets}
          formatTime={formatTime}
          applyNote={applyNote}
          nightWord={nightWord}
          onApply={() => void onApply(done.items, done.startTime).then((applied) => setApplyNote(applied ? 'applied' : 'kept'))}
        />
      )}
    </section>
  );
}

function Result({
  done,
  stale,
  profile,
  train,
  base,
  night,
  catalogTargets,
  formatTime,
  nightWord,
  applyNote,
  onApply,
}: {
  done: Done;
  stale: string[];
  profile: Profile;
  train: TrainEntry;
  base: AiPlanPanelProps['base'];
  night: AstronomicalNight | null;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  nightWord: string;
  applyNote: 'applied' | 'kept' | null;
  onApply: () => void;
}) {
  const { result, names, items } = done;
  const verified = result.status === 'verified';
  const slots = [...result.plan.plan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nameOf = (id: string) => names.get(id) ?? id;
  const say = (m: string) => plainText(m, names);
  const exposureOf = (id: string) => result.plan.exposures.find((e) => e.id === id);
  const inputs = useMemo(() => items.map((it) => slotInputFor(it, profile, catalogTargets)), [items, profile, catalogTargets]);
  const timeline = useMemo(
    () => (base !== null && night !== null ? timelinePlanOf({ items, inputs, result, site: base.site, horizon: base.horizon, minAltitude: base.minAltitude, night }) : null),
    [items, inputs, result, base, night],
  );
  const cutWhy = (id: string): string =>
    result.warnings.some((w) => w.kind === 'cut-fits-free-time' && w.id === id)
      ? 'The AI left it out, but the checker found free time where it could still fit (see the notes below).'
      : 'The AI judged it did not fit this night alongside the targets above.';
  const last = result.lastTarget;
  const applyBlock =
    !verified
      ? 'This plan was not fully checked, so it cannot be used as your plan.'
      : train.kind !== 'optical'
        ? 'Pick an optical train at the top of the page: a smart scope plans its own exposures.'
        : slots.length === 0
          ? 'This plan has no slots.'
          : slots.length > MAX_SLOTS
            ? `The night timeline schedules at most ${MAX_SLOTS} targets and this AI plan has ${slots.length}. Remove a target from the plan and plan again.`
            : stale.length > 0
              ? 'This plan is out of date. Plan again first.'
              : null;

  return (
    <div className="mt-3 space-y-4" data-testid="ai-result">
      {stale.length > 0 && (
        <p role="status" className="rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="ai-stale">
          Out of date: you changed {stale.map((k) => PART_LABELS[k]).join(' and ')} after this plan was made. Plan again to match.
        </p>
      )}
      <p className={`rounded border px-3 py-2 font-normal text-sm ${verified ? 'border-sky-300/40 text-white/90' : 'border-orange-300/40 bg-orange-400/15 text-orange-100'}`} data-testid="ai-checked">
        {verified ? CHECKED_TEXT : `Not fully checked: after ${result.repairRounds} ${result.repairRounds === 1 ? 'try' : 'tries'} to fix it, the code still found problems with this plan (listed below). Treat it as a rough draft. The AI decided the order, times and exposures; the code only checks.`}
      </p>

      <div>
        <h3 className="text-white font-normal text-base mb-2">Your night, in order</h3>
        {slots.length === 0 ? (
          <p className="text-white/90 font-normal text-sm">The AI planned no slots for this night.</p>
        ) : (
          <ol className="space-y-2" aria-label="AI plan, in time order">
            {slots.map((s, i) => {
              const exp = exposureOf(s.id);
              const isLast = i === slots.length - 1 && last !== null && last.id === s.id;
              return (
                <li key={`${s.id}-${s.start}`} className="rounded border border-white/15 p-3 text-sm font-normal text-white/90" data-testid={`ai-slot-${i}`}>
                  <p className="text-white">
                    {i + 1}. {nameOf(s.id)} <span className="tabular-nums">{clockOfIso(s.start)} to {clockOfIso(s.end)}</span> <span className="text-white/70">({minutesBetween(s.start, s.end)} min)</span>
                  </p>
                  <p className="text-white/80">
                    {exp ? `The AI wants about ${Math.round(exp.minutes)} min of light for this target.` : 'No exposure was given for this target.'}
                    {s.exposureMinutes !== undefined ? ` It plans ${Math.round(s.exposureMinutes)} min of light in this slot.` : ''}
                  </p>
                  {isLast && last !== null && (
                    <p className="mt-1">
                      <span className="text-white/70">Last slot, {last.usefulness === 'useful' ? 'worth shooting' : last.usefulness === 'marginal' ? 'marginal' : 'not worth shooting'}: </span>
                      {last.reason}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2 text-white/70 font-normal text-sm" data-testid="ai-frames-note">
          {FRAMES_NOTE}
        </p>
        {result.plan.notes && (
          <p className="mt-2 text-white/90 font-normal text-sm" data-testid="ai-notes">
            <span className="text-white/70">The AI&apos;s notes: </span>
            {result.plan.notes}
          </p>
        )}
      </div>

      <div>
        <h3 className="text-white font-normal text-base mb-2">Left out ({result.plan.cut.length})</h3>
        {result.plan.cut.length === 0 ? (
          <p className="text-white/90 font-normal text-sm">Nothing: every target fits.</p>
        ) : (
          <ul className="space-y-1" data-testid="ai-cut">
            {result.plan.cut.map((id) => (
              <li key={id} className="text-sm font-normal text-white/90">
                <span className="text-white">{nameOf(id)}.</span> {cutWhy(id)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(result.violations.length > 0 || result.warnings.length > 0 || result.flips > 0) && (
        <div>
          <h3 className="text-white font-normal text-base mb-2">What the checker found</h3>
          <ul className="space-y-2" data-testid="ai-checker">
            {result.violations.map((v, i) => (
              <li key={`v${i}`} className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-orange-300/60 px-1.5 py-0.5 text-xs font-medium text-orange-200">Problem</span>
                {say(v.message)}
              </li>
            ))}
            {result.flips > 0 && (
              <li className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-xs font-medium text-sky-200">Note</span>
                {result.flips} {result.flips === 1 ? 'slot crosses' : 'slots cross'} the meridian, so the mount flips during {result.flips === 1 ? 'it' : 'them'}.
              </li>
            )}
            {result.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-xs font-medium text-sky-200">Note</span>
                {say(w.message)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.repairError && <p className="text-white/80 font-normal text-sm">The AI could not finish fixing the plan, so this is the best it came up with.</p>}
      {result.quality && (
        <p className="text-white/90 font-normal text-sm" data-testid="ai-quality">
          <span className="text-white/70">The AI&apos;s own review ({result.quality.good ? 'good' : 'has a concern'}): </span>
          {result.quality.verdict}
          {result.quality.issue ? ` Concern: ${result.quality.issue}` : ''}
          {result.quality.repaired ? ' The plan above is the corrected one.' : ''}
        </p>
      )}
      {result.qualityError && <p className="text-white/80 font-normal text-sm">The review could not be completed.</p>}

      {timeline !== null && base !== null && night !== null && slots.length > 0 && (
        <div>
          <h3 className="text-white font-normal text-base mb-2">Night graph</h3>
          <NightTimeline plan={timeline} inputs={inputs} night={night} site={base.site} horizon={base.horizon} minAltitude={base.minAltitude} formatTime={formatTime} nightWord={nightWord} idPrefix="ai-timeline" />
        </div>
      )}

      <div>
        <button type="button" className={btn44} onClick={onApply} disabled={applyBlock !== null} aria-describedby="ai-apply-note">
          Use this plan
        </button>
        <p id="ai-apply-note" className="mt-1 text-white/70 font-normal text-xs" data-testid="ai-apply-note">
          {applyBlock ??
            (applyNote === 'applied'
              ? 'Done: the open plan now has this AI plan\u2019s order, first start time, and every target keeps its own exposure (its preset, or its custom numbers). Targets the AI left out follow them. The AI\u2019s times and exact lengths are not kept: the night timeline times each target again with its own estimate, so its times will not match the AI plan above. The code check above covers the AI\u2019s times, not the timeline\u2019s: the timeline shows its own flip and window notes.'
              : applyNote === 'kept'
                ? 'The open plan was left as it was.'
                : 'This sets the open plan\u2019s order, first start time, and every target keeps its own exposure (its preset, or its custom numbers). Targets the AI left out follow them. The AI\u2019s times and exact lengths are not kept: the night timeline times each target again with its own estimate, so its times will not match the AI plan above. The code check above covers the AI\u2019s times, not the timeline\u2019s: the timeline shows its own flip and window notes.')}
        </p>
      </div>
    </div>
  );
}
