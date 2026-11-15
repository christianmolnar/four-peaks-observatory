# Planner: plan several nights (engine only)

The page no longer has a "Plan several nights" panel: the planner is one plan, one night. The engine stays in `src/planner/campaign/` with its own tests,
for when several nights come back. It spreads a plan's targets over up to 14 nights. Code decides all of it: no AI, no cost, no sign-in.

## What the engine takes

- The night 1 evening, the site, train, horizon, minimum altitude and the plan's targets in their order, and a number of nights (1 to 14).
- Optional limits per target: hours per night at most, and a useful range (least and most minutes): the engine's own `hoursPerNight` and `useful` fields.
- **The default useful range comes from the exposure engine** (`exposureFor`, `planner-exposure.md`), not from a table of its own.
  For each target, on the chosen train, filter and Bortle class: the least is the light the Quick preset stops at, the most is the light Deep stops at, each rounded up to the 5 minute grid (`usefulRangeOf`, `src/planner/campaign/analysis.ts`).
  The target's catalog surface brightness reaches it (`subject.surfaceBrightnessMu`), so a bright, a medium and a faint target get different ranges: on a C11 at f/10, broadband, Bortle 6, 30 to 30, 30 to 240 and 70 to 295 minutes for surface brightness 20, 22 and 24.
- A smart scope has no optics to size the ranges from; a train with no focal ratio, image scale or pixel size has none either.
- Planets are left out (they move; the engine places fixed objects).

## What it returns

- Per target: total minutes, nights used, and status **Full** (reached its most useful length), **Useful** (reached the least) or **Cut** (never did), with the engine's reason when cut.
- The cut line sits above the first cut target and says what it needs, for example "needs 90 min, 40 left".
- Per night: the dark hours, each slot with start, end, minutes of light, mean altitude, a note when the mount flips, what was not scheduled and why.

## How it runs

- `startCampaign` (`src/planner/campaign/run.ts`) runs `planCampaign` in a Web Worker of its own for each run. Cancel ends the worker.
- Where there is no Worker (jest, old browsers) it runs on the main thread after one event-loop turn. If a worker could not be made it does this silently in production (the build strips console output; only development shows a warning), and a page that used it would freeze for 1-3 s on a phone while it plans.
- Time to plan at Fountain Hills (Node, desktop CPU): 3 targets x 3 nights 0.1 s, 6 x 3 0.25 s, 6 x 14 0.7 s, 25 x 14 4.9 s.
  In a browser at 4x CPU slowdown the main thread's longest task during the heaviest run (25 x 14) was about 100 ms, all of it rendering.

## Checks

- Tests: `src/planner/campaign/` (`campaign.test.ts`, `run.test.ts`, `view.test.ts` and the rest).
