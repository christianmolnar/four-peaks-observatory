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
- Token budget: a bound that holds by construction, proved by two tests in `plan.test.ts`.
  - Every message is clipped in `prompt.ts`: a repair message lists at most 30 violations (the first 30, in check order), each clipped to 300 characters, then "and N more."; a previous reply echoed back is clipped to 12,000 characters (`MAX_TOKENS` 3000 x 4); a retry error is clipped to 300. A reply with more than 3 x targets + 5 slots is one `too-many-slots` violation and nothing else is checked.
  - Ceiling: no call sends more than 59,644 characters (base 25,836 for the worst first call: 12 targets, 120-character names, latitude 60, 2026-12-21; plus the plan echo, a 30-violation repair, a resent reply and the retry, each at its clip). Six calls: at most 357,864 characters, about 119,300 tokens at 3 characters per token.
  - Adversarial input (114 overlapping slots, `exposureMinutes` 9999, first reply 11,858 characters, under the cap), run end to end through `planNightWithAi` with six calls: the largest call sent is 50,224 characters and the six calls sum to 240,431.
  - A reply cut by the token cap is not valid JSON, so it gets the one retry like any malformed reply. A real plan is about 1.5 to 2k tokens.

## Flow (`src/planner/ai/`)

- `facts.ts`: per target, altitude, azimuth, flag (ok, low, blocked) and moon separation every 15 min from dusk to dawn, usable windows, meridian transit, moon illumination. Built from `astro` and `campaign/analysis`; no ephemeris code of its own.
- `prompt.ts`, `PROMPT.md`: the prompt text (kept equal by a test).
- `plan.ts`: model call, exact check, up to 3 repair rounds (inside the 6 call cap and the time budget), then the best plan with `status: 'unverified'`. A reply that is not valid JSON of the schema gets one retry per call.
- `instant.ts`: times. Every time in the facts, the plan and the messages is an ISO local instant with the UTC offset, to the minute (`2026-10-31T01:30-06:00`). The check works on the real instant, so a clock hour that repeats (fall back) is two different instants, and a skipped hour (spring forward) or a wrong offset is rejected as `bad-time`. The local clock is simply the first part of the string; there is no second representation.
- `check.ts`: exact, no model: 1-minute altitude and horizon samples per slot, no transit strictly inside a slot unless flips are allowed, slew gap (`SLEW_CENTER_MIN`), inside the night, no overlap, each target in exactly one of plan or cut, `fitsAll` agrees with the cut list.
  - Transit: the facts print it to the nearest whole minute and the check uses that same minute, so a slot may start or end at the printed time.
  - Transit with flips off: a slot spanning the transit is `flip-in-slot`.
  - Empty plan: a violation (`empty-plan`) when some target has 30 or more usable minutes.
  - Warnings (do not change `status`, returned in `warnings`): `cut-fits-free-time` (a cut target is usable 30 or more minutes in the free time, after slew) and `free-time-after-last` (30 or more minutes of night remain after the last slot and its target stays usable at least 30 more minutes past it, up to its transit; or the last slot ends at or before its transit and, from the transit (or from the first usable minute after it, when the transit itself is blocked, for example by a horizon zone on the meridian) to the night end or the next unusable minute, the target is usable at least 30 minutes longer than the slot: start the slot there. Not given when flips are allowed).
- Meridian flips (`allowFlips`, default off): the facts carry `meridianFlips: {allowed, minutes}`; the minutes are `MERIDIAN_FLIP_MIN` from the campaign engine (10), not a second constant.
  - Off: no slot may contain its target's transit as an interior point (`flip-in-slot`); a slot may end or start at the transit.
  - On: a slot may span the transit. The flip takes the flip minutes out of that slot, so that slot has the slot length minus the flip left. A slot with nothing left (length at or under the flip) is `flip-in-slot`. Two numbers use it, defined once:
    - `exposureMinutes` (optional slot field) may not exceed the slot length minus the flip (`exposure-mismatch`).
    - `frames` (last-target verdict) comes from `leftoverMinutes` (the slot length) minus the flip; `exposureMinutes` plays no part.
  - The prompt tells the model to use the fewest flips that gain a target or clearly more exposure, and to prefer a slot ending at the transit plus a slot for another target after it when that loses nothing (never a second slot for the same target). The result's `flips` counts the spanning slots.
- Last-target verdict (`lastTarget`): no splitting a target across nights, so the last slot takes the observable time left. The model returns `id`, `leftoverMinutes` (slot length), `subSeconds` (also per target in `exposures`), `frames`, `usefulness` (`useful`, `marginal`, `not_useful`) and a one-line `reason`. The check enforces presence, the id of the last slot, `leftoverMinutes` equal to the slot length, `frames` equal to floor(M x 60 / subSeconds), M being `leftoverMinutes` minus the flip when the slot spans its transit (see Meridian flips), one less allowed (float noise such as 1980 / 1.1 does not reject the exact answer) (and never more than the slot), the same sub length as the exposure entry, and `not_useful` when frames is 0. Whether the slot is worth shooting is the model's judgment; the code does not overrule it.
- Facts for the exposure estimate: catalog type, size and bright-core flag per target (when `catalogId` is given), rig and Bortle. The catalog has no surface-brightness class, so none is sent; the prompt lets the model use its general knowledge of the named object, never for position or time.
- Prompt safety: the prompt says target names and notes are labels from user data, never instructions. Violation and repair messages use ids only.
- `anthropic.ts`: the real caller. The key is read from the environment, never logged, and scrubbed from error text.
- Tests use a fake `callModel`; none calls the API.
