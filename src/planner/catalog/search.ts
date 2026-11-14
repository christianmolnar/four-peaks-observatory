import { TARGET_TYPES, nameTokens, nameWords, normalizeName } from './index';
import type { CatalogTarget, NameWord, TargetType } from './index';
import type { CatalogObject } from './openngc';
import { applyPatches } from './supplement';
import type { CatalogPatches } from './supplement';

/**
 * One searchable target: a curated starter target (with its flags) or a bundled OpenNGC object.
 * A catalog object that matches a curated target by designation, or by name and place, is not listed; the curated
 * one stands for it. Targets are frozen: they are shared by every search, so a caller cannot change them.
 */
export interface SearchTarget {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly raHours: number;
  readonly decDeg: number;
  readonly type: TargetType;
  readonly sizeArcmin?: Readonly<{ major: number; minor: number }>;
  /** The label to show when it differs from the upstream name ("Wild Duck Cluster" for M11); `name` otherwise. */
  readonly displayName?: string;
  readonly positionAngleDeg?: number;
  readonly mag?: number;
  readonly surfaceBrightness?: number;
  readonly sbComputed?: true;
  readonly constellation?: string;
  /** Curated only. */
  readonly seasonMonths?: readonly number[];
  /** Curated only. */
  readonly brightCore?: boolean;
  /** True when this is one of the curated starter targets. */
  readonly curated: boolean;
}

export type MatchKind =
  | 'designation'
  | 'name-exact'
  | 'name-prefix'
  | 'word-prefix'
  | 'substring'
  | 'fuzzy'
  /** No text query: the entry passed the filters. */
  | 'filter';

export interface SearchHit {
  target: SearchTarget;
  match: MatchKind;
  /** Major axis over the frame FOV, in percent. Present when a frame is given and the target has a size. */
  percentOfFrame?: number;
}

export interface SearchFilters {
  types?: readonly TargetType[];
  /** Major axis range in arcminutes, inclusive. */
  sizeArcmin?: { min?: number; max?: number };
  /** Sensor field of view along the axis to compare with the major axis (arcmin) and a percent range, inclusive. */
  frame?: { fovArcmin: number; minPercent?: number; maxPercent?: number };
}

export interface SearchQuery extends SearchFilters {
  text?: string;
  /** At most this many hits; default 20. */
  limit?: number;
}

export interface SearchResult {
  text: string;
  hits: SearchHit[];
  /** Number of matches before the limit was applied. */
  total: number;
  /**
   * True when a text query matched nothing in the bundled catalog (filters ignored). This is the hook for a
   * later online lookup; the local search never calls out.
   */
  notFoundLocally: boolean;
}

const DEFAULT_LIMIT = 20;
// A catalog designation: letters, a number, at most two suffix letters ("ngc224", "ic1396", "m31", "ngc1487nw").
const DESIGNATION = /^[a-z]{1,4}\d+[a-z]{0,2}$/;
const NUMBER_ONLY = /^\d+$/;
/** Catalog designations a bare number can mean, in the order their hits rank: M, NGC, IC, Caldwell. */
const CATALOG_RANK: Record<string, number> = { m: 0, ngc: 1, ic: 2, c: 3 };

const TIER: Record<Exclude<MatchKind, 'filter'>, number> = {
  designation: 0,
  'name-exact': 1,
  'name-prefix': 2,
  'word-prefix': 3,
  substring: 4,
  fuzzy: 5,
};

interface NameKey {
  key: string;
  /** Offsets in `key` where each word after the first starts. */
  wordStarts: number[];
  words: string[];
}

interface Entry {
  target: SearchTarget;
  /** Normalized designation -> 0 when it is the object's own number, 1 when it is an alias. */
  designations: Map<string, 0 | 1>;
  names: NameKey[];
  /** 0 for a Messier object, else 1; Messier objects rank first among equal matches. */
  messier: 0 | 1;
}

function nameKey(label: string): NameKey {
  const words = nameWords(label);
  const wordStarts: number[] = [];
  let at = 0;
  words.forEach((w, i) => {
    if (i > 0) wordStarts.push(at);
    at += w.length;
  });
  return { key: words.join(''), wordStarts, words };
}

function addLabel(e: Entry, label: string, own: 0 | 1): void {
  const key = normalizeName(label);
  if (key === '') return;
  if (DESIGNATION.test(key)) {
    const prev = e.designations.get(key);
    if (prev === undefined || own < prev) e.designations.set(key, own);
  } else {
    e.names.push(nameKey(label));
  }
}

