# Planner: site location lookup

Fills latitude, longitude, elevation and time zone in the site editor ("Find my site").
Sky darkness (Bortle) is not looked up; it stays the editable site box until the atlas licence is decided.

## What runs where

- `GET /api/planner/geocode?q=`: place or postal code, up to 5 candidates (`src/app/api/planner/geocode/route.ts`).
- `GET /api/planner/elevation?lat=&lon=`: metres, or `null` when the service has no height (`.../elevation/route.ts`).
- Time zone for hand-entered coordinates and Nominatim results: `@photostructure/tz-lookup` 11.8.0 (maintained fork of `tz-lookup`), in the browser, offline. 73 KB of boundary data, 29 KB gzipped, the same size as the 6.1.25 package it replaced. Less exact right at zone borders and at sea. The old package had pre-2022 data (Ciudad Juárez came out as America/Ojinaga, one hour off); the fork gets it right (America/Ciudad_Juarez, test in `timezone.test.ts`). Open-Meteo results carry the geocoder's own zone.
- Code: `src/planner/location/` (`client.ts` for the browser, `geocode.ts` for the server, `limits.ts` for the caps).
- UI: `src/app/planner/SiteFinder.tsx`, used by `ProfileEditor.tsx`.

## Sources

- **Open-Meteo geocoding** (primary): returns coordinates, elevation (90 m DEM) and time zone in one call. A ZIP returns the city, not a ZIP centroid.
  - Terms: free for non-commercial use, under 10,000 calls a day, 600 a minute, CC BY 4.0 with attribution. https://open-meteo.com/en/terms
  - Our own daily cap (2,000) keeps well inside that.
