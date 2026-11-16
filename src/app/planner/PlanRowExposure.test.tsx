/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ExposureResult, ExposureWarning } from '@/planner/exposure';
import PlanRowExposure from './PlanRowExposure';
import type { PlanRowExposureProps } from './PlanRowExposure';
import type { RowExposure } from './rowExposure';

// The warnings split of the stage 1 guide, row by row: the nine codes to act on show as "Warning" with the one thing to change and the
// controls that change it; everything else is folded in "Notes (N)".

const w = (code: string, severity: 'warning' | 'note', text = `text of ${code}`): ExposureWarning => ({ code: code as ExposureWarning['code'], severity, text });
const result = (warnings: ExposureWarning[]): ExposureResult =>
  ({
    ok: true,
    source: 'calculated',
    label: 'estimate',
    mode: 'balanced',
    modeLabel: 'Balanced',
    custom: false,
    differs: [],
    modeRangeMin: [30, 60],
    subSeconds: 60,
    subSecondsRange: [30, 120],
    subCount: 60,
    subCountRange: [30, 120],
    integrationMin: 60,
    usableIntegrationRangeMin: [40, 60],
    ditherEveryFrames: 3,
    gain: { suggested: null, note: 'No gain is stored.' },
    filterNote: 'No filter.',
    swampSeconds: 70,
    readNoisePenalty: 0.05,
    knee: { minutes: 90, snrTimeMin: 120, marginalMin: 143, setBy: 'diminishing-returns', surfaceBrightnessMu: 22, surfaceBrightnessFrom: 'catalog' },
    reachesSnrTarget: true,
    limitedBy: { sub: 'read-noise', total: 'snr-target' },
    overhead: {},
    overheadRangeMin: [10, 20],
    elapsedMin: 80,
    elapsedRangeMin: [70, 90],
    finish: null,
    finishRange: null,
    warnings,
  }) as unknown as ExposureResult;
const view = (warnings: ExposureWarning[]): RowExposure => {
  const r = result(warnings);
  return { kind: 'ok', chosen: r, presets: { quick: r, balanced: r, deep: r }, marginal: [], inputs: 'x', usableMinutes: 300, customUnusable: null, withNumber: () => r };
};
const handlers = () => ({
  onPreset: jest.fn(),
  onNumber: jest.fn(),
  onBack: jest.fn(),
  onSaveFavorite: jest.fn(),
  onRemoveFavorite: jest.fn(),
  onRestore: jest.fn(),
  onNotNow: jest.fn(),
  onGoTo: jest.fn(),
});
const show = (warnings: ExposureWarning[], extra: Partial<PlanRowExposureProps> = {}) => {
  const h = handlers();
  render(<PlanRowExposure id="x" name="Target X" preset="balanced" view={view(warnings)} formatTime={() => '00:00'} favorite={null} favoritesBlocked={null} prompt={null} {...h} {...extra} />);
  return h;
};

afterEach(cleanup);

describe('warnings on a row', () => {
  it('each act-on code shows as a Warning with its text, the one thing to change, and the real controls', () => {
    const cases: [string, string, string[]][] = [
      ['filter-rated-slower', 'Pick a filter rated for this speed, or another train.', ['Change the filter', 'Change the setup']],
      ['filter-uvir-missing', 'Pick a filter that blocks UV/IR, or add a UV/IR cut filter to the train.', ['Change the filter']],
      ['filter-visual-colour', 'Pick an imaging filter instead.', ['Change the filter']],
      ['moon-near', 'Pick a night when the Moon is farther away or down, or a target farther from it.', ['Change the date']],
      ['no-usable-time', 'Pick another date or another target.', ['Change the date']],
      ['limited-by-usable-time', 'Pick a night with more usable time to reach the mode’s length.', ['Change the date']],
      ['meridian-flip', 'Plan a pause to flip and re-centre at the crossing; its time is already counted.', []],
      ['target-ou4', 'Pick a brighter target for a short session, or plan many nights of narrowband.', []],
      ['short-session-faint', 'Pick a brighter, more compact target for a short session, or choose Balanced or Deep Project.', []],
    ];
    for (const [code, change, buttons] of cases) {
      const h = show([w(code, 'warning')]);
      const box = screen.getByTestId('plan-warning-x');
      expect(box.textContent).toContain('Warning');
      expect(box.textContent).toContain(`text of ${code}`);
      expect(box.textContent).toContain(`What to change: ${change}`);
      expect(within(box).queryAllByRole('button').map((b) => b.textContent)).toEqual(buttons);
      expect(within(box).queryAllByRole('button').every((b) => /min-h-11/.test(b.className))).toBe(true);
      const wanted = { 'Change the date': 'date', 'Change the filter': 'filter', 'Change the setup': 'train' } as const;
      for (const label of buttons) {
        fireEvent.click(within(box).getByRole('button', { name: label }));
        expect(h.onGoTo).toHaveBeenLastCalledWith(wanted[label as keyof typeof wanted]);
      }
      cleanup();
    }
  });

  it('every other code is context: no Warning line, and its text is in the folded "Notes (N)", counted', () => {
    show([w('inputs-assumed', 'note'), w('sampling', 'note'), w('short-of-target', 'warning'), w('moon-near', 'note')]);
    expect(screen.getAllByTestId('plan-warning-x')).toHaveLength(1); // moon-near only, whatever its severity
    fireEvent.click(screen.getByRole('button', { name: 'Why these numbers' }));
    const notes = screen.getByRole('button', { name: 'Notes (3)' });
    expect(notes.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(notes);
    const list = document.getElementById('plan-notes-x-body')!;
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['text of inputs-assumed', 'text of sampling', 'Warning: text of short-of-target']);
  });

  it('no warnings, no Warning line, and "Notes (0)" says there are none', () => {
    show([]);
    expect(screen.queryByTestId('plan-warning-x')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Why these numbers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Notes (0)' }));
    expect(screen.getByText('No notes for this target.')).toBeTruthy();
  });

  it('every control of the row is a 44 px target', () => {
    show([w('moon-near', 'warning')], { favorite: { id: 'x', preset: 'deep', subSeconds: 1, subCount: 1, filterName: '', trainName: '', savedAt: '2026-01-01T00:00:00Z' }, prompt: 'ask' });
    fireEvent.click(screen.getByRole('button', { name: 'Why these numbers' }));
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(8);
    for (const b of buttons) expect(b.className).toMatch(/min-h-11/);
    for (const t of screen.getAllByRole('textbox')) expect(t.className).toMatch(/min-h-11/);
    expect(screen.getByRole('checkbox', { name: 'Save as favorite' }).closest('label')!.className).toMatch(/min-h-11/);
  });
});