function fromCurated(t: CatalogTarget): Entry {
  const e: Entry = {
    target: {
      id: t.id,
      name: t.name,
      aliases: [...t.aliases],
      raHours: t.raHours,
      decDeg: t.decDeg,
      type: t.type,
      ...(t.sizeArcmin === undefined ? {} : { sizeArcmin: { ...t.sizeArcmin } }),
      seasonMonths: [...t.seasonMonths],
      ...(t.brightCore === undefined ? {} : { brightCore: t.brightCore }),
      curated: true,
    },
    designations: new Map(),
    names: [],
    messier: 1,
  };
  addLabel(e, t.id, 0);
  for (const label of [t.name, ...t.aliases]) addLabel(e, label, 0);
  e.messier = [...e.designations.keys()].some((k) => /^m\d+$/.test(k)) ? 0 : 1;
  return e;
}

/** The catalog numbers an object owns: "m31", "ngc224", "ic405", "c33". */
function numberDesignations(o: CatalogObject): string[] {
  return [
    ...(o.m === undefined ? [] : [`m${o.m}`]),
    ...(o.ngc === undefined ? [] : [`ngc${o.ngc}`]),
    ...(o.ic === undefined ? [] : [`ic${o.ic}`]),
    ...(o.c === undefined ? [] : [`c${o.c}`]),
  ];
}

/** Everything the object owns: its id and its catalog numbers. */
function ownDesignations(o: CatalogObject): string[] {
  return [normalizeName(o.id), ...numberDesignations(o)];
}

function fromObject(o: CatalogObject): Entry {
  const aliases = o.aliases ?? [];
  const shown = new Set([normalizeName(o.name)]);
  const labels = [...numberDesignations(o).map(designationLabel), ...aliases].filter((a) => {
    const k = normalizeName(a);
    return !shown.has(k) && shown.add(k);
  });
  const e: Entry = {
    target: {
      id: o.id,
      name: o.name,
      aliases: labels,
      raHours: o.raHours,
      decDeg: o.decDeg,
      type: o.type,
      ...(o.majorArcmin === undefined
        ? {}
        : { sizeArcmin: { major: o.majorArcmin, minor: o.minorArcmin ?? o.majorArcmin } }),
      ...(o.displayName === undefined ? {} : { displayName: o.displayName }),
      ...(o.positionAngleDeg === undefined ? {} : { positionAngleDeg: o.positionAngleDeg }),
      ...(o.mag === undefined ? {} : { mag: o.mag }),
      ...(o.surfaceBrightness === undefined ? {} : { surfaceBrightness: o.surfaceBrightness }),
      ...(o.sbComputed === undefined ? {} : { sbComputed: true as const }),
      ...(o.constellation === undefined ? {} : { constellation: o.constellation }),
      curated: false,
    },
    designations: new Map(),
    names: [],
    messier: o.m === undefined ? 1 : 0,
  };
  for (const k of ownDesignations(o)) e.designations.set(k, 0);
  addLabel(e, o.name, 0);
  for (const a of aliases) addLabel(e, a, 1);
  return e;
}

/** "ngc224" -> "NGC 224", "m31" -> "M31", "c33" -> "C 33". For display in `aliases` only. */
function designationLabel(key: string): string {
  const m = /^([a-z]+)(\d+[a-z]?)$/.exec(key);
  if (!m) return key;
  return m[1] === 'm' ? `M${m[2]}` : `${m[1].toUpperCase()} ${m[2]}`;
}

/**
 * A curated target stands for the catalog object it matches: it also answers to that object's numbers and
 * names ("C 20" finds the curated North America Nebula). The curated fields themselves are not touched.
 */
function absorb(curated: Entry, object: Entry): void {
  for (const [k, own] of object.designations) if (!curated.designations.has(k)) curated.designations.set(k, own);
  curated.names.push(...object.names);
  if (object.target.aliases.length > 0) {
    const have = new Set([curated.target.name, ...curated.target.aliases].map(normalizeName));
    const extra = [object.target.name, ...object.target.aliases].filter((a) => !have.has(normalizeName(a)));
    curated.target = { ...curated.target, aliases: [...curated.target.aliases, ...extra] };
  }
  if (object.messier === 0) curated.messier = 0;
}

