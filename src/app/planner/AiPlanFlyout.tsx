'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_TARGETS } from '@/planner/ai/facts';
import { MAX_SLOTS } from '@/planner/itinerary';
import type { ItineraryItem } from '@/planner/itinerary';
import type { TrainEntry } from '@/planner/profile';
import { buildAiPlanBody, RequestTooLargeError } from '@/planner/ai/body';
import type { AiPlanForm, PlanTarget } from '@/planner/ai/body';
import type { AiPlanResult } from '@/planner/ai/plan';
import type { ViolationKind } from '@/planner/ai/check';
import {
  NETWORK_PROBLEM,
  TIMEOUT_PROBLEM,
  UNREADABLE_PROBLEM,
  clockOfIso,
  itineraryFromAiPlan,
  minutesBetween,
  problemFor,
  readResult,
} from '@/planner/ai/view';
import type { AiProblem } from '@/planner/ai/view';

export const AI_PLAN_URL = '/api/planner/ai-plan';
/** A little over the route's own 120 s: when the page stops waiting. */
export const CLIENT_TIMEOUT_MS = 130_000;

const btn44 = 'min-h-11 min-w-11 px-3 py-1.5 rounded border border-p-line/30 text-p-t1 font-normal text-sm hover:bg-p-raised/10 disabled:opacity-40 aria-disabled:opacity-40';

