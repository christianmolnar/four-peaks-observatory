import { MAX_SUBS, MAX_SUB_S, MIN_CUSTOM_SUB_S, PRESETS } from '../exposure';
import type { Profile } from '../profile';
import { LIST_SPECS, textsOf } from '../state/edit';
import type { ListKey } from '../state/edit';
import type { Plan, PlanTargetRef } from '../state/plans';
import type { ProjectSheet } from '../projects/sheet';
import { csvField } from './csv';
import { PROJECT_CSV_HEADER, projectCsvRows, projectMarkdown, trackerLines } from './projects';
import { md, oneLine } from './text';

/**
 * What a person reads in a shared plan: plain words and units, no ids. One row is one object of the plan, with its times and exposure.
 * The page fills the open plan's rows from the numbers its own rows and timeline show (so a file, a sheet and the screen agree); the other
 * plans are read from what they store, and say so.
 */
export interface SheetRow {
  order: number;
  /**
   * scheduled: the timeline gives the row a time, so its sub length, count and light are the timeline's own.
   * unscheduled: the timeline leaves the row out tonight; it carries no numbers and adds no light.
   * stored: no night was worked out for this plan; only what the plan stores is shown.
   */
  state: 'scheduled' | 'unscheduled' | 'stored';
  name: string;
  type: string;
  /** "05h 35m 17s" and "+05° 23' 28\"", or empty for a body that moves (the Moon, a planet). */
  ra: string;
  dec: string;
  /** Clock times in the site's zone, or empty when the plan has none for the object. */
  start: string;
  end: string;
  preset: string;
  subSeconds: number | null;
  subCount: number | null;
  lightMin: number | null;
  /** The filter of the plan's train; "No filter" when it has none. */
  filter: string;
  /** "Favorite saved: 120 s x 30, Balanced", or empty. */
  favorite: string;
  note: string;
  /** Why the row has no numbers, or the timeline's warnings for it. */
  warning: string;
}

export interface PlanSheet {
  name: string;
  /** "Sat 14 Nov 2026". */
  date: string;
  /** Site name with its place. */
  site: string;
  /** Train name and its parts. */
  train: string;
  night: string;
  startsAt: string;
  notes: string;
  /** Sentences that apply to the whole plan (the train or site is gone from the gear, and what is shown instead). */
  warnings: string[];
  /** Said when the numbers and times were not worked out for this plan (it is not the open one). */
  caveat: string;
  rows: SheetRow[];
  totalLightMin: number | null;
  /**
   * The plan's filter mix, one line per target (the row's own numbers). Set only for the plain-text file; every other format and the print sheet leave it out.
   */
  mix?: string[];
}

export interface GearSheet {
  sections: { title: string; lines: string[] }[];
}

export interface ShareDoc {
  /** The plans, in order; empty when only gear is shared. */
  plans: PlanSheet[];
  gear: GearSheet | null;
  /** Sentences for the whole file (the saved plans are held back, so this is what is on the page). */
  notes: string[];
  /** The projects (marathons) shared with it; absent or empty: none. */
  projects?: ProjectSheet[];
}

/** Said once on every run sheet: the planner has no gain to give. */
export const GAIN_NOTE = 'Gain is set at the camera; this planner does not choose one.';

export const sheetTotal = (rows: readonly SheetRow[]): number | null => {
  const done = rows.filter((r) => r.lightMin !== null);
  return done.length === 0 ? null : Math.round(done.reduce((sum, r) => sum + (r.lightMin as number), 0));
};

// ------------------------------------------------------------------ coordinates

const pad = (n: number): string => String(n).padStart(2, '0');

function hms(hours: number): [number, number, number] {
  const total = Math.round((((hours % 24) + 24) % 24) * 3600) % 86400;
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
}

