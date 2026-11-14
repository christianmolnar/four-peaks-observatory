import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'build-catalog.mjs');
const ASSET = join(ROOT, 'public', 'catalog', 'openngc-v20260501.json');

const HEAD =
  'Name;Type;RA;Dec;Const;MajAx;MinAx;PosAng;B-Mag;V-Mag;J-Mag;H-Mag;K-Mag;SurfBr;Hubble;Pax;Pm-RA;Pm-Dec;RadVel;Redshift;Cstar U-Mag;Cstar B-Mag;Cstar V-Mag;M;NGC;IC;Cstar Names;Identifiers;Common names;NED notes;OpenNGC notes;Sources';
function row(f: Partial<Record<string, string>>): string {
  const cols = HEAD.split(';');
  return cols.map((c) => f[c] ?? '').join(';');
}

function build(ngc: string[], addendum: string[]): { objects: Record<string, unknown>[]; report: Record<string, unknown>; bytes: string } {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'NGC.csv'), [HEAD, ...ngc].join('\n') + '\n');
  writeFileSync(join(dir, 'src', 'addendum.csv'), [HEAD, ...addendum].join('\n') + '\n');
  const out = join(dir, 'out.json');
  const stdout = execFileSync('node', [SCRIPT, '--src', join(dir, 'src'), '--out', out, '--partial'], { encoding: 'utf8' });
  const bytes = readFileSync(out, 'utf8');
  return { objects: JSON.parse(bytes).objects, report: JSON.parse(stdout), bytes };
}

describe('build script rules (fixture input)', () => {
  const ngc = [
    // kept: bright galaxy with a catalog SB
    row({ Name: 'NGC0224', Type: 'G', RA: '00:42:44.35', Dec: '+41:16:08.6', Const: 'And', MajAx: '177.83', MinAx: '69.66', PosAng: '35', 'B-Mag': '4.36', 'V-Mag': '3.44', SurfBr: '23.63', M: '031', 'Common names': 'Andromeda Galaxy' }),
    // kept: nebula, SB computed from mag and size
    row({ Name: 'NGC1976', Type: 'Cl+N', RA: '05:35:16.48', Dec: '-05:23:22.8', Const: 'Ori', MajAx: '90', MinAx: '60', 'V-Mag': '4.0', M: '042', 'Common names': 'Great Orion Nebula,Orion Nebula', Identifiers: 'LBN 974,MWSC 0582' }),
    // kept: large nebula without a magnitude
    row({ Name: 'IC1396', Type: 'Cl+N', RA: '21:39:06', Dec: '+57:30:00', Const: 'Cep', MajAx: '14' }),
    // kept: Caldwell by Identifiers
    row({ Name: 'NGC0188', Type: 'OCl', RA: '00:44:00', Dec: '+85:20:00', Const: 'Cep', MajAx: '17', 'V-Mag': '8.1', Identifiers: 'C 001,MWSC 0021' }),
    // dropped by the cut: faint, small, no size, galaxy without a magnitude
    row({ Name: 'NGC0999', Type: 'G', RA: '02:00:00', Dec: '+10:00:00', MajAx: '1.5', 'B-Mag': '15.2' }),
    row({ Name: 'NGC1000', Type: 'G', RA: '02:10:00', Dec: '+10:00:00', MajAx: '0.5', 'B-Mag': '12' }),
    row({ Name: 'NGC1001', Type: 'G', RA: '02:20:00', Dec: '+10:00:00', MajAx: '3' }),
    row({ Name: 'NGC1002', Type: 'G', RA: '02:30:00', Dec: '+10:00:00', 'B-Mag': '12' }),
    // dropped by type
    row({ Name: 'NGC1003', Type: 'Dup', RA: '02:40:00', Dec: '+10:00:00', MajAx: '9', 'V-Mag': '9' }),
    row({ Name: 'NGC1004', Type: '*', RA: '02:50:00', Dec: '+10:00:00', 'V-Mag': '3', 'Common names': 'Some Star' }),
    row({ Name: 'NGC1005', Type: 'NonEx', RA: '03:00:00', Dec: '+10:00:00' }),
  ];
  const addendum = [
    row({ Name: 'M040', Type: '**', RA: '12:22:16.1', Dec: '+58:05:04', Const: 'UMa', 'V-Mag': '8.0', M: '040' }),
    row({ Name: 'C009', Type: 'HII', RA: '22:57:54.0', Dec: '+62:31:06', Const: 'Cep', MajAx: '50', MinAx: '30', 'Common names': 'Cave Nebula', Identifiers: 'LBN 529,SH 2-155' }),
  ];
  const built = build(ngc, addendum);
  const byId = Object.fromEntries(built.objects.map((o) => [o.id as string, o]));

  it('keeps and drops exactly these', () => {
    expect(Object.keys(byId).sort()).toEqual(['c9', 'ic1396', 'm40', 'ngc188', 'ngc1976', 'ngc224']);
  });

  it('reports what it dropped', () => {
    expect(built.report).toMatchObject({
      rowsRead: 13,
      droppedByType: { Dup: 1, '*': 1, NonEx: 1 },
      droppedByTypeTotal: 3,
      droppedByCut: 4,
      droppedNamed: ['NGC1004 (*)'],
    });
  });

  it('keeps M40 as a double star and numbers Messier and Caldwell objects', () => {
    expect(byId.m40).toMatchObject({ type: 'double-star', m: 40 });
    expect(byId.ngc188).toMatchObject({ c: 1, ngc: 188 });
    expect(byId.c9).toMatchObject({ c: 9, name: 'Cave Nebula', aliases: ['C 9', 'LBN 529', 'SH 2-155'] });
  });

  it('galaxies keep the catalog SB; others compute it and say so', () => {
    expect(byId.ngc224).toMatchObject({ surfaceBrightness: 23.63, majorArcmin: 177.83, positionAngleDeg: 35, mag: 3.44 });
    expect(byId.ngc224).not.toHaveProperty('sbComputed');
    // 4.0 + 2.5 * log10(pi/4 * 5400 * 3600) = 21.96
    expect(byId.ngc1976).toMatchObject({ surfaceBrightness: 21.96, sbComputed: true, aliases: ['Orion Nebula', 'LBN 974'] });
    expect(byId.ic1396).not.toHaveProperty('surfaceBrightness');
  });

  it('is deterministic', () => {
    expect(build(ngc, addendum).bytes).toBe(built.bytes);
  });
});

