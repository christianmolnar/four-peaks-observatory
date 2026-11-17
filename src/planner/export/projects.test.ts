import { computeProgress } from '../projects/progress';
import { L, NOW, line, project, session } from '../projects/testkit';
import { importProjects } from '../projects/edit';
import { projectSheet } from '../projects/sheet';
import type { ProjectSheet } from '../projects/sheet';
import { EMPTY_PROJECTS } from '../projects/validate';
import { MAX_PLANS_FILE_CHARS, PlansFileError, plansFileText, readPlansFile, readProjectsFile } from './plans-file';
import { PROJECT_CSV_HEADER, durationText, percentText, projectCsvRows, projectMarkdown, trackerText } from './projects';
import { docToCsv, docToMarkdown, docToText } from './share';
import type { ShareDoc } from './share';

const NAMES = { gear: 'EdgeHD 11 + HyperStar + ASI2600MC Duo', target: (id: string) => ({ m31: 'M31', m42: 'M42 Orion', ngc1499: 'NGC 1499' })[id] ?? id, filter: (id: string) => ({ [L]: 'Broadband', nbz: 'NBZ-II', nb3: 'NB3-PM' })[id] ?? id };
const logged = project({
  sessions: [session('a', 'm31', L, 120), session('b', 'm31', L, 60, '2026-11-15'), session('c', 'm42', 'nbz', 70), session('d', 'm42', 'nb3', 30), session('e', 'ngc1499', L, 40), session('f', 'm31', L, 120)],
});
const sheet = (p = logged) => projectSheet(p, NAMES);
const doc = (projects: ProjectSheet[]): ShareDoc => ({ plans: [], gear: null, notes: [], projects });

describe('the Copy tracker text', () => {
  it('has the mockup shape: header, progress, per target and filter, filter totals, optional footnote, off-plan list', () => {
    expect(trackerText(sheet())).toBe(
      [
        'PROJECT: Fall marathon',
        'EdgeHD 11 + HyperStar + ASI2600MC Duo, 60-second exposures, 2 targets',
        'Progress: 6h 10m / 8h (77.1%, 1h 10m over)',
        'Planned 8h, completed 6h 10m, remaining 3h',
        '370 of 480 planned 60-second exposures',
        '',
        'M31: 5h / 5h (100%, 1h over)',
        '  Broadband: 5h / 4h (125%, 1h over)',
        '  NBZ-II: 0h / 1h (0%)',
        'M42 Orion: 1h 10m / 3h (38.9%, 10m over)',
        '  Broadband: 0h / 2h (0%)',
        '  NBZ-II: 1h 10m / 1h (116.7%, 10m over)',
        '  NB3-PM (optional): 30m / 1h (50%)',
        '',
        'Filter totals',
        '  Broadband: 5h / 6h (83.3%, 1h over)',
        '  NBZ-II: 1h 10m / 2h (58.3%, 10m over)',
        '  NB3-PM: 0h / 0h (–)',
        '',
        'Optional time excluded from the totals: M42 Orion NB3-PM 30m of 1h',
        '',
        'Not in the plan (kept, in no total above; 40m in all):',
        '  2026-11-16 NGC 1499 Broadband 40m: the target is not in this project',
        '',
      ].join('\n'),
    );
  });

  it('the first mockup numbers: 4h 30m of 62h is 7.3% and 270 of 3,720 exposures at 60 s', () => {
    const p = project({ targets: [{ id: 'm31', lines: [line(L, 3720)] }], sessions: [session('a', 'm31', L, 270)] });
    const t = trackerText(projectSheet(p, NAMES));
    expect(t).toContain('Progress: 4h 30m / 62h (7.3%)');
    expect(t).toContain('270 of 3,720 planned 60-second exposures');
  });

  it('a dash for a plan of zero, never NaN, Infinity or an exponent', () => {
    const t = trackerText(projectSheet(project({ targets: [{ id: 'm31', lines: [line(L, 0)] }], sessions: [session('a', 'm31', L, 10)] }), NAMES));
    expect(t).toContain('Progress: 10m / 0h (–, 10m over)');
    expect(t).not.toMatch(/NaN|Infinity|e\+|undefined|null/);
    expect(percentText(null)).toBe('–');
  });

  it('durations', () => {
    expect([0, 45, 60, 90, 270, 3720, 5.25, 100000].map(durationText)).toEqual(['0h', '45m', '1h', '1h 30m', '4h 30m', '62h', '5m 15s', '1666h 40m']);
  });

  it('a hostile name or note is one plain line', () => {
    const t = trackerText(projectSheet(project({ name: 'Fall\nPROJECT: evil' }), NAMES));
    expect(t.split('\n')[0]).toBe('PROJECT: Fall PROJECT: evil');
  });
});

