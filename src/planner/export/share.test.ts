import sample from '../data/sample-profile.json';
import { parseProfile } from '../profile';
import type { Profile } from '../profile';
import { startPlans, updatePlan } from '../state/plans';
import type { Plan, PlanTargetRef } from '../state/plans';
import { ASIAIR_HEADER, GAIN_NOTE, asciiName, asiairCsv, asiairPanes, decText, docToCsv, docToMarkdown, docToText, gearSheet, raText, sheetTotal, storedSheet } from './share';
import type { PlanSheet, ShareDoc, SheetRow, TargetFacts } from './share';

const profile: Profile = parseProfile(JSON.stringify(sample));
const dateText = (iso: string) => `date ${iso}`;
const FACTS: Record<string, TargetFacts> = {
  m42: { name: 'Orion Nebula', type: 'Nebula', raHours: 5.588, decDeg: -5.391 },
  m31: { name: 'Andromeda "Galaxy", big', type: 'Galaxy', raHours: 0.712, decDeg: 41.269 },
};

function plan(targets: PlanTargetRef[], name = 'Camping trip'): Plan {
  const s = startPlans({ date: '2026-11-14', siteId: profile.sites[0].id, trainId: profile.trains[0].id, now: '2026-11-14T00:00:00.000Z' });
  return updatePlan(s, 'plan-1', { targets }, '2026-11-14T00:00:00.000Z').plans.map((p) => ({ ...p, name }))[0];
}

const row = (over: Partial<SheetRow> = {}): SheetRow => ({
  order: 1, state: 'scheduled', name: 'M42 Orion Nebula', type: 'Nebula', ra: raText(5.588), dec: decText(-5.391), start: '20:30', end: '22:10', preset: 'Balanced',
  subSeconds: 180, subCount: 40, lightMin: 120, filter: 'Dual narrowband', favorite: '', note: '', warning: '', ...over,
});
const sheet = (rows: SheetRow[], over: Partial<PlanSheet> = {}): PlanSheet => ({
  name: 'Camping trip', date: 'Sat 14 Nov 2026', site: 'Home', train: 'C11 + 2600', night: 'Night 19:00 to 05:00', startsAt: '19:10', notes: '', warnings: [], caveat: '', rows, totalLightMin: sheetTotal(rows), ...over,
});
const doc = (plans: PlanSheet[], gear = false): ShareDoc => ({ plans, gear: gear ? gearSheet(profile) : null, notes: [] });

describe('coordinates', () => {
  it('writes hours, minutes and seconds of RA, rolling over at 24 h', () => {
    expect(raText(5.588)).toBe("05h 35m 17s");
    expect(raText(23.99999)).toBe('00h 00m 00s');
  });
  it('writes Dec with its sign, and never "-00" for a hair below zero', () => {
    expect(decText(-5.391)).toBe(`-05° 23' 28"`);
    expect(decText(41.269)).toBe(`+41° 16' 08"`);
    expect(decText(-0.00001)).toBe(`+00° 00' 00"`);
  });
});

describe('run sheet text', () => {
  const text = docToText(doc([sheet([row(), row({ order: 2, name: 'M31', start: '', end: '', subSeconds: null, subCount: null, lightMin: null, warning: 'No pixel size.' })])]));
  it('lists order, time, name, position, subs, total, filter and the gain note', () => {
    expect(text).toContain('PLAN: Camping trip');
    expect(text).toContain('1. 20:30-22:10  M42 Orion Nebula (Nebula)');
    expect(text).toContain('RA 05h 35m 17s');
    expect(text).toContain('40 x 180 s = 120 min');
    expect(text).toContain('filter: Dual narrowband');
    expect(text).toContain(GAIN_NOTE);
    expect(text).toContain('Total light: 120 min');
  });
  it('says plainly when an object has no time or no numbers', () => {
    expect(text).toContain('2. no time  M31');
    expect(text).toContain('subs: not worked out');
    expect(text).toContain('Warning: No pixel size.');
  });
  it('states a stale train or site on the sheet', () => {
    const t = docToText(doc([sheet([row()], { warnings: ['This plan was made with a train that is no longer in your gear. It shows "X" for now.'] })]));
    expect(t).toContain('Warning: This plan was made with a train that is no longer in your gear.');
  });
  it('has no raw ids', () => {
    expect(text).not.toMatch(/plan-1|deep-c11|fountain-hills/);
  });
});