describe('the committed asset (pinned to OpenNGC v20260501)', () => {
  const text = readFileSync(ASSET, 'utf8');
  const doc = JSON.parse(text);

  it('has the measured counts', () => {
    expect(doc.source).toMatchObject({ tag: 'v20260501', name: 'OpenNGC' });
    expect(doc.count).toBe(4920);
    expect(doc.objects).toHaveLength(4920);
    const byType: Record<string, number> = {};
    for (const o of doc.objects) byType[o.type] = (byType[o.type] ?? 0) + 1;
    expect(byType).toEqual({
      galaxy: 3795,
      'open-cluster': 603,
      nebula: 225,
      'globular-cluster': 205,
      'planetary-nebula': 43,
      asterism: 32,
      'supernova-remnant': 10,
      'galaxy-group': 4,
      'dark-nebula': 2,
      'double-star': 1,
    });
  });

  it('stays near the measured size', () => {
    expect(text.length).toBeGreaterThan(1_000_000);
    expect(text.length).toBeLessThan(1_100_000);
    const gz = gzipSync(text, { level: 9 }).length;
    expect(gz).toBeGreaterThan(150_000);
    expect(gz).toBeLessThan(165_000);
  });

  it('holds 109 Messier objects (all but M102) and 109 Caldwell objects', () => {
    const m = new Set(doc.objects.filter((o: { m?: number }) => o.m).map((o: { m: number }) => o.m));
    const c = new Set(doc.objects.filter((o: { c?: number }) => o.c).map((o: { c: number }) => o.c));
    expect([...Array(110).keys()].map((i) => i + 1).filter((n) => !m.has(n))).toEqual([102]);
    expect([...Array(109).keys()].map((i) => i + 1).filter((n) => !c.has(n))).toEqual([]);
  });

  it('records the input hashes and the licence', () => {
    expect(doc.license).toBe('CC-BY-SA-4.0');
    expect(doc.source.inputSha256['NGC.csv']).toMatch(/^[0-9a-f]{64}$/);
  });
});
