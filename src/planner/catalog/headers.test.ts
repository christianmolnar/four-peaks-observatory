import nextConfig from '../../../next.config';
import { CATALOG_URL } from './openngc';

describe('next.config headers', () => {
  it('serves the versioned catalog file immutable for a year, and nothing else under /catalog', async () => {
    const rules = await nextConfig.headers!();
    const rule = rules.find((r) => r.source.startsWith('/catalog/'));
    expect(rule).toBeDefined();
    expect(rule!.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
    // The pattern matches the versioned file name the loader asks for, and not the licence note beside it.
    const re = new RegExp(`^${rule!.source.replace('.', '\\.').replace(':version', '[^/]+')}$`);
    expect(re.test(CATALOG_URL)).toBe(true);
    expect(re.test('/catalog/LICENSE-openngc.md')).toBe(false);
    expect(CATALOG_URL).toMatch(/-v\d{8}-r\d+\.json$/);
  });
});
