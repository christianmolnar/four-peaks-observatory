/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { GAIN_NOTE, sheetTotal } from '@/planner/export';
import type { PlanSheet, SheetRow, ShareDoc } from '@/planner/export';
import PrintSheet from './PrintSheet';

afterEach(cleanup);

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  order: 1, name: 'M42 Orion Nebula', type: 'Nebula', ra: '05h 35m 17s', dec: `-05° 23' 28"`, start: '20:30', end: '22:10', preset: 'Balanced', subSeconds: 180, subCount: 40, lightMin: 120, filter: 'Dual narrowband', favorite: '', note: 'check focus', warning: '', ...over,
});
const sheet = (rows: SheetRow[], over: Partial<PlanSheet> = {}): PlanSheet => ({ name: 'Camping trip', date: 'Sat 14 Nov 2026', site: 'Home', train: 'C11', night: '', startsAt: '19:10', notes: '', warnings: [], caveat: '', rows, totalLightMin: sheetTotal(rows), ...over });

describe('the run sheet', () => {
  it('has a row per object with order, time, position, subs, a blank gain cell, filter and notes', () => {
    const doc: ShareDoc = { plans: [sheet([row(), row({ order: 2, name: 'M31', start: '', end: '', subSeconds: null, subCount: null, lightMin: null })])], gear: null, notes: [] };
    render(<PrintSheet doc={doc} />);
    const table = screen.getByTestId('print-plan');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['#', 'Time', 'Target', 'Subs', 'Gain', 'Filter', 'Notes']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1].textContent).toContain('20:30–22:10');
    expect(rows[1].textContent).toContain('RA 05h 35m 17s');
    expect(rows[1].textContent).toContain('40 × 180 s');
    expect(rows[1].textContent).toContain('120 min');
    expect(rows[1].textContent).toContain('Dual narrowband');
    expect(rows[1].textContent).toContain('check focus');
    expect(rows[2].textContent).toContain('no time');
    expect(rows[2].textContent).toContain('not worked out');
    expect(screen.getByTestId('print-sheet').textContent).toContain(GAIN_NOTE);
    expect(screen.getByTestId('print-sheet').textContent).toContain('Total light: 120 min');
  });
  it('states a stale train on the sheet, in words and not by colour', () => {
    render(<PrintSheet doc={{ plans: [sheet([row()], { warnings: ['This plan was made with a train that is no longer in your gear.'] })], gear: null, notes: [] }} />);
    expect(screen.getByText(/^Warning: This plan was made with a train/)).toBeTruthy();
  });
  it('prints every plan on its own page and the gear after them', () => {
    const { container } = render(<PrintSheet doc={{ plans: [sheet([row()]), sheet([row()], { name: 'Second' })], gear: { sections: [{ title: 'Trains', lines: ['C11 (Celestron)'] }] }, notes: [] }} />);
    expect(container.querySelectorAll('.run-sheet-break')).toHaveLength(2);
    expect(screen.getByText('C11 (Celestron)')).toBeTruthy();
  });
});
