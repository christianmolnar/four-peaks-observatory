# Imaging planner preview (`/planner`)

Reachable by URL only; not in the header, `noindex`. All state is in the browser (localStorage keys `fpo-planner-profile-v1`, `fpo-planner-captured-v1`). No server code.

## Manual check

1. `npm run dev`, open `/planner`.
2. Date defaults to tonight at the site (from its longitude; before 06:00 site time it is the night that began yesterday), whatever the browser's zone. Times are shown in the browser's time zone, because the profile's site has no time zone field.
3. Horizon editor, number boxes (Start, End, Height; Minimum altitude works the same). Typing changes only the box:
   - Type `200` in Start, key by key: the slider and the "Horizon:" line do not move until you press Enter or leave the box (Tab, click elsewhere). Then the slider goes to 200.
   - Type `500` and press Enter: a message under the box ("must be from 0 to 359 deg"); slider, line and plan stay at the old value. Same for `361`, and for `91` in Height. Escape clears the box back to the committed value.
   - Type `320` in Start while End is 320: "Start and end must differ." Nothing changes. Change End to 300: the message and the typed 320 disappear (Start shows its old value).
   - Dragging a slider or using its arrow keys commits at once and the box follows.
   - After a bad value, "Save horizon" (once something real is changed) stores the arc without it.
   - "Discard changes", "Reset to sample", a different site, or an import also clear anything typed in the boxes.
4. Raise the height to 80: southern targets drop out of the list. "Clear horizon": badge "Horizon not set", flat minimum altitude in each "why".
5. "Save horizon" then reload: the arc persists. "Reset to sample" restores the default.
6. "Export CSV": header row, one row per listed target, names with commas quoted.
7. Import a profile with `latitude: 120`: the error names `$.sites[0].latitude`.

## Automated

- `npm test` covers the plan functions, CSV, storage and validation helpers, and a server render of the page for fixed dates (`src/app/planner/planner.test.tsx`).
- `src/app/planner/NumberSlider.test.tsx` types key by key (user-event, jsdom) through the whole page: bad values, Escape, Discard, Reset, site change, the other field making a value valid, Save after bad typing.
- `src/app/planner/PlannerApp.wiring.test.tsx` covers the default date (site, not browser; refreshed on import), blocked or full storage (load, import, captured tick) and the CSV time format.
- Rows list "Why recommended", score parts and fit detail as text under each target (no hover needed).
