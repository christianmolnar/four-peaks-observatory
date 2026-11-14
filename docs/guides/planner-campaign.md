# Planner: plan several nights

The "Plan several nights" panel sits under My plan, beside "Plan my night with AI". It spreads My plan over up to 14 nights.
Code decides all of it (the engine in `src/planner/campaign/`): no AI, no cost, no sign-in.

## Using it

- **Reach it** from "Plan several nights" in the My plan header, or the link under the sticky strip.
- **Inputs** are what the page already holds: the chosen evening is night 1, the site, train, horizon, minimum altitude and My plan in its order.
  The only control of its own is **Number of nights** (default 3, 1 to 14).
- **Limits per target** (optional, closed by default): hours per night at most, and a useful range (least and most minutes).
  These are the engine's own `hoursPerNight` and `useful` fields. Empty boxes use the defaults; the default range shows in the box.
- **Seasonal lists are not a filter.** Change *Evening of* and plan again; night 1 is always the evening you chose.
- **Planets** are left out (they move; the engine places fixed objects), and the panel says so. Targets not in the catalog are left out too.

## Reading the result

- Per target: total minutes, nights used, and status **Full** (reached its most useful length), **Useful** (reached the least) or **Cut** (never did), with the engine's reason when cut.
- The **cut line** sits above the first cut target and says what it needs, for example "needs 90 min, 40 left".
- Per night (open the night): the dark hours, each slot with start, end, minutes of light, mean altitude, a note when the mount flips,
  what was not scheduled and why, the night's own cut line, and the page's night graph.
- A night with no usable darkness says so, with the engine's reason.
- **Out of date**: if the first night, nights, site, train, horizon, minimum altitude, My plan or a limit changes after a result, a marker names what changed. Plan again.

## Use night N as my itinerary

Offers that night's slots to the itinerary through the same hand-off as the AI plan (asks before replacing slots that are there).
Each slot takes the exposure mode closest to its minutes (`modeForMinutes`, shared with the AI apply) and the first slot's clock time becomes the start.
The itinerary times its slots again, so its times differ. Using a night also sets *Evening of* to that night's date (only when the itinerary took it), so its clocks, altitudes and flip notes are for that night. The result stays on screen and usable: it is tied to its own first night, so that move does not mark it out of date; a date change you make yourself does.

## How it runs

- `startCampaign` (`src/planner/campaign/run.ts`) runs `planCampaign` in a Web Worker of its own for each run. Cancel ends the worker; a change while it runs does the same and says so.
- Where there is no Worker (jest, old browsers) it runs on the main thread after one event-loop turn. If a worker could not be made it does this silently in production (the build strips console output; only development shows a warning), and the page freezes for 1-3 s on a phone while it plans.
- Time to plan at Fountain Hills (Node, desktop CPU): 3 targets x 3 nights 0.1 s, 6 x 3 0.25 s, 6 x 14 0.7 s, 25 x 14 4.9 s.
  In a browser at 4x CPU slowdown the main thread's longest task during the heaviest run (25 x 14) was about 100 ms, all of it rendering.

## Not included

- Print and CSV do not carry the campaign summary (the print sheet and CSV read the single-night list and itinerary).
- Start time, candidates, `value` and multi-target framing exist in the engine; the panel does not expose them.

## Checks

- Tests: `src/app/planner/PlannerApp.campaign.test.tsx`, `src/planner/campaign/run.test.ts`, `view.test.ts`.
- Browser run (375 and 1280 px, CPU 4x): a script kept outside the repo drove the page; results are in the builder report.
