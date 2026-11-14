#!/usr/bin/env node
// Times "tonight's best 100" over the whole bundled catalog, in node.
//
//   node scripts/bench-tonight.mjs [--runs 20] [--budget-ms 150]
//
// The planner is TypeScript, so the script first compiles the modules it needs with the repo's own `tsc` into
// ~/.cache/fourpeaks-bench (nothing is written to the repo), then runs the real `rankTargets` from there.
// Reports, per site: cold first run, then median and p95 over the timed runs. Exits 1 when a median is over budget.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(homedir(), '.cache', 'fourpeaks-bench');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const RUNS = flag('--runs', 20);
const BUDGET_MS = flag('--budget-ms', 150);

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, resolveJsonModule: true,
      skipLibCheck: true, strict: true, outDir: join(OUT, 'js'), rootDir: join(ROOT, 'src'), typeRoots: [join(ROOT, 'node_modules', '@types')], types: [],
    },
    files: ['plan/rank.ts', 'catalog/openngc.ts', 'catalog/search.ts', 'catalog/supplement.ts', 'optics/index.ts'].map((f) => join(ROOT, 'src', 'planner', f)),
  }),
);
execFileSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(OUT, 'tsconfig.json')], { stdio: 'inherit' });

const require = createRequire(import.meta.url);
process.env.NODE_PATH = join(ROOT, 'node_modules');
require('node:module').Module._initPaths();
const planner = (m) => require(join(OUT, 'js', 'planner', m));
const { rankTargets } = planner('plan/rank');
const { parseExtract } = planner('catalog/openngc');
const { createCatalogIndex } = planner('catalog/search');
const { catalogPatches } = planner('catalog/supplement');
const { starterTargets } = planner('catalog/index');
const { opticalTrain } = planner('optics/index');

const extract = parseExtract(JSON.parse(readFileSync(join(ROOT, 'public', 'catalog', 'openngc-v20260501-r3.json'), 'utf8')));
const index = createCatalogIndex(extract.objects, starterTargets, catalogPatches);
const targets = index.targets;

// A 36-point horizon, so the horizon cost is in the numbers; a mid-size refractor and camera: about 2 x 1.3 degrees.
const horizon = Array.from({ length: 36 }, (_, i) => ({ az: i * 10, alt: 8 + ((i * 7) % 6) }));
const train = {
  kind: 'optical',
  name: 'bench',
  optics: opticalTrain({ focalLengthMm: 540, apertureMm: 80 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
const longTrain = {
  kind: 'optical',
  name: 'bench 2000',
  optics: opticalTrain({ focalLengthMm: 2000, apertureMm: 200 }, { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 }),
};
const smartTrain = { kind: 'smart', name: 'bench smart', optics: null };
const sites = [
  { label: '33.5 N', site: { latitude: 33.5, longitude: -112.0, elevationM: 400 }, timeZone: 'America/Phoenix' },
  { label: '60 N', site: { latitude: 60, longitude: 10.0, elevationM: 100 }, timeZone: 'Europe/Oslo' },
  { label: '40 S', site: { latitude: -40, longitude: 175.0, elevationM: 50 }, timeZone: 'Pacific/Auckland' },
];

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
let over = false;
console.log(`catalog: ${targets.length} targets, ${RUNS} timed runs per site, budget ${BUDGET_MS} ms`);
// The default size screen drops most small objects for a wide field; with it off the whole sky is scored (the worst case).
const variants = [
  { name: '540 mm, default size band', extra: {} },
  { name: '540 mm, no size screen', extra: { minFramePercent: 0, includeTooLarge: true } },
  { name: '2000 mm, default size band', extra: { train: longTrain } },
  { name: 'smart scope (no size screen exists)', extra: { train: smartTrain } },
];
for (const { label, site, timeZone, variant } of sites.flatMap((x) => variants.map((v) => ({ ...x, variant: v })))) {
  const input = { site, timeZone, horizon, minAltitude: 30, date: '2026-11-14', train, targets, limit: 100, ...variant.extra };
  let t = performance.now();
  const first = rankTargets(input);
  const cold = performance.now() - t;
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    t = performance.now();
    rankTargets(input);
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  const median = (times[Math.floor((RUNS - 1) / 2)] + times[Math.floor(RUNS / 2)]) / 2;
  const p95 = percentile(times, 0.95);
  if (median > BUDGET_MS) over = true;
  console.log(
    `${label}, ${variant.name}: cold ${cold.toFixed(1)} ms, median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms; ` +
      `${first.counts.scored} scored of ${first.counts.input}, ${first.counts.usable} usable, ${first.entries.length} returned`,
  );
}
if (over) {
  console.error(`median over the ${BUDGET_MS} ms budget`);
  process.exit(1);
}
