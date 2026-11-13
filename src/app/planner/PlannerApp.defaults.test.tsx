/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// The page opens on what the user already chose: tonight's sky, the gear picked at the top, nothing asked twice.

const narrow = () => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === 'deep-c11-2600' ? -1 : 1)) };
};
const app = () => render(<PlannerApp initialDate="2026-12-15" initialProfile={narrow()} />);

afterEach(cleanup);

describe('planner defaults', () => {
  it('opens with Season "In season tonight" and Type "All"', () => {
    app();
    expect((screen.getByLabelText('Season') as HTMLSelectElement).value).toBe('in');
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('all');
  });

  it('still lets the user widen the season', async () => {
    app();
    const season = screen.getByLabelText('Season') as HTMLSelectElement;
    expect([...season.options].map((o) => o.value)).toEqual(['all', 'in', 'out']);
    const count = () => screen.getByTestId('target-table').querySelectorAll('th[scope="row"]').length;
    const inSeason = count();
    await userEvent.setup().selectOptions(season, 'all');
    expect(count()).toBeGreaterThan(inSeason);
  });

  it('has one gear selector: Train; the Type filter offers only target types', () => {
    app();
    expect(screen.getAllByLabelText('Train')).toHaveLength(1);
    expect(screen.queryByLabelText('Setup')).toBeNull();
    const type = screen.getByLabelText('Type') as HTMLSelectElement;
    expect([...type.options].map((o) => o.textContent)).toEqual(['All', 'Deep-sky', 'Planets']);
    expect(screen.queryByText(/Fits this setup/)).toBeNull();
    expect(screen.queryByText(/Too large for this setup/)).toBeNull();
  });

  it('shows only targets that fit the Train, and the toggle adds the too-large ones', async () => {
    app();
    const rows = () => screen.getByTestId('target-table').textContent as string;
    expect(rows()).not.toContain('Too large');
    await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Show targets that do not fit' }));
    expect(rows()).toContain('Too large');
  });
});
