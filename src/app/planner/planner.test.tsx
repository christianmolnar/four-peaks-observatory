import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProfile, withSiteArc } from '@/planner/state';
import { arcPath, describeArc } from './HorizonEditor';
import PlannerApp from './PlannerApp';

// Server render of the first paint (effects do not run): the page for a fixed date and profile.
const render = (profile = sampleProfile(), date = '2026-12-15') =>
  renderToStaticMarkup(<PlannerApp initialDate={date} initialProfile={profile} />);

const siteId = sampleProfile().sites[0].id;
const rows = (html: string) => (html.match(/<tr class="border-b border-white\/10/g) ?? []).length;

describe('planner page', () => {
  const html = render();

  it('renders the controls, the ranked table and the horizon editor', () => {
    expect(html).toContain('IMAGING PLANNER');
    expect(html).toContain('id="plan-date"');
    expect(html).toContain('value="2026-12-15"');
    expect(html).toContain('Fountain Hills, AZ');
    expect(html).toContain('data-testid="target-table"');
    expect(html).toContain('Orion Nebula');
    expect(html).toContain('Why recommended');
    expect(html).toContain('Export CSV');
    expect(html).toContain('Reset to sample');
    expect(rows(html)).toBeGreaterThan(5);
  });

  it('shows the why, score parts and fit detail as text under each row, not as hover titles', () => {
    expect(html).toContain('Why recommended:');
    expect(html).toContain('Score parts: usable');
    expect(html).toContain('Fit: ');
    expect(html).not.toContain('title="usable');
    expect(html).not.toMatch(/Hover a score/);
  });

  it('says only what is true about data leaving the browser', () => {
    expect(html).toContain('stay in this browser');
    expect(html).not.toContain('nothing is sent anywhere');
  });

  it('the empty-profile screen offers the import control it names', () => {
    const empty = render({ ...sampleProfile(), sites: [], plans: [] });
    expect(empty).toContain('for="profile-import"');
    expect(empty).toContain('Reset to sample');
  });

  it('labels every control and gives both charts a text alternative', () => {
    for (const id of ['plan-date', 'plan-site', 'plan-train', 'f-season', 'f-setup', 'profile-import', 'arc-start-number', 'arc-end-number', 'arc-height-number']) {
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain('aria-label="Start azimuth slider"');
    expect(html).toContain('<title id="polar-title">');
    expect(html).toContain('<title id="alt-title">');
    expect(html).toContain('Horizon as a table');
    expect(html).toContain('Altitude as a table');
    expect(html).toContain('Blocked from 120 deg');
  });

  it('shows the sample arc in the summary and the sliders', () => {
    expect(html).toContain('Horizon: blocked 120° (SE) to 320° (NW), 42° high.');
    expect(html).toContain('value="42"');
  });

  it('clearing the arc shows "horizon not set" and the flat minimum in the list', () => {
    const cleared = render(withSiteArc(sampleProfile(), siteId, null));
    expect(cleared).toContain('data-testid="horizon-not-set"');
    expect(cleared).toContain('Horizon not set: only the flat minimum altitude applies.');
    expect(cleared).toContain('flat 20 deg minimum (horizon not set)');
    expect(cleared).toContain('Add a blocked arc');
    expect(cleared).not.toContain('aria-label="Start azimuth slider"');
    expect(html).not.toContain('flat 20 deg minimum');
  });

  it('changing the arc changes the usable windows in the list', () => {
    const open = render(withSiteArc(sampleProfile(), siteId, null));
    const wall = render(withSiteArc(sampleProfile(), siteId, { startAz: 90, endAz: 270, heightDeg: 80 }));
    expect(rows(wall)).toBeLessThan(rows(open));
    expect(open).toMatch(/>Orion Nebula</);
    expect(wall).not.toMatch(/>Orion Nebula</);
  });

  it('with a smart-scope train there is no field-of-view math', () => {
    const p = sampleProfile();
    const smartFirst = { ...p, trains: [...p.trains].sort((a) => (a.kind === 'smart' ? -1 : 1)) };
    const h = render(smartFirst);
    expect(h).toContain('Smart scope');
    expect(h).not.toContain('>Too large<');
  });
});

describe('horizon helpers', () => {
  it('describes the arc and the not-set state in words', () => {
    expect(describeArc(null)).toMatch(/^Horizon not set/);
    expect(describeArc({ startAz: 300, endAz: 60, heightDeg: 35 })).toContain('300 deg (NW) clockwise to 60 deg (NE)');
  });

  it('draws the sector with the large-arc flag only past 180 degrees', () => {
    expect(arcPath({ startAz: 0, endAz: 90, heightDeg: 30 })).toContain('A 120 120 0 0 1');
    expect(arcPath({ startAz: 120, endAz: 320, heightDeg: 42 })).toContain('A 120 120 0 1 1');
    expect(arcPath({ startAz: 300, endAz: 60, heightDeg: 35 })).toContain('A 120 120 0 0 1');
  });
});
