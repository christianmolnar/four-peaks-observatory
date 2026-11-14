# Planner catalog: bundled OpenNGC extract

## What it is
- Static asset `public/catalog/openngc-v20260501.json`, built from OpenNGC tag v20260501 (Mattia Verga).
- Loaded on first search by `src/planner/catalog/loader.ts`, validated by `openngc.ts`, indexed by `search.ts`.
- Merged with the 25 curated targets in `src/planner/data/targets.json`: a catalog object that shares a designation
  with a curated target is not listed; the curated target answers to its numbers and names.

## Rebuild
- `node scripts/build-catalog.mjs` fetches `NGC.csv` and `addendum.csv` at the pinned tag and rewrites the asset.
- `node scripts/build-catalog.mjs --src <dir>` reads both files from a local directory instead.
- Output is deterministic; the file records the SHA-256 of both inputs.
- The script exits non-zero if any Messier (other than M102) or any Caldwell object does not resolve.

## Filter rules
- Types kept: galaxies, galaxy pairs/triplets/groups, open and globular clusters, planetary nebulae, nebulae
  (Neb, EmN, RfN, HII, Cl+N), dark nebulae, supernova remnants, `*Ass` (asterisms and star clouds).
- Types dropped: Dup, NonEx, `*`, `**`, Nova, Other.
- Kept: mag (V, else B) 14 or brighter and major axis 1 arcmin or larger. Non-galaxies without a magnitude stay
  (IC 1396, the Rosette, Mel 111); galaxies without one go.
- Always kept: every Messier (M40 is typed `**` and M73 `Other` upstream; both kept), every Caldwell, every object with a common name.
- M102 is absent: OpenNGC lists it only as a duplicate of M101.
- Surface brightness: galaxies carry the catalog value; everything else is computed from mag and size and
  flagged `sbComputed`. Objects with no magnitude have none.
- Sizes of galaxies may be infrared (2MASS) when LEDA has none; they are not visual sizes.

## Licence handling
- OpenNGC is CC BY-SA 4.0. The extract is Adapted Material and is shared under the same licence.
- The data stays a separate file, never inlined in code; the code is not covered by ShareAlike. This is the
  reading in R-01, not legal advice.
- Licence note next to the file: `public/catalog/LICENSE-openngc.md`.
- Credit shown on the planner page: `src/app/planner/CatalogCredits.tsx`.
- Footer text: "Deep-sky catalog data: OpenNGC by Mattia Verga, CC BY-SA 4.0. Filtered and reformatted by Four
  Peaks Observatory. Includes data from NED, HyperLEDA, SIMBAD (CDS) and HEASARC."
