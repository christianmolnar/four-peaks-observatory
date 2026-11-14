import { checkPlan, countFlips, planWarnings } from './check';
import type { PlanWarning, Violation } from './check';
import { buildFacts } from './facts';
import type { AiPlanInput, NightFacts } from './facts';
import { echoReply, buildQualityPrompt, buildQualityRepairPrompt, buildRepairPrompt, buildRetryPrompt, buildUserPrompt, planAsReply, SYSTEM_PROMPT } from './prompt';
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

/** One model call, parsed. A reply that is not valid JSON of the schema gets one retry; a second failure is an error. */
async function ask<T>(callModel: CallModel, messages: ModelMessage[], parse: (t: string) => Parsed<T>, budget: Budget): Promise<T> {
  budget.take();
  const first = await callModel(messages);
  const a = parse(first);
  if (a.ok) return a.value;
  budget.take();
  const second = await callModel([...messages, { role: 'assistant', content: echoReply(first) }, { role: 'user', content: buildRetryPrompt(a.error) }]);
  const b = parse(second);
  if (b.ok) return b.value;
  throw new ModelReplyError(`The model's reply was malformed twice: ${b.error}`);
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export async function planNightWithAi(input: AiPlanInput, opts: AiPlanOptions): Promise<AiPlanResult> {
  const { facts, night } = buildFacts(input);
  const budget = new Budget(opts.now ?? Date.now, opts.budgetMs ?? BUDGET_MS);
  const base: ModelMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(facts) }];
  const withReply = (plan: ModelPlan, ask_: string): ModelMessage[] => [...base, { role: 'assistant', content: planAsReply(plan) }, { role: 'user', content: ask_ }];

  // The first call has nothing to fall back on: its errors propagate. Every later error keeps the best plan obtained so far.
  let plan = await ask(opts.callModel, base, parsePlanReply, budget);
  let violations = checkPlan(input, night, plan);
  let best = { plan, violations };
  let rounds = 0;
  let repairError: string | undefined;

  while (violations.length > 0 && rounds < MAX_REPAIRS) {
    rounds++;
    try {
      plan = await ask(opts.callModel, withReply(best.plan, buildRepairPrompt(best.violations)), parsePlanReply, budget);
    } catch (e) {
      repairError = messageOf(e);
      break;
    }
    violations = checkPlan(input, night, plan);
    if (violations.length < best.violations.length) best = { plan, violations };
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
      const q = await ask(opts.callModel, withReply(result.plan, buildQualityPrompt()), parseQualityReply, budget);
      result.quality = { ...q, repaired: false };
      if (!q.good && q.issue) {
        const fixed = await ask(opts.callModel, withReply(result.plan, buildQualityRepairPrompt(q.issue, q.fix)), parsePlanReply, budget);
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
