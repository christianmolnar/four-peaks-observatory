# Planner exposure: what is computed and what is assumed

Every exposure number the exposure panel, the itinerary and the several-night plan show comes from `exposureFor` in `src/planner/exposure/index.ts`. A model does not set it.
The AI plan is the one place where a model's numbers still show: see "Who uses it" below.
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

`choice` is `{ preset, overrides? }`. Presets and overrides go through the same function.

## Who uses it

- **The exposure panel** (`planExposure`) calls it once per preset.
- **The itinerary** calls it for each slot's preset. Export CSV and JSON read the itinerary's integration.
- **The several-night plan** works each target's useful range out with it: the least is where Quick stops, the most where Deep stops (`usefulRangeOf`, `planner-campaign.md`). There is no second table.
- **The AI plan panel** shows two things for each slot: the model's numbers (the minutes it wants for the target, and the minutes it plans in the slot, which stay the plan's allocation) and, from `exposureFor`, the sub length and count for those slot minutes
  (Balanced preset, the slot's minutes as the total, no Moon, marked "calculated" with the Bortle class). The model's own sub length is no longer shown.
  Still the model's: the minutes per target and per slot, and the `subSeconds` it must return (the checker's last-slot frame count uses that `subSeconds`, so it can differ from the count the panel calculates).
  Applying an AI plan to the itinerary keeps only a preset per slot (`modeForMinutes`), and the itinerary then plans each slot's own numbers.

## Sub length

- **The rule.** Sub = K x read noise squared / sky rate. Read noise then adds sqrt(1 + 1/K) - 1 to the noise: K = 5 gives 9.5%, 10 gives 4.9%, 20 gives 2.5%.
- **K = 10 is the standard** (was 20, which no source uses). The presets use 5, 10, 20.
- **The sky rate** scales with the Bortle class (SQM), pixel area, 1 / f-ratio squared, the passband width and the Moon.
  Reference: 0.25 e per pixel per second at SQM 20.9, f/5, 3.76 um, 300 nm. A measured background would replace it; the profile has no field for one yet.
- **Read noise** comes from the camera's class in the profile (low 1.0 e, medium 3, high 8). Not set: medium, and a note says so.
- **Then the clamps**, in this order: the 15 s floor (overhead), then the ceiling = the lowest of the preset's risk cap, the 300 s guiding limit, star saturation and, for a flagged bright core, 120 s.
  The result snaps to 15, 20, 30, 45, 60, 90, 120, 180, 240 or 300 s and never goes above the ceiling.
- **Dual-narrowband at f/10** breaks the rule: Bortle 6 asks for about 420 s. The plan takes the cap (300 s, 180 s in Quick), accepts the penalty and shows it (6.8% and 11%).
- **HyperStar** asks for 1 to 3 s by the rule with no filter; the floor holds it at 15 s, and star saturation caps it near 28 s (f/1.93, no filter).
  Star saturation takes the filter into account: stars are continuum, so a filter passing a fraction of the band lets stars take that much longer to clip, and the cap is multiplied by 300 nm over the passband (50 nm: 6x, about 170 s; 14 nm: 21x, about 600 s).
  The 30 s behind it is one report, probably unfiltered; the scaling is this module's arithmetic, not a measurement.
  So HyperStar with a dual-band at Bortle 4 takes about 60 s (Balanced), 30 s Quick and 120 s Deep, and the 7+7 nm filter at f/2 asks for about 220 s, which is within the 300 s guiding ceiling.
- **The f-ratio changes the sub, not the hours** (next section).

## Total light

- **The knee is set by the object.** Time to a signal-to-noise per 2.5 arcsec element, sky-limited: T = SNR squared x (S_obj + S_sky) / S_obj squared, so T grows as (1 + C) / C squared with the object's contrast C = 10^(0.4 (SQM - surface brightness)).
  Halving the contrast quadruples the time.
- **Aperture sets the hours**: the same C11 gives the same minutes at f/10, f/7 and f/1.93. The code needs the aperture, which comes from f-ratio, pixel size and image scale together.
- **The count rounds up**, so the plan reaches the stop point (and the 30 minute minimum) instead of falling up to one sub short; the usable window still cuts it.
- **The stop point** is the sooner of two things: the preset's SNR target, and the point where 30 more minutes add less than the preset's share (20%, 10%, 5%: 68, 143 and 293 minutes).
  It is never below 30 minutes (setup costs 30). Then the usable window cuts it.
