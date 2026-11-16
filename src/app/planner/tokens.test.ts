/**
 * Colour tokens: planner files name colours only through the `--p-*` tokens in globals.css, so a theme (R6c) swaps values and nothing else.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const DIR = 'src/app/planner';
const sources = readdirSync(DIR)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.(ts|tsx)$/.test(f) && f !== 'next-auth-react.stub.ts')
  .map((f) => ({ file: f, text: readFileSync(join(DIR, f), 'utf8') }));
const css = readFileSync('src/app/globals.css', 'utf8');

// Allowlist (each entry says why):
// - PrintSheet.tsx: the print sheet is black on white on every theme; it only renders under `print:`.
// - any class with a `print:` modifier: print rules win over tokens.
// - SVG chart fills and strokes (AltitudeChart, NightTimeline, HorizonEditor) are hex attributes, not utilities: they are data colours of the drawings and are themed with the charts in R6c.
const ALLOWED_FILES = new Set(['PrintSheet.tsx']);
const RAW = /(?<![A-Za-z0-9_-])((?:[a-z0-9[\]&>_-]+:)*)(?:text|bg|border|ring|outline|divide|accent|fill|stroke|from|via|to|placeholder|caret|decoration|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?(?![A-Za-z0-9-])/g;

describe('planner colour tokens', () => {
  it('no planner file holds a raw colour utility outside the allowlist', () => {
    const found: string[] = [];
    for (const { file, text } of sources) {
      if (ALLOWED_FILES.has(file)) continue;
      for (const m of text.matchAll(RAW)) if (!m[1].includes('print:')) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('every token class used in the planner is defined in globals.css (variable and theme colour)', () => {
    const used = new Set<string>();
    for (const { text } of sources) {
      for (const m of text.matchAll(/(?<![A-Za-z0-9_-])(?:[a-z0-9[\]&>_-]+:)*(?:text|bg|border|ring|outline|accent)-p-([a-z0-9-]+)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(8);
    const missing = [...used].filter((n) => !css.includes(`--p-${n}:`) || !css.includes(`--color-p-${n}: var(--p-${n});`));
    expect(missing).toEqual([]);
  });

  it('defines the eight core tokens and the one focus rule; no theme block yet', () => {
    for (const n of ['bg', 'surface', 'raised', 't1', 't2', 'line', 'focus', 'accent']) expect(css).toContain(`--p-${n}:`);
    expect(css).toMatch(/\.planner-root :focus-visible\s*\{\s*outline: 2px solid var\(--p-focus\);\s*outline-offset: 2px;/);
    expect(css).not.toContain('data-theme');
  });

  it('the Share sheet and the AI flyout use the page ground, not slate-950', () => {
    for (const f of ['ShareSheet.tsx', 'AiPlanFlyout.tsx']) {
      const t = sources.find((s) => s.file === f)!.text;
      expect(t).toContain('bg-p-bg');
      expect(t).not.toContain('slate');
    }
  });
});
