/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { planTonight, planTrainFor } from '@/planner/plan';
import { starterTargets } from '@/planner/catalog';
import { sampleProfile } from '@/planner/state';
import PrintSheet from './PrintSheet';

const profile = sampleProfile();
const { entries } = planTonight({
  site: { latitude: 33.6, longitude: -111.7 },
  horizon: null,
  minAltitude: 20,
  date: '2026-11-13',
  train: planTrainFor(profile, profile.trains[0]),
  targets: starterTargets,
});
const fmt = (d: Date) => d.toISOString().slice(11, 16);

afterEach(cleanup);

describe('the print sheet', () => {
  it('has no Season column and never prints "Not listed", for catalog targets, curated ones and planets alike', () => {
    render(<PrintSheet date="2026-11-13" siteLine="s" trainLine="t" nightLine="n" horizonLine="h" entries={entries.slice(0, 12)} captured={new Set()} formatTime={fmt} />);
    const sheet = screen.getByTestId('print-sheet');
    const head = within(sheet).getAllByRole('columnheader').map((h) => h.textContent);
    expect(head).toEqual(['#', 'Target', 'Fit', 'Peak', 'Usable window', 'Moon', 'Score', 'Captured']);
    expect(sheet.textContent).not.toMatch(/Season|Not listed|n\/a/);
    expect(within(sheet).getAllByRole('row')).toHaveLength(13);
  });
});
