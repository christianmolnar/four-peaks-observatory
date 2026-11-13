# Planner AI night plan

The model decides; code supplies facts and checks. One night, up to 12 targets. No UI yet: the route and `src/planner/ai/plan.ts` are the deliverable.

## Environment (set in Vercel and in `.env.local`; values never in the repo)

- `ANTHROPIC_API_KEY`: required. Without it the route answers 503 and names only the variable.
- `PLANNER_AI_MODEL`: optional. Default `claude-sonnet-5-5`.
- `PLANNER_OWNER_GITHUB_ID`: already used; only owners can call the route.

## Route

`POST /api/planner/ai-plan`, owner only (`requireOwner()` runs first: 401 signed out, 403 not an owner, before the body is read).

- Body (JSON, max 64 KB): `targets` (1 to 12 of `{id, name, raHours, decDeg}`), `site` (`latitude`, `longitude`, optional `elevationM`), `timeZone` (IANA), `horizon` (null or `[{az, alt}]`, max 360), `minAltitude`, `date` (YYYY-MM-DD, the evening the night starts), optional `startTime` (`HH:MM`), optional `qualityReview` (default false).
- Answer: `{status: 'verified' | 'unverified', plan, violations, facts, repairRounds, modelCalls, quality?}`.
- Errors: 400 bad body, 413 too large, 422 no usable night, 429 rate limit, 502 model failed or never returned valid JSON, 503 key not set.
- Rate limit: 10 calls per owner id per rolling hour, in memory (`request.ts`). It resets on a cold start and is per server instance, so it is a brake, not a quota.
- `maxDuration` is 120 s: up to four sequential model calls (plan plus three repairs), plus the optional review.

## Flow (`src/planner/ai/`)

- `facts.ts`: per target, altitude, azimuth, flag (ok, low, blocked) and moon separation every 15 min from dusk to dawn, usable windows, meridian transit, moon illumination. Built from `astro` and `campaign/analysis`; no ephemeris code of its own.
- `prompt.ts`, `PROMPT.md`: the prompt text (kept equal by a test).
- `plan.ts`: model call, exact check, up to 3 repair rounds, then the best plan with `status: 'unverified'`. A reply that is not valid JSON of the schema gets one retry per call.
- `check.ts`: exact, no model: 1-minute altitude and horizon samples per slot, no transit strictly inside a slot, slew gap (`SLEW_CENTER_MIN`), inside the night, no overlap, each target in exactly one of plan or cut, `fitsAll` agrees with the cut list.
- `anthropic.ts`: the real caller. The key is read from the environment, never logged, and scrubbed from error text.
- Tests use a fake `callModel`; none calls the API.