describe('Markdown', () => {
  it('writes a table row per object and escapes markup and pipes in names and notes', () => {
    const md = docToMarkdown(doc([sheet([row({ name: 'A|B *star* <x>', note: 'line one\nline two | three' })])]));
    expect(md).toContain('## Camping trip');
    expect(md).toContain('| 1 | 20:30-22:10 | A\\|B \\*star\\* \\<x\\>');
    expect(md).toContain('line one line two \\| three');
    expect(md.split('\n').filter((l) => l.startsWith('| 1 ')).length).toBe(1);
  });
});

describe('CSV', () => {
  it('has one header and a row per object, with the plan columns on each row', () => {
    const csv = docToCsv(doc([sheet([row(), row({ order: 2, name: 'Say "hi", ok' })])]));
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith('Plan,Evening,Site,Train,Order,Start,End,Object')).toBe(true);
    expect(lines[2]).toContain('"Say ""hi"", ok"');
    expect(lines[1]).toContain('Camping trip');
    expect(lines[1]).toContain('05h 35m 17s,"-05° 23\' 28"""');
    expect(lines[1]).toContain(',180,40,120,');
  });
  it('keeps a spreadsheet from reading a name as a formula', () => {
    expect(docToCsv(doc([sheet([row({ name: '=HYPERLINK("x")' })])]))).toContain("'=HYPERLINK");
  });
  it('writes the gear as its own table after the plans', () => {
    const csv = docToCsv(doc([sheet([row()])], true));
    expect(csv).toContain('\r\n\r\nKind,Description\r\n');
    expect(csv).toContain('Site,"Fountain Hills');
  });
});

describe('gear in words', () => {
  it('lists sites, equipment and trains with names, not ids', () => {
    const text = docToText(doc([], true));
    expect(text).toContain('GEAR');
    expect(text).toContain('Trains:');
    expect(text).not.toContain('deep-c11-2600');
    expect(text).toMatch(/Latitude/);
  });
});

describe('a plan as stored', () => {
  const p = plan([{ id: 'm42', preset: 'custom', base: 'deep', custom: { subSeconds: 120, subCount: 30 }, start: '20:30', end: '22:00', note: 'check focus' }, { id: 'm31', preset: 'quick' }, { id: 'gone', preset: 'balanced' }]);
  const s = storedSheet(p, profile, (id) => FACTS[id] ?? null, dateText, (id) => (id === 'm42' ? 'Favorite saved: 120 s x 30' : ''));
  it('carries order, presets, a custom one\'s numbers, times, notes and favorites', () => {
    expect(s.rows.map((r) => r.name)).toEqual(['Orion Nebula', 'Andromeda "Galaxy", big', 'A target that is not in the bundled catalog']);
    expect(s.rows[0]).toMatchObject({ preset: 'Custom (from Deep Project)', subSeconds: 120, subCount: 30, lightMin: 60, start: '20:30', end: '22:00', note: 'check focus', favorite: 'Favorite saved: 120 s x 30' });
    expect(s.rows[1]).toMatchObject({ preset: 'Quick & Beautiful', subSeconds: null, lightMin: null });
    expect(s.totalLightMin).toBeNull();
  });
  it('says the numbers are not worked out for it', () => {
    expect(s.caveat).toMatch(/open this plan/);
    expect(s.site).toContain('Fountain Hills');
    expect(s.train).not.toMatch(/^deep-c11/);
  });
});

describe('ASIAir CSV', () => {
  const targets = [
    { name: 'M42', raHours: 5.588, decDeg: -5.391 },
    { name: 'Andromeda "Galaxy", big', raHours: 0.712, decDeg: 41.269 },
    { name: 'Orión', raHours: 5.5, decDeg: 0 },
    { name: 'M42', raHours: 5.6, decDeg: -5.4 },
  ];
  it('is the Telescopius mosaic layout, one row per target, header first, CRLF', () => {
    const lines = asiairCsv(targets, { widthArcmin: 120.4, heightArcmin: 80 }, false).trim().split('\r\n');
    expect(lines[0]).toBe(ASIAIR_HEADER);
    expect(lines).toHaveLength(5);
    expect(lines[1]).toBe(`Pane 1, 05hr 35' 17", -05º 23' 28", 0.00, 120.40, 80.00, 20%, 1, 1`);
    expect(lines[2]).toBe(`Pane 2, 00hr 42' 43", +41º 16' 08", 0.00, 120.40, 80.00, 20%, 2, 1`);
  });
  it('numbers the panes as the real export does, and lists which object each pane is in ASCII, with no comma or quote', () => {
    const lines = asiairCsv(targets, null, false).trim().split('\r\n');
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['Pane 1', 'Pane 2', 'Pane 3', 'Pane 4']);
    for (const l of lines.slice(1)) expect(l.split(',')).toHaveLength(9);
    expect(asiairPanes(targets)).toEqual(['Pane 1: M42', 'Pane 2: Andromeda Galaxy big', 'Pane 3: Orion', 'Pane 4: M42']);
  });
  it('writes the degree sign as the letter d on request, and the file is then plain ASCII', () => {
    const csv = asiairCsv(targets, null, true);
    expect(csv).toContain(`-05d 23' 28"`);
    expect(csv).toMatch(/^[\x00-\x7f]*$/);
  });
  it('asciiName strips accents and the marks that break a CSV row', () => {
    expect(asciiName('Orión, "Nébula"')).toBe('Orion Nebula');
    expect(asciiName('日本')).toBe('');
  });
});

