import { renderToStaticMarkup } from 'react-dom/server';
import CatalogCredits from './CatalogCredits';

describe('catalog credits', () => {
  const html = renderToStaticMarkup(<CatalogCredits />);
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

  it('credits OpenNGC, its licence and the upstream databases', () => {
    expect(text).toContain('OpenNGC by Mattia Verga, CC BY-SA 4.0');
    expect(text).toContain('Filtered and reformatted by Four Peaks Observatory');
    for (const db of ['NED', 'HyperLEDA', 'SIMBAD (CDS)', 'HEASARC']) expect(text).toContain(db);
    expect(html).toContain('href="https://github.com/mattiaverga/OpenNGC"');
    expect(html).toContain('href="https://creativecommons.org/licenses/by-sa/4.0/"');
  });

  it('credits OpenStreetMap for the time-zone boundaries, under ODbL, always', () => {
    expect(text).toContain('Time-zone boundaries');
    expect(text).toContain('OpenStreetMap contributors');
    expect(text).toContain('timezone-boundary-builder');
    expect(text).toContain('ODbL');
    expect(html).toContain('href="https://www.openstreetmap.org/copyright"');
    expect(html).toContain('href="https://opendatacommons.org/licenses/odbl/1-0/"');
    expect(html).toContain('href="https://github.com/evansiroky/timezone-boundary-builder"');
  });
});
