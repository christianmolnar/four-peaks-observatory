import { START_EXPOSURE } from './constants';
import { dispersionList, maxFramesPerSecond, roiPx } from './numbers';

describe('the solar-system numbers', () => {
  it('start exposure: Mars 15 ms gain 246, Saturn 64 ms gain 104, Uranus 120 ms gain 528, Neptune 130 ms gain 478 (sourced); Jupiter 10 ms (assumed); the rest none', () => {
    const pick = (b: keyof typeof START_EXPOSURE) => [START_EXPOSURE[b].ms, START_EXPOSURE[b].gain, START_EXPOSURE[b].basis];
    expect(pick('Mars')).toEqual([15, 246, 'sourced']);
    expect(pick('Saturn')).toEqual([64, 104, 'sourced']);
    expect(pick('Uranus')).toEqual([120, 528, 'sourced']);
    expect(pick('Neptune')).toEqual([130, 478, 'sourced']);
    expect(pick('Jupiter')).toEqual([10, undefined, 'assumption']);
    for (const b of ['Mercury', 'Venus', 'Moon'] as const) expect(START_EXPOSURE[b].ms).toBeNull();
  });
  it('frame rate cap is 1000 / exposure, rounded down', () => {
    expect([maxFramesPerSecond('Jupiter'), maxFramesPerSecond('Mars'), maxFramesPerSecond('Saturn'), maxFramesPerSecond('Uranus'), maxFramesPerSecond('Neptune')]).toEqual([100, 66, 15, 8, 7]);
    expect(maxFramesPerSecond('Venus')).toBeNull();
  });
  it('ROI: 1.5 times the size in steps of 16 px; Saturn takes its rings (2.3) into it', () => {
    expect(roiPx('Jupiter', 278)).toBe(432);
    expect(roiPx('Mars', 100)).toBe(160);
    expect(roiPx('Saturn', 100)).toBe(352);
    expect(roiPx('Mars', null)).toBeNull();
  });
  it('dispersion is listed at 80, 70, 60, 45 and 30 degrees', () => {
    expect(dispersionList().map((d) => [d.altitudeDeg, Number(d.arcsec.toFixed(2))])).toEqual([[80, 0.15], [70, 0.32], [60, 0.5], [45, 0.87], [30, 1.5]]);
  });
});
