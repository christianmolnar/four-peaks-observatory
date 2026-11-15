# Planner AI night plan

The model decides; code supplies facts and checks. One night, up to 12 targets. The page has a panel for it (see Planner panel); the route and `src/planner/ai/plan.ts` are the engine.

## Environment (set in Vercel and in `.env.local`; values never in the repo)

- `ANTHROPIC_API_KEY`: required. Without it the route answers 503 and names only the variable.
- `PLANNER_AI_MODEL`: optional. Default `claude-sonnet-5-5`.
- `PLANNER_OWNER_GOOGLE_SUB` / `PLANNER_OWNER_GOOGLE_EMAIL`: the owner allowlist (see Who can call it). Optional; empty means nobody is an owner.
- `PLANNER_GUEST_PER_HOUR` (default 6) and `PLANNER_GUEST_PER_DAY` (default 60): guest caps in model calls. A malformed value makes the route answer 503 naming the variable.
- `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`): the counter store (see Caps). Optional; without them the cap is best effort. Every KV call is bounded to 2 s.
- `AUTH_SECRET` is required for guests (it keys the visitor hash; unset means guests get 503 naming it, no fallback). Sign-in (optional for visitors): `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL`.

## Route

`POST /api/planner/ai-plan`, open to everyone. The caller is an **owner** (signed in with Google and on the allowlist: no caps) or a **guest** (everyone else, signed in or not: capped, no sign-in needed).

## Who can call it

- Owner: a Google account whose `sub` (the stable account id) is in `PLANNER_OWNER_GOOGLE_SUB` (comma list; entries that are not plain numbers are dropped; empty means nobody).
- Second way: an email in `PLANNER_OWNER_GOOGLE_EMAIL` (comma list, case-insensitive), counted only when Google says the email is verified (`email_verified` is exactly true). An unverified email never matches.
  - Why both: the `sub` never changes and is the firm identity; the email is easier to put in the list. Verified-only keeps it safe. Prefer `sub` for anyone who might lose their address.
- Guest: gets the same plan, but no `qualityReview` (ignored if sent) and the default repair rounds. `requireOwner()` (`src/lib/planner-auth/require-user.ts`) stays for any future owner-only route; this route uses `identifyCaller()` instead.

## Caps (guests only; owners are never counted)

- Units are model calls, not requests: every call to the model (first, retry, repair) is counted before it is made. A typical plan is one call, so the defaults (6 per hour per visitor, 60 per day for everyone) are about 6 and 60 plans.
- Per visitor: the client IP from `x-vercel-forwarded-for` (else `x-real-ip`, else the first `x-forwarded-for` entry as a last resort), HMAC-hashed with `AUTH_SECRET`; IPv6 is keyed by its /64 prefix and IPv4-mapped IPv6 as the IPv4. The IP is never stored, logged or returned. No header means one shared visitor bucket. Fixed windows: the clock hour and the UTC day.
- Before any work, a guest over a limit gets 429 with `Retry-After` and the model is not called: "Daily planner limit reached, try tomorrow" (global) or "Hourly planner limit reached ..." (visitor). A limit reached mid-request stops further repair calls and the best plan so far is returned (`repairError` says why).
- Counter store (`src/planner/ai/counter-store.ts`, one `CounterStore` interface, two shipping implementations):
  - KV: Upstash Redis over REST, used when `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` pair) are set. Shared by every server instance, so the cap is firm. If the store is unreachable, slower than 2 s or answers garbage, the guest gets 503 and no model call is made (mid-request, repair stops and the best plan so far is returned). Owners never touch the store.
  - Memory: used when those variables are absent. **Best effort only**: each serverless instance has its own counters and a cold start resets them, so the real cap can be many times higher.
- **The hard backstop is a monthly spend limit set in the Anthropic console.** Set it whatever the store; the caps bound normal use, the spend limit bounds the bill.

