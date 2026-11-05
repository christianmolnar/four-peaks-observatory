import { starterTargets } from '../catalog';
import { planTonight } from '../plan';
import type { PlanTrain } from '../plan';
import { opticalTrain } from '../optics';
import { CSV_HEADER, csvField, planToCsv } from './csv';

/** Minimal RFC 4180 reader, to check the writer against something independent of it. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

const train: PlanTrain = {
  kind: 'optical',
  name: 't',
  optics: opticalTrain({ focalLengthMm: 2800, apertureMm: 280 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
const plan = planTonight({
  site: { latitude: 40, longitude: -105 },
  horizon: null,
  minAltitude: 20,
  date: '2026-12-15',
  train,
  targets: starterTargets,
});
const formatTime = (d: Date) => d.toISOString().slice(11, 16);

describe('csvField', () => {
  it('quotes commas, quotes and line breaks, and leaves plain text alone', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('Cone, Christmas Tree')).toBe('"Cone, Christmas Tree"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('a\nb')).toBe('"a\nb"');
    expect(csvField(3.5)).toBe('3.5');
  });
});

describe('planToCsv', () => {
  it('has a header row and one row per entry, every row with the header width', () => {
    const rows = parseCsv(planToCsv(plan.entries, { formatTime }));
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows).toHaveLength(plan.entries.length + 1);
    for (const r of rows) expect(r).toHaveLength(CSV_HEADER.length);
    expect(rows[1][0]).toBe('1');
    expect(rows[1][1]).toBe(plan.entries[0].name);
  });

  it('keeps a name with a comma and a quote in one cell', () => {
    const odd = { ...plan.entries[0], name: 'Cone, "Tree" Nebula' };
    const csv = planToCsv([odd], { formatTime });
    expect(csv).toContain('"Cone, ""Tree"" Nebula"');
    const rows = parseCsv(csv);
    expect(rows[1]).toHaveLength(CSV_HEADER.length);
    expect(rows[1][1]).toBe('Cone, "Tree" Nebula');
  });

  it('writes windows, why text and captured flags', () => {
    const first = plan.entries[0];
    const rows = parseCsv(planToCsv(plan.entries, { formatTime, captured: new Set([first.id]) }));
    const col = (name: string) => CSV_HEADER.indexOf(name as (typeof CSV_HEADER)[number]);
    expect(rows[1][col('Captured')]).toBe('yes');
    expect(rows[2][col('Captured')]).toBe('no');
    expect(rows[1][col('Why recommended')]).toBe(first.why);
    expect(rows[1][col('Usable windows')]).toContain(' to ');
    expect(rows[1][col('Score')]).toBe(String(first.score.total));
  });

  it('with no entries gives just the header', () => {
    expect(parseCsv(planToCsv([], { formatTime }))).toEqual([[...CSV_HEADER]]);
  });
});