const DEG = Math.PI / 180;

/** Angular separation of two targets, in arcminutes. */
function separationArcmin(a: SearchTarget, b: SearchTarget): number {
  const d1 = a.decDeg * DEG;
  const d2 = b.decDeg * DEG;
  const dra = (a.raHours - b.raHours) * 15 * DEG;
  const h = Math.sin((d2 - d1) / 2) ** 2 + Math.cos(d1) * Math.cos(d2) * Math.sin(dra / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h))) / DEG) * 60;
}

/** Objects closer than this to a curated target's center, whatever their size, can be the same thing. */
const MIN_FOOTPRINT_ARCMIN = 5;

/**
 * The same object under another number: it shares a common name with the curated target and lies inside the
 * larger of the two footprints (the Rosette Nebula is NGC 2237 in the curated list and NGC 2238 upstream).
 */
function sameThing(curated: Entry, object: Entry): boolean {
  const have = new Set(curated.names.map((n) => n.key));
  if (!object.names.some((n) => have.has(n.key))) return false;
  const radius = Math.max(
    MIN_FOOTPRINT_ARCMIN,
    (curated.target.sizeArcmin?.major ?? 0) / 2,
    (object.target.sizeArcmin?.major ?? 0) / 2,
  );
  return separationArcmin(curated.target, object.target) <= radius;
}

function deepFreeze<T extends object>(o: T): T {
  for (const v of Object.values(o)) if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) deepFreeze(v);
  return Object.freeze(o);
}

/** Levenshtein distance, or max + 1 as soon as it is certain to exceed max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function maxEdits(len: number): number {
  if (len < 4) return 0;
  return len <= 6 ? 1 : 2;
}

interface Match {
  kind: Exclude<MatchKind, 'filter'>;
  /** 0 for the object's own designation, 1 for an alias; 0 elsewhere. */
  sub: number;
  dist: number;
}

/**
 * Where a query with a Greek letter in it starts in a name, as a word index, or null. "omega", "theta" and "delta"
 * are the abbreviations ome, tet and del, which sit inside other words (andROMEda, sexTET, amas DE Lecu), so every
 * word of the query must be a whole word of the name; only the last one, if it is not a Greek letter, may be half typed.
 */
function greekWordMatch(words: readonly string[], q: readonly NameWord[]): number | null {
  for (let at = 0; at + q.length <= words.length; at++) {
    const ok = q.every((t, i) => (i === q.length - 1 && !t.greek ? words[at + i].startsWith(t.word) : words[at + i] === t.word));
    if (ok) return at;
  }
  return null;
}

/**
 * How a query matches an entry, or null.
 * - A designation-shaped query ("ngc651", "c14") is complete: it matches only that designation (or a name that is
 *   exactly that). There is no prefix match, so "NGC 651" never turns into "NGC 6514".
 * - A query with a Greek letter in it ("omega", "ω Cen", "theta") matches whole words only: no substring and no
 *   word-prefix inside a longer word.
 * - A number alone ("7000", "42") means that number in any catalog: M42, NGC 42, IC 42, C 42, ranked in that
 *   order; a name that starts with the digits ("47 Tucanae") also matches. It never matches inside a name.
 */
function exactMatch(e: Entry, q: string, greek: NameWord[] | null): Match | null {
  const own = e.designations.get(q);
  if (own !== undefined) return { kind: 'designation', sub: own, dist: 0 };
  if (NUMBER_ONLY.test(q)) {
    const wanted = Number(q);
    let hit: Match | null = null;
    for (const [k, sub] of e.designations) {
      const m = /^(m|ngc|ic|c)(\d+)$/.exec(k);
      if (m === null || Number(m[2]) !== wanted) continue;
      const cand: Match = { kind: 'designation', sub, dist: CATALOG_RANK[m[1]] };
      if (hit === null || cand.sub < hit.sub || (cand.sub === hit.sub && cand.dist < hit.dist)) hit = cand;
    }
    if (hit !== null) return hit;
    return e.names.some((n) => n.key.startsWith(q)) ? { kind: 'name-prefix', sub: 0, dist: 0 } : null;
  }
  const complete = DESIGNATION.test(q);
  let best: Match | null = null;
  const take = (kind: Match['kind']): void => {
    if (best === null || TIER[kind] < TIER[best.kind]) best = { kind, sub: 0, dist: 0 };
  };
  for (const n of e.names) {
    if (n.key === q) take('name-exact');
    else if (complete) continue;
    else if (greek !== null) {
      const at = greekWordMatch(n.words, greek);
      if (at !== null) take(at === 0 ? 'name-prefix' : 'word-prefix');
    }
    else if (n.key.startsWith(q)) take('name-prefix');
    else if (n.wordStarts.some((s) => n.key.startsWith(q, s))) take('word-prefix');
    else if (n.key.includes(q)) take('substring');
  }
  return best;
}

