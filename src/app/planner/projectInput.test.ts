import { PROJECT_LIMITS } from '@/planner/projects';
import { readBox } from './projectInput';

const bad = (text: string, opts = {}) => {
  const r = readBox(PROJECT_LIMITS.minutes, text, 'Minutes', opts);
  if (r.ok) throw new Error(`expected a refusal for ${JSON.stringify(text)}`);
  return r.message;
};

describe('readBox: a typed number or a refusal in plain words', () => {
  it('reads whole numbers, with spaces around', () => {
    expect(readBox(PROJECT_LIMITS.minutes, '120', 'Minutes')).toEqual({ ok: true, value: 120 });
    expect(readBox(PROJECT_LIMITS.minutes, '  45 ', 'Minutes')).toEqual({ ok: true, value: 45 });
    expect(readBox(PROJECT_LIMITS.minutes, '0', 'Minutes')).toEqual({ ok: true, value: 0 });
    expect(readBox(PROJECT_LIMITS.minutes, '100000', 'Minutes')).toEqual({ ok: true, value: 100000 });
  });
  it('an empty or blank box is blank when allowed, else asks for a number', () => {
    expect(readBox(PROJECT_LIMITS.minutes, '   ', 'Minutes', { blank: true })).toEqual({ ok: true, value: null });
    expect(bad('')).toBe('Minutes: type a number. Enter a whole number for the number of minutes between 0 and 100,000 min.');
    expect(bad('   ')).toMatch(/^Minutes: type a number\./);
  });
  it('refuses negatives, text, fractions, exponents, huge numbers, lists and pasted junk, in words, never raw', () => {
    for (const t of ['-5', 'abc', '2.5', '1e308', '1e5', '99999999', '100001', '1 20', '1,200', 'NaN', 'Infinity', '-Infinity', '٣', '0x10', '12 min', '<b>1</b>', '9'.repeat(400)]) {
      const m = bad(t);
      expect(m).toMatch(/^Minutes: /);
      expect(m).toMatch(/between 0 and 100,000 min\.$/);
      expect(m).not.toMatch(/NaN|Infinity|e\+|\$\.|\[0\]|undefined/);
      expect(m.length).toBeLessThan(200);
    }
    expect(bad('-5')).toBe('Minutes: -5 is below the lowest allowed number. Enter a whole number for the number of minutes between 0 and 100,000 min.');
    expect(bad('99999999')).toMatch(/is above the highest allowed number/);
    expect(bad('2.5')).toMatch(/is not a whole number/);
    expect(bad('abc')).toMatch(/^Minutes: that is not a number written with digits only\./);
  });
  it('a sub length allows a decimal inside its own range', () => {
    expect(readBox(PROJECT_LIMITS.subSeconds, '60', 'Sub length')).toEqual({ ok: true, value: 60 });
    expect(readBox(PROJECT_LIMITS.subSeconds, '7.5', 'Sub length')).toEqual({ ok: true, value: 7.5 });
    const r = readBox(PROJECT_LIMITS.subSeconds, '0', 'Sub length');
    expect(r.ok).toBe(false);
    const big = readBox(PROJECT_LIMITS.subSeconds, '301', 'Sub length');
    expect(big.ok).toBe(false);
  });
});
