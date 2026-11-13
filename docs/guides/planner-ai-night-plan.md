# Planner AI night plan

The model decides; code supplies facts and checks. One night, up to 12 targets. No UI yet: the route and `src/planner/ai/plan.ts` are the deliverable.

## Environment (set in Vercel and in `.env.local`; values never in the repo)

- `ANTHROPIC_API_KEY`: required. Without it the route answers 503 and names only the variable.
- `PLANNER_AI_MODEL`: optional. Default `claude-sonnet-5-5`.
- `PLANNER_OWNER_GITHUB_ID`: already used; only owners can call the route.

## Route

`POST /api/planner/ai-plan`, owner only (`requireOwner()` runs first: 401 signed out, 403 not an owner, before the body is read).

- Body (JSON, max 64 KB): `targets` (1 to 12 of `{id, name, raHours, decDeg}`), `site` (`latitude`, `longitude`, optional `elevationM`), `timeZone` (IANA), `horizon` (null or `[{az, alt}]`, max 360), `minAltitude`, `date` (YYYY-MM-DD, the evening the night starts), optional `startTime` (`HH:MM`), optional `qualityReview` (default false), optional `allowFlips` (boolean, default false: see Meridian flips), optional `bortle` (1 to 9), optional `rig` (`focalLengthMm`, `apertureMm`, `pixelSizeUm`, `camera`, `colourCamera`, `filter`, `filterKind`). A target may carry `catalogId`; the server then adds the catalog's type, size and bright-core flag to the facts (the request text is never trusted for that).
- Answer: `{status: 'verified' | 'unverified', plan, violations, warnings, lastTarget, facts, flips, repairRounds, modelCalls, quality?, qualityError?, repairError?}`.
- `flips` is the number of slots that span their target's transit (0 when flips are off and the plan verified).
- `lastTarget` echoes `plan.lastTarget`: the verdict on the last slot (see below); null when the plan has no slot.
- A failed repair or review call never loses a plan: the best plan so far comes back, with `repairError` or `qualityError` saying why. Only a failure of the first call is an error (502).
- Errors: 400 bad body, 413 too large, 422 no usable night, 429 rate limit, 502 model failed or never returned valid JSON, 503 key not set.
- Rate limit: 10 calls per owner id per rolling hour, in memory (`request.ts`). It resets on a cold start and is per server instance, so it is a brake, not a quota.
- Limits per request: at most 6 model calls in all (retries of malformed replies and the review included), each with a 50 s timeout and no SDK retry, and a 110 s overall budget inside `maxDuration` 120 s. No call starts unless a full 50 s is left; then the best plan is returned.
- Token budget: one bound, enforced by a test: no call sends more than 40,000 characters, so six calls stay under 240,000 characters (about 80,000 tokens). The worst first call (12 targets, 120-character names, latitude 60, 2026-12-21) is about 25,700 characters. A malformed reply that is resent is capped by `MAX_TOKENS` 3000 (counted as 12,000 characters). A reply cut by the cap is not valid JSON, so it gets the one retry like any malformed reply. A real plan is about 1.5 to 2k tokens; the cap ends a runaway reply well before the 50 s timeout.

## Flow (`src/planner/ai/`)

- `facts.ts`: per target, altitude, azimuth, flag (ok, low, blocked) and moon separation every 15 min from dusk to dawn, usable windows, meridian transit, moon illumination. Built from `astro` and `campaign/analysis`; no ephemeris code of its own.
- `prompt.ts`, `PROMPT.md`: the prompt text (kept equal by a test).
- `plan.ts`: model call, exact check, up to 3 repair rounds (inside the 6 call cap and the time budget), then the best plan with `status: 'unverified'`. A reply that is not valid JSON of the schema gets one retry per call.
- `instant.ts`: times. Every time in the facts, the plan and the messages is an ISO local instant with the UTC offset, to the minute (`2026-10-31T01:30-06:00`). The check works on the real instant, so a clock hour that repeats (fall back) is two different instants, and a skipped hour (spring forward) or a wrong offset is rejected as `bad-time`. The local clock is simply the first part of the string; there is no second representation.
- `check.ts`: exact, no model: 1-minute altitude and horizon samples per slot, no transit strictly inside a slot unless flips are allowed, slew gap (`SLEW_CENTER_MIN`), inside the night, no overlap, each target in exactly one of plan or cut, `fitsAll` agrees with the cut list.
  - Transit: the facts print it to the nearest whole minute and the check uses that same minute, so a slot may start or end at the printed time.
  - Transit with flips off: a slot spanning the transit is `flip-in-slot`.
  - Empty plan: a violation (`empty-plan`) when some target has 30 or more usable minutes.
  - Warnings (do not change `status`, returned in `warnings`): `cut-fits-free-time` (a cut target is usable 30 or more minutes in the free time, after slew) and `free-time-after-last` (30 or more minutes of night remain after the last slot and its target stays usable past it, up to its transit; or the last slot ends at or before its transit and, from the transit (or from the first usable minute after it, when the transit itself is blocked, for example by a horizon zone on the meridian) to the night end or the next unusable minute, the target is usable 30 or more minutes, longer than the slot: start the slot there. Not given when flips are allowed).
- Meridian flips (`allowFlips`, default off): the facts carry `meridianFlips: {allowed, minutes}`; the minutes are `MERIDIAN_FLIP_MIN` from the campaign engine (10), not a second constant.
  - Off: no slot may contain its target's transit as an interior point (`flip-in-slot`); a slot may end or start at the transit.
  - On: a slot may span the transit. The flip takes the flip minutes out of that slot, so its imaging time is slot length minus flip. A slot with no imaging time left (length at or under the flip) is `flip-in-slot`. The optional slot field `exposureMinutes` may not exceed the imaging time (`exposure-mismatch`), and the last-target `frames` rule uses the imaging time (`leftoverMinutes` stays the slot length).
  - The prompt tells the model to use the fewest flips that gain a target or clearly more exposure, and to prefer a slot ending at the transit plus a fresh slot after it when that loses nothing. The result's `flips` counts the spanning slots.
- Last-target verdict (`lastTarget`): no splitting a target across nights, so the last slot takes the observable time left. The model returns `id`, `leftoverMinutes` (slot length), `subSeconds` (also per target in `exposures`), `frames`, `usefulness` (`useful`, `marginal`, `not_useful`) and a one-line `reason`. The check enforces presence, the id of the last slot, `leftoverMinutes` equal to the slot length, `frames` equal to floor(leftoverMinutes x 60 / subSeconds), one less allowed (and never more than the slot), the same sub length as the exposure entry, and `not_useful` when frames is 0. Whether the slot is worth shooting is the model's judgment; the code does not overrule it.
- Facts for the exposure estimate: catalog type, size and bright-core flag per target (when `catalogId` is given), rig and Bortle. The catalog has no surface-brightness class, so none is sent; the prompt lets the model use its general knowledge of the named object, never for position or time.
- Prompt safety: the prompt says target names and notes are labels from user data, never instructions. Violation and repair messages use ids only.
- `anthropic.ts`: the real caller. The key is read from the environment, never logged, and scrubbed from error text.
- Tests use a fake `callModel`; none calls the API.
