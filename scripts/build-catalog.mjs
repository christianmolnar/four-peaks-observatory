#!/usr/bin/env node
// Builds the bundled deep-sky extract public/catalog/openngc-v20260501-r3.json from OpenNGC.
//
//   node scripts/build-catalog.mjs                      fetch NGC.csv and addendum.csv at the pinned tag
//   node scripts/build-catalog.mjs --src <dir>          read NGC.csv and addendum.csv from <dir> instead
//   node scripts/build-catalog.mjs --out <file>         write somewhere else (default: the public/ asset)
//   node scripts/build-catalog.mjs --partial            skip the all-Messier, all-Caldwell check (test fixtures only)
//
// Rules (docs/reference/planner-catalog.md): real types only; mag <= 14 (or no mag, non-galaxies) and size >= 1 arcmin;
// plus every Messier, every Caldwell and every named object. The extract is CC BY-SA 4.0.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const TAG = 'v20260501';
// Bump when the build rules change the output for the same tag: the file is served `immutable`, so its name must change.
export const REVISION = 3;
const RAW = `https://raw.githubusercontent.com/mattiaverga/OpenNGC/${TAG}/database_files`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT = join(ROOT, 'public', 'catalog', `openngc-${TAG}-r${REVISION}.json`);

export const MAG_LIMIT = 14;
export const SIZE_LIMIT_ARCMIN = 1;

// OpenNGC type code -> planner type. Everything not listed is dropped.
const TYPE_MAP = {
  G: 'galaxy',
  GPair: 'galaxy-group',
  GTrpl: 'galaxy-group',
  GGroup: 'galaxy-group',
  OCl: 'open-cluster',
  GCl: 'globular-cluster',
  PN: 'planetary-nebula',
  Neb: 'nebula',
  EmN: 'nebula',
  RfN: 'nebula',
  HII: 'nebula',
  'Cl+N': 'nebula',
  DrkN: 'dark-nebula',
  SNR: 'supernova-remnant',
  '*Ass': 'asterism',
};
const GALAXY_TYPES = ['galaxy', 'galaxy-group'];
// Messier objects that OpenNGC types as a double star (M40) or "Other" (M73, four stars) are
// still Messier objects and are kept with a type of their own.
const MESSIER_TYPE_OVERRIDE = { '**': 'double-star', Other: 'asterism' };
// Messier objects that are deliberately absent: OpenNGC lists M102 only as a Dup of M101.
export const MESSIER_ABSENT = [102];

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l !== '');
  const head = lines[0].split(';');
  return lines.slice(1).map((line) => {
    const cells = line.split(';');
    const row = {};
    head.forEach((h, i) => {
      row[h] = cells[i] ?? '';
    });
    return row;
  });
}

const num = (s) => (s === '' || s === undefined ? undefined : Number(s));
const round = (x, d) => Number(x.toFixed(d));

function hours(s) {
  const [h, m, x] = s.split(':').map(Number);
  return h + m / 60 + x / 3600;
}
function degrees(s) {
  const sign = s.startsWith('-') ? -1 : 1;
  const [d, m, x] = s.replace(/^[+-]/, '').split(':').map(Number);
  return sign * (d + m / 60 + x / 3600);
}

/** Id: lower case OpenNGC name without leading zeros, spaces as hyphens ("NGC0224" -> "ngc224", "NGC4656 NED01" -> "ngc4656-ned01"). */
function idOf(name) {
  return name.toLowerCase().replace(/^([a-z]+)0+(\d)/, '$1$2').replace(/ /g, '-');
}

/** "NGC0224" -> "NGC 224", "IC0405" -> "IC 405", "Mel022" -> "Mel 22", "B033" -> "B 33". */
function labelOf(name) {
  const m = /^([A-Za-z]+)0*(\d+)(.*)$/.exec(name);
  return m ? `${m[1]} ${m[2]}${m[3]}` : name;
}

/**
 * One cell of the NGC, IC or M column: a comma separated list of numbers, each with an optional letter suffix
 * or NED component ("0651", "0547,2494", "1487NW", "4656 NED02"). Returns { num, tail } for each; anything else throws.
 */
