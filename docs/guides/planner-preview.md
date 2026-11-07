# Imaging planner preview (`/planner`)

Reachable by URL only; not in the header, `noindex`. All state is in the browser (localStorage keys `fpo-planner-profile-v1`, `fpo-planner-captured-v1`). No server code.

## Manual check

1. `npm run dev`, open `/planner`.
2. Date defaults to tonight at the site (from its longitude; before 06:00 site time it is the night that began yesterday), whatever the browser's zone. Times are shown in the browser's time zone, because the profile's site has no time zone field.
3. Horizon editor (Start, End, Height). Typing and sliding edit a draft; only "Save horizon" stores it.
   - Click "Edit horizon" next to the "Horizon:" line in Tonight: the page jumps to the editor.
   - Type `200` in Start, key by key: the slider and the polar chart in the editor follow as soon as the text is a valid whole number. The status line says "Unsaved changes". The "Horizon:" line, the target list and the altitude chart plan from the saved arc, so they change only when you click "Save horizon" (or press Enter in a box while the form is valid). Nothing is stored before that.
   - A slider follows its own box whenever the box holds a valid number, so the arrow keys step one degree at a time across the other end (Start 318, then ArrowRight: 319, 320, 321 ...).
   - Type `500` in Start: a line under the box says "Use 0 to 359 degrees.", the slider goes back to the saved Start and the plan never left it, "Save horizon" is greyed and the status line says "Fix the highlighted box to save". Same for `361`, for `91` or `95` in Height ("Use 0 to 90 degrees."), for an empty box, and for `1.5` ("Whole degrees only.").
   - Type `320` in Start while End is 320: "Start and End must differ." under both boxes.
   - Leaving a box (Tab, a click elsewhere) and Escape do nothing. Pressing Enter in a box saves only if the form is valid.
   - The buttons and the target list keep their page position on every key, because the list does not follow the draft and every message line has its height reserved. So the first click on "Discard changes", "Use sample horizon", "Clear horizon" or "Save horizon" works right after bad typing. "Discard changes" puts the three boxes back to the saved arc.
   - "Use sample horizon" loads the sample arc into the boxes as an unsaved draft ("Discard changes" undoes it) and puts Minimum altitude back to 20. The whole-profile wipe is "Replace profile with sample" in the Profile section.
   - A different site, an import and "Replace profile with sample" also set the boxes from the saved arc and Minimum altitude to 20; nothing typed survives.
   - Tab order: Start box, Start slider, End box, End slider, Height box, Height slider, Save, Discard, Use sample horizon, Clear horizon, "Horizon as a table".
   - Minimum altitude (Tonight) works on its own: it applies as soon as the text is a whole number from 0 to 89, with no Save. While it is invalid the plan keeps the value that was in effect when the current run of typing began, never a half-typed prefix. A run ends when the box gets focus, on Enter, or after a pause of about 0.6 s with no keystroke; only then does the kept value move to the current valid number. So emptying the box with Backspace (45 in effect, or the default 20) still plans with 45 (or 20), and within one run of typing the message names the value from before the run, and the line under the box names it ("Use 0 to 89. Planning with 30 until fixed."). Its message slot reserves two lines.
   - Bad Minimum altitude does not block "Save horizon".
4. Raise the height to 80 and save: southern targets drop out of the list. "Clear horizon" is also a draft: badge "Horizon not set" and the flat minimum altitude in each "why" once saved; "Discard changes" brings the arc back.
5. "Save horizon" then reload: the arc persists, status line empty. "Replace profile with sample" (Profile section, asks first) restores the default.
6. Targets: pick the train "C11 f/10 + ASI2600MC Duo". Targets that do not fit the field are not listed. Tick "Show targets that do not fit": they appear below every row that fits, and their text reads "Does not fit this setup (...)" under "Why it is listed". Rows that fit still read "Why recommended".
7. "Export CSV": header row, one row per listed target, names with commas quoted.
8. Import a profile with `latitude: 120`: the error names `$.sites[0].latitude`.

## Automated

- `npm test` covers the plan functions (including the fit sort), CSV, storage and validation helpers, a server render of the page for fixed dates, and DOM tests (user-event, jsdom).
- `src/app/planner/HorizonEditor.test.tsx` types key by key through the whole page: every row of the round-2 and round-3 failure tables (bad values, Discard, Use sample horizon, Replace profile, site change, import, Minimum altitude after each), Save and reload, Enter, blur, tab order.
- `src/app/planner/PlannerApp.fit.test.tsx`: targets that do not fit are hidden by default, sort last, and are not "recommended".
- `src/app/planner/PlannerApp.wiring.test.tsx`: default date, blocked or full storage, CSV time format.

## Layout check (real browser)

jsdom has no layout, so it cannot see a button move. `docs/guides/planner-layout-check.py` drives headless Chromium with real key presses and a real mouse at 1280 and 390 px: Save, Discard, Use sample horizon and Clear horizon keep identical bounding boxes before and after each rejected value, and a real mouse click (90 ms hold, aimed in the top fifth of the button) works first time after bad typing. It needs Playwright for Python and its Chromium, which the repo does not depend on:

    ~/tools/shots/bin/python docs/guides/planner-layout-check.py

It starts its own `next dev` on a free port and stops it afterwards; pass a URL to use a server you already run. Exit code 0 means every check passed.

It also measures, after every key and every drag step, the page position of the four buttons and the target list (typing 500 in Start, 91 and 95 in Height, slider drags), that Clear horizon and Add a blocked arc leave Save horizon in place, that no message line is clipped at 1280, 1024, 768, 640, 390 and 360 px, that a click on Save horizon under a toast works and the toast clears, and that Edit horizon lands below the site header.

Last recorded run: `docs/guides/planner-layout-check.out.txt` (88 of 88 checks).

Not done yet from the design review: chart beside the list, cards on phones, jargon renames.
