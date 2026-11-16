import { renderToStaticMarkup } from 'react-dom/server';
import { sampleProfile, withSiteArcs } from '@/planner/state';
import { arcPath, describeArcs } from './HorizonEditor';
import PlannerApp from './PlannerApp';

// Server render of the first paint (effects do not run): the page for a fixed date and profile.
const render = (profile = sampleProfile(), date = '2026-12-15') =>
  renderToStaticMarkup(<PlannerApp initialDate={date} initialProfile={profile} />);

/** The sample profile with one train moved first, since the page opens on the first train. */
const withTrainFirst = (id: string) => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === id ? -1 : 1)) };
};
const wideProfile = () => withTrainFirst('wide-c11-hyperstar-2600');
const siteId = sampleProfile().sites[0].id;

describe('planner page', () => {
  const html = render(wideProfile());

  it('renders the controls, the search, the loading state of the list and the horizon editor (the list itself is ranked off the render)', () => {
    expect(html).toContain('IMAGING PLANNER');
    expect(html).toContain('id="plan-date"');
    expect(html).toContain('value="2026-12-15"');
    expect(html).toContain('Fountain Hills, AZ');
    expect(html).toContain('Best targets for');
    expect(html).toContain('Ranking the whole catalog');
    expect(html).not.toContain('data-testid="target-list"');
    expect(html).toContain('Search the catalog by name or number');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('Gear and site');
    expect(html).toContain('PLAN: ');
    expect(html).toContain('More');
    expect(html).toContain('Reset all');
    expect(html).not.toContain('Replace profile with sample');
  });

  it('says only what is true about data leaving the browser, in the Gear and site tab', () => {
    expect(html).toContain('stay in this browser');
    expect(html).not.toContain('nothing is sent anywhere');
  });

  it('the empty-profile screen offers the import control it names', () => {
    const empty = render({ ...sampleProfile(), sites: [], plans: [] });
    expect(empty).toContain('for="profile-import"');
    expect(empty).toContain('Reset all');
  });

  it('labels every control and gives both charts a text alternative', () => {
    for (const id of ['plan-date', 'plan-site', 'plan-train', 'f-type', 'profile-import', 'arc-start-number', 'arc-end-number', 'arc-height-number']) {
      expect(html).toContain(`for="${id}"`);
    }
    expect(html).toContain('aria-label="Blocked from slider"');
    expect(html).toContain('<title id="polar-title">');
    expect(html).toContain('Horizon as a table');
    expect(html).toContain('Blocked from 120 deg');
  });

  it('shows the sample arc in the summary and the sliders', () => {
    expect(html).toContain('Horizon: blocked 120° (SE) to 320° (NW), 42° high.');
    expect(html).toContain('value="42"');
  });

  it('clearing the arc shows "horizon not set" and the flat minimum in the list', () => {
    const cleared = render(withSiteArcs(wideProfile(), siteId, []));
    expect(cleared).toContain('data-testid="horizon-not-set"');
    expect(cleared).toContain('Horizon not set: only the flat minimum altitude applies.');
    expect(cleared).toContain('Add a zone');
    expect(cleared).not.toContain('aria-label="Blocked from slider"');
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
    expect(describeArcs([])).toMatch(/^Horizon not set/);
    expect(describeArcs([{ startAz: 300, endAz: 60, heightDeg: 35 }])).toContain('300 deg (NW) clockwise to 60 deg (NE)');
    expect(describeArcs([{ startAz: 300, endAz: 60, heightDeg: 35 }, { startAz: 120, endAz: 200, heightDeg: 20 }])).toMatch(/^2 blocked zones: 1, from 300 deg.*; 2, from 120 deg/);
  });

  it('draws the sector with the large-arc flag only past 180 degrees', () => {
    expect(arcPath({ startAz: 0, endAz: 90, heightDeg: 30 })).toContain('A 120 120 0 0 1');
    expect(arcPath({ startAz: 120, endAz: 320, heightDeg: 42 })).toContain('A 120 120 0 1 1');
    expect(arcPath({ startAz: 300, endAz: 60, heightDeg: 35 })).toContain('A 120 120 0 0 1');
  });
});