- **Surface brightness** comes from the catalog number (mag per square arcsec). A class without a number stands for its row (high 20, medium 22, low 24); a cluster or planetary nebula is high; nothing else is known, so medium is assumed and a note says so.
- **A filter** passes an emission object's lines (85%) and cuts the sky by the passband, so contrast rises; a continuum object loses light with the sky. Types nebula, planetary-nebula and supernova-remnant count as emission.
- **A faint object may never reach the target** in a night; the plan then stops at the diminishing-returns point and says it is short of the target (`short-of-target`).
  The note prints the time as minutes under 2 hours, hours under 10 hours and "more than 10 hours, beyond one night" past that, never a count in the thousands.
  It suggests a narrower filter only for emission types; for a continuum object (a galaxy, a cluster) it says a narrower filter would not help, because the filter cuts the object with the sky.
  Rounding the count up means the note no longer fires from flooring alone.

## Presets

A preset is parameters, not a total. Saved itineraries keep the names `quick`, `balanced`, `deep`.

| Preset | K | SNR target | Stops when 30 more min add under | Longest sub |
|---|---|---|---|---|
| Quick & Beautiful | 5 | 20 | 20% | 180 s |
| Balanced | 10 | 40 | 10% | 300 s |
| Deep Project | 20 | 60 | 5% | 300 s |

All three dither every 3 subs and not more often than every 120 s.

A bright object needs about 30 minutes in every preset: even SNR 60 takes under 30 minutes at surface brightness 20 to 21, so the minimum total holds all three at 30 minutes and the cards differ only in sub length and count (for example 30 s x 60, 60 s x 30, 120 s x 15 on a C11 at f/10).
That follows from the research ("for a bright object the preset gives under an hour"); the preset descriptions say it. Beyond about surface brightness 22.5 in Bortle 6 every object takes the same diminishing-returns stops (68, 143 and 293 minutes).
The SNR targets 40 and 60 put a medium object in Bortle 6 at about 1.7 h and 3.9 h without a filter: the first is inside the research's 0.5 to 2.5 h at the knee, the second is above it and below the 4.9 h of Deep's own 5% knee.

## Custom

Overrides are `subSeconds`, `subCount` and `totalMin`. Any override that differs from the preset's own value makes the result `custom: true` and lists each difference (`field`, the preset's value, the chosen one).
A chosen sub is used as given: not snapped, not capped. The usable window still limits the count. There is no screen for it yet.

## Constants that are assumptions

All live in `src/planner/exposure/constants.ts`, each with its reason.

- Sky reference rate (0.25), the Bortle to SQM table, the Moon gain (3): no measurement behind them.
- Read noise per class; the research uses 1.0 e for the ASI2600MC Duo at gain 100 and the ZWO documents disagree (0.9 to 4.2 e, 1.0 to 3.3 e).
- The SNR targets (20, 40, 60) and the 2.5 arcsec element. 20 is the research's figure; 40 and 60 are 2x and 3x it, not measured (see Presets for where that puts a medium object).
- Risk caps (180, 300 s): a loss model with one event per hour, not a measurement.
- Floor (15 s), overhead per sub (10 s), the star-saturation reference (30 s at f/2, one report, scaled by the passband), the bright-core cap (120 s, the top of a broadband fast-reflector range).
- Surface brightness class cuts (22 and 24), and the catalog's B-band number used against the sky as if it were the same band.
- Emission types, the 85% filter throughput.

## Warnings

Every code the module produces is reachable (tests cover each): the filter-fit ones, `inputs-assumed`, `sampling`, `moon-near`, `target-ou4`, `no-usable-time`, `limited-by-usable-time`, `below-mode-range`, `short-session-faint` (a warning, in Quick, now that the catalog's surface brightness reaches it), `short-session-unknown`, `sb-assumed`, `short-of-target`, `sub-capped` and `meridian-flip`.
`below-mode-range` now means the plan is under half of the total the stop point asked for.