function fuzzyMatch(e: Entry, q: string): Match | null {
  const max = maxEdits(q.length);
  if (max === 0 || /\d/.test(q)) return null;
  let best = max + 1;
  for (const n of e.names) {
    for (const start of [0, ...n.wordStarts]) {
      const rest = n.key.slice(start);
      // Whole word(s), and the same length as the query, so a half-typed name still matches.
      best = Math.min(best, editDistance(q, rest, max), editDistance(q, rest.slice(0, q.length), max));
    }
  }
  return best <= max ? { kind: 'fuzzy', sub: 0, dist: best } : null;
}

const magOf = (t: SearchTarget): number => t.mag ?? 99;

function compareEntries(a: { e: Entry; m: Match | null }, b: { e: Entry; m: Match | null }): number {
  const ta = a.m === null ? 0 : TIER[a.m.kind];
  const tb = b.m === null ? 0 : TIER[b.m.kind];
  return (
    ta - tb ||
    (a.m?.sub ?? 0) - (b.m?.sub ?? 0) ||
    (a.m?.dist ?? 0) - (b.m?.dist ?? 0) ||
    a.e.messier - b.e.messier ||
    Number(b.e.target.curated) - Number(a.e.target.curated) ||
    magOf(a.e.target) - magOf(b.e.target) ||
    (a.e.target.id < b.e.target.id ? -1 : a.e.target.id > b.e.target.id ? 1 : 0)
  );
}

function passes(t: SearchTarget, f: SearchFilters): { ok: boolean; percent?: number } {
  if (f.types !== undefined && !f.types.includes(t.type)) return { ok: false };
  const major = t.sizeArcmin?.major;
  const size = f.sizeArcmin;
  if (size !== undefined && (size.min !== undefined || size.max !== undefined)) {
    if (major === undefined) return { ok: false };
    if (size.min !== undefined && major < size.min) return { ok: false };
    if (size.max !== undefined && major > size.max) return { ok: false };
  }
  const frame = f.frame;
  if (frame === undefined) return { ok: true };
  if (major === undefined) return frame.minPercent === undefined && frame.maxPercent === undefined ? { ok: true } : { ok: false };
  const percent = (major / frame.fovArcmin) * 100;
  if (frame.minPercent !== undefined && percent < frame.minPercent) return { ok: false };
  if (frame.maxPercent !== undefined && percent > frame.maxPercent) return { ok: false };
  return { ok: true, percent };
}

function checkFinite(name: string, v: unknown): void {
  if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v))) throw new Error(`${name} must be a finite number, got ${String(v)}`);
}

/** Throws on a filter value that would silently match everything or nothing (NaN, Infinity, an unknown type). */
function checkQuery(q: SearchQuery): void {
  if (q.limit !== undefined && !(Number.isInteger(q.limit) && q.limit > 0)) throw new Error(`limit must be a positive integer, got ${q.limit}`);
  if (q.types !== undefined) {
    if (!Array.isArray(q.types)) throw new Error('types must be an array of target types');
    for (const t of q.types) if (!TARGET_TYPES.includes(t)) throw new Error(`types holds an unknown target type: ${String(t)}`);
  }
  if (q.sizeArcmin !== undefined) {
    checkFinite('sizeArcmin.min', q.sizeArcmin.min);
    checkFinite('sizeArcmin.max', q.sizeArcmin.max);
  }
  if (q.frame !== undefined) {
    checkFinite('frame.fovArcmin', q.frame.fovArcmin);
    if (!(q.frame.fovArcmin > 0)) throw new Error(`frame.fovArcmin must be positive, got ${q.frame.fovArcmin}`);
    checkFinite('frame.minPercent', q.frame.minPercent);
    checkFinite('frame.maxPercent', q.frame.maxPercent);
  }
}