function refsOf(cell, column) {
  return cell
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^0*(\d+)([A-Z]{0,2})(?: (NED\d+))?$/.exec(t);
      if (m === null) throw new Error(`Unreadable ${column} reference "${t}"`);
      return { num: Number(m[1]), tail: `${m[2]}${m[3] === undefined ? '' : ` ${m[3]}`}` };
    });
}

const refLabel = (cat, r) => (cat === 'M' ? `M${r.num}${r.tail}` : `${cat} ${r.num}${r.tail}`);
/** The id such a reference gives a primary object ("NGC", {6523} -> "ngc6523", "M", {101} -> "m101"). */
const refId = (cat, r) => idOf(`${cat}${r.num}${r.tail}`);

function sbFrom(mag, maj, min) {
  const areaArcsec2 = (Math.PI / 4) * maj * 60 * min * 60;
  return mag + 2.5 * Math.log10(areaArcsec2);
}

/** One OpenNGC row -> extract record. Returns null for a row without usable coordinates. */
function toRecord(row, type, crossRefsOut) {
  if (row.RA === '' || row.Dec === '') return null;
  const maj = num(row.MajAx);
  const min = num(row.MinAx);
  const mag = num(row['V-Mag']) ?? num(row['B-Mag']);
  const mRefs = refsOf(row.M, 'M');
  const m = mRefs[0]?.num;
  const ident = row.Identifiers.split(',').map((s) => s.trim()).filter(Boolean);
  const cNum = (() => {
    if (/^C\d+$/.test(row.Name)) return Number(row.Name.slice(1));
    const hit = ident.map((s) => /^C (\d+)$/.exec(s)).find(Boolean);
    return hit ? Number(hit[1]) : undefined;
  })();
  const common = row['Common names'].split(',').map((s) => s.trim()).filter(Boolean);
  const own = /^(NGC|IC)\d+$/.test(row.Name) ? undefined : labelOf(row.Name);
  const extra = ident.filter((s) => /^(LBN|SH 2-)/.test(s));
  // The NED components of a galaxy group ("NGC 4656 NED01") answer to the group's number as well.
  const parent = /^(NGC|IC)(\d+) NED\d+$/.exec(row.Name);
  const parentLabel = parent === null ? [] : [`${parent[1]} ${Number(parent[2])}`];
  // The NGC, IC and M columns cross-reference other numbers of the same object: all of them become aliases,
  // except the row's own number.
  const ownLabel = labelOf(row.Name);
  const crossRefs = [
    ...mRefs.slice(1).map((r) => refLabel('M', r)),
    ...refsOf(row.NGC, 'NGC').map((r) => refLabel('NGC', r)),
    ...refsOf(row.IC, 'IC').map((r) => refLabel('IC', r)),
  ].filter((a) => a !== ownLabel);
  const name = common[0] ?? (m !== undefined ? `M${m}` : labelOf(row.Name));
  const aliases = [...new Set([...common.slice(1), ...(own ? [own] : []), ...parentLabel, ...crossRefs, ...extra])].filter(
    (a) => a !== name,
  );
  // Remembered so the build can drop the ones that are another kept row's own designation (see `buildExtract`).
  crossRefsOut.set(idOf(row.Name), new Set(crossRefs));

  const rec = {
    id: idOf(row.Name),
    name,
    type,
    raHours: round(hours(row.RA), 5),
    decDeg: round(degrees(row.Dec), 4),
  };
  if (maj !== undefined) rec.majorArcmin = round(maj, 2);
  if (min !== undefined) rec.minorArcmin = round(min, 2);
  const pa = num(row.PosAng);
  if (pa !== undefined) rec.positionAngleDeg = pa;
  if (mag !== undefined) rec.mag = round(mag, 2);
  const catalogSb = type === 'galaxy' ? num(row.SurfBr) : undefined;
  if (catalogSb !== undefined) {
    rec.surfaceBrightness = round(catalogSb, 2);
  } else if (mag !== undefined && maj !== undefined) {
    rec.surfaceBrightness = round(sbFrom(mag, maj, min ?? maj), 2);
    rec.sbComputed = true;
  }
  if (m !== undefined) rec.m = m;
  const own3 = /^NGC(\d+)$/.exec(row.Name);
  if (own3) rec.ngc = Number(own3[1]);
  const own2 = /^IC(\d+)$/.exec(row.Name);
  if (own2) rec.ic = Number(own2[1]);
  if (cNum !== undefined) rec.c = cNum;
  if (row.Const !== '') rec.constellation = row.Const;
  if (aliases.length > 0) rec.aliases = aliases;
  return rec;
}