describe('text, Markdown, CSV and JSON carry the same numbers, from the one computation', () => {
  const s = sheet();
  const p = computeProgress(logged);

  it('the sheet is computed from progress, rounded once', () => {
    expect(s.overall.planned).toBe(p.overall.planned);
    expect(s.overall.done).toBe(p.overall.done);
    expect(s.overall.plannedExposures).toBe(p.exposures.planned);
    expect(s.overall.percent).toBe(77.1);
  });

  it('every number the text prints is in the CSV and the JSON sheet', () => {
    const rows = projectCsvRows(s).map((r) => r.split(','));
    const overall = rows.find((r) => r[1] === 'Overall')!;
    expect(overall.slice(6, 14)).toEqual([String(s.overall.planned), String(s.overall.done), String(s.overall.remaining), String(s.overall.over), String(s.overall.percent), String(s.overall.plannedExposures), String(s.overall.doneExposures), '']);
    const target = rows.find((r) => r[1] === 'Target and filter' && r[3] === 'M42 Orion' && r[4] === 'NBZ-II')!;
    expect(target.slice(5, 11)).toEqual(['no', '60', '70', '0', '10', '116.7']);
    const total = rows.find((r) => r[1] === 'Filter total' && r[4] === 'Broadband')!;
    expect(total.slice(6, 11)).toEqual(['360', '300', '120', '60', '83.3']);
    // the text states the same minutes
    expect(trackerText(s)).toContain(`${durationText(s.overall.done)} / ${durationText(s.overall.planned)} (${percentText(s.overall.percent)}`);
    const json = JSON.parse(plansFileText({ exportedAt: NOW, plans: [], sheets: [], profile: null, projects: [logged], projectSheets: [s] }));
    expect(json.projectSheets[0].overall).toEqual(s.overall);
    expect(json.projectSheets[0].filters).toEqual(s.filters);
  });

  it('an empty percent is empty in the CSV, and the optional and off-plan rows are there', () => {
    const z = projectSheet(project({ targets: [{ id: 'm31', lines: [line(L, 0)] }], sessions: [session('a', 'm31', L, 10)] }), NAMES);
    expect(projectCsvRows(z).find((r) => r.split(',')[1] === 'Overall')!.split(',').slice(6, 11)).toEqual(['0', '10', '0', '10', '']);
    const kinds = projectCsvRows(s).map((r) => r.split(',')[1]);
    expect(kinds).toEqual(expect.arrayContaining(['Overall', 'Target', 'Target and filter', 'Filter total', 'Optional (excluded)', 'Not in the plan', 'Session']));
    expect(kinds.filter((k) => k === 'Session')).toHaveLength(6);
  });

  it('Markdown has the progress, a table per target and filter and the filter totals', () => {
    const m = projectMarkdown(s).join('\n');
    expect(m).toContain('## Fall marathon');
    expect(m).toContain('- **Progress:** 6h 10m / 8h (77.1%, 1h 10m over)');
    expect(m).toContain('| | NBZ-II | 1h 10m | 1h | 116.7%, 10m over |');
    expect(m).toContain('### Filter totals');
  });

  it('joins the Share document: text, Markdown and CSV each add the project and leave the rest as it was', () => {
    const base: ShareDoc = { plans: [], gear: { sections: [{ title: 'Scopes', lines: ['EdgeHD 11'] }] }, notes: ['n'] };
    const withP = { ...base, projects: [s] };
    expect(docToText(withP)).toContain(trackerText(s).trimEnd());
    expect(docToText({ ...base, projects: [] })).toBe(docToText(base));
    expect(docToMarkdown({ ...base, projects: [] })).toBe(docToMarkdown(base));
    expect(docToCsv({ ...base, projects: [] })).toBe(docToCsv(base));
    expect(docToMarkdown(withP)).toContain('## Fall marathon');
    expect(docToMarkdown(doc([s])).startsWith('# Four Peaks planner export')).toBe(true);
    const csv = docToCsv(withP).split('\r\n');
    expect(csv).toContain(PROJECT_CSV_HEADER.join(','));
    expect(csv.some((l) => l.startsWith('Kind,Description'))).toBe(true);
  });

  it('text a spreadsheet would run as a formula is guarded in the CSV', () => {
    const e = projectSheet(project({ name: '=HYPERLINK("x")' }), NAMES);
    expect(projectCsvRows(e)[0].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
});

describe('the file: lossless import, a repeat adds nothing, old files still import', () => {
  const stored = project({ sessions: [session('a', 'm31', L, 30), { id: 'b', date: '2026-11-01', targetId: 'm42', filterId: L, exposures: 7, subSeconds: 45, note: 'late; "quoted"' }, session('c', 'ngc1499', L, 12)] });
  const file = plansFileText({ exportedAt: NOW, plans: [], sheets: [], profile: null, projects: [stored], projectSheets: [sheet(stored)] });

  it('writes kind "projects" for projects alone, and reads them back field for field, off-plan sessions included', () => {
    expect(JSON.parse(file).kind).toBe('projects');
    const r = readProjectsFile(file);
    expect(r.notices).toEqual([]);
    expect(r.projects).toEqual([stored]);
  });

  it('a file with plans and projects stays a plans file (kind plans) and the plans reader still reads it', () => {
    const text = plansFileText({ exportedAt: NOW, plans: [{ id: 'plan-1', name: 'P', createdAt: NOW, updatedAt: NOW, date: '2026-11-14', siteId: 'home', trainId: 't1', startTime: null, targets: [{ id: 'm42', preset: 'balanced' }], notes: '' }], sheets: [], profile: null, projects: [stored] });
    expect(JSON.parse(text).kind).toBe('plans');
    expect(readPlansFile(text, '2026-11-17', (x) => x).plans).toHaveLength(1);
    expect(readProjectsFile(text).projects).toEqual([stored]);
  });

  it('a file with no projects is exactly what it was before this step', () => {
    const before = plansFileText({ exportedAt: NOW, plans: [], sheets: [], profile: null });
    expect(Object.keys(JSON.parse(before))).toEqual(['format', 'kind', 'version', 'exportedAt', 'plans', 'sheets']);
    const empty = plansFileText({ exportedAt: NOW, plans: [], sheets: [], profile: null, projects: [] });
    expect(empty).toBe(before);
  });

  it('import then import again: the first adds, the repeat adds nothing', () => {
    const r = readProjectsFile(file);
    const first = importProjects(EMPTY_PROJECTS, r.projects, 'copy', NOW);
    expect(first.state.projects).toEqual([stored]);
    const again = importProjects(first.state, readProjectsFile(file).projects, 'copy', NOW);
    expect(again).toMatchObject({ added: 0, skipped: 1 });
    expect(again.state).toEqual(first.state);
  });

  it('an old plans file (no projects) says so in plain words and imports nothing', () => {
    const old = JSON.stringify({ format: 'four-peaks-planner', kind: 'plans', version: 1, plans: [{}] });
    expect(() => readProjectsFile(old)).toThrow(PlansFileError);
    expect(() => readProjectsFile(old)).toThrow('The file holds no projects.');
  });

  const refuses = (text: string, re: RegExp) => {
    expect(() => readProjectsFile(text)).toThrow(PlansFileError);
    expect(() => readProjectsFile(text)).toThrow(re);
    try {
      readProjectsFile(text);
    } catch (e) {
      expect((e as Error).message).not.toMatch(/\$\.|expected|undefined|\[object|NaN|Infinity/);
    }
  };
  const env = (over: Record<string, unknown>) => JSON.stringify({ format: 'four-peaks-planner', kind: 'projects', version: 1, plans: [], projects: [stored], ...over });

  it('a file that is not a projects file is refused in plain words', () => {
    refuses('  ', /empty/);
    refuses('{nope', /not valid JSON/);
    refuses('[1]', /should be an object/);
    refuses(JSON.stringify({ format: 'other', version: 1, projects: [] }), /not made by this planner/);
    refuses(JSON.stringify({ version: 1, projects: [] }), /not made by this planner/);
    refuses(env({ version: undefined }), /no version/);
    refuses(env({ version: 9 }), /newer version of the planner \(version 9\)/);
    refuses(env({ version: 0 }), /version 0/);
    refuses(env({ projects: [] }), /holds no projects/);
    refuses(env({ projects: {} }), /not a list/);
    refuses('x'.repeat(MAX_PLANS_FILE_CHARS + 1), /too large/);
  });

  it('hostile projects: each bad one is left out in words, never printed raw; all bad is refused', () => {
    const hostile = [
      { ...stored, id: 'h1', name: 'Bad minutes', sessions: [{ ...session('a', 'm31', L, 1), minutes: 1e308 }] },
      { ...stored, id: 'h2', name: 'Bad date\nsecond line', sessions: [{ ...session('a', 'm31', L, 1), date: '2026-02-30' }] },
      { ...stored, id: 'h3', name: 'Strings', sessions: [{ ...session('a', 'm31', L, 1), minutes: 'HOSTILE' }] },
      { ...stored, id: 'h4', name: 'Negative', targets: [{ id: 'm31', lines: [{ filterId: L, minutes: -4, optional: false }] }] },
      { ...stored, id: 'h5', name: 'Dupes', sessions: [session('a', 'm31', L, 1), session('a', 'm31', L, 1)] },
      { ...stored, id: 'h6', name: 'Many', sessions: Array.from({ length: 5001 }, (_, i) => session(`s${i}`, 'm31', L, 1)) },
      JSON.parse('{"__proto__":{"polluted":true},"id":"h7","name":"Proto"}'),
      { ...stored, id: 'good', name: 'Good' },
    ];
    const r = readProjectsFile(env({ projects: hostile }));
    expect(r.projects.map((p) => p.id)).toEqual(['good']);
    expect(r.notices).toHaveLength(7);
    const said = r.notices.join('\n');
    expect(said).toMatch(/"Bad minutes" could not be read and is left out \(session 1, minutes: an impossibly large number is outside the allowed range; use a whole number, 0 to 100,000 min\)/);
    expect(said).not.toMatch(/HOSTILE|NaN|Infinity|e\+|\$\.|\[object/);
    expect(said.split('\n').every((l) => l.startsWith('The project '))).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    refuses(env({ projects: hostile.slice(0, 7) }), /None of the projects in the file could be read/);
  });

  it('a project that repeats an id inside the file is left out; more than the limit is counted', () => {
    const r = readProjectsFile(env({ projects: [stored, { ...stored, name: 'Again' }, ...Array.from({ length: 21 }, (_, i) => ({ ...stored, id: `q${i}`, name: `Q${i}` }))] }));
    expect(r.projects).toHaveLength(20);
    expect(r.notices.join(' ')).toMatch(/repeats the id of an earlier project/);
    expect(r.notices.join(' ')).toMatch(/reads at most 20 projects, so 2 more/);
  });
});

describe('the version in a refusal is worded, never raw number formatting', () => {
  const refusal = (version: number) => {
    try {
      readProjectsFile(JSON.stringify({ format: 'four-peaks-planner', kind: 'projects', version, projects: [project()] }));
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('expected a refusal');
  };
  it('a newer whole version is named; a huge one is not printed as 1e+308', () => {
    expect(refusal(7)).toMatch(/newer version of the planner \(version 7\); this one reads version 1\./);
    const huge = refusal(1e308);
    expect(huge).toMatch(/newer version of the planner; this one reads version 1\./);
    expect(huge).not.toMatch(/e\+/);
  });
  it('an odd older version is worded without its raw digits', () => {
    expect(refusal(0)).toMatch(/It is version 0;/);
    expect(refusal(0.5)).toMatch(/Its version is not a whole number;/);
    expect(refusal(1e-7)).not.toMatch(/e-/);
  });
});
