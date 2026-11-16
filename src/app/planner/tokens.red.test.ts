/**
 * The red night theme (globals.css): one block gives every token its red value, red channel only, with the contrast the design computed; print ignores it.
 */
import { readdirSync, readFileSync } from 'fs';

const css = readFileSync('src/app/globals.css', 'utf8');

const dayBlock = css.slice(css.indexOf('.planner-root,\n  .planner-ground {'), css.indexOf('/* One focus style'));
const redStart = css.indexOf('html[data-theme="red"] :is(.planner-root,.planner-ground) {');
const redBlock = css.slice(redStart, css.indexOf('}', redStart));
const vars = (block: string): Map<string, string> => new Map([...block.matchAll(/(--p-[a-z0-9-]+):\s*([^;]+?)\s*(?:\/\*[^*]*\*\/)?;/g)].map((m) => [m[1], m[2].trim()]));
const day = vars(dayBlock);
const red = vars(redBlock);

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const lum = (hex: string): number => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('red night theme tokens', () => {
  it('has one block that gives every Day token a red value (31 core tokens plus the chart ones)', () => {
    expect(red.size).toBeGreaterThanOrEqual(31);
    expect([...day.keys()].filter((k) => !k.startsWith('--p-c-')).length).toBe(31);
    expect([...red.keys()].sort()).toEqual([...day.keys()].sort());
  });

  it('is red channel only: no green or blue above 40, in the block or anywhere in the red rules', () => {
    for (const [name, v] of red) {
      expect(v).toMatch(/^#[0-9a-f]{6}$/);
      const [, g, b] = rgb(v);
      expect({ name, g: g <= 40, b: b <= 40 }).toEqual({ name, g: true, b: true });
    }
    const redRules = css.slice(redStart);
    for (const m of redRules.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      const [, g, b] = rgb(m[0]);
      expect({ hex: m[0], ok: g <= 40 && b <= 40 }).toEqual({ hex: m[0], ok: true });
    }
  });

  it('uses the design palette: text and focus #ff2828 (the design values #ff2a2a and #ff6060: green and blue above 40), secondary #e02020, surface #120000, ground black', () => {
    expect(red.get('--p-t1')).toBe('#ff2828');
    expect(red.get('--p-t2')).toBe('#e02020');
    expect(red.get('--p-focus')).toBe('#ff2828');
    expect(red.get('--p-surface')).toBe('#120000');
    expect(red.get('--p-bg')).toBe('#000000');
  });

  it('red text meets the design contrast on every surface it sits on', () => {
    expect(ratio('#ff2828', '#000000')).toBeGreaterThanOrEqual(5.55);
    expect(ratio('#ff2828', '#120000')).toBeGreaterThanOrEqual(5.4);
    expect(ratio('#ff2828', '#1f0404')).toBeGreaterThanOrEqual(5.15);
    expect(ratio('#e02020', '#000000')).toBeGreaterThanOrEqual(4.39);
  });

  it('no token that carries text is one of the border-only reds', () => {
    for (const n of ['t1', 't2', 'warn-text', 'warn-strong', 'info-text', 'info-strong', 'ok-text', 'pending', 'would', 'accent']) {
      expect(['#5a0a0a', '#a01010']).not.toContain(red.get(`--p-${n}`));
    }
  });

  it('no --p-c-* token that any planner SVG text draws with is a border-only red, and every chart text fill reaches 5.4:1 on the chart ground', () => {
    const files = readdirSync('src/app/planner').filter((f) => /\.tsx$/.test(f) && !/\.test\./.test(f));
    const used = new Set<string>();
    for (const f of files) {
      const src = readFileSync(`src/app/planner/${f}`, 'utf8');
      for (const m of src.matchAll(/<text\b[^>]*?\bfill="var\((--p-c-[a-z0-9-]+)\)"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) {
      expect(['#5a0a0a', '#a01010']).not.toContain(red.get(t));
      expect(ratio(red.get(t)!, red.get('--p-c-ink')!)).toBeGreaterThanOrEqual(5.4);
    }
    expect(red.get('--p-c-tick-text')).toBe('#ff2828');
    expect(day.get('--p-c-tick-text')).toBe('#94a3b8');
    expect(day.get('--p-c-tick')).toBe('#94a3b8');
  });

  it('chip fills in red: selected mode chip and gear chips carry red text at the design ratios', () => {
    expect(css).toMatch(/\.bg-p-info-fill\\\/20 \{\s*background-color: #240505;/);
    expect(css).toMatch(/\[class\*="bg-p-chip-"\]\[class\*="-fill\/15"\]\) \{\s*background-color: #1f0404;/);
    expect(ratio('#ff2828', '#240505')).toBeGreaterThanOrEqual(4.98);
    expect(ratio('#ff2828', '#1f0404')).toBeGreaterThanOrEqual(5.15);
  });

  it('the alpha bases mix to a visible surface and border on black', () => {
    const mix = (hex: string, a: number): string =>
      `#${rgb(hex).map((v) => Math.round(v * a).toString(16).padStart(2, '0')).join('')}`;
    expect(lum(mix(red.get('--p-raised')!, 0.1))).toBeGreaterThan(0);
    expect(lum(mix(red.get('--p-raised')!, 0.15))).toBeGreaterThan(lum(mix(red.get('--p-raised')!, 0.1)));
    expect(ratio(mix(red.get('--p-line')!, 0.3), '#000000')).toBeGreaterThanOrEqual(1.35);
    // the selected chip's fill still carries red text at AA
    expect(ratio('#ff2828', mix(red.get('--p-info-fill')!, 0.2))).toBeGreaterThanOrEqual(4.5);
  });

  it('every red rule sits inside @media screen, so print and PDF never read the theme', () => {
    const start = css.indexOf('@media screen {\nhtml[data-theme="red"] :is(.planner-root,.planner-ground) {');
    expect(start).toBeGreaterThan(0);
    const rest = css.slice(start);
    expect(rest.trimEnd().endsWith('}')).toBe(true);
    // brace depth never returns to 0 before the end of the file: the one @media screen block holds all red rules
    let depth = 0;
    for (let i = rest.indexOf('{'); i < rest.lastIndexOf('}'); i++) {
      if (rest[i] === '{') depth++;
      if (rest[i] === '}') depth--;
      expect(depth).toBeGreaterThan(0);
    }
    // outside that block, only the base-layer size default (itself in @media screen) mentions the theme
    const before = css.slice(0, start);
    for (const m of before.matchAll(/html\[data-theme/g)) expect(before.slice(Math.max(0, m.index! - 200), m.index!)).toContain('@media screen');
  });

  it('no print rule and no print: class reads the theme', () => {
    const printBlocks = [...css.matchAll(/@media print\s*\{[\s\S]*?\n  \}/g)].map((m) => m[0]);
    for (const b of printBlocks) expect(b).not.toContain('data-theme');
    expect(css).toContain('.planner-print-sheet');
  });

  it('forces dark native controls, black page, black theme colour and dimmed images in red', () => {
    expect(css).toMatch(/html\[data-theme="red"\]\s*\{[^}]*color-scheme: dark;[^}]*background-color: #000;/);
    expect(css).toMatch(/html\[data-theme="red"\] :is\(\.planner-root,\.planner-ground,nav\) :is\(img, video, canvas\)\s*\{\s*opacity: 0\.5;/);
    expect(css).toContain('html[data-theme="red"] ::selection');
    expect(readFileSync('src/app/planner/page.tsx', 'utf8')).toContain("themeColor: '#000000'");
  });
});