describe('a stored plan never prints a custom value outside the limits as a number', () => {
  const BAD: [string, unknown, unknown][] = [
    ['999 s', 999, 50],
    ['5000 subs', 60, 5000],
    ['1e308 x 1e308', 1e308, 1e308],
    ['negative', -5, -3],
    ['zero', 0, 0],
    ['text', 'abc', '12'],
    ['a fraction of a sub', 60, 2.5],
    ['Infinity as JSON null', null, null],
  ];
  const sheetOf = (c: unknown, n: unknown) => {
    // The store refuses a zero, a negative or a text, so the plan is built past it: the sheet must still judge whatever a plan holds.
    const p: Plan = { ...plan([{ id: 'm42', preset: 'balanced' }, { id: 'm31', preset: 'quick' }], 'Out of limits') };
    p.targets = [{ id: 'm42', preset: 'custom', base: 'deep', custom: { subSeconds: c as number, subCount: n as number } }, { id: 'm31', preset: 'quick' }];
    return storedSheet(p, profile, (id) => FACTS[id] ?? null, dateText, () => '');
  };
  for (const [label, c, n] of BAD) {
    it(`${label}: the row says the custom is not used, with no numbers, in text, Markdown, CSV and the sheet itself`, () => {
      const s = sheetOf(c, n);
      expect(s.rows[0]).toMatchObject({ preset: 'Custom values outside the limits (not used)', subSeconds: null, subCount: null, lightMin: null });
      expect(s.rows[0].warning).toMatch(/Custom outside limits.*Deep Project used/);
      expect(s.totalLightMin).toBeNull();
      const d = doc([s]);
      for (const out of [docToText(d), docToMarkdown(d), docToCsv(d), JSON.stringify(s)]) {
        expect(out).toContain('Custom values outside the limits (not used)');
        expect(out).not.toMatch(/Infinity|NaN|e\+\d|\b999\b|\b5000\b|-\d+ min|= 0 min|Total light:/);
      }
    });
  }
  it('a custom inside the limits keeps its numbers, and no stored plan carries a total', () => {
    const s = sheetOf(300, 500);
    expect(s.rows[0]).toMatchObject({ subSeconds: 300, subCount: 500, lightMin: 2500 });
    expect(docToText(doc([s]))).not.toMatch(/Total light/);
  });
});

describe('the run sheet says what the timeline schedules', () => {
  it('an unscheduled row says so in every format, with no numbers and no light in the total', () => {
    const rows = [row(), row({ order: 2, state: 'unscheduled', name: 'M31', start: '', end: '', subSeconds: null, subCount: null, lightMin: null })];
    const d = doc([sheet(rows, { totalLightMin: 120 })]);
    expect(docToText(d)).toMatch(/2\. not scheduled tonight {2}M31/);
    expect(docToText(d)).toContain('no subs, no light');
    expect(docToText(d)).toContain('Total light: 120 min');
    expect(docToMarkdown(d)).toMatch(/\| 2 \| not scheduled tonight \| M31 .*\| none \| {2}\|/);
    expect(docToCsv(d)).toMatch(/M31,.*,Not scheduled tonight\./);
  });
  it('a clip row (the Moon, a planet) says its minutes without a sub count', () => {
    const d = doc([sheet([row({ type: 'Solar system', name: 'Jupiter', subSeconds: null, subCount: null, lightMin: 25 })])]);
    expect(docToText(d)).toContain('clips, not subs, about 25 min');
  });
});

describe('gear with units and plain words', () => {
  it('writes units after numbers and words for stored choices', () => {
    const t = docToText(doc([], true));
    expect(t).toMatch(/Pixel size [\d.]+ µm/);
    expect(t).toMatch(/Sensor width \d+ px/);
    expect(t).toMatch(/Latitude [\d.-]+°/);
    expect(t).not.toMatch(/broadband-LP|alt-az\b|Pixel size [\d.]+;/);
  });
});
