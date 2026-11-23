/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ExposureResult, ExposureWarning } from '@/planner/exposure';
import PlanRowExposure, { ExposureWarnings } from './PlanRowExposure';
import PlanRowMix from './PlanRowMix';
import type { PlanRowExposureProps } from './PlanRowExposure';
import { splitWarnings } from './rowExposure';
import type { RowExposure } from './rowExposure';

// The warnings of a card: the codes to act on show as a few words with the one control that changes them; the Details hold the numbers.

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
    gain: { suggested: null },
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
  return { kind: 'ok', chosen: r, presets: { quick: r, balanced: r, deep: r }, marginal: [], inputs: 'x', imageScale: 1.4, usableMinutes: 300, customUnusable: null, withNumber: () => r, forFilter: () => ({ subs: 'Subs', warning: null }) };
};
const handlers = () => ({
  onNumber: jest.fn(),
  onBack: jest.fn(),
  onSaveFavorite: jest.fn(),
  onRemoveFavorite: jest.fn(),
  onRestore: jest.fn(),
  onNotNow: jest.fn(),
});
const show = (warnings: ExposureWarning[], extra: Partial<PlanRowExposureProps> = {}) => {
  const h = handlers();
  render(<PlanRowExposure id="x" name="Target X" preset="balanced" view={view(warnings)} favorite={null} favoritesBlocked={null} prompt={null} {...h} {...extra} />);
  return h;
};

afterEach(cleanup);

describe('warnings on a card', () => {
  it('each act-on code shows as its few words, with the controls that change it', () => {
    const cases: [string, string[]][] = [
      ['filter-rated-slower', ['Change the filter', 'Change the setup']],
      ['filter-uvir-missing', ['Change the filter']],
      ['filter-visual-colour', ['Change the filter']],
      ['moon-near', ['Change the date']],
      ['no-usable-time', ['Change the date']],
      ['limited-by-usable-time', ['Change the date']],
      ['meridian-flip', []],
    ];
    for (const [code, buttons] of cases) {
      const onGoTo = jest.fn();
      render(<ExposureWarnings id="x" warnings={[w(code, 'warning')]} onGoTo={onGoTo} />);
      const box = screen.getByTestId('plan-warning-x');
      expect(box.textContent).toContain(`text of ${code}`);
      expect(within(box).queryAllByRole('button').map((b) => b.textContent)).toEqual(buttons);
      expect(within(box).queryAllByRole('button').every((b) => /min-h-11/.test(b.className))).toBe(true);
      const wanted = { 'Change the date': 'date', 'Change the filter': 'filter', 'Change the setup': 'train' } as const;
      for (const label of buttons) {
        fireEvent.click(within(box).getByRole('button', { name: label }));
        expect(onGoTo).toHaveBeenLastCalledWith(wanted[label as keyof typeof wanted]);
      }
      cleanup();
    }
  });

  it('a code with no control to act on is not an act-on warning', () => {
    const { act, notes } = splitWarnings([w('moon-near', 'note'), w('count-capped', 'note')]);
    expect(act.map((x) => x.code)).toEqual(['moon-near']);
    expect(notes.map((x) => x.code)).toEqual(['count-capped']);
  });

  it('the Details of a row have no Warning line and no Notes fold', () => {
    show([w('moon-near', 'warning')]);
    expect(screen.queryByTestId('plan-warning-x')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Notes/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'How this is worked out' })).toBeNull();
  });

  it('every control of the Details is a 44 px target', () => {
    show([], { favorite: { id: 'x', preset: 'deep', subSeconds: 1, subCount: 1, filterName: '', trainName: '', savedAt: '2026-01-01T00:00:00Z' }, prompt: 'ask' });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(3);
    for (const b of buttons) expect(b.className).toMatch(/min-h-11/);
    for (const t of screen.getAllByRole('textbox')) expect(t.className).toMatch(/min-h-11/);
    expect(screen.getByRole('checkbox', { name: 'Save as favorite' }).closest('label')!.className).toMatch(/min-h-11/);
  });
});

describe('the filter mix line of a row: subs and the UV/IR warning', () => {
  it('shows the subs line with no gain, and the warning only when one is given', () => {
    const mix = { kind: 'mix', availableMin: 90, lines: [{ filterId: 'nb3', name: 'NB3-PM', minutes: 90, verdict: 'adds', adds: [], shared: [], coveredBy: [] }], needed: [], uncovered: [], haMostlyNii: false } as never;
    const extra = (warning: string | null) => () => ({ subs: 'Subs: 180 s x 30, total 1 h 30 min', warning });
    const { rerender } = render(<PlanRowMix id="a" mix={mix} extra={extra('No UV/IR cut')} />);
    fireEvent.click(screen.getByRole('button', { name: /filter mix/i }));
    expect(screen.getByTestId('plan-mix-subs').textContent).toBe('Subs: 180 s x 30, total 1 h 30 min');
    expect(screen.getByTestId('plan-mix-subs').textContent).not.toMatch(/gain/i);
    expect(screen.getByTestId('plan-mix-uvir').textContent).toBe('No UV/IR cut');
    rerender(<PlanRowMix id="a" mix={mix} extra={extra(null)} />);
    expect(screen.queryByTestId('plan-mix-uvir')).toBeNull();
  });
});
