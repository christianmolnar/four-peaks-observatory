# Planner exposure: what is computed and what is assumed

Every exposure number comes from `exposureFor` in `src/planner/exposure/index.ts`. A model does not set it.
The AI plan may rank and explain; sub length, count, total, dither and stops are recomputed here.
Every number is an estimate. Research and sources: `~/Token/research/fourpeaks-exposure-modes.md`.
Starting parameters for the owner's rigs: `planner-exposure-table.md` (regenerate with `node scripts/planner-exposure-table.mjs --out docs/guides/planner-exposure-table.md`).

## The entry point

`exposureFor(object, rig, site, night, choice)` returns, for one object:

- Sub length, count and total light, each with a range.
- The stop point (the knee) and why the plan stops there.
- What limited the sub (read noise, risk cap, saturation, floor) and the total (SNR target, diminishing returns, usable window, 30 minute minimum).
- Read-noise penalty at the chosen sub, dither interval, overhead, elapsed time and finish.
- A gain note (there is no gain or HCG point in the profile, so it says "none"), a filter note and the warnings.
- `source: 'calculated'`, so a screen can tag it.

`planExposure` (the panel) calls it once per preset; the itinerary calls it for the slot's preset.
`choice` is `{ preset, overrides? }`. Presets and overrides go through the same function.

## Sub length

- **The rule.** Sub = K x read noise squared / sky rate. Read noise then adds sqrt(1 + 1/K) - 1 to the noise: K = 5 gives 9.5%, 10 gives 4.9%, 20 gives 2.5%.
- **K = 10 is the standard** (was 20, which no source uses). The presets use 5, 10, 20.
- **The sky rate** scales with the Bortle class (SQM), pixel area, 1 / f-ratio squared, the passband width and the Moon.
  Reference: 0.25 e per pixel per second at SQM 20.9, f/5, 3.76 um, 300 nm. A measured background would replace it; the profile has no field for one yet.
- **Read noise** comes from the camera's class in the profile (low 1.0 e, medium 3, high 8). Not set: medium, and a note says so.
- **Then the clamps**, in this order: the 15 s floor (overhead), then the ceiling = the lowest of the preset's risk cap, the 300 s guiding limit, star saturation and, for a flagged bright core, 120 s.
  The result snaps to 15, 20, 30, 45, 60, 90, 120, 180, 240 or 300 s and never goes above the ceiling.
- **Dual-narrowband at f/10** breaks the rule: Bortle 6 asks for about 420 s. The plan takes the cap (300 s, 180 s in Quick), accepts the penalty and shows it (6.8% and 11%).
- **HyperStar** asks for 1 to 3 s by the rule; the floor holds it at 15 s, and star saturation caps it near 28 s.
- **The f-ratio changes the sub, not the hours** (next section).

## Total light

- **The knee is set by the object.** Time to a signal-to-noise per 2.5 arcsec element, sky-limited: T = SNR squared x (S_obj + S_sky) / S_obj squared, so T grows as (1 + C) / C squared with the object's contrast C = 10^(0.4 (SQM - surface brightness)).
  Halving the contrast quadruples the time.
- **Aperture sets the hours**: the same C11 gives the same minutes at f/10, f/7 and f/1.93. The code needs the aperture, which comes from f-ratio, pixel size and image scale together.
- **The stop point** is the sooner of two things: the preset's SNR target, and the point where 30 more minutes add less than the preset's share (20%, 10%, 5%: 68, 143 and 293 minutes).
  It is never below 30 minutes (setup costs 30). Then the usable window cuts it.
- **Surface brightness** comes from the catalog number (mag per square arcsec). A class without a number stands for its row (high 20, medium 22, low 24); a cluster or planetary nebula is high; nothing else is known, so medium is assumed and a note says so.
- **A filter** passes an emission object's lines (85%) and cuts the sky by the passband, so contrast rises; a continuum object loses light with the sky. Types nebula, planetary-nebula and supernova-remnant count as emission.
- **A faint object may never reach the target** in a night; the plan then stops at the diminishing-returns point and says it is short of the target.

## Presets

A preset is parameters, not a total. Saved itineraries keep the names `quick`, `balanced`, `deep`.

| Preset | K | SNR target | Stops when 30 more min add under | Longest sub |
|---|---|---|---|---|
| Quick & Beautiful | 5 | 20 | 20% | 180 s |
| Balanced | 10 | 40 | 10% | 300 s |
| Deep Project | 20 | 60 | 5% | 300 s |

All three dither every 3 subs and not more often than every 120 s.

## Custom

Overrides are `subSeconds`, `subCount` and `totalMin`. Any override that differs from the preset's own value makes the result `custom: true` and lists each difference (`field`, the preset's value, the chosen one).
A chosen sub is used as given: not snapped, not capped. The usable window still limits the count. There is no screen for it yet.

## Constants that are assumptions

All live in `src/planner/exposure/constants.ts`, each with its reason.

- Sky reference rate (0.25), the Bortle to SQM table, the Moon gain (3): no measurement behind them.
- Read noise per class; the research uses 1.0 e for the ASI2600MC Duo at gain 100 and the ZWO documents disagree (0.9 to 4.2 e, 1.0 to 3.3 e).
- The SNR targets (20, 40, 60) and the 2.5 arcsec element. 20 is the research's figure; 40 and 60 are chosen so a medium object in Bortle 6 lands in the research's 0.5 to 2.5 hours.
- Risk caps (180, 300 s): a loss model with one event per hour, not a measurement.
- Floor (15 s), overhead per sub (10 s), the star-saturation reference (30 s at f/2, one report), the bright-core cap (120 s).
- Surface brightness class cuts (22 and 24), and the catalog's B-band number used against the sky as if it were the same band.
- Emission types, the 85% filter throughput.

## Warnings

Every code the module produces is reachable (tests cover each): the filter-fit ones, `inputs-assumed`, `sampling`, `moon-near`, `target-ou4`, `no-usable-time`, `limited-by-usable-time`, `below-mode-range`, `short-session-faint` (a warning, in Quick, now that the catalog's surface brightness reaches it), `short-session-unknown`, `sb-assumed`, `short-of-target`, `sub-capped` and `meridian-flip`.
`below-mode-range` now means the plan is under half of the total the stop point asked for.
