import { readFileSync } from 'fs';
import { join } from 'path';

// The planner must stay prerendered (static, CDN-cached). Reading cookies/headers or forcing dynamic would break that.
describe('planner page is static', () => {
  const src = readFileSync(join(__dirname, 'page.tsx'), 'utf8');
  it('does not force dynamic rendering', () => {
    expect(src).not.toMatch(/export\s+const\s+dynamic\s*=/);
    expect(src).not.toMatch(/export\s+const\s+revalidate\s*=\s*0/);
  });
  it('reads no request data and is not async', () => {
    expect(src).not.toMatch(/from\s+['"]next\/headers['"]/);
    expect(src).not.toMatch(/@\/auth['"]/);
    expect(src).not.toMatch(/async\s+function\s+PlannerPage/);
  });
});

describe('planner page credits', () => {
  it('shows the OpenNGC attribution', () => {
    expect(readFileSync(join(__dirname, 'page.tsx'), 'utf8')).toContain('<CatalogCredits />');
  });
});

describe('planner page sign-in', () => {
  // That the control is in the planner's header row is a rendered check: PlannerApp.plans.test.tsx "has sign-in in the header row".
  it('keeps no sign-in in the page footer: the control is in the planner header', () => {
    expect(readFileSync(join(__dirname, 'page.tsx'), 'utf8')).not.toContain('AuthControl');
  });
});

describe('planner page header', () => {
  it('uses the slim 48 px site header (this page only)', () => {
    expect(readFileSync(join(__dirname, 'page.tsx'), 'utf8')).toContain('<SiteLayout slim>');
  });
});