export interface CatalogIndex {
  /** Number of distinct targets (curated plus catalog objects not claimed by a curated one). */
  readonly size: number;
  /** Every distinct target, curated first then catalog order; frozen, shared with every search. */
  readonly targets: readonly SearchTarget[];
  search(query: SearchQuery): SearchResult;
}

/**
 * Builds the search index once. A catalog object is dropped in favor of a curated target when its own designation
 * (id, M, NGC, IC, C number) is also a designation of the curated target, or when it shares a common name with it
 * and lies inside its footprint. `patches` (the name supplement and overrides) are applied to the objects first.
 */
export function createCatalogIndex(
  objects: readonly CatalogObject[],
  curated: readonly CatalogTarget[],
  patches?: CatalogPatches,
): CatalogIndex {
  const patched = patches === undefined ? objects : applyPatches(objects, patches);
  const curatedEntries = curated.map(fromCurated);
  const claimedBy = new Map<string, Entry>();
  for (const e of curatedEntries) for (const k of e.designations.keys()) if (!claimedBy.has(k)) claimedBy.set(k, e);
  const rest: Entry[] = [];
  for (const o of patched) {
    const entry = fromObject(o);
    const owner =
      ownDesignations(o).map((k) => claimedBy.get(k)).find((e) => e !== undefined) ??
      curatedEntries.find((c) => sameThing(c, entry));
    if (owner === undefined) rest.push(entry);
    else absorb(owner, entry);
  }
  const entries: Entry[] = [...curatedEntries, ...rest];
  // The letters of every catalog designation ("ngc", "ic", "m", "mel"): typed alone they are the start of a number, not a name.
  const catalogPrefixes = new Set<string>();
  for (const e of entries) for (const k of e.designations.keys()) {
    const prefix = /^([a-z]+)\d/.exec(k);
    if (prefix !== null) catalogPrefixes.add(prefix[1]);
  }
  for (const e of entries) deepFreeze(e.target);
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.target.id)) throw new Error(`Catalog index: duplicate id ${e.target.id}`);
    ids.add(e.target.id);
  }

  return {
    size: entries.length,
    targets: entries.map((e) => e.target),
    search(query: SearchQuery): SearchResult {
      checkQuery(query);
      const limit = query.limit ?? DEFAULT_LIMIT;
      const text = (query.text ?? '').trim();
      const q = normalizeName(text);
      // Something was typed but nothing searchable is left of it ("🔭", ".*"): a miss, not an empty box.
      if (text !== '' && q === '') return { text, hits: [], total: 0, notFoundLocally: true };
      // "NGC" alone is a catalog waiting for its number: no hits, and not a miss for an online lookup either.
      if (catalogPrefixes.has(q)) return { text, hits: [], total: 0, notFoundLocally: false };
      const filtered = (list: { e: Entry; m: Match | null }[]): SearchHit[] =>
        list
          .map(({ e, m }) => ({ e, m, f: passes(e.target, query) }))
          .filter((x) => x.f.ok)
          .map(({ e, m, f }) => ({
            target: e.target,
            match: m?.kind ?? ('filter' as const),
            ...(f.percent === undefined ? {} : { percentOfFrame: f.percent }),
          }));

      if (q === '') {
        const hasFilter = query.types !== undefined || query.sizeArcmin !== undefined || query.frame !== undefined;
        if (!hasFilter) return { text, hits: [], total: 0, notFoundLocally: false };
        const all = filtered(entries.map((e) => ({ e, m: null })).sort(compareEntries));
        return { text, hits: all.slice(0, limit), total: all.length, notFoundLocally: false };
      }

      const tokens = nameTokens(text);
      const greek = tokens.some((t) => t.greek) && !DESIGNATION.test(q) ? tokens : null;
      let matched = entries.flatMap((e) => {
        const m = exactMatch(e, q, greek);
        return m === null ? [] : [{ e, m }];
      });
      let found = matched.sort(compareEntries);
      let hits = filtered(found);
      if (hits.length < limit) {
        const seen = new Set(found.map((x) => x.e));
        const fuzzy = entries.flatMap((e) => {
          if (seen.has(e)) return [];
          const m = fuzzyMatch(e, q);
          return m === null ? [] : [{ e, m }];
        });
        matched = [...found, ...fuzzy];
        found = matched.sort(compareEntries);
        hits = filtered(found);
      }
      return { text, hits: hits.slice(0, limit), total: hits.length, notFoundLocally: found.length === 0 };
    },
  };
}