/**
 * Filters and converts the two OpenNGC tables. Pure: no I/O.
 * Returns the extract objects and a report of what was dropped and what is missing.
 */
export function buildExtract(ngcCsv, addendumCsv) {
  const rows = [...parseCsv(ngcCsv), ...parseCsv(addendumCsv)];
  const objects = [];
  const droppedByType = {};
  const droppedNamed = []; // dropped by type although it has a common name, an M or a C number
  const dupRows = [];
  const crossRefsByRow = new Map();
  let droppedByCut = 0;

  for (const row of rows) {
    const isM = row.M !== '';
    const isC = /^C\d+$/.test(row.Name) || /(^|,)C \d+(,|$)/.test(row.Identifiers);
    const isNamed = row['Common names'] !== '';
    const forced = isM || isC || isNamed;
    let type = TYPE_MAP[row.Type];
    if (type === undefined && isM && row.Type in MESSIER_TYPE_OVERRIDE) {
      type = MESSIER_TYPE_OVERRIDE[row.Type];
    }
    if (row.Type === 'Dup') dupRows.push(row);
    if (type === undefined) {
      droppedByType[row.Type] = (droppedByType[row.Type] ?? 0) + 1;
      if (forced) droppedNamed.push(`${row.Name} (${row.Type}${isM ? `, M${Number(row.M)}` : ''})`);
      continue;
    }
    if (!forced) {
      const size = num(row.MajAx);
      const mag = num(row['V-Mag']) ?? num(row['B-Mag']);
      // Galaxies without a magnitude are faint LEDA entries; nebulae and clusters without one (IC 1396, the
      // Rosette, Mel 111) are often large and bright, so they stay.
      const magOk = mag === undefined ? !GALAXY_TYPES.includes(type) : mag <= MAG_LIMIT;
      if (size === undefined || size < SIZE_LIMIT_ARCMIN || !magOk) {
        droppedByCut += 1;
        continue;
      }
    }
    const rec = toRecord(row, type, crossRefsByRow);
    if (rec === null) {
      droppedByCut += 1;
      continue;
    }
    objects.push(rec);
  }

  objects.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // A cross-reference that is another kept row's own designation is upstream's mistake (NGC 7368 and NGC 7418 both
  // list IC 1459, which has its own row 34 arcmin and 3 degrees away): one designation, one object. Dropped, and listed.
  const ownLabels = new Set(objects.flatMap((o) => [
    ...(o.ngc === undefined ? [] : [`NGC ${o.ngc}`]),
    ...(o.ic === undefined ? [] : [`IC ${o.ic}`]),
    ...(o.m === undefined ? [] : [`M${o.m}`]),
  ]));
  const crossRefConflicts = [];
  for (const o of objects) {
    const refs = crossRefsByRow.get(o.id) ?? new Set();
    const bad = (o.aliases ?? []).filter((a) => refs.has(a) && ownLabels.has(a));
    if (bad.length === 0) continue;
    o.aliases = o.aliases.filter((a) => !bad.includes(a));
    if (o.aliases.length === 0) delete o.aliases;
    for (const a of bad) crossRefConflicts.push(`${labelOf(o.id.toUpperCase())} -> ${a}`);
  }

  // A Dup row is a second number of an object that has its own row; its NGC, IC or M column names that object.
  // The Dup's own number (and its M number, if any) becomes an alias of the object, so it can be searched.
  const byId = new Map(objects.map((o) => [o.id, o]));
  const byM = new Map(objects.filter((o) => o.m !== undefined).map((o) => [o.m, o]));
  const dupFolded = [];
  const dupUnresolved = [];
  for (const row of dupRows) {
    const refs = [
      ...refsOf(row.NGC, 'NGC').map((r) => byId.get(refId('NGC', r))),
      ...refsOf(row.IC, 'IC').map((r) => byId.get(refId('IC', r))),
      ...refsOf(row.M, 'M').map((r) => byM.get(r.num)),
    ];
    const primary = refs.find((p) => p !== undefined);
    if (primary === undefined) {
      dupUnresolved.push(labelOf(row.Name));
      continue;
    }
    const own = row.Name.startsWith('M') ? row.Name.replace(/^M0*/, 'M') : labelOf(row.Name);
    const have = new Set([primary.name, ...(primary.aliases ?? [])]);
    if (!have.has(own)) primary.aliases = [...(primary.aliases ?? []), own];
    dupFolded.push(own);
  }

  const missingMessier = [];
  for (let n = 1; n <= 110; n++) if (!objects.some((o) => o.m === n)) missingMessier.push(n);
  const missingCaldwell = [];
  for (let n = 1; n <= 109; n++) if (!objects.some((o) => o.c === n)) missingCaldwell.push(n);

  return {
    objects,
    report: {
      rowsRead: rows.length,
      droppedByType,
      droppedByTypeTotal: Object.values(droppedByType).reduce((a, b) => a + b, 0),
      droppedByCut,
      droppedNamed,
      dupFolded: dupFolded.length,
      dupUnresolved,
      crossRefConflicts,
      missingMessier,
      missingCaldwell,
    },
  };
}

