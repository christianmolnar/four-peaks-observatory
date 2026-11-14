# Planner catalog: bundled OpenNGC extract

## What it is
- Static asset `public/catalog/openngc-v20260501-r2.json`, built from OpenNGC tag v20260501 (Mattia Verga).
- Loaded on first search by `src/planner/catalog/loader.ts`, validated by `openngc.ts`, indexed by `search.ts`.
- Merged with the 25 curated targets in `src/planner/data/targets.json`: a catalog object that shares a designation
  with a curated target, or a common name and a place inside its footprint (NGC 2238 and the Rosette, IC 4703 and the
  Eagle), is not listed; the curated target answers to its numbers and names.
- Served with `Cache-Control: public, max-age=31536000, immutable` (`next.config.ts`). The file name is
  `openngc-<tag>-r<revision>.json`: change the build rules or the tag, bump `REVISION` in the script and the name
  changes with it. Never rebuild different content under the same name.
- Hits are frozen objects shared by every search; callers cannot change them.

## Rebuild
- `node scripts/build-catalog.mjs` fetches `NGC.csv` and `addendum.csv` at the pinned tag and rewrites the asset.
- `node scripts/build-catalog.mjs --src <dir>` reads both files from a local directory instead.
- Output is deterministic; the file records the SHA-256 of both inputs.
- The script exits non-zero if any Messier (other than M102) or any Caldwell object does not resolve.

## Measured (v20260501, revision 2)
- 4,920 objects; 510 of them with aliases (562 aliases); 363 Dup rows folded, 289 Dup rows without a primary in the extract.
- 1,059,983 bytes raw, 158,284 bytes gzip -9. Search index over catalog and curated targets: 4,914 targets.

## Filter rules
- Types kept: galaxies, galaxy pairs/triplets/groups, open and globular clusters, planetary nebulae, nebulae
  (Neb, EmN, RfN, HII, Cl+N), dark nebulae, supernova remnants, `*Ass` (asterisms and star clouds).
- Types dropped: Dup, NonEx, `*`, `**`, Nova, Other.
- Kept: mag (V, else B) 14 or brighter and major axis 1 arcmin or larger. Non-galaxies without a magnitude stay
  (IC 1396, the Rosette, Mel 111); galaxies without one go.
- Always kept: every Messier (M40 is typed `**` and M73 `Other` upstream; both kept), every Caldwell, every object with a common name.
- M102 has no row: OpenNGC lists it only as a duplicate of M101 and says the identification is controversial.
  It is an alias of M101 (so "M102" finds M101); the other candidate, NGC 5866, is not used.
- Surface brightness: galaxies carry the catalog value; everything else is computed from mag and size and
  flagged `sbComputed`. Objects with no magnitude have none.
- Cross-references: the NGC, IC and M columns are split on commas and keep letter suffixes and NED components
  (`0547,2494`, `1487NW`, `4656 NED02`); every number except the row's own becomes an alias (NGC 2244 on NGC 2239).
  The build throws on a value it cannot read; the loader rejects an alias that holds `NaN`.
- Dup rows are dropped as objects, but each one's number is folded into the aliases of the object its NGC, IC or M
  column names, when that object is in the extract (NGC 6533 on the Lagoon, M102 on M101). The build report lists the
  Dup rows whose primary is not in the extract (`dupUnresolved`): those numbers stay unfound. That includes IC 819,
  IC 820, IC 3543 and IC 3546, which duplicate faint lettered components (NGC 4676A, NGC 4565C) below the cut.
- NED components ("NGC 4656 NED01") are kept as separate galaxies, because the group row has no magnitude and
  drops out, so the component is the imaging target (the Hockey Stick). Their ids use a hyphen
  (`ngc4656-ned01`), they carry no NGC number of their own, and they answer to the group number ("NGC 4656").
- Sizes of galaxies may be infrared (2MASS) when LEDA has none; they are not visual sizes.

## Licence handling
- OpenNGC is CC BY-SA 4.0. The extract is Adapted Material and is shared under the same licence.
- The data stays a separate file, never inlined in code; the code is not covered by ShareAlike. This is the
  reading in R-01, not legal advice.
- Licence note next to the file: `public/catalog/LICENSE-openngc.md`.
- Credit shown on the planner page: `src/app/planner/CatalogCredits.tsx`.
- Footer text: "Deep-sky catalog data: OpenNGC by Mattia Verga, CC BY-SA 4.0. Filtered and reformatted by Four
  Peaks Observatory. Includes data from NED, HyperLEDA, SIMBAD (CDS) and HEASARC."

## Names the data does not have
- `src/planner/data/catalog-supplement.json`: popular imaging nicknames, each tied to one catalog object by id
  (Heart, Soul, Pacman, Elephant Trunk, Seven Sisters, Wizard, Seagull, Jellyfish, Witch's Broom, Hockey Stick,
  Sculptor Galaxy, 47 Tucanae, Clownface, Skull). Own work, CC0-1.0, kept apart from the OpenNGC file. Names OpenNGC
  already has (Pelican, Cocoon, Bubble, Crescent, Iris, Cave, Whale, Sunflower, Black Eye, Needle, Horsehead, Double
  Cluster; Monkey Head, Christmas Tree and Cone, Cigar, Leo Triplet, Markarian's Chain among the curated) are not repeated.
- Not added: the Tulip (Sh2-101) and the Virgo Cluster have no catalog object to tie to.
- `src/planner/data/catalog-overrides.json`: corrections to upstream names, each with its reason. Own work, CC0-1.0.
  - IC 434 is not the Flame Nebula (OpenNGC's own note says it is the strip behind the Horsehead). NGC 2024 is.
    IC 434 is named "IC 434" and NGC 2024 "Flame Nebula". No other upstream naming error was verified.
- Both files are applied when the index is built, and the build of the index throws when an id is no longer in the catalog.

## Search rules
- Name keys: NFKC (full-width digits and letters), lower case, apostrophes dropped, a leading "the" dropped, Greek
  letters (symbol or spelled out) as SIMBAD Bayer abbreviations (`ω`, `omega` -> `ome`; `θ` -> `tet`), Barnard -> B,
  Sharpless (with or without the 2) -> Sh2.
- A designation-shaped query (`ngc651`, `ic5`, `c14`) is complete: it matches that designation or an exact name,
  never a prefix. No hit means `notFoundLocally: true`.
- A number alone (`42`, `7000`) means that number in every catalog (M, NGC, IC, Caldwell, in that order); a name
  starting with the digits ("47 Tucanae") also matches; it never matches inside a name.
- Text that normalises to nothing (`🔭`, `.*`) is a miss (`notFoundLocally: true`), not an empty box. Empty text is
  not a miss.
- Filter values must be finite numbers (NaN and Infinity throw), `fovArcmin` positive, `types` known.