export interface AiPlanFlyoutProps {
  /** Everything of the request except the targets; null when the page cannot plan (no night, no site). */
  base: Omit<AiPlanForm, 'targets'> | null;
  /** The open plan's fixed-position targets, in the plan's order. */
  targets: readonly PlanTarget[];
  /** Why there is nothing to send yet, in a few words; null when there is. */
  blocked: string | null;
  /** The plan's site or train is gone from the gear: what is shown instead. The AI is not asked until the user keeps it or changes it. */
  staleNotes?: readonly { key: string; text: string; keepLabel: string; onKeep: () => void }[];
  /** Closes the flyout and focuses the page's Train control. */
  onChangeStale?: () => void;
  train: TrainEntry;
  /** Each target's exposure preset as a label ("Balanced", "Custom"), by target id. */
  presetLabels: ReadonlyMap<string, string>;
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

const PARTS = ['night', 'site', 'train', 'plan', 'sky'] as const;

/** What the checker found, in a few words (the full sentences go to the AI, not the screen). */
const VIOLATION_LABEL: Record<ViolationKind, string> = {
  'too-many-slots': 'Too many slots',
  'unknown-target': 'Unknown target',
  'bad-time': 'Bad time',
  'outside-night': 'Outside the night',
  'below-min-altitude': 'Below minimum altitude',
  'blocked-by-horizon': 'Behind horizon',
  'flip-in-slot': 'Flip in slot',
  'exposure-mismatch': 'Light too long',
  overlap: 'Overlap',
  'slew-gap': 'Slew gap short',
  'duplicate-slot': 'Two slots',
  'in-plan-and-cut': 'In plan and left out',
  'duplicate-cut': 'Left out twice',
  'missing-target': 'Target missing',
  'missing-exposure': 'No exposure',
  'fits-flag': 'Flag wrong',
  'empty-plan': 'Plan empty',
  'missing-verdict': 'No last verdict',
  'verdict-mismatch': 'Last slot mismatch',
};

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

/**
 * "Plan my night with AI": a flyout over the plan (a side sheet on a wide screen, the whole screen on a phone). One button asks, a status line
 * shows the wait, the result is the planned slots in order. The open plan changes only when "Use this plan" is pressed. Closing it stops any request in flight.
 */
export default function AiPlanFlyout({ base, targets, blocked, staleNotes = [], onChangeStale = () => undefined, train, presetLabels, owner, fetchPlan, onApply, onClose }: AiPlanFlyoutProps) {
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
  const stale = done !== null && prepared !== null ? PARTS.filter((k) => done.parts[k] !== prepared.parts[k]) : done !== null ? [...PARTS] : [];
  const count = Math.min(targets.length, MAX_TARGETS);
  const noun = count === 1 ? 'target' : 'targets';
  const status = loading ? 'Planning...' : run === 'cancelled' ? 'Cancelled' : run === 'superseded' ? 'Out of date' : '';
  const canAsk = disabledReason === null && !loading;
  const showAskAgain = done !== null || run === 'cancelled' || run === 'superseded' || (run === 'error' && problem?.retry === true);

  const applyBlock =
    done === null
      ? null
      : done.result.status !== 'verified'
        ? 'Not fully checked'
        : train.kind !== 'optical'
          ? 'Pick optical setup'
          : done.result.plan.plan.length === 0
            ? 'No slots'
            : done.result.plan.plan.length > MAX_SLOTS
              ? `Max ${MAX_SLOTS} targets`
              : stale.length > 0
                ? 'Out of date'
                : null;

  /** The short line above the buttons: why Use this plan is off, or what it did. */
  const footerNote = applyBlock ?? (applyNote === 'applied' ? 'Applied' : applyNote === 'kept' ? 'Not applied' : null);

  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-plan-heading"
      data-testid="ai-flyout"
      className="planner-root fixed inset-0 z-[60] flex flex-col bg-p-bg text-p-t1 shadow-2xl print:hidden md:inset-y-0 md:left-auto md:right-0 md:w-[32rem] md:max-w-[90vw] md:border-l md:border-p-line/20"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
        <h2 id="ai-plan-heading" ref={heading} tabIndex={-1} className="mb-3 text-xl font-light tracking-[0.1em] text-p-t1 focus:outline-none">
          PLAN MY NIGHT WITH AI
        </h2>
        <div className="space-y-2">
          {staleNotes.map((n) => (
            <div key={n.key} className="rounded border border-p-warn/50 bg-p-warn-fill/15 p-2 text-sm font-normal text-p-warn-text" data-testid={`ai-stale-${n.key}`}>
              <p className="break-words">{n.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={`${btn44} max-w-full min-w-0 break-words text-left`} onClick={n.onKeep}>{n.keepLabel}</button>
                <button type="button" className={btn44} onClick={onChangeStale}>Change</button>
              </div>
            </div>
          ))}
          {disabledReason !== null && (
            <p id="ai-plan-reason" className="text-sm font-normal text-p-warn-text" data-testid="ai-plan-reason">
              {disabledReason}
            </p>
          )}
          {owner && (
            <label className="flex min-h-11 items-center gap-2 text-sm font-normal text-p-t1">
              <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} className="h-5 w-5 shrink-0 accent-p-focus" />
              <span>Ask the AI to review</span>
            </label>
          )}
          {done === null && run === 'idle' && (
            <button type="button" className={btn44} onClick={() => void send()} disabled={!canAsk} aria-describedby={disabledReason !== null ? 'ai-plan-reason' : undefined}>
              Plan {count} {noun}
            </button>
          )}
          <p aria-live="polite" aria-busy={loading} className="min-h-6 text-sm font-normal text-p-t1" data-testid="ai-status">
            {status}
          </p>
          {loading && (
            <button ref={cancelButton} type="button" className={btn44} onClick={cancel}>
              Cancel
            </button>
          )}
          {run === 'error' && problem !== null && (
            <div role="alert" className="rounded border border-p-warn/40 bg-p-warn-fill/15 px-3 py-2 text-sm font-normal text-p-warn-text" data-testid="ai-problem">
              {problem.text}
            </div>
          )}
          {done !== null && done.result.status !== 'verified' && (
            <p className="inline-block rounded bg-p-warn/15 px-2 py-0.5 text-sm font-normal text-p-warn-text" data-testid="ai-checked">Not fully checked</p>
          )}
        </div>

        {done !== null && <Result done={done} stale={stale} presetLabels={presetLabels} />}
      </div>

      <div className="border-t border-p-line/20 bg-p-bg p-3" data-testid="ai-footer">
        {done !== null && footerNote !== null && (
          <p id="ai-apply-note" className={`mb-2 text-sm font-normal ${applyBlock !== null ? 'text-p-t1' : 'text-p-t2'}`} data-testid="ai-apply-note">
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
              aria-describedby={footerNote !== null ? 'ai-apply-note' : undefined}
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

function Result({ done, stale, presetLabels }: { done: Done; stale: readonly string[]; presetLabels: ReadonlyMap<string, string> }) {
  const { result, names } = done;
  const slots = [...result.plan.plan].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nameOf = (id: string) => names.get(id) ?? id;
  const chip = 'rounded bg-p-warn/15 px-2 py-0.5 text-sm font-normal text-p-warn-text';
  const problems = result.violations.map((v) => (v.id !== undefined ? `${nameOf(v.id)}: ${VIOLATION_LABEL[v.kind]}` : VIOLATION_LABEL[v.kind]));

  return (
    <div className="mt-3 space-y-3" data-testid="ai-result">
      {stale.length > 0 && (
        <p role="status" className={`${chip} inline-block`} data-testid="ai-stale">
          Out of date
        </p>
      )}
      {slots.length > 0 && (
        <ol className="space-y-2" aria-label="AI plan, in time order">
          {slots.map((s, i) => (
            <li key={`${s.id}-${s.start}`} className="rounded border border-p-line/15 p-3 text-sm font-normal text-p-t1" data-testid={`ai-slot-${i}`}>
              {i + 1}. {nameOf(s.id)} <span className="tabular-nums">{clockOfIso(s.start)} to {clockOfIso(s.end)}</span> <span className="text-p-t2">({minutesBetween(s.start, s.end)} min, {presetLabels.get(s.id) ?? 'Balanced'})</span>
            </li>
          ))}
        </ol>
      )}
      {result.plan.cut.length > 0 && (
        <p className="text-sm font-normal text-p-t1" data-testid="ai-cut">
          Left out: {result.plan.cut.map(nameOf).join(', ')}
        </p>
      )}
      {problems.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" data-testid="ai-checker">
          {problems.map((p, i) => (
            <li key={i} className={chip}>{p}</li>
          ))}
        </ul>
      )}
      {result.quality && (
        <p className={`${chip} inline-block`} data-testid="ai-quality">
          Review: {result.quality.good ? 'good' : 'concern'}
        </p>
      )}
    </div>
  );
}