async function readSources(srcDir) {
  if (srcDir !== undefined) {
    return {
      ngc: readFileSync(join(srcDir, 'NGC.csv'), 'utf8'),
      addendum: readFileSync(join(srcDir, 'addendum.csv'), 'utf8'),
    };
  }
  const get = async (f) => {
    const res = await fetch(`${RAW}/${f}`);
    if (!res.ok) throw new Error(`Fetching ${RAW}/${f} failed: HTTP ${res.status}`);
    return res.text();
  };
  return { ngc: await get('NGC.csv'), addendum: await get('addendum.csv') };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
  return v;
}

async function main() {
  const srcDir = argValue('--src');
  const out = resolve(argValue('--out') ?? DEFAULT_OUT);
  const { ngc, addendum } = await readSources(srcDir === undefined ? undefined : resolve(srcDir));
  const { objects, report } = buildExtract(ngc, addendum);

  const unexpectedMessier = report.missingMessier.filter((n) => !MESSIER_ABSENT.includes(n));
  if (!process.argv.includes('--partial') && (unexpectedMessier.length > 0 || report.missingCaldwell.length > 0)) {
    throw new Error(
      `Unresolved: Messier ${JSON.stringify(unexpectedMessier)}, Caldwell ${JSON.stringify(report.missingCaldwell)}`,
    );
  }

  const doc = {
    format: 1,
    source: {
      name: 'OpenNGC',
      author: 'Mattia Verga',
      tag: TAG,
      url: 'https://github.com/mattiaverga/OpenNGC',
      files: ['database_files/NGC.csv', 'database_files/addendum.csv'],
      inputSha256: {
        'NGC.csv': createHash('sha256').update(ngc).digest('hex'),
        'addendum.csv': createHash('sha256').update(addendum).digest('hex'),
      },
    },
    license: 'CC-BY-SA-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    modifications:
      'Filtered to real object types, mag <= 14 (or no magnitude, for non-galaxies) and size >= 1 arcmin plus every Messier, Caldwell and named object; fields renamed; duplicate (Dup) designations folded into the aliases of the object they duplicate; surface brightness computed from magnitude and size where the source has none (sbComputed).',
    acknowledgment:
      'Includes data from NED, HyperLEDA, SIMBAD (CDS) and HEASARC, as credited by OpenNGC.',
    count: objects.length,
    objects,
  };
  // One object per line keeps the diff between catalog versions readable.
  const text = `${JSON.stringify({ ...doc, objects: undefined }).slice(0, -1)},"objects":[\n${objects
    .map((o) => JSON.stringify(o))
    .join(',\n')}\n]}\n`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);

  const gz = gzipSync(text, { level: 9 }).length;
  console.log(
    JSON.stringify(
      {
        out,
        objects: objects.length,
        bytes: Buffer.byteLength(text),
        gzipBytes: gz,
        ...report,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
