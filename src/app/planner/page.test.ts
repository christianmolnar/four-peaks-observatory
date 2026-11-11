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
