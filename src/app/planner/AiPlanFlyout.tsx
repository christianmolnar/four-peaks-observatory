'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

export interface AiPlanFlyoutProps {
  /** Everything of the request except the targets; null when the page cannot plan (no night, no site). */
  base: Omit<AiPlanForm, 'targets'> | null;
  /** The open plan's fixed-position targets, in the plan's order. */
  targets: readonly PlanTarget[];
  /** Why there is nothing to send yet, in words for the user; null when there is. */
  blocked: string | null;
  /** The plan's site or train is gone from the gear: what is shown instead. The AI is not asked until the user keeps it or changes it. */
  staleNotes?: readonly { key: string; text: string; keepLabel: string; onKeep: () => void }[];
  /** Closes the flyout and focuses the page's Train control. */
  onChangeStale?: () => void;
  /** What the open plan holds that the AI plan leaves out (planets, targets past the limit); empty when nothing. */
  leftOutNote: string;
  profile: Profile;
  train: TrainEntry;
  siteName: string;
  nightWord: string;
  night: AstronomicalNight | null;
  /** The night in plain words (dark window, Moon), as the page shows it. */
  nightText: string;
  /** The horizon in plain words, as the page shows it. */
  horizonText: string;
  /** Each target's exposure preset as a label ("Balanced", "Custom"), by target id. */
  presetLabels: ReadonlyMap<string, string>;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  /** Shown only to the owner. */
  owner: boolean;
  /** For tests: stands in for the browser's fetch. */
  fetchPlan?: typeof fetch;
  /** Puts the AI plan's order and first start into the open plan; answers true when the plan took it, false when the page refused it. */
  onApply: (items: ItineraryItem[], startTime: string | null) => Promise<boolean>;
  /** The user closed the flyout. Nothing in the plan has changed unless "Use this plan" was pressed. */
  onClose: () => void;
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

const PART_LABELS: Record<string, string> = { night: 'the night', site: 'the site', train: 'the setup', plan: 'the plan', sky: 'the horizon or minimum altitude' };

/** The request as the page would send it now, split by what the user chose: the stale marker names what moved. */
function partsOf(form: AiPlanForm, train: TrainEntry): Record<string, string> {
  return {
    night: form.date,
    site: JSON.stringify([form.site, form.timeZone, form.bortle ?? null]),
    train: JSON.stringify([train.id, train.kind === 'optical' ? (train.filterId ?? null) : null, form.rig ?? null]),
    // The set of ids, not their order: the AI's plan reorders the open plan, and applying it must not make the result stale against itself.
    plan: form.targets.map((t) => t.id).sort().join(','),
    sky: JSON.stringify([form.horizon, form.minAltitude]),
  };
}

const CHECKED_TEXT =
  'Every slot is above your minimum altitude and clear of your horizon at every minute, no slots overlap, and every target is either in the plan or left out. The AI decided the order, the times, how much light each target gets and the reasons you read here; the code only checks them. Sub length and count are worked out by code when you use the plan. Meridian crossings, if any, are listed below.';

const FRAMES_NOTE = 'Frame counts and sub lengths come from the exposure rules when you use this plan; they are not shown here.';

type StepState = 'done' | 'now' | 'waiting' | 'failed';
const STEP_WORD: Record<StepState, string> = { done: 'done', now: 'now', waiting: 'waiting', failed: 'failed' };

function Step({ n, title, state, children }: { n: number; title: string; state: StepState; children?: ReactNode }) {
  return (
    <li aria-current={state === 'now' || state === 'failed' ? 'step' : undefined} className={`rounded border p-3 ${state === 'now' ? 'border-sky-300/60' : state === 'failed' ? 'border-orange-300/50' : 'border-white/15'}`} data-testid={`ai-step-${n}`} data-state={state}>
      <h3 className={`flex flex-wrap items-baseline gap-x-2 text-base font-normal ${state === 'waiting' ? 'text-white/60' : 'text-white'}`}>
        <span>{n}. {title}</span>
        <span className="text-sm text-white/70" data-testid={`ai-step-${n}-state`}>({STEP_WORD[state]})</span>
      </h3>
      {children !== undefined && <div className="mt-2 min-w-0 break-words">{children}</div>}
    </li>
  );
}

/**
 * "Plan my night with AI": a flyout over the plan (a side sheet on a wide screen, the whole screen on a phone). Three steps: the night as
 * the AI is given it, the AI ordering and timing the targets, the code checking every slot against the sky. It ends in a result; the open
 * plan changes only when "Use this plan" is pressed. Closing it stops any request in flight.
 */
export default function AiPlanFlyout({ base, targets, blocked, leftOutNote, staleNotes = [], onChangeStale = () => undefined, profile, train, siteName, nightWord, night, nightText, horizonText, presetLabels, catalogTargets, formatTime, owner, fetchPlan, onApply, onClose }: AiPlanFlyoutProps) {
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

  // Focus follows the work: the flyout's heading on opening; Cancel while the AI works; the heading again when the answer (or the error) is in.
  const heading = useRef<HTMLHeadingElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const wasLoading = useRef(false);
  const loadingNow = run === 'loading';
  useEffect(() => {
    if (loadingNow) {
      cancelButton.current?.focus();
    } else if (wasLoading.current) {
      const a = document.activeElement;
      if (a === null || a === document.body || a === cancelButton.current) heading.current?.focus();
    }
    wasLoading.current = loadingNow;
  }, [loadingNow]);
  useEffect(() => heading.current?.focus(), []);

  // The page behind is inert while the flyout is open: Tab and screen readers stay inside it, and Escape (heard here) always reaches it.
  const dialog = useRef<HTMLDivElement>(null);
  const closeRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const own = dialog.current;
    const made: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === own || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      made.push(el);
    }
    // Escape closes and Tab wraps from the document, so they still work when focus has dropped to the page body (a click on the backdrop, a wrap through the browser's own controls).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && own) {
        const items = Array.from(own.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')).filter((el) => el.closest('[hidden]') === null && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
        if (items.length === 0) return;
        const at = document.activeElement;
        const inside = at instanceof Node && own.contains(at);
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (!inside || at === first || at === heading.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (!inside || at === last)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      made.forEach((el) => el.removeAttribute('inert'));
    };
  }, []);

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
  const close = () => {
    flight.current?.controller.abort();
    flight.current = null;
    onClose();
  };
  closeRef.current = close;

  const loading = run === 'loading';
  const stale = done !== null && prepared !== null ? Object.keys(PART_LABELS).filter((k) => done.parts[k] !== prepared.parts[k]) : done !== null ? Object.keys(PART_LABELS) : [];
  const count = Math.min(targets.length, MAX_TARGETS);
  const noun = count === 1 ? 'target' : 'targets';
  const step1: StepState = loading || done !== null || run === 'error' ? 'done' : 'now';
  const step2: StepState = loading ? 'now' : run === 'error' ? 'failed' : done !== null ? 'done' : 'waiting';
  const step3: StepState = done !== null ? (done.result.status === 'verified' ? 'done' : 'failed') : 'waiting';
  const status =
    loading
      ? `Planning ${nightWord}. The AI can take a minute or two.`
      : run === 'cancelled'
        ? 'Cancelled. Nothing was changed.'
        : run === 'superseded'
          ? `You changed something while the AI was working, so its answer was dropped. Ask again to use your new choices.`
          : done !== null
            ? `Plan ready for ${nightWord}: ${done.result.plan.plan.length} ${done.result.plan.plan.length === 1 ? 'target' : 'targets'} planned, ${done.result.plan.cut.length} left out. ${done.result.status === 'verified' ? 'Checked by code.' : 'Not fully checked.'}`
            : '';
  const canAsk = disabledReason === null && !loading;
  const showAskAgain = done !== null || run === 'cancelled' || run === 'superseded' || (run === 'error' && problem?.retry === true);

  const applyBlock =
    done === null
      ? null
      : done.result.status !== 'verified'
        ? 'This plan was not fully checked, so it cannot be used as your plan.'
        : train.kind !== 'optical'
          ? 'Pick an optical setup at the top of the page: a smart scope plans its own exposures.'
          : done.result.plan.plan.length === 0
            ? 'This plan has no slots.'
            : done.result.plan.plan.length > MAX_SLOTS
              ? `The night timeline schedules at most ${MAX_SLOTS} targets and this AI plan has ${done.result.plan.plan.length}. Remove a target from the plan and ask again.`
              : stale.length > 0
                ? 'This plan is out of date. Ask again first.'
                : null;

  // On the body, so it sits above the site's fixed navigation whatever the page's own stacking.
  /** The short line above the buttons: why Use this plan is off, or what it did. */
  const footerNote =
    applyBlock ??
    (applyNote === 'applied' ? 'Done: the open plan now has this order and first start time.' : applyNote === 'kept' ? 'The open plan was left as it was.' : null);

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-plan-heading"
      data-testid="ai-flyout"
      className="planner-root fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white shadow-2xl print:hidden md:inset-y-0 md:left-auto md:right-0 md:w-[32rem] md:max-w-[90vw] md:border-l md:border-white/20"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <h2 id="ai-plan-heading" ref={heading} tabIndex={-1} className="mb-3 text-xl font-light tracking-[0.1em] text-white focus:outline-none">
          PLAN MY NIGHT WITH AI
        </h2>
        <p className="mb-3 text-sm font-normal text-white/80">
          The AI picks the order and the times for the targets in the open plan. Exposure (sub length, count) is worked out by code, not by the AI. Nothing in your plan changes until you press Use this plan.
        </p>
        <ol className="space-y-3" aria-label="Steps">
          <Step n={1} title="Checking the night" state={step1}>
            {form !== null ? (
              <ul className="space-y-1 text-sm font-normal text-white/90" data-testid="ai-inputs">
                <li>Night: {nightText.trim()}</li>
                <li>Site: {siteName}, minimum altitude {form.minAltitude}°.</li>
                <li>{horizonText}</li>
                <li>Setup: {train.name}.</li>
                <li>
                  {count} {noun}, in the plan&apos;s order:{' '}
                  {targets.slice(0, MAX_TARGETS).map((t, i) => (
                    <span key={t.id}>
                      {i > 0 ? ', ' : ''}
                      {t.name} ({presetLabels.get(t.id) ?? 'Balanced'})
                    </span>
                  ))}
                  .
                </li>
              </ul>
            ) : null}
            {staleNotes.map((n) => (
              <div key={n.key} className="mt-2 rounded border border-orange-300/50 bg-orange-400/15 p-2 text-sm font-normal text-orange-100" data-testid={`ai-stale-${n.key}`}>
                <p className="break-words">{n.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={`${btn44} max-w-full min-w-0 break-words text-left`} onClick={n.onKeep}>{n.keepLabel}</button>
                  <button type="button" className={btn44} onClick={onChangeStale}>Change</button>
                </div>
              </div>
            ))}
            {leftOutNote !== '' && <p className="mt-1 text-sm font-normal text-white/70" data-testid="ai-left-out-note">{leftOutNote}</p>}
            {disabledReason !== null && (
              <p id="ai-plan-reason" className="mt-1 text-sm font-normal text-orange-100" data-testid="ai-plan-reason">
                {disabledReason}
              </p>
            )}
            {owner && (
              <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-normal text-white/90">
                <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="h-5 w-5 shrink-0 accent-sky-400" />
                <span>Also ask the AI to review the plan (owner only; takes longer)</span>
              </label>
            )}
            {done === null && run === 'idle' && (
              <button type="button" className={`${btn44} mt-2`} onClick={() => void send()} disabled={!canAsk} aria-describedby={disabledReason !== null ? 'ai-plan-reason' : undefined}>
                Ask the AI to order and time {count} {noun}
              </button>
            )}
          </Step>

          <Step n={2} title={`Asking the AI to order and time ${count} ${noun}`} state={step2}>
            <p aria-live="polite" aria-busy={loading} className="min-h-6 text-sm font-normal text-white" data-testid="ai-status">
              {status}
            </p>
            {loading && (
              <button ref={cancelButton} type="button" className={`${btn44} mt-2`} onClick={cancel}>
                Cancel
              </button>
            )}
            {run === 'error' && problem !== null && (
              <div role="alert" className="mt-2 rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-sm font-normal text-orange-100" data-testid="ai-problem">
                {problem.text}
              </div>
            )}
          </Step>

          <Step n={3} title="Checking the plan against the sky" state={step3}>
            {done !== null ? (
              <p className={`rounded border px-3 py-2 text-sm font-normal ${done.result.status === 'verified' ? 'border-sky-300/40 text-white/90' : 'border-orange-300/40 bg-orange-400/15 text-orange-100'}`} data-testid="ai-checked">
                {done.result.status === 'verified'
                  ? `${done.result.repairRounds === 0 ? 'Passed. ' : `Repaired: the first answer failed the code's checks, so it was sent back ${done.result.repairRounds} ${done.result.repairRounds === 1 ? 'time' : 'times'}; the plan below is the corrected one and passes now. `}${CHECKED_TEXT}`
                  : `Not fully checked: after ${done.result.repairRounds} ${done.result.repairRounds === 1 ? 'try' : 'tries'} to fix it, the code still found problems with this plan (listed below). Treat it as a rough draft. The AI decided the order, times and light per target; the code only checks.`}
              </p>
            ) : null}
          </Step>
        </ol>

        {done !== null && (
          <Result
            done={done}
            stale={stale}
            profile={profile}
            base={base}
            night={night}
            catalogTargets={catalogTargets}
            formatTime={formatTime}
            nightWord={nightWord}
            presetLabels={presetLabels}
          />
        )}
        {done !== null && (
          <p id="ai-apply-explain" className="mt-4 text-sm font-normal text-white/70" data-testid="ai-apply-explain">
            Use this plan sets the open plan’s order and first start time, replacing the earlier times. Each target keeps its own exposure (its preset, or its custom numbers). Targets the AI left out follow the others. The night timeline times each target again with its own estimate, so its times can differ from the AI’s. The code check covers the AI’s times, not the timeline’s: the timeline shows its own flip and window notes.
          </p>
        )}
      </div>

      <div className="border-t border-white/20 bg-slate-950 p-3" data-testid="ai-footer">
        {done !== null && footerNote !== null && (
          <p id="ai-apply-note" className="mb-2 text-sm font-normal text-white/80" data-testid="ai-apply-note">
            {footerNote}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {done !== null && (
            <button
              type="button"
              className={btn44}
              onClick={() => void onApply(done.items, done.startTime).then((applied) => setApplyNote(applied ? 'applied' : 'kept'))}
              disabled={applyBlock !== null}
              aria-describedby={footerNote !== null ? 'ai-apply-note' : 'ai-apply-explain'}
            >
              Use this plan
            </button>
          )}
          {showAskAgain && (
            <button type="button" className={btn44} onClick={() => void send()} disabled={!canAsk}>
              Ask again
            </button>
          )}
          <button type="button" className={btn44} onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Result({
  done,
  stale,
  profile,
  base,
  night,
  catalogTargets,
  formatTime,
  nightWord,
  presetLabels,
}: {
  done: Done;
  stale: string[];
  profile: Profile;
  base: AiPlanFlyoutProps['base'];
  night: AstronomicalNight | null;
  catalogTargets: readonly SlotTarget[];
  formatTime: (d: Date) => string;
  nightWord: string;
  presetLabels: ReadonlyMap<string, string>;
}) {
  const { result, names, items } = done;
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

  return (
    <div className="mt-3 space-y-4" data-testid="ai-result">
      {stale.length > 0 && (
        <p role="status" className="rounded border border-orange-300/40 bg-orange-400/15 px-3 py-2 text-orange-100 font-normal text-sm" data-testid="ai-stale">
          Out of date: you changed {stale.map((k) => PART_LABELS[k]).join(' and ')} after this plan was made. Ask again to match.
        </p>
      )}
      <div>
        <h3 className="text-white font-normal text-base mb-2">The plan, in order</h3>
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
                    {i + 1}. {nameOf(s.id)} <span className="tabular-nums">{clockOfIso(s.start)} to {clockOfIso(s.end)}</span> <span className="text-white/70">({minutesBetween(s.start, s.end)} min, {presetLabels.get(s.id) ?? 'Balanced'})</span>
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
                <span className="mr-2 rounded border border-orange-300/60 px-1.5 py-0.5 text-sm font-medium text-orange-200">Problem</span>
                {say(v.message)}
              </li>
            ))}
            {result.flips > 0 && (
              <li className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-sm font-medium text-sky-200">Note</span>
                {result.flips} {result.flips === 1 ? 'slot crosses' : 'slots cross'} the meridian, so the mount flips during {result.flips === 1 ? 'it' : 'them'}.
              </li>
            )}
            {result.warnings.map((w, i) => (
              <li key={`w${i}`} className="text-sm font-normal text-white/90">
                <span className="mr-2 rounded border border-sky-300/50 px-1.5 py-0.5 text-sm font-medium text-sky-200">Note</span>
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

    </div>
  );
}
