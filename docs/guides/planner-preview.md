# Imaging planner preview (`/planner`)

Reachable by URL only; not in the header, `noindex`. All state is in the browser (localStorage keys `fpo-planner-profile-v1`, `fpo-planner-captured-v1`). No server code.

## Manual check

1. `npm run dev`, open `/planner`.
2. Date defaults to tonight at the site (from its longitude; before 06:00 site time it is the night that began yesterday), whatever the browser's zone. Times are shown in the browser's time zone, because the profile's site has no time zone field.
3. Horizon editor: type a start azimuth of `500` (message, slider unchanged), `200` (slider moves to 200); drag the slider or use arrow keys (the box follows). Set start equal to end ("Start and end must differ."). Type a start, then Discard changes or Reset to sample: the box and slider go back together.
4. Raise the height to 80: southern targets drop out of the list. "Clear horizon": badge "Horizon not set", flat minimum altitude in each "why".
5. "Save horizon" then reload: the arc persists. "Reset to sample" restores the default.
6. "Export CSV": header row, one row per listed target, names with commas quoted.
7. Import a profile with `latitude: 120`: the error names `$.sites[0].latitude`.

## Automated

- `npm test` covers the plan functions, CSV, storage and validation helpers, and a server render of the page for fixed dates (`src/app/planner/planner.test.tsx`).
- The rules behind typing and slider sync (`numberView`: Discard, Reset, reject then change the other field, site change) are unit-tested in `src/planner/state/state.test.ts`. There is no DOM test environment in the repo, so the wiring itself is checked by hand in step 3.
- Rows list "Why recommended", score parts and fit detail as text under each target (no hover needed).
