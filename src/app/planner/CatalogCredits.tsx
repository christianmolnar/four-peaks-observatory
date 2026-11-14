// CC BY-SA 4.0 credit for the bundled OpenNGC extract (public/catalog). Wording: docs/reference/planner-catalog.md.
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
      HEASARC.
    </footer>
  );
}
