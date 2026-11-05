# Imaging planner preview (`/planner`)

Reachable by URL only; not in the header, `noindex`. All state is in the browser (localStorage keys `fpo-planner-profile-v1`, `fpo-planner-captured-v1`). No server code.

## Manual check

1. `npm run dev`, open `/planner`.
2. Date defaults to tonight (before 06:00 it is the night that began yesterday). Times use the browser's time zone, because the profile's site has no time zone field.
3. Horizon editor: type a start azimuth of `500` (message, slider unchanged), `200` (slider moves to 200); drag the slider or use arrow keys (the box follows). Set start equal to end (validator message with the field path).
4. Raise the height to 80: southern targets drop out of the list. "Clear horizon": badge "Horizon not set", flat minimum altitude in each "why".
5. "Save horizon" then reload: the arc persists. "Reset to sample" restores the default.
6. "Export CSV": header row, one row per listed target, names with commas quoted.
7. Import a profile with `latitude: 120`: the error names `$.sites[0].latitude`.

## Automated

- `npm test` covers the plan functions, CSV, storage and validation helpers, and a server render of the page for fixed dates (`src/app/planner/planner.test.tsx`).
- Typing and slider sync live in the browser only; step 3 above is the check.
