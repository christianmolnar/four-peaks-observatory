// Planner footer credits: CC BY-SA 4.0 for the bundled OpenNGC extract (public/catalog; wording: docs/reference/planner-catalog.md), and ODbL for the OpenStreetMap-derived time-zone boundaries in the site-location lookup (docs/guides/planner-location-lookup.md).
export default function CatalogCredits() {
  return (
    <footer className="mt-10 text-xs text-gray-500 print:hidden">
      Deep-sky catalog data:{' '}
      <a className="underline" href="https://github.com/mattiaverga/OpenNGC" rel="noreferrer">
        OpenNGC
      </a>{' '}
      by Mattia Verga,{' '}
      <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noreferrer">
        CC BY-SA 4.0
      </a>
      . Filtered and reformatted by Four Peaks Observatory. Includes data from NED, HyperLEDA, SIMBAD (CDS) and
      HEASARC. Time-zone boundaries from{' '}
      <a className="underline" href="https://github.com/evansiroky/timezone-boundary-builder" rel="noreferrer">
        timezone-boundary-builder
      </a>
      , built from{' '}
      <a className="underline" href="https://www.openstreetmap.org/copyright" rel="noreferrer">
        OpenStreetMap contributors
      </a>
      ,{' '}
      <a className="underline" href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noreferrer">
        ODbL
      </a>
      .
    </footer>
  );
}
