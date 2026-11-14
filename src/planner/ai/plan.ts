import { checkPlan, countFlips, planWarnings } from './check';
import type { PlanWarning, Violation } from './check';
import { buildFacts, coarsenFacts, FACTS_LEVELS } from './facts';
import type { AiPlanInput, Night, NightFacts } from './facts';
import { buildQualityPrompt, buildQualityRepairPrompt, buildRepairPrompt, buildRetryPrompt, buildUserPrompt, clip, MAX_ECHO_CHARS, planAsReply, SYSTEM_PROMPT } from './prompt';
import { parsePlanReply, parseQualityReply } from './schema';
import type { LastTargetVerdict, ModelPlan, Parsed, QualityVerdict } from './schema';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** The only door to a model. Tests pass a fake; production passes `createAnthropicCaller()`. */
export type CallModel = (messages: ModelMessage[]) => Promise<string>;

export const MAX_REPAIRS = 3;
/** Every model call of one request, retries of malformed replies included. */
export const MAX_CALLS = 6;
/** The longest one call may take: the real caller's timeout. */
export const CALL_TIMEOUT_MS = 50_000;
/** The whole request, inside the route's 120 s: no call starts unless a full CALL_TIMEOUT_MS is left. */
export const BUDGET_MS = 110_000;

/** The one hard limit: no model call carries more characters than this (all messages together), whatever the request or the replies. */
export const MAX_CALL_CHARS = 60_000;
/** The ceiling of a whole request: every call at the limit. */
export const MAX_REQUEST_CHARS = MAX_CALL_CHARS * MAX_CALLS;
/** What the system prompt and the facts may take of a call: the rest is room for echoed replies and the ask. Facts that do not fit even at the coarsest level are refused. */
export const MAX_BASE_CHARS = 30_000;

/** The request cannot be put into a call of MAX_CALL_CHARS. A RangeError, so the route answers 422. Thrown before any call is made. */
export class PromptTooLargeError extends RangeError {}

export interface AiPlanOptions {
  callModel: CallModel;
  /** Ask the model to review a verified plan, with one repair round. Default off. */
  qualityReview?: boolean;
  /** Test hooks: the clock and the overall time budget. */
  now?: () => number;
  budgetMs?: number;
}

export interface AiPlanResult {
  /** verified: the exact check found nothing. unverified: the best plan after the repair rounds, with its violations. */
  status: 'verified' | 'unverified';
  plan: ModelPlan;
  violations: Violation[];
  /** The exact check's non-blocking findings (a cut target that would fit, free time left after the last slot). */
  warnings: PlanWarning[];
  /** The last slot's verdict (also inside `plan`): leftover minutes, frames, usefulness. Null when the plan has no slot. */
  lastTarget: LastTargetVerdict | null;
  /** The facts the model was given and the check used. */
  facts: NightFacts;
  /** Slots that span their target's transit (each is one meridian flip). Always 0 when flips are not allowed and the plan is verified. */
  flips: number;
  repairRounds: number;
  modelCalls: number;
  quality?: QualityVerdict & { repaired: boolean };
  /** Set when the quality call failed; the verified plan is still returned. */
  qualityError?: string;
  /** Set when a repair call failed (API error, malformed twice, out of calls or time); the best plan so far is still returned. */
  repairError?: string;
}

export class ModelReplyError extends Error {}
export class BudgetError extends Error {}

/** Counts calls and time. The first call always goes; later ones only inside MAX_CALLS and with a full CALL_TIMEOUT_MS left. */
class Budget {
  calls = 0;
  private readonly deadline: number;
  constructor(private readonly now: () => number, budgetMs: number) {
    this.deadline = now() + budgetMs;
  }
  take(): void {
    if (this.calls >= MAX_CALLS) throw new BudgetError(`Stopped: the ${MAX_CALLS} model calls allowed per request are used.`);
    if (this.calls > 0 && this.now() + CALL_TIMEOUT_MS > this.deadline) throw new BudgetError('Stopped: not enough time left for another model call.');
    this.calls++;
  }
}

/** One earlier exchange: the model's reply (absent: nothing to echo) and the user message that followed it. `ask` takes how many violations it may list. */
interface Turn {
  reply?: string;
  ask: (listMax: number) => string;
}

const chars = (m: readonly ModelMessage[]): number => m.reduce((n, x) => n + x.content.length, 0);

/** Shrink steps, tried in order: echoed replies clipped, echoed replies dropped, then the violation list cut. */
const SHRINK: readonly { echo: number; list: number }[] = [
  { echo: MAX_ECHO_CHARS, list: 30 },
  { echo: 3000, list: 30 },
  { echo: 1000, list: 30 },
  { echo: 0, list: 30 },
  { echo: 0, list: 10 },
  { echo: 0, list: 3 },
  { echo: 0, list: 0 },
];

