import { PROFILE_VERSION, SITE_LIMITS, enterText } from '../profile';
import type { ProfileError } from '../profile';
import { LIST_SPECS } from './edit';
import type { ListKey } from './edit';

const KIND: Record<string, string> = {
  sites: 'site',
  scopes: 'scope',
  accessories: 'accessory',
  cameras: 'camera',
  smartScopes: 'smart scope',
  filters: 'filter',
  trains: 'train',
  plans: 'plan',
};

const FIELD: Record<string, string> = {
  blockedArcs: 'blocked zone',
  startAz: 'start direction',
  endAz: 'end direction',
  heightDeg: 'height',
  accessoryIds: 'accessory',
  scopeId: 'scope',
  cameraId: 'camera',
  filterId: 'filter',
  smartScopeId: 'smart scope',
  siteId: 'site',
  trainId: 'train',
  targetIds: 'target',
  id: 'id',
};

type Token = { key: string } | { n: number };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A name for a message: short, so one long stored name cannot fill the line. */
const nameText = (v: unknown, n: number): string => (typeof v === 'string' && v.trim() !== '' ? `"${v.length > 40 ? `${v.slice(0, 40)}…` : v}"` : `number ${n + 1}`);

function fieldWords(key: string, list: string | undefined): string {
  const label = list !== undefined && list in LIST_SPECS ? LIST_SPECS[list as ListKey].fields.find((f) => f.key === key)?.label : undefined;
  if (label !== undefined) return label.toLowerCase();
  return FIELD[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/**
 * Where a profile problem is, in words, from the validator's path and the text it read: "$.equipment.scopes[0].focalLengthMm" is
 * `scope "Edge HD 11", focal length`. A path the profile is not shaped for is "the profile" plus the field.
 */
export function profilePathInWords(path: string, raw: unknown): string {
  const tokens = [...path.matchAll(/\.([A-Za-z0-9_]+)|\[(\d+)\]/g)].map((m): Token => (m[1] !== undefined ? { key: m[1] } : { n: Number(m[2]) }));
  let at = 0;
  let node: unknown = raw;
  let list: string | undefined;
  const first = tokens[0];
  if (first && 'key' in first) {
    if (first.key === 'equipment') {
      const second = tokens[1];
      if (second && 'key' in second) {
        list = second.key;
        node = isRecord(raw) && isRecord(raw.equipment) ? raw.equipment[second.key] : undefined;
        at = 2;
      } else {
        return 'the equipment lists';
      }
    } else {
      list = first.key;
      node = isRecord(raw) ? raw[first.key] : undefined;
      at = 1;
    }
  }
  if (list === undefined) return 'the saved profile';
  const kind = KIND[list];
  if (kind === undefined) return `the saved profile, ${fieldWords(list, undefined)}`;
  const idx = tokens[at];
  if (!idx || !('n' in idx)) return `the ${kind} list`;
  const item = Array.isArray(node) ? node[idx.n] : undefined;
  const who = `${kind} ${nameText(isRecord(item) ? item.name : undefined, idx.n)}`;
  const rest: string[] = [];
  for (let i = at + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if ('key' in t) rest.push(fieldWords(t.key, list));
    else if (rest.length > 0) rest[rest.length - 1] += ` ${t.n + 1}`;
  }
  return rest.length === 0 ? who : `${who}, ${rest.join(', ')}`;
}

const capital = (s: string): string => `${s[0].toUpperCase()}${s.slice(1)}`;

/** A stored value as it is shown in a sentence: cut short, so one huge stored value cannot fill the line. */
function shownValue(json: string): string {
  return json.length > 24 ? `${json.slice(0, 24)}…` : json;
}

/** "it is missing", "it is empty", "it is "abc"": the value part of a validator message, which is JSON text. */
function itIs(got: string): string {
  if (got === 'undefined') return 'it is missing';
  if (got === 'null') return 'it is empty';
  return `it is ${shownValue(got)}`;
}

/** "a, b or c". */
const orList = (xs: string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** The path one step up: "$.sites[0].extra" is "$.sites[0]". */
const parentPath = (path: string): string => path.replace(/(\.[A-Za-z0-9_]+|\[\d+\])$/, '');
const lastKey = (path: string): string => /\.([A-Za-z0-9_]+)$/.exec(path)?.[1] ?? '';

const WHOLE_PROFILE = 'The saved profile is not in the planner\u2019s format: it should be an object with sites, equipment and trains.';

/**
 * A validator error as one plain sentence with no field path and none of the validator's own words. This is the one place a
 * ProfileError becomes text for a person (load, held notice, import, refusals): a message it has no sentence for still comes out
 * without `expected`, `got`, `allowed:` or a `$.` path.
 * `raw` is the parsed JSON the error is about, used to name the item ("Scope "Edge HD 11"").
 */
export function profileProblemText(e: ProfileError, raw: unknown): string {
  const { path } = e;
  const detail = e.message.slice(path.length + 2);
  const where = capital(profilePathInWords(path, raw));
  const m = (re: RegExp) => re.exec(detail);
  let hit: RegExpExecArray | null;

  if (path === '$' && /^not valid JSON/.test(detail)) return 'It is not valid JSON.';
  if (path === '$.version') {
    const got = m(/^expected \d+, got ([\s\S]*)$/)?.[1] ?? 'undefined';
    if (got === 'undefined') return 'It has no version number.';
    return `It is version ${shownValue(got)}; this planner reads version ${PROFILE_VERSION} (and upgrades versions 1 and 2).`;
  }
  if (path === '$' && detail === 'expected an object') return WHOLE_PROFILE;
  if (detail === 'expected an object') return `${where} is not in the planner\u2019s format: it should be a set of named fields.`;
  if (detail === 'expected an array') return `${where} should be a list.`;
  if ((hit = m(/^unknown field \(allowed: (.*?); notes start with _\)$/))) {
    const owner = capital(profilePathInWords(parentPath(path), raw));
    return `${owner} has a field the planner does not know: "${shownValue(lastKey(path))}". The fields it reads here are ${hit[1]}.`;
  }
  if (detail === 'expected a non-empty string') return `${where} is empty or is not text.`;
  if (detail === 'expected a string') return `${where} is not text.`;
  if ((hit = m(/^expected a number from (\S+) to (\S+), got ([\s\S]*)$/))) return `${where} should be a number from ${hit[1]} to ${hit[2]}; ${itIs(hit[3])}.`;
  if ((hit = m(/^expected a whole number from 1 to 9, got ([\s\S]*)$/))) return `${enterText(SITE_LIMITS.bortle)} ${capital(itIs(hit[1]))}.`;
  if ((hit = m(/^at most (\d+) blocked zones, got (\d+)$/))) return `${where}: the planner holds at most ${hit[1]} blocked zones; there are ${hit[2]}.`;
  if ((hit = m(/^arc must span at least (\S+) degrees.*\(start ([^,]+), end ([^;)]+)/))) return `${where}: the zone must span at least ${hit[1]} degrees, so its start and end must differ (start ${hit[2]}, end ${hit[3]}).`;
  if ((hit = m(/^arc must leave at least (\S+) degrees unblocked \(start ([^,]+), end ([^)]+)\)/))) return `${where}: the zone must leave at least ${hit[1]} degrees of horizon open (start ${hit[2]}, end ${hit[3]}). Shorten it, or remove the zone if nothing is blocked.`;
  if (detail === 'expected a list of zones (may be empty)') return `${where}: the list of blocked zones is missing (it may be empty).`;
  if ((hit = m(/^not a time zone name such as (\S+), got ([\s\S]*)$/))) return `${where}: ${shownValue(hit[2])} is not a time zone name. Use a name such as ${hit[1]}.`;
  if ((hit = m(/^expected true or false, got ([\s\S]*)$/))) return `${where} should be true or false; ${itIs(hit[1])}.`;
  if ((hit = m(/^expected a real date as YYYY-MM-DD, got ([\s\S]*)$/))) return `${where} is saved as ${shownValue(hit[1])}; use a real date written YYYY-MM-DD.`;
  if ((hit = m(/^expected (one of .+|".+"(?: or ".+")?), got ([\s\S]*)$/))) {
    const listed = hit[1].startsWith('one of ');
    const options = listed ? hit[1].slice(7).split(', ') : [...hit[1].matchAll(/"([^"]*)"/g)].map((x) => `"${x[1]}"`);
    const saved = hit[2] === 'undefined' ? 'is not set' : `is saved as ${shownValue(hit[2])}`;
    return `${where} ${saved}; use ${orList(options)}.`;
  }
  if ((hit = m(/^duplicate id "([\s\S]*)"$/))) {
    const owner = capital(profilePathInWords(parentPath(path), raw));
    const kind = KIND[/^\$\.(?:equipment\.)?([A-Za-z]+)/.exec(path)?.[1] ?? ''] ?? 'item';
    return `${owner} uses the id "${shownValue(hit[1])}", which another ${kind} already uses. Each id must be different.`;
  }
  if ((hit = m(/^unknown (scope|camera|filter|accessory|smart scope|site|train) "([\s\S]*)"$/))) return `${where}: no ${hit[1]} has the id "${shownValue(hit[2])}" in this profile.`;
  if (/\b(expected|got)\b|allowed:|\$\./.test(detail)) return `${where} is not valid.`;
  return `${where}: ${detail}`;
}
