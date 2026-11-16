/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { GAIN_NOTE, sheetTotal } from '@/planner/export';
import type { PlanSheet, SheetRow, ShareDoc } from '@/planner/export';
import PrintSheet from './PrintSheet';

afterEach(cleanup);

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  order: 1, state: 'scheduled', name: 'M42 Orion Nebula', type: 'Nebula', ra: '05h 35m 17s', dec: `-05° 23' 28"`, start: '20:30', end: '22:10', preset: 'Balanced', subSeconds: 180, subCount: 40, lightMin: 120, filter: 'Dual narrowband', favorite: '', note: 'check focus', warning: '', ...over,
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
  it('keeps its columns: Time is wide enough for "22:53–00:40" (17% or more), the widths add to 100%, the time and the subs never break, and "not scheduled tonight" wraps', () => {
    const doc: ShareDoc = { plans: [sheet([row({ start: '22:53', end: '00:40' }), row({ order: 2, state: 'unscheduled', start: '', end: '', subSeconds: null, subCount: null, lightMin: null })])], gear: null, notes: [] };
    const { container } = render(<PrintSheet doc={doc} />);
    const widths = [...container.querySelectorAll('col')].map((c) => parseFloat((c as HTMLElement).style.width));
    expect(widths).toHaveLength(7);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(100);
    expect(widths[1]).toBeGreaterThanOrEqual(17);
    const rows = within(screen.getByTestId('print-plan')).getAllByRole('row');
    expect(rows[1].querySelector('.run-sheet-nowrap')?.textContent).toBe('22:53–00:40');
    expect(rows[1].querySelectorAll('.run-sheet-nowrap')[1]?.textContent).toBe('40 × 180 s');
    expect(rows[2].textContent).toContain('not scheduled tonight');
    expect(rows[2].textContent).toContain('none');
    expect(rows[2].querySelector('.run-sheet-nowrap')).toBeNull();
    expect(container.querySelector('style')?.textContent).toMatch(/\.run-sheet-nowrap \{ white-space: nowrap; \}/);
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
