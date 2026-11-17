#!/usr/bin/env node
// Backs up and restores the planner's shared spec library (the gear specs people corrected or confirmed).
//
//   node scripts/library-backup.mjs export [--file path]   KV -> src/planner/library/backup.json
//   node scripts/library-backup.mjs import [--file path]   backup.json -> KV (only entries the store does not have yet)
//
// Reads the KV address and token from the environment (KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN),
// e.g. after `vercel env pull ~/.cache/fourpeaks.env` and `set -a; . ~/.cache/fourpeaks.env; set +a`. Without them it stops: a memory store has nothing to back up.
// The planner is TypeScript, so the script compiles the modules it needs with the repo's own `tsc` into ~/.cache/fourpeaks-library (nothing is written to the repo
// except the backup file), then runs the real code from there.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(homedir(), '.cache', 'fourpeaks-library');
const [mode, ...rest] = process.argv.slice(2);
const fi = rest.indexOf('--file');
const FILE = fi === -1 ? join(ROOT, 'src', 'planner', 'library', 'backup.json') : resolve(rest[fi + 1] ?? '');

if (mode !== 'export' && mode !== 'import') {
  console.error('Usage: node scripts/library-backup.mjs export|import [--file path]');
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'commonjs', moduleResolution: 'node10', esModuleInterop: true, resolveJsonModule: true, lib: ['es2022', 'dom'],
      skipLibCheck: true, strict: true, outDir: join(OUT, 'js'), rootDir: join(ROOT, 'src'), typeRoots: [join(ROOT, 'node_modules', '@types')], types: ['node'],
    },
    files: ['backup.ts', 'store.ts'].map((f) => join(ROOT, 'src', 'planner', 'library', f)),
  }),
);
execFileSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(OUT, 'tsconfig.json')], { stdio: 'inherit' });

const require = createRequire(import.meta.url);
const lib = (m) => require(join(OUT, 'js', 'planner', m));
const { kvConfigFrom } = lib('ai/counter-store');
const { KvRestLibraryStore } = lib('library/store');
const { exportBackup, importBackup } = lib('library/backup');

const kv = kvConfigFrom(process.env);
if (!kv) {
  console.error('No KV address and token in the environment (KV_REST_API_URL and KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN). Nothing done.');
  process.exit(1);
}
const store = new KvRestLibraryStore(kv.url, kv.token);

try {
  if (mode === 'export') {
    const text = await exportBackup(store);
    writeFileSync(FILE, text);
    console.log(`Wrote ${JSON.parse(text).entries.length} entries to ${FILE}`);
  } else {
    const { written, kept } = await importBackup(store, readFileSync(FILE, 'utf8'));
    console.log(`Imported ${written} entries from ${FILE}; ${kept} already in the store were kept as they are.`);
  }
} catch (e) {
  console.error(`Failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
