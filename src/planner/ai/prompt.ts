import type { Violation } from './check';
import type { NightFacts } from './facts';
import type { ModelPlan } from './schema';
import { PLAN_JSON_SCHEMA, QUALITY_JSON_SCHEMA } from './schema';

/** The exact text is mirrored in PROMPT.md for review; a test keeps them equal. */
export const SYSTEM_PROMPT = `You plan one night of deep-sky imaging for a fixed observatory. You get a list of targets and a FACTS table computed by code. You decide; the code only supplies facts and checks your answer.

RULES
1. Use only the FACTS table for every position, altitude, azimuth, time window, moon value and meridian transit. Do not compute positions yourself and do not use remembered coordinates or ephemeris values. If you need a fact the table does not hold, plan without it.
2. All times are 24 h local clock "HH:MM" in the facts' timeZone. Every time must lie within night.start to night.end. A time after midnight is written as it reads on the clock (for example "01:30").
3. EXPOSURES: for every target give the optimal one-night exposure time in minutes: the longest integration that is still useful and gives a fully processable image tonight. Consider how long the target is observable (its windows), its altitude, and the moon.
4. PLAN: order the targets in time. Give each at most one slot with start and end. A slot must:
   - lie fully inside one of that target's windows (windows already exclude blocked sky and altitudes under minAltitudeDeg);
   - not have the target's transit strictly between its start and end (a meridian flip mid-slot is not allowed; a slot may end or start exactly at the transit);
   - keep at least slewMin minutes between its end and the next slot's start, with no overlap.
   Prefer high altitude, a large moon separation and a low or set moon. A slot may be shorter than the exposure you chose when the night is short; say so in notes.
5. If not every target fits, "plan" runs to where the night's observable time ends, and "cut" lists the targets left out, in any order. Every target id appears exactly once, in "plan" or in "cut". "fitsAll" is true exactly when "cut" is empty.
6. Reply with one JSON object that matches this schema, and nothing else (no prose, no code fence):
${JSON.stringify(PLAN_JSON_SCHEMA)}`;

export function buildUserPrompt(facts: NightFacts): string {
  return `Plan this night. FACTS (JSON). For each target, "samples" has one row per entry of "sampleTimes": [altitude deg, azimuth deg, flag, moon separation deg]; flag is "ok", "low" (under minAltitudeDeg) or "blocked" (behind a horizon zone). "windows" are the exact spans where the target is usable. "transit" is when it crosses the meridian (the flip), or null when that is outside the night.

${JSON.stringify(facts)}`;
}

export function buildRepairPrompt(violations: readonly Violation[]): string {
  return `The code checked your plan against the facts and found these violations:
${violations.map((v, i) => `${i + 1}. ${v.message}`).join('\n')}

Fix them. Change only what is needed, keep the rest of the plan, and use only the facts table. Reply with the full corrected plan as one JSON object, same schema, nothing else.`;
}

export function buildRetryPrompt(error: string): string {
  return `Your reply could not be used: ${error}. Reply again with one JSON object matching the schema, and nothing else.`;
}

export function buildQualityPrompt(): string {
  return `The code verified the plan above: every slot is usable, there is no flip inside a slot, and every target is in the plan or the cut list. Is it a good plan for the night? Judge only with the facts table: are the exposures right for the observable time, is the order sensible, is a better use of the night missing? This one reply is a review, not a plan: reply with one JSON object matching this schema and nothing else. "verdict" is one short sentence; "issue" and "fix" appear only when "good" is false.
${JSON.stringify(QUALITY_JSON_SCHEMA)}`;
}

export function buildQualityRepairPrompt(issue: string, fix: string | undefined): string {
  return `Your review of the plan found this issue: ${issue}${fix ? ` Suggested fix: ${fix}` : ''}

Fix it. Keep every rule, use only the facts table, and reply with the full corrected plan as one JSON object, same schema, nothing else.`;
}

export const planAsReply = (plan: ModelPlan): string => JSON.stringify(plan);