- Body (JSON, max 64 KB): `targets` (1 to 12 of `{id, name, raHours, decDeg}`), `site` (`latitude`, `longitude`, optional `elevationM`), `timeZone` (IANA), `horizon` (null or `[{az, alt}]`, max 360), `minAltitude`, `date` (YYYY-MM-DD, the evening the night starts), optional `startTime` (`HH:MM`), optional `qualityReview` (default false, owners only), optional `allowFlips` (boolean, default false: see Meridian flips), optional `bortle` (1 to 9), optional `rig` (`focalLengthMm`, `apertureMm`, `pixelSizeUm`, `camera`, `colourCamera`, `filter`, `filterKind`). A target may carry `catalogId`; the server then adds the catalog's type, size and bright-core flag to the facts (the request text is never trusted for that).
- Answer: `{status: 'verified' | 'unverified', plan, violations, warnings, lastTarget, facts, flips, repairRounds, modelCalls, quality?, qualityError?, repairError?}`.
- `flips` is the number of slots that span their target's transit (0 when flips are off and the plan verified).
- `lastTarget` echoes `plan.lastTarget`: the verdict on the last slot (see below); null when the plan has no slot.
- A failed repair or review call never loses a plan: the best plan so far comes back, with `repairError` or `qualityError` saying why. Only a failure of the first call is an error (502).
- Errors: 400 bad body, 413 too large, 422 no usable night, 429 guest limit, 502 model failed or never returned valid JSON, 503 key not set, limits misconfigured or counter store unreachable.
- Limits per request: at most 6 model calls in all (retries of malformed replies and the review included), each with a 50 s timeout and no SDK retry, and a 110 s overall budget inside `maxDuration` 120 s. No call starts unless a full 50 s is left; then the best plan is returned.
- Call size: one enforced limit, not a measured sample.
  - `MAX_CALL_CHARS` (60,000, `plan.ts`): no model call carries more characters than this (all messages together). Every call (first, retry, repair, review, review repair) goes through `fitCall`, which is the only place a call is sized.
  - Overall ceiling = `MAX_CALL_CHARS` x `MAX_CALLS` (6) = `MAX_REQUEST_CHARS` = 360,000 characters.
  - `fitCall` shrinks in this order until the call is under the limit: echoed earlier replies clipped (12,000, 3,000, 1,000), echoed replies dropped, then the violation list cut (30, 10, 3, 0). Other texts are clipped where built (`prompt.ts`): a violation to 300 characters, a retry error to 300, a review `issue` and `fix` to 300 each (`schema.ts` also caps them when parsing). A reply with more than 3 x targets + 5 slots is one `too-many-slots` violation and nothing else is checked; such a plan never becomes the best plan.
  - Facts: the system prompt plus facts must fit `MAX_BASE_CHARS` (30,000), which leaves the rest of the call for echoes and the ask. `planNightWithAi` walks `FACTS_LEVELS` (`facts.ts`): samples every 15 min with all windows, then every 30 min with at most 24 windows per target, then every 60 min with at most 8 (the longest, in time order; `windowsOmitted` says how many were left out). The coarsest level depends only on the target count and the night length (at most 24 h), not on the horizon. The check does not use the facts text, so a coarser table never changes what verifies.
  - If the facts do not fit even at the coarsest level, `PromptTooLargeError` (a `RangeError`, so 422) is thrown before any call is made. A call over the limit is never sent.
  - Tests (`plan.test.ts`, "one enforced call limit"): the evaluator's two inputs, a seeded property loop of random requests (up to 12 targets, 40-character ids, 360 horizon points, latitude -80 to 80, flips and review on) with adversarial replies, asserting that no call exceeds `MAX_CALL_CHARS`.
  - A reply cut by the token cap is not valid JSON, so it gets the one retry like any malformed reply. A real plan is about 1.5 to 2k tokens.

## Flow (`src/planner/ai/`)

- `facts.ts`: per target, altitude, azimuth, flag (ok, low, blocked) and moon separation every 15 min from dusk to dawn (coarser when the facts would not fit one call, see Call size), usable windows, meridian transit, moon illumination. Built from `astro` and `campaign/analysis`; no ephemeris code of its own.
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

## Global daily cap

- A few visitors can use up the 60 calls for everyone: 10 plans of 6 calls each is enough. Until the UTC day ends, every guest then gets 429.
- Owners are not affected; they are uncapped and never counted.
- To open it up sooner, raise `PLANNER_GUEST_PER_DAY` (spend grows with it) or wait for UTC midnight.
- The Anthropic console monthly spend limit is the final backstop.

## Planner flyout

- `src/app/planner/AiPlanFlyout.tsx`, opened by "Plan my night with AI" in the open plan's header: a side sheet on a wide screen (the plan stays visible), the whole screen on a phone. Three steps: 1 "Checking the night" (the night, site, horizon, train and the targets with their presets, in plain words, and the ask button), 2 "Asking the AI to order and time N targets" (live status, Cancel), 3 "Checking the plan against the sky" (passed, repaired, or not fully checked). It has no controls of its own for date, site, train, horizon or minimum altitude: it sends what the open plan holds (its date, site and train), with the plan's fixed objects in the plan's order (planets are left out, and so are targets past 12; the flyout says so). Opening it sends nothing; the plan changes only on "Use this plan". Close stops a request in flight.
- The request is built by `buildAiPlanBody` (`src/planner/ai/body.ts`) and the tests check it with the route's own `parseBody`. `catalogId` goes only for targets in the curated catalog, the only ones the route knows.
- States: empty plan (ask button disabled with the reason), loading with Cancel, superseded (an input changed while the request was out: the answer is dropped), each route error in plain words (429 from `Retry-After`, 503, 502 with Ask again, 422), and a stale marker naming what changed (night, site, train, the plan, horizon or minimum altitude) after a plan was made.
- The result: slots with start, end, minutes and the target's preset, the minutes the model asked for and plans, and the usefulness word and reason for the last slot. No frame count, sub length or preset total is shown for any slot: the card says "Frame counts and sub lengths come from the exposure rules when you use this plan; they are not shown here." After apply, the open plan takes the order and first start time; every target keeps its own preset, and the plan's timeline works out frames and times itself. The model's `notes` and the last slot's `reason`, the left-out list, the checker's findings in plain words (`plainText` in `src/planner/ai/view.ts` turns ids into names and ISO times into clock times), and the page's own night graph (`NightTimeline`).
- The model gives no reason per slot or per cut target (the schema has `notes` and the last slot's `reason` only), so those two texts are what the page can show in the model's words.
- "Use this plan" writes the AI plan's order and the first start time (replacing the earlier one) into the open plan (`applyAiPlan` in `PlannerApp.tsx`), saved like any plan change, so Print and the timeline exports carry it. Targets the AI left out stay in the plan, after the placed ones; the targets' own notes stay. It asks nothing: the text under the result says what it sets. Not offered for an unverified plan, a smart-scope train, or more than 8 slots. Nothing else reorders the plan (the itinerary's "Use this order" is gone); the order is the user's picks or the AI plan's.
- The review switch shows only for the owner (`owner` from `/api/planner/session`); a guest's request never carries `qualityReview`.
