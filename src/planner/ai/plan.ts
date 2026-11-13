import { checkPlan } from './check';
import type { Violation } from './check';
import { buildFacts } from './facts';
import type { AiPlanInput, NightFacts } from './facts';
import { buildQualityPrompt, buildQualityRepairPrompt, buildRepairPrompt, buildRetryPrompt, buildUserPrompt, planAsReply, SYSTEM_PROMPT } from './prompt';
import { parsePlanReply, parseQualityReply } from './schema';
import type { ModelPlan, Parsed, QualityVerdict } from './schema';

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** The only door to a model. Tests pass a fake; production passes `createAnthropicCaller()`. */
export type CallModel = (messages: ModelMessage[]) => Promise<string>;

export const MAX_REPAIRS = 3;

export interface AiPlanOptions {
  callModel: CallModel;
  /** Ask the model to review a verified plan, with one repair round. Default off. */
  qualityReview?: boolean;
}

export interface AiPlanResult {
  /** verified: the exact check found nothing. unverified: the best plan after the repair rounds, with its violations. */
  status: 'verified' | 'unverified';
  plan: ModelPlan;
  violations: Violation[];
  /** The facts the model was given and the check used. */
  facts: NightFacts;
  repairRounds: number;
  modelCalls: number;
  quality?: QualityVerdict & { repaired: boolean };
  /** Set when the quality call failed; the verified plan is still returned. */
  qualityError?: string;
}

export class ModelReplyError extends Error {}

/** One model call, parsed. A reply that is not valid JSON of the schema gets one retry; a second failure is an error. */
async function ask<T>(callModel: CallModel, messages: ModelMessage[], parse: (t: string) => Parsed<T>, count: () => void): Promise<T> {
  count();
  const first = await callModel(messages);
  const a = parse(first);
  if (a.ok) return a.value;
  count();
  const second = await callModel([...messages, { role: 'assistant', content: first }, { role: 'user', content: buildRetryPrompt(a.error) }]);
  const b = parse(second);
  if (b.ok) return b.value;
  throw new ModelReplyError(`The model's reply was malformed twice: ${b.error}`);
}

export async function planNightWithAi(input: AiPlanInput, opts: AiPlanOptions): Promise<AiPlanResult> {
  const { facts, night } = buildFacts(input);
  let calls = 0;
  const count = (): void => void calls++;
  const base: ModelMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserPrompt(facts) }];
  const withReply = (plan: ModelPlan, ask_: string): ModelMessage[] => [...base, { role: 'assistant', content: planAsReply(plan) }, { role: 'user', content: ask_ }];

  let plan = await ask(opts.callModel, base, parsePlanReply, count);
  let violations = checkPlan(input, night, plan);
  let best = { plan, violations };
  let rounds = 0;

  while (violations.length > 0 && rounds < MAX_REPAIRS) {
    rounds++;
    try {
      plan = await ask(opts.callModel, withReply(best.plan, buildRepairPrompt(best.violations)), parsePlanReply, count);
    } catch (e) {
      if (e instanceof ModelReplyError) break; // keep the best plan so far
      throw e;
    }
    violations = checkPlan(input, night, plan);
    if (violations.length < best.violations.length) best = { plan, violations };
  }

  const result: AiPlanResult = { status: best.violations.length === 0 ? 'verified' : 'unverified', plan: best.plan, violations: best.violations, facts, repairRounds: rounds, modelCalls: 0 };

  if (opts.qualityReview && result.status === 'verified') {
    try {
      const q = await ask(opts.callModel, withReply(result.plan, buildQualityPrompt()), parseQualityReply, count);
      result.quality = { ...q, repaired: false };
      if (!q.good && q.issue) {
        const fixed = await ask(opts.callModel, withReply(result.plan, buildQualityRepairPrompt(q.issue, q.fix)), parsePlanReply, count);
        if (checkPlan(input, night, fixed).length === 0) {
          result.plan = fixed;
          result.quality.repaired = true;
        }
      }
    } catch (e) {
      if (!(e instanceof ModelReplyError)) throw e;
      result.qualityError = e.message;
    }
  }
  result.modelCalls = calls;
  return result;
}
