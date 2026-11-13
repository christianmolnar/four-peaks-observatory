/**
 * @jest-environment jsdom
 */
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile, defaultDateForProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// The page opens on what the user already chose: tonight's sky, the gear picked at the top, nothing asked twice.

const narrow = () => {
  const p = sampleProfile();
  return { ...p, trains: [...p.trains].sort((a) => (a.id === 'deep-c11-2600' ? -1 : 1)) };
};
const app = () => render(<PlannerApp initialDate="2026-12-15" initialProfile={narrow()} />);

afterEach(cleanup);

describe('planner defaults', () => {
  it('opens with Type "All", no Season control, and the date picker on the given night', () => {
    app();
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('all');
    expect(screen.queryByLabelText('Season')).toBeNull();
    expect(document.getElementById('f-season')).toBeNull();
    expect((screen.getByLabelText('Evening of') as HTMLInputElement).value).toBe('2026-12-15');
  });

  it('defaults the date to today for the site zone when none is given', () => {
    render(<PlannerApp initialProfile={narrow()} />);
    expect((screen.getByLabelText('Evening of') as HTMLInputElement).value).toBe(defaultDateForProfile(new Date(), narrow()));
  });

  it('re-ranks the list when the date moves to the other half of the year, with no season control', () => {
    app();
    const names = () =>
      [...screen.getByTestId('target-table').querySelectorAll('th[scope="row"]')].map((r) => (r.textContent as string).trim());
    const winter = names();
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2027-06-15' } });
    const summer = names();
    expect(summer).not.toEqual(winter);
    const rank = (list: string[], name: string) => list.findIndex((n) => n.startsWith(name));
    // A summer object climbs the list; a winter object drops out.
    expect(rank(winter, 'Hercules Globular Cluster')).toBeGreaterThan(rank(summer, 'Hercules Globular Cluster'));
    expect(rank(winter, 'Running Man Nebula')).toBeGreaterThanOrEqual(0);
    expect(rank(summer, 'Running Man Nebula')).toBe(-1);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-12-15' } });
    expect(names()).toEqual(winter);
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