function dms(degrees: number): { sign: string; d: number; m: number; s: number } {
  const total = Math.round(Math.abs(degrees) * 3600);
  return { sign: degrees < 0 && total > 0 ? '-' : '+', d: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

export function raText(hours: number): string {
  const [h, m, s] = hms(hours);
  return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

export function decText(degrees: number): string {
  const { sign, d, m, s } = dms(degrees);
  return `${sign}${pad(d)}° ${pad(m)}' ${pad(s)}"`;
}

// ------------------------------------------------------------------ the stored plans, as sheets

/** What the page knows of a catalog id: its name and place, or null when it is not in the bundled catalog. */
export interface TargetFacts {
  name: string;
  type: string;
  raHours: number | null;
  decDeg: number | null;
}

export const NOT_IN_CATALOG = 'A target that is not in the bundled catalog';
export const CUSTOM_OUTSIDE = 'Custom values outside the limits (not used)';

/** True when a stored custom sub length and count can be used: a sub of MIN_CUSTOM_SUB_S to MAX_SUB_S seconds and a whole count of 1 to MAX_SUBS. */
export const customInLimits = (subSeconds: unknown, subCount: unknown): boolean =>
  typeof subSeconds === 'number' && Number.isFinite(subSeconds) && subSeconds >= MIN_CUSTOM_SUB_S && subSeconds <= MAX_SUB_S && typeof subCount === 'number' && Number.isInteger(subCount) && subCount >= 1 && subCount <= MAX_SUBS;

/** Why a stored custom is not used, in words with the limits and never the stored numbers. */
export const customOutsideText = (base: keyof typeof PRESETS): string =>
  `The stored custom numbers are outside the limits (a sub of ${MIN_CUSTOM_SUB_S} to ${MAX_SUB_S} s, 1 to ${MAX_SUBS} whole subs), so they are not used; the ${PRESETS[base].label} preset is used instead.`;

export const presetName = (ref: Pick<PlanTargetRef, 'preset' | 'base'>): string => (ref.preset === 'custom' ? `Custom (from ${PRESETS[ref.base ?? 'balanced'].label})` : PRESETS[ref.preset].label);

export const filterNameOf = (profile: Profile, trainId: string): string => {
  const t = profile.trains.find((x) => x.id === trainId);
  if (t === undefined) return '';
  if (t.kind === 'smart') return 'Built-in filter wheel or none (smart scope)';
  return (t.filterId === undefined ? undefined : profile.equipment.filters.find((f) => f.id === t.filterId)?.name) ?? 'No filter';
};

export function trainText(profile: Profile, trainId: string): string {
  const t = profile.trains.find((x) => x.id === trainId);
  if (t === undefined) return 'a train that is no longer in your gear';
  const eq = profile.equipment;
  if (t.kind === 'smart') return `${t.name} (${eq.smartScopes.find((s) => s.id === t.smartScopeId)?.name ?? 'smart scope'})`;
  const parts = [eq.scopes.find((s) => s.id === t.scopeId)?.name, ...t.accessoryIds.map((id) => eq.accessories.find((a) => a.id === id)?.name), eq.cameras.find((c) => c.id === t.cameraId)?.name, filterNameOf(profile, t.id)];
  return `${t.name} (${parts.filter((p): p is string => p !== undefined && p !== '').join(', ')})`;
}

export function siteText(profile: Profile, siteId: string): string {
  const s = profile.sites.find((x) => x.id === siteId);
  if (s === undefined) return 'a site that is no longer in your gear';
  return `${s.name} (${s.latitude.toFixed(4)}°, ${s.longitude.toFixed(4)}°${s.elevationM !== undefined ? `, ${s.elevationM} m` : ''}${s.timeZone ? `, ${s.timeZone}` : ''})`;
}

/**
 * A plan as it is stored, with no night worked out: its objects in order, the preset of each, the sub length and count of a Custom one, the
 * clock times it was given, and its notes. It says so, so no one reads a blank as "no exposure".
 */
export function storedSheet(plan: Plan, profile: Profile, facts: (id: string) => TargetFacts | null, dateText: (iso: string) => string, favorite: (id: string) => string): PlanSheet {
  const filter = filterNameOf(profile, plan.trainId) || 'No filter';
  const rows = plan.targets.map((t, i): SheetRow => {
    const f = facts(t.id);
    const stored = t.preset === 'custom' && t.custom?.subSeconds !== undefined && t.custom.subCount !== undefined ? { s: t.custom.subSeconds, n: t.custom.subCount } : null;
    const outside = stored !== null && !customInLimits(stored.s, stored.n);
    const custom = stored !== null && !outside ? stored : null;
    return {
      order: i + 1,
      state: 'stored',
      name: f?.name ?? NOT_IN_CATALOG,
      type: f?.type ?? '',
      ra: f?.raHours != null ? raText(f.raHours) : '',
      dec: f?.decDeg != null ? decText(f.decDeg) : '',
      start: t.start ?? '',
      end: t.end ?? '',
      preset: outside ? CUSTOM_OUTSIDE : presetName(t),
      subSeconds: custom?.s ?? null,
      subCount: custom?.n ?? null,
      lightMin: custom === null ? null : Math.round((custom.s * custom.n) / 60),
      filter,
      favorite: favorite(t.id),
      note: t.note ?? '',
      warning: outside ? customOutsideText(t.base ?? 'balanced') : '',
    };
  });
  return {
    name: plan.name,
    date: dateText(plan.date),
    site: siteText(profile, plan.siteId),
    train: trainText(profile, plan.trainId),
    night: '',
    startsAt: plan.startTime ?? '',
    notes: plan.notes,
    warnings: [],
    caveat: 'Sub lengths, counts, times and total light are worked out for the plan that is open; open this plan and share it for them. Shown here: what the plan stores, with no total.',
    rows,
    totalLightMin: null,
  };
}

// ------------------------------------------------------------------ gear, in words

const GEAR_ORDER: ListKey[] = ['sites', 'scopes', 'accessories', 'cameras', 'smartScopes', 'filters'];

/** The unit written after a number of the gear lists, so "Pixel size 3.76" reads "Pixel size 3.76 µm". */
const GEAR_UNITS: Record<string, string> = {
  latitude: '°',
  longitude: '°',
  elevationM: ' m',
  focalLengthMm: ' mm',
  apertureMm: ' mm',
  effectiveFocalLengthMm: ' mm',
  sizeMm: ' mm',
  pixelSizeUm: ' µm',
  sensorWidthPx: ' px',
  sensorHeightPx: ' px',
  passbandWidthNm: ' nm',
  narrowestBandNm: ' nm',
  maxIncidentAngleDeg: '°',
};
/** The words for a stored choice that are not words (alt-az, broadband-LP); anything else reads as stored. */
const GEAR_WORDS: Record<string, Record<string, string>> = {
  mountMode: { 'alt-az': 'alt-azimuth', eq: 'equatorial' },
  kind: { 'broadband-LP': 'broadband light-pollution', 'UV-IR cut': 'UV/IR cut', 'visual-only': 'visual only' },
  readNoiseClass: { low: 'low', medium: 'medium', high: 'high' },
};

function gearValue(key: string, kind: string, value: string): string {
  if (kind === 'number') return `${value}${GEAR_UNITS[key] ?? ''}`;
  return GEAR_WORDS[key]?.[value] ?? value;
}

export function gearSheet(profile: Profile): GearSheet {
  const sections: GearSheet['sections'] = [];
  for (const key of GEAR_ORDER) {
    const items = key === 'sites' ? profile.sites : profile.equipment[key];
    if (items.length === 0) continue;
    const spec = LIST_SPECS[key];
    sections.push({
      title: spec.title,
      lines: items.map((item) => {
        const texts = textsOf(key, item);
        const parts = spec.fields.filter((f) => f.key !== 'name' && texts[f.key] !== '').map((f) => `${f.label} ${f.key === 'bortle' ? `class ${texts[f.key]}` : gearValue(f.key, f.kind, texts[f.key])}`);
        return `${texts.name}${parts.length === 0 ? '' : `: ${parts.join('; ')}`}`;
      }),
    });
  }
  if (profile.trains.length > 0) sections.push({ title: 'Trains', lines: profile.trains.map((t) => trainText(profile, t.id)) });
  return { sections };
}

// ------------------------------------------------------------------ plain text

const L = (s: string, label: string): string[] => (s === '' ? [] : [`${label}${s}`]);
export const NOT_SCHEDULED = 'not scheduled tonight';
const timeSpan = (r: SheetRow): string => (r.state === 'unscheduled' ? NOT_SCHEDULED : r.start === '' ? 'no time' : r.end === '' ? r.start : `${r.start}-${r.end}`);
const subsText = (r: SheetRow): string => (r.subSeconds === null || r.subCount === null ? '' : `${r.subCount} x ${r.subSeconds} s`);
/** What a row says in place of subs: nothing planned (unscheduled), clips (the Moon, a planet) with their minutes, or "not worked out". */
export const noSubsText = (r: SheetRow): string => {
  if (r.state === 'unscheduled') return 'no subs, no light';
  const light = r.lightMin !== null && r.lightMin > 0 ? `, about ${r.lightMin} min` : '';
  return r.type === 'Solar system' ? `clips, not subs${light}` : `subs: not worked out${light}`;
};

function planText(p: PlanSheet): string[] {
  const out = [`PLAN: ${p.name}`, `Evening of ${p.date}`, `Site: ${p.site}`, `Train: ${p.train}`];
  out.push(...L(p.night, 'Night: '), ...L(p.startsAt, 'Imaging starts: '), `Local times at the site. ${GAIN_NOTE}`);
  if (p.notes.trim() !== '') out.push(`Notes: ${oneLine(p.notes)}`);
  out.push(...p.warnings.map((w) => `Warning: ${w}`));
  if (p.caveat !== '') out.push(`Note: ${p.caveat}`);
  out.push('');
  if (p.rows.length === 0) out.push('No objects in this plan.');
  for (const r of p.rows) {
    out.push(`${r.order}. ${timeSpan(r)}  ${r.name}${r.type === '' ? '' : ` (${r.type})`}`);
    if (r.ra !== '') out.push(`   RA ${r.ra}  Dec ${r.dec}`);
    const sub = subsText(r);
    out.push(`   ${sub === '' ? noSubsText(r) : `${sub} = ${r.lightMin} min`}  gain ____  filter: ${r.filter}${r.preset === '' ? '' : `  (${r.preset})`}`);
    if (r.favorite !== '') out.push(`   ${r.favorite}`);
    if (r.note !== '') out.push(`   Note: ${oneLine(r.note)}`);
    if (r.warning !== '') out.push(`   Warning: ${oneLine(r.warning)}`);
  }
  if (p.totalLightMin !== null) out.push('', `Total light: ${p.totalLightMin} min`);
  if (p.mix !== undefined && p.mix.length > 0) out.push('', 'Filter mix (each target’s planned light split between the selected filters):', ...p.mix.map((l) => `- ${oneLine(l)}`));
  return out;
}

export function docToText(doc: ShareDoc): string {
  const blocks: string[][] = [];
  if (doc.notes.length > 0) blocks.push(doc.notes);
  for (const p of doc.plans) blocks.push(planText(p));
  for (const p of doc.projects ?? []) blocks.push(trackerLines(p));
  if (doc.gear !== null) blocks.push(['GEAR', ...doc.gear.sections.flatMap((s) => ['', `${s.title}:`, ...s.lines.map((l) => `- ${l}`)])]);
  return `${blocks.map((b) => b.join('\n')).join('\n\n\n')}\n`;
}

// ------------------------------------------------------------------ Markdown

export { md };

function planMarkdown(p: PlanSheet): string[] {
  const out = [`## ${md(p.name)}`, '', `- **Evening:** ${md(p.date)}`, `- **Site:** ${md(p.site)}`, `- **Train:** ${md(p.train)}`];
  if (p.night !== '') out.push(`- **Night:** ${md(p.night)}`);
  if (p.startsAt !== '') out.push(`- **Imaging starts:** ${md(p.startsAt)}`);
  out.push(`- **Times** are local at the site. ${md(GAIN_NOTE)}`);
  if (p.notes.trim() !== '') out.push(`- **Notes:** ${md(p.notes)}`);
  for (const w of p.warnings) out.push(`- **Warning:** ${md(w)}`);
  if (p.caveat !== '') out.push(`- **Note:** ${md(p.caveat)}`);
  out.push('');
  if (p.rows.length === 0) return [...out, 'No objects in this plan.'];
  out.push('| # | Time | Object | RA / Dec | Subs | Total | Gain | Filter | Notes |', '|---|---|---|---|---|---|---|---|---|');
  for (const r of p.rows) {
    const sub = subsText(r) || (r.state === 'unscheduled' ? 'none' : r.type === 'Solar system' ? 'clips' : 'not worked out');
    const notes = [r.preset === '' ? '' : r.preset, r.favorite, r.note, r.warning && `Warning: ${r.warning}`].filter((x) => x !== '').join('; ');
    out.push(`| ${r.order} | ${md(timeSpan(r))} | ${md(r.name)}${r.type === '' ? '' : ` (${md(r.type)})`} | ${r.ra === '' ? '' : `${md(r.ra)}, ${md(r.dec)}`} | ${md(sub)} | ${r.lightMin === null ? '' : `${r.lightMin} min`} |  | ${md(r.filter)} | ${md(notes)} |`);
  }
  if (p.totalLightMin !== null) out.push('', `Total light: ${p.totalLightMin} min`);
  return out;
}

export function docToMarkdown(doc: ShareDoc): string {
  const blocks: string[][] = [];
  const title = doc.plans.length === 1 && doc.gear === null && (doc.projects ?? []).length === 0 ? `# Imaging plan: ${md(doc.plans[0].name)}` : '# Four Peaks planner export';
  blocks.push([title, ...(doc.notes.length > 0 ? ['', ...doc.notes.map(md)] : [])]);
  for (const p of doc.plans) blocks.push(planMarkdown(p));
  for (const p of doc.projects ?? []) blocks.push(projectMarkdown(p));
  if (doc.gear !== null) blocks.push(['## Gear', ...doc.gear.sections.flatMap((s) => ['', `### ${md(s.title)}`, '', ...s.lines.map((l) => `- ${md(l)}`)])]);
  return `${blocks.map((b) => b.join('\n')).join('\n\n')}\n`;
}

// ------------------------------------------------------------------ CSV

export const SHEET_CSV_HEADER = ['Plan', 'Evening', 'Site', 'Train', 'Order', 'Start', 'End', 'Object', 'Type', 'RA', 'Dec', 'Preset', 'Sub length (s)', 'Subs', 'Total light (min)', 'Filter', 'Favorite', 'Note', 'Warning'] as const;
export const GEAR_CSV_HEADER = ['Kind', 'Description'] as const;

/** Our own computed text (a declination starts with + or -) is quoted when needed but never given the formula guard that user-typed text gets. */
const own = (s: string): string => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const line = (cells: readonly (string | number | { own: string })[]): string => cells.map((c) => (typeof c === 'object' ? own(c.own) : csvField(c))).join(',');

export function docToCsv(doc: ShareDoc): string {
  const tables: string[][] = [];
  if (doc.plans.length > 0) {
    const rows = doc.plans.flatMap((p) => {
      const planWarning = [...p.warnings, p.caveat].filter((x) => x !== '').join(' ');
      if (p.rows.length === 0) return [line([p.name, p.date, p.site, p.train, '', '', '', '', '', '', '', '', '', '', '', '', '', p.notes, planWarning])];
      return p.rows.map((r) =>
        line([p.name, p.date, p.site, p.train, r.order, r.start, r.end, r.name, r.type, { own: r.ra }, { own: r.dec }, r.preset, r.subSeconds ?? '', r.subCount ?? '', r.lightMin ?? '', r.filter, r.favorite, r.note, [planWarning, r.state === 'unscheduled' ? 'Not scheduled tonight.' : '', r.warning].filter((x) => x !== '').join(' ')]),
      );
    });
    tables.push([line(SHEET_CSV_HEADER), ...rows]);
  }
  if ((doc.projects ?? []).length > 0) tables.push([line(PROJECT_CSV_HEADER), ...(doc.projects ?? []).flatMap(projectCsvRows)]);
  if (doc.gear !== null) tables.push([line(GEAR_CSV_HEADER), ...doc.gear.sections.flatMap((s) => s.lines.map((l) => line([s.title, l])))]);
  return `${tables.map((t) => t.join('\r\n')).join('\r\n\r\n')}\r\n`;
}

// ------------------------------------------------------------------ ASIAir

/**
 * The ASIAir's Plan > Add > Import takes a Telescopius mosaic CSV: positions only, one pane per row. The header and the row style are copied from a real
 * Telescopius export (the research note): the first column is "Pane 1", "Pane 2" and so on, and it has no column for a name, so the file cannot say which
 * object is which pane; `asiairPanes` lists that for the person (the sheet shows it) and the run sheet has the order. Whether the app takes unrelated
 * targets as the panes of one mosaic is untested. `degreeAsLetter` writes the degree sign as the letter d, the form to try if the app refuses the real one
 * (U+00BA, as Telescopius writes it).
 */
export const ASIAIR_HEADER = 'Pane, RA, DEC, Position Angle (East), Pane width (arcmins), Pane height (arcmins), Overlap, Row, Column';

export interface AsiairTarget {
  name: string;
  raHours: number;
  decDeg: number;
}

export const asciiName = (name: string): string => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '').replace(/[",]/g, ' ').replace(/\s+/g, ' ').trim();

/** Which object each pane is: "Pane 1: M42". */
export const asiairPanes = (targets: readonly AsiairTarget[]): string[] => targets.map((t, i) => `Pane ${i + 1}: ${asciiName(t.name) || `Target ${i + 1}`}`);

export function asiairCsv(targets: readonly AsiairTarget[], fov: { widthArcmin: number; heightArcmin: number } | null, degreeAsLetter: boolean): string {
  const w = (fov?.widthArcmin ?? 60).toFixed(2);
  const h = (fov?.heightArcmin ?? 60).toFixed(2);
  const rows = targets.map((t, i) => {
    const [rh, rm, rs] = hms(t.raHours);
    const { sign, d, m, s } = dms(t.decDeg);
    return `Pane ${i + 1}, ${pad(rh)}hr ${pad(rm)}' ${pad(rs)}", ${sign}${pad(d)}${degreeAsLetter ? 'd' : 'º'} ${pad(m)}' ${pad(s)}", 0.00, ${w}, ${h}, 20%, ${i + 1}, 1`;
  });
  return `${[ASIAIR_HEADER, ...rows].join('\r\n')}\r\n`;
}
