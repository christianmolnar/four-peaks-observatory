import type { CardBody } from '@/planner/astro/bodies';
import { evaluatePlanet, evaluateTarget, nightContext } from '@/planner/plan';
import type { PlanEntry, PlanTarget, TonightInput } from '@/planner/plan';

/** One night's scoring for single targets: the same `evaluateTarget` the ranking calls, against the same night context. */
export interface NightScorer {
  target(t: PlanTarget): PlanEntry;
  planet(body: CardBody): PlanEntry;
}

/**
 * The night's context built once, then any target (a search hit, an item of my plan) scored against it. Null when the
 * night has no astronomical darkness: there is nothing to score. This is not a second scoring: it is the ranking's own
 * single-target path, so a target's score here equals its score in the list, whether or not the list shows it.
 */
export function createNightScorer(input: Omit<TonightInput, 'targets' | 'includePlanets'>): NightScorer | null {
  const ctx = nightContext(input);
  if (!('sky' in ctx)) return null;
  return { target: (t) => evaluateTarget(ctx, t), planet: (b) => evaluatePlanet(ctx, b) };
}
