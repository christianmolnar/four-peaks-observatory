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
// No SVG exception any more: chart fills and strokes read `var(--p-c-*)` or the page tokens (R6c), so the red theme reaches them.
const ALLOWED_FILES = new Set(['PrintSheet.tsx']);
const RAW = /(?<![A-Za-z0-9_-])((?:[a-z0-9[\]&>_-]+:)*)(?:text|bg|border|ring|outline|divide|accent|fill|stroke|from|via|to|placeholder|caret|decoration|shadow)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})(?:\/\d+)?(?![A-Za-z0-9-])/g;

// Arbitrary-value colours (`bg-[#0b1020]`, `text-[rgb(...)]`), literal colour attributes on SVG (`fill="#fff"`) and literal colours in inline `style` objects.
const ARBITRARY = /(?<![A-Za-z0-9_-])((?:[a-z0-9[\]&>_-]+:)*)(?:text|bg|border|ring|outline|divide|accent|fill|stroke|from|via|to|placeholder|caret|decoration|shadow)-\[(?:color:|#|rgb|hsl|hwb|lab|lch|oklch|oklab|color\()[^\]]*\]/g;
const TOKEN_VALUE = /^(?:var\(--p-[a-z0-9-]+\)|currentColor|none|inherit|transparent)$/;
const SVG_ATTR = /\b(?:fill|stroke|stopColor|floodColor|lightingColor)=(?:"([^"]*)"|\{\s*(?:'([^']*)'|`([^`]*)`)\s*\})/g;
const STYLE_PROP = /\b(?:color|backgroundColor|background|borderColor|borderTopColor|borderBottomColor|outlineColor|fill|stroke|boxShadow|textShadow|caretColor|accentColor)\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)/g;
// A hex colour held in a string (a JS constant, a prop, a template). Allowlist: the viewport themeColor in page.tsx is browser chrome, not planner UI.
const HEX_LITERAL = /['"`]#[0-9a-fA-F]{3,8}['"`]/g;
const HEX_ALLOWED = new Set(['page.tsx']);
const first = (m: RegExpMatchArray): string => m.slice(1).find((x) => x !== undefined) ?? '';

describe('planner colour tokens', () => {
  it('no arbitrary-value colour class outside the allowlist', () => {
    const found: string[] = [];
    for (const { file, text } of sources) {
      if (ALLOWED_FILES.has(file)) continue;
      for (const m of text.matchAll(ARBITRARY)) if (!m[1].includes('print:')) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('every literal SVG colour attribute and inline style colour is a token (var(--p-*), currentColor, none)', () => {
    const found: string[] = [];
    for (const { file, text } of sources) {
      if (ALLOWED_FILES.has(file)) continue;
      for (const m of text.matchAll(SVG_ATTR)) if (!TOKEN_VALUE.test(first(m))) found.push(`${file}: ${m[0]}`);
      for (const m of text.matchAll(STYLE_PROP)) if (!TOKEN_VALUE.test(first(m))) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('no hex colour held in a string in any planner file (JS constants too), except the page viewport themeColor', () => {
    const found: string[] = [];
    for (const { file, text } of sources) {
      if (ALLOWED_FILES.has(file) || HEX_ALLOWED.has(file)) continue;
      for (const m of text.matchAll(HEX_LITERAL)) found.push(`${file}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('the guard sees text-[color:#...] and a hex constant (self-check)', () => {
    expect('text-[color:#fff]'.match(ARBITRARY)).not.toBeNull();
    expect('const HEXC = "#ff0000";'.match(HEX_LITERAL)).not.toBeNull();
  });

  it('the timeline series colours are the --p-c-s0..7 tokens, defined in Day and in red', () => {
    const t = sources.find((s) => s.file === 'NightTimeline.tsx')!.text;
    expect(t).toContain('`var(--p-c-s${i})`');
    for (let i = 0; i < 8; i++) {
      expect(css.match(new RegExp(`--p-c-s${i}:`, 'g'))).toHaveLength(2);
    }
  });

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

  it('defines the eight core tokens and the one focus rule, which also covers the footer credits', () => {
    for (const n of ['bg', 'surface', 'raised', 't1', 't2', 'line', 'focus', 'accent']) expect(css).toContain(`--p-${n}:`);
    expect(css).toMatch(/\.planner-root :focus-visible,\s*\.planner-ground :focus-visible\s*\{\s*outline: 2px solid var\(--p-focus\);\s*outline-offset: 2px;/);
  });

  it('the Share sheet and the AI flyout use the page ground, not slate-950', () => {
    for (const f of ['ShareSheet.tsx', 'AiPlanFlyout.tsx']) {
      const t = sources.find((s) => s.file === f)!.text;
      expect(t).toContain('bg-p-bg');
      expect(t).not.toContain('slate');
    }
  });
});