/** The only place a call is sized: the first step of SHRINK that puts the messages under MAX_CALL_CHARS, or a PromptTooLargeError. */
function fitCall(base: readonly ModelMessage[], turns: readonly Turn[]): ModelMessage[] {
  for (const step of SHRINK) {
    const out: ModelMessage[] = [...base];
    for (const t of turns) {
      if (t.reply !== undefined && step.echo > 0) {
        out.push({ role: 'assistant', content: clip(t.reply, step.echo) }, { role: 'user', content: t.ask(step.list) });
      } else {
        // A dropped reply leaves two user messages in a row: one message, with a note.
        const last = out[out.length - 1];
        const note = t.reply !== undefined ? '(Your earlier reply is left out for length.) ' : '';
        out[out.length - 1] = { role: 'user', content: `${last.content}\n\n${note}${t.ask(step.list)}` };
      }
    }
    if (chars(out) <= MAX_CALL_CHARS) return out;
  }
  throw new PromptTooLargeError(`The request is too large for one model call (${MAX_CALL_CHARS} characters): use fewer targets or a smaller site description.`);
}

/** One model call, parsed. A reply that is not valid JSON of the schema gets one retry; a second failure is an error. Every call goes through fitCall. */
async function ask<T>(callModel: CallModel, base: readonly ModelMessage[], turns: readonly Turn[], parse: (t: string) => Parsed<T>, budget: Budget): Promise<T> {
  const firstMessages = fitCall(base, turns);
  budget.take();
  const first = await callModel(firstMessages);
  const a = parse(first);
  if (a.ok) return a.value;
  const retryMessages = fitCall(base, [...turns, { reply: first, ask: () => buildRetryPrompt(a.error) }]);
  budget.take();
  const second = await callModel(retryMessages);
  const b = parse(second);
  if (b.ok) return b.value;
  throw new ModelReplyError(`The model's reply was malformed twice: ${b.error}`);
}

/** Fewer violations is better; a too-many-slots plan is never better than any other plan. */
const rank = (v: readonly Violation[]): number => (v.some((x) => x.kind === 'too-many-slots') ? Infinity : v.length);

/** The facts at the finest level whose system prompt and facts fit MAX_BASE_CHARS. */
function fitFacts(input: AiPlanInput): { facts: NightFacts; night: Night; base: ModelMessage[] } {
  const full = buildFacts(input);
  for (const level of FACTS_LEVELS) {
    const { night } = full;
    const facts = coarsenFacts(full.facts, level);
    const base: ModelMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(facts) }];
    if (chars(base) <= MAX_BASE_CHARS) return { facts, night, base };
  }
  throw new PromptTooLargeError(`The night's facts do not fit one model call even at the coarsest level (${MAX_BASE_CHARS} characters): use fewer targets.`);
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function planNightWithAi(input: AiPlanInput, opts: AiPlanOptions): Promise<AiPlanResult> {
  const { facts, night, base } = fitFacts(input);
  const budget = new Budget(opts.now ?? Date.now, opts.budgetMs ?? BUDGET_MS);
  const after = (plan: ModelPlan, askText: (listMax: number) => string): Turn[] => [{ reply: planAsReply(plan), ask: askText }];

  // The first call has nothing to fall back on: its errors propagate. Every later error keeps the best plan obtained so far.
  let plan = await ask(opts.callModel, base, [], parsePlanReply, budget);
  let violations = checkPlan(input, night, plan);
  let best = { plan, violations };
  let rounds = 0;
  let repairError: string | undefined;

  while (violations.length > 0 && rounds < MAX_REPAIRS) {
    rounds++;
    try {
      plan = await ask(opts.callModel, base, after(best.plan, (n) => buildRepairPrompt(best.violations, n)), parsePlanReply, budget);
    } catch (e) {
      repairError = messageOf(e);
      break;
    }
    violations = checkPlan(input, night, plan);
    if (rank(violations) < rank(best.violations)) best = { plan, violations };
  }

  const result: AiPlanResult = {
    status: best.violations.length === 0 ? 'verified' : 'unverified',
    plan: best.plan,
    violations: best.violations,
    warnings: [],
    lastTarget: null,
    facts,
    flips: 0,
    repairRounds: rounds,
    modelCalls: 0,
  };
  if (repairError !== undefined) result.repairError = repairError;

  if (opts.qualityReview && result.status === 'verified') {
    try {
      const q = await ask(opts.callModel, base, after(result.plan, () => buildQualityPrompt()), parseQualityReply, budget);
      result.quality = { ...q, repaired: false };
      if (!q.good && q.issue) {
        const fixed = await ask(opts.callModel, base, after(result.plan, () => buildQualityRepairPrompt(q.issue!, q.fix)), parsePlanReply, budget);
        if (checkPlan(input, night, fixed).length === 0) {
          result.plan = fixed;
          result.quality.repaired = true;
        }
      }
    } catch (e) {
      result.qualityError = messageOf(e);
    }
  }
  result.warnings = planWarnings(input, night, result.plan);
  result.flips = countFlips(input, night, result.plan);
  result.lastTarget = result.plan.lastTarget ?? null;
  result.modelCalls = budget.calls;
  return result;
}
