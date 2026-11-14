import { normalizeName } from './index';
import type { CatalogTarget, TargetType } from './index';
import type { CatalogObject } from './openngc';

/**
 * One searchable target: a curated starter target (with its flags) or a bundled OpenNGC object.
 * A catalog object that matches a curated target by designation is not listed; the curated one stands for it.
 */
export interface SearchTarget {
  id: string;
  name: string;
  aliases: string[];
  raHours: number;
  decDeg: number;
  type: TargetType;
  sizeArcmin?: { major: number; minor: number };
  positionAngleDeg?: number;
  mag?: number;
  surfaceBrightness?: number;
  sbComputed?: true;
  constellation?: string;
  /** Curated only. */
  seasonMonths?: number[];
  /** Curated only. */
  brightCore?: boolean;
  /** True when this is one of the curated starter targets. */
  curated: boolean;
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
const DESIGNATION = /^[a-z]{1,4}\d+[a-z]?$/;

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
  const words = label
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const wordStarts: number[] = [];
  let at = 0;
  words.forEach((w, i) => {
    if (i > 0) wordStarts.push(at);
    at += w.length;
  });
  return { key: words.join(''), wordStarts };
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
      aliases: t.aliases,
      raHours: t.raHours,
      decDeg: t.decDeg,
      type: t.type,
      ...(t.sizeArcmin === undefined ? {} : { sizeArcmin: t.sizeArcmin }),
      seasonMonths: t.seasonMonths,
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
  const e: Entry = {
    target: {
      id: o.id,
      name: o.name,
      aliases: [...numberDesignations(o).filter((k) => k !== normalizeName(o.name)).map(designationLabel), ...aliases],
      raHours: o.raHours,
      decDeg: o.decDeg,
      type: o.type,
      ...(o.majorArcmin === undefined
        ? {}
        : { sizeArcmin: { major: o.majorArcmin, minor: o.minorArcmin ?? o.majorArcmin } }),
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

function exactMatch(e: Entry, q: string): Match | null {
  const own = e.designations.get(q);
  if (own !== undefined) return { kind: 'designation', sub: own, dist: 0 };
  let best: Match | null = null;
  const take = (kind: Match['kind']): void => {
    if (best === null || TIER[kind] < TIER[best.kind]) best = { kind, sub: 0, dist: 0 };
  };
  for (const n of e.names) {
    if (n.key === q) take('name-exact');
    else if (n.key.startsWith(q)) take('name-prefix');
    // A designation-shaped query ("c14") only matches names from the front, never inside "NGC 1487 NED02".
    else if (DESIGNATION.test(q)) continue;
    else if (n.wordStarts.some((s) => n.key.startsWith(q, s))) take('word-prefix');
    else if (n.key.includes(q)) take('substring');
  }
  if (best === null && q.length >= 2 && /\d/.test(q)) {
    for (const k of e.designations.keys()) if (k.startsWith(q)) return { kind: 'name-prefix', sub: 1, dist: 0 };
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

function checkQuery(q: SearchQuery): void {
  if (q.limit !== undefined && !(Number.isInteger(q.limit) && q.limit > 0)) throw new Error(`limit must be a positive integer, got ${q.limit}`);
  if (q.frame !== undefined && !(q.frame.fovArcmin > 0)) throw new Error(`frame.fovArcmin must be positive, got ${q.frame.fovArcmin}`);
}

export interface CatalogIndex {
  /** Number of distinct targets (curated plus catalog objects not claimed by a curated one). */
  readonly size: number;
  search(query: SearchQuery): SearchResult;
}

/**
 * Builds the search index once. A catalog object whose own designation (id, M, NGC, IC, C number) is also a
 * designation of a curated target is dropped in favor of the curated one.
 */
export function createCatalogIndex(
  objects: readonly CatalogObject[],
  curated: readonly CatalogTarget[],
): CatalogIndex {
  const curatedEntries = curated.map(fromCurated);
  const claimedBy = new Map<string, Entry>();
  for (const e of curatedEntries) for (const k of e.designations.keys()) if (!claimedBy.has(k)) claimedBy.set(k, e);
  const rest: Entry[] = [];
  for (const o of objects) {
    const owner = ownDesignations(o).map((k) => claimedBy.get(k)).find((e) => e !== undefined);
    if (owner === undefined) rest.push(fromObject(o));
    else absorb(owner, fromObject(o));
  }
  const entries: Entry[] = [...curatedEntries, ...rest];
  const ids = new Set<string>();
  for (const e of entries) {
    if (ids.has(e.target.id)) throw new Error(`Catalog index: duplicate id ${e.target.id}`);
    ids.add(e.target.id);
  }

  return {
    size: entries.length,
    search(query: SearchQuery): SearchResult {
      checkQuery(query);
      const limit = query.limit ?? DEFAULT_LIMIT;
      const text = (query.text ?? '').trim();
      const q = normalizeName(text);
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

      let matched = entries.flatMap((e) => {
        const m = exactMatch(e, q);
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