- **Open-Meteo elevation** (hand-entered coordinates, and Nominatim results): `api.open-meteo.com/v1/elevation`. 5 s timeout.
- **Open Topo Data** (elevation backup, asked only when Open-Meteo's elevation call fails): `api.opentopodata.org/v1/ned10m,srtm30m`. USGS NED 10 m inside the United States, SRTM 30 m elsewhere (public-domain data); a point neither covers has no height (`null`), which is not an error.
  - Terms (https://www.opentopodata.org/, public API): free, no key; max 100 locations per request, 1 call a second, 1,000 calls a day.
  - We stay inside them: one call a second through the same slot gate as Nominatim (own key `planner:loc:topo:`), and a daily budget of 900 (`TOPO_DAILY_CAP`); past it the backup is skipped and elevation is simply not filled in.
  - Server side only (our route calls it), so CORS does not apply. Cached in the same 24 h height cache as Open-Meteo answers.
  - Elevation stays an editable box; "no elevation" is never an error state, only a note.
- **Nominatim** (fallback, only when Open-Meteo errors or finds nothing): OpenStreetMap data, ODbL. Policy: https://operations.osmfoundation.org/policies/nominatim/
  - US ZIP search by Nominatim is unreliable (a 5-digit query matches other countries; the `postalcode` parameter returned nothing in testing). It is a fallback, so candidates always show their country.

## Attribution (shown under the results)

- "Place search and elevation by Open-Meteo.com (CC BY 4.0)." Always.
- "Elevation backup: Open Topo Data (USGS NED and SRTM data)." Same line, always.
- "Contains data from OpenStreetMap contributors (ODbL)." Under the results, only when a Nominatim result was returned.
- Planner page footer (`CatalogCredits.tsx`, next to the catalog credit), always: "Time-zone boundaries from timezone-boundary-builder, built from OpenStreetMap contributors, ODbL." The offline time zone comes from boundaries that originate in OpenStreetMap, so the credit is owed whether or not Nominatim ran.

## Query rules

- 2 to 100 characters, no control characters (400 otherwise).
- "City, ST" or "City, State": Open-Meteo is asked for the city; the part after the comma filters by state, county or country (US state codes understood). No match falls through to Nominatim.
- "City State" with no comma ("Tucson Arizona", "Tucson AZ"): a trailing US state name, or an upper-case two-letter code, is split off and used as the filter, so Open-Meteo answers it without a Nominatim call. A lower-case "az" is left as part of the name.
- ZIP+4 is cut to the 5 digits. Other postcodes go through as typed.
- Street addresses are not wanted (the box says so). A leading house number is dropped before anything is sent or cached ("123 Main St, Phoenix" becomes "Main St, Phoenix"), only when the first part has a street word, so "29 Palms, CA" is untouched. Nothing else about an address is stripped.
- Result order: a 5-digit search lists United States matches first (stable), then other countries' postcodes. Every other search keeps the geocoder's own order; there is no locale-based ordering.
- Elevation requests and the elevation cache use the same rounding, 5 decimals (about 1 m). The browser rounds typed coordinates to 5 decimals before asking, so a Google Maps paste with 14 decimals works. The route itself accepts at most 8 decimals.
- Reply bodies are read as a stream and cut off at 256 KB (a larger `Content-Length` is refused before reading).
- Elevation of -9999 (no data) is dropped, never shown.

## Nominatim policy, as implemented

- Button press only: no autocomplete anywhere.
- One request per second: callers queue in one server instance, and claim a one-second slot in the counter store, refused while the slot before it is taken. Claimed slots are never adjacent, so two requests are always more than 1 s apart.
  - **The gate spans server instances only when KV is configured** (the counter store is then shared). Without KV the store is in memory, so the gate is per instance: two instances can each send one request in the same second. Check that the KV env vars are set in production before relying on the app-wide limit.
  - Residual risk, even with KV: two instances racing between the check and the claim.
- User-Agent: `FourPeaksObservatory-planner/1.0 (+https://fourpeaksobservatory.com; ...)`. No personal contact data.
- Results cached 24 h in memory (500 entries) and at the CDN (`s-maxage=86400`). Empty and failed answers are not cached.
- Switch without a release: set env `PLANNER_NOMINATIM=off` (Open-Meteo only; an Open-Meteo outage then reads as "not available").

## Limits (fail closed)

- Per visitor: 30 lookups an hour. Whole site: 2,000 a day (UTC). Env: `PLANNER_LOCATION_PER_HOUR`, `PLANNER_LOCATION_PER_DAY` (a malformed value is a 503, never a silent default).
- Same visitor key and counter store as the AI plan (`guest-limits.ts`, `counter-store.ts`), own key prefix `planner:loc:`. The key is an HMAC of the IP bucket; no IP is stored or logged.
- A cache hit costs nothing. A miss is one lookup, whatever the number of outbound calls behind it.
- 429 with `Retry-After` when a cap is reached. 503 when the counter store, the cap setting or the visitor secret is unavailable. 502 with a plain message when both services are down.
- Every outbound call has a timeout: 6 s place search (each service), 5 s per elevation source.
- Place search, worst case about 18 s (pinned in `geocode.test.ts`): Open-Meteo 6 s, Nominatim queue 3 s, Nominatim 6 s, then 3 s shared by both elevation sources (if they have not answered the heights are left out). The route allows 30 s; the browser waits 25 s.
- Elevation lookup for typed coordinates, worst case about 14 s: Open-Meteo 5 s, Open Topo Data queue up to 4 s, its call 5 s. The route allows 15 s.

## Elevation endpoint reachability

- Measured 2026-11-13 from the dev machine (WSL2, Phoenix), with curl, 20 s limit, polite spacing: `api.open-meteo.com/v1/elevation` **never connected**. 8 of 8 finished attempts failed the same way (6 at the 20 s limit, 2 at 8 and 12 s; a 7th was cancelled): DNS in 25 ms, TCP connect never completes (the host has the single address 51.81.167.44; IPv6 is refused at once). Not a slow answer, so a longer timeout would not help, and it is not our route.
- `geocoding-api.open-meteo.com` (a different host) answered at the same time in 0.8 s, so this is that one address from this network, not Open-Meteo as a whole. Whether Vercel can reach it is not measured here; an earlier session saw it answer from this machine (335 m), so it is **intermittent**, not permanently down.
- Open Topo Data from the same machine: 200 in 0.3 to 0.6 s on 5 of 5 calls (Phoenix 330.6 m from NED against 355.8 from the Open-Elevation instance and 364 from SRTM; Tokyo 40 m from SRTM; a two-point batch with the dataset list worked).
- USGS EPQS (`epqs.nationalmap.gov`): TLS connected, no answer within 12 s on 2 of 2 calls. Not used.
- Open-Elevation public instance: answered, but 90 m SRTM only (25 m off at Phoenix) and a volunteer-run service. Not used.
- Behaviour: Open-Meteo first with a 5 s timeout; on any upstream failure Open Topo Data is asked once; if both fail the box stays editable and the page says "Elevation was not filled in: ...".
- Check on Vercel: `curl "https://<site>/api/planner/elevation?lat=33.4484&lon=-112.074"` should return `{"elevationM":331}` (or 331 from the backup).

## Saved values are protected

- A lookup never silently replaces a value already in a site box. "Use" fills empty boxes, and boxes an earlier lookup in this session filled and the user has not edited since. Everything else (saved values, anything typed) is kept.
- Each result shows "Would change: Latitude 33.6 to 33.4484, ..." for what Use would keep, with a "Replace" button that overwrites it. The status message lists what was kept ("Kept your own entries for: ...") and what was replaced ("Replaced: Latitude 33.6 to 33.4484").
- After Use or Replace, focus moves to the status message.
- The same rule applies to "Look up elevation and time zone".
- A result is merged against the boxes as they are when it arrives, not as they were when the button was pressed. Typing in any box while a lookup runs is never overwritten, and if the latitude or longitude changed meanwhile nothing is written.
- A waiting "Replace" from a coordinate lookup belongs to those coordinates: change either box and it disappears. It also disappears when nothing would change any more.
- The status sentence is built from what happened: "Filled in the elevation for these coordinates." names only boxes written; "Kept your own entries for: ..." names those left alone.

## Tests

- `src/planner/location/*.test.ts`, `src/app/api/planner/geocode/route.test.ts`, `src/app/planner/SiteFinder.test.tsx`, `bounded-fetch.test.ts`. All use fake fetch; no network.
