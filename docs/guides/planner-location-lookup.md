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
- **Open-Meteo elevation** (hand-entered coordinates, and Nominatim results): `api.open-meteo.com/v1/elevation`.
- **Nominatim** (fallback, only when Open-Meteo errors or finds nothing): OpenStreetMap data, ODbL. Policy: https://operations.osmfoundation.org/policies/nominatim/
  - US ZIP search by Nominatim is unreliable (a 5-digit query matches other countries; the `postalcode` parameter returned nothing in testing). It is a fallback, so candidates always show their country.

## Attribution (shown under the results)

- "Place search and elevation by Open-Meteo.com (CC BY 4.0)." Always.
- "Contains data from OpenStreetMap contributors (ODbL)." Only when a Nominatim result was returned.

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
- Every outbound call has a timeout: 6 s place search (each service), 5 s elevation. The browser waits at most 20 s.

## Elevation endpoint reachability

- `api.open-meteo.com/v1/elevation` answered from the dev machine on 2026-11-13 (335 m for 33.45, -112.07). An earlier timeout from this machine did not repeat.
- If it is ever unreachable, the box stays editable and the page says "Elevation was not filled in: ...".
- Check on Vercel: `curl "https://<site>/api/planner/elevation?lat=33.4484&lon=-112.074"` should return `{"elevationM":331}`.

## Saved values are protected

- A lookup never silently replaces a value already in a site box. "Use" fills empty boxes, and boxes an earlier lookup in this session filled and the user has not edited since. Everything else (saved values, anything typed) is kept.
- Each result shows "Would change: Latitude 33.6 to 33.4484, ..." for what Use would keep, with a "Replace" button that overwrites it. The status message lists what was kept ("Kept your own entries for: ...") and what was replaced ("Replaced: Latitude 33.6 to 33.4484").
- After Use or Replace, focus moves to the status message.
- The same rule applies to "Look up elevation and time zone".

## Tests

- `src/planner/location/*.test.ts`, `src/app/api/planner/geocode/route.test.ts`, `src/app/planner/SiteFinder.test.tsx`, `bounded-fetch.test.ts`. All use fake fetch; no network.
