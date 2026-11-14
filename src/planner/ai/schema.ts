import { ISO_PATTERN, ISO_RE } from './instant';

/** One imaging slot. Times are ISO local instants with the UTC offset ("2026-10-31T01:30-06:00"), as in the facts. */
export interface PlanSlot {
  id: string;
  start: string;
  end: string;
  /** Optional: the minutes the model plans to expose in this slot. At most the slot length, minus the flip time when the slot spans the transit. */
  exposureMinutes?: number;
}

export interface ExposureEntry {
  id: string;
  /** Optimal one-night integration, minutes. */
  minutes: number;
  /** Sub-exposure length, seconds. */
  subSeconds: number;
}

export const USEFULNESS = ['useful', 'marginal', 'not_useful'] as const;
export type Usefulness = (typeof USEFULNESS)[number];

/** The verdict on the last slot of the night: whatever observable time is left, and whether it is worth shooting. */
export interface LastTargetVerdict {
  /** The target of the last plan slot. */
  id: string;
  /** Length of that slot in minutes (all the observable time left for it). */
  leftoverMinutes: number;
  subSeconds: number;
  /** About leftoverMinutes x 60 / subSeconds, never more. */
  frames: number;
  usefulness: Usefulness;
  /** One line. */
  reason: string;
}

/** The model's answer for one night. */
export interface ModelPlan {
  exposures: ExposureEntry[];
  /** In time order. */
  plan: PlanSlot[];
  /** Targets that do not fit tonight, any order. */
  cut: string[];
  fitsAll: boolean;
  /** Required when `plan` is not empty. */
  lastTarget?: LastTargetVerdict;
  notes?: string;
}

/** Quality-review verdict. */
export interface QualityVerdict {
  good: boolean;
  verdict: string;
  /** Present when `good` is false: the one problem. */
  issue?: string;
  fix?: string;
}

/** JSON schema of `ModelPlan`; the prompt carries this text and `parsePlanReply` enforces it. */
export const PLAN_JSON_SCHEMA = {
  type: 'object',
  required: ['exposures', 'plan', 'cut', 'fitsAll'],
  additionalProperties: false,
  properties: {
    exposures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'minutes', 'subSeconds'],
        additionalProperties: false,
        properties: { id: { type: 'string' }, minutes: { type: 'number', exclusiveMinimum: 0 }, subSeconds: { type: 'number', exclusiveMinimum: 0 } },
      },
    },
    plan: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'start', 'end'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          start: { type: 'string', pattern: ISO_PATTERN },
          end: { type: 'string', pattern: ISO_PATTERN },
          exposureMinutes: { type: 'number', exclusiveMinimum: 0 },
        },
      },
    },
    cut: { type: 'array', items: { type: 'string' } },
    fitsAll: { type: 'boolean' },
    lastTarget: {
      type: 'object',
      required: ['id', 'leftoverMinutes', 'subSeconds', 'frames', 'usefulness', 'reason'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        leftoverMinutes: { type: 'number', minimum: 0 },
        subSeconds: { type: 'number', exclusiveMinimum: 0 },
        frames: { type: 'integer', minimum: 0 },
        usefulness: { enum: [...USEFULNESS] },
        reason: { type: 'string' },
      },
    },
    notes: { type: 'string' },
  },
} as const;

export const QUALITY_JSON_SCHEMA = {
  type: 'object',
  required: ['good', 'verdict'],
  additionalProperties: false,
  properties: { good: { type: 'boolean' }, verdict: { type: 'string' }, issue: { type: 'string' }, fix: { type: 'string' } },
} as const;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Strict JSON: one optional ``` fence around it is tolerated, nothing else. */
export function parseJsonReply(text: string): Parsed<unknown> {
  let t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  if (fence) t = fence[1];
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message})` };
  }
}

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const good = <T,>(value: T): { ok: true; value: T } => ({ ok: true, value });

/** Each item is parsed to a result of its own, so a valid item may itself be a string (a cut id). */
function listOf<T>(v: unknown, what: string, item: (x: unknown, i: number) => Parsed<T>): Parsed<T[]> {
  if (!Array.isArray(v)) return fail(`${what} must be an array`);
  const out: T[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = item(v[i], i);
    if (!r.ok) return fail(`${what}[${i}]: ${r.error}`);
    out.push(r.value);
  }
  return good(out);
}

function parseVerdict(x: unknown): LastTargetVerdict | string {
  if (!isObj(x) || !isStr(x.id)) return 'needs a string id';
  const n = (k: string, ok: (v: number) => boolean, what: string): string | null => (typeof x[k] === 'number' && Number.isFinite(x[k]) && ok(x[k] as number) ? null : `${k} must be ${what}`);
  const bad = n('leftoverMinutes', (v) => v >= 0, 'a number, 0 or more') ?? n('subSeconds', (v) => v > 0, 'a positive number') ?? n('frames', (v) => Number.isInteger(v) && v >= 0, 'a whole number, 0 or more');
  if (bad) return bad;
  if (typeof x.usefulness !== 'string' || !(USEFULNESS as readonly string[]).includes(x.usefulness)) return `usefulness must be one of ${USEFULNESS.join(', ')}`;
  if (!isStr(x.reason)) return 'reason must be a non-empty string';
  return { id: x.id, leftoverMinutes: x.leftoverMinutes as number, subSeconds: x.subSeconds as number, frames: x.frames as number, usefulness: x.usefulness as Usefulness, reason: x.reason };
}

/** Parses and validates a plan reply. Unknown keys are dropped; anything missing or mistyped is an error naming the field. */
export function parsePlanReply(text: string): Parsed<ModelPlan> {
  const j = parseJsonReply(text);
  if (!j.ok) return j;
  const o = j.value;
  if (!isObj(o)) return { ok: false, error: 'the reply must be one JSON object' };

  const exposures = listOf<ExposureEntry>(o.exposures, 'exposures', (x) => {
    if (!isObj(x) || !isStr(x.id)) return fail('needs a string id');
    if (typeof x.minutes !== 'number' || !Number.isFinite(x.minutes) || x.minutes <= 0) return fail('minutes must be a positive number');
    if (typeof x.subSeconds !== 'number' || !Number.isFinite(x.subSeconds) || x.subSeconds <= 0) return fail('subSeconds must be a positive number');
    return good({ id: x.id, minutes: x.minutes, subSeconds: x.subSeconds });
  });
  if (!exposures.ok) return exposures;
  const plan = listOf<PlanSlot>(o.plan, 'plan', (x) => {
    if (!isObj(x) || !isStr(x.id)) return fail('needs a string id');
    if (typeof x.start !== 'string' || !ISO_RE.test(x.start)) return fail('start must be a local ISO time with offset, like 2026-10-31T01:30-06:00');
    if (typeof x.end !== 'string' || !ISO_RE.test(x.end)) return fail('end must be a local ISO time with offset, like 2026-10-31T01:30-06:00');
    if (x.exposureMinutes !== undefined && (typeof x.exposureMinutes !== 'number' || !Number.isFinite(x.exposureMinutes) || x.exposureMinutes <= 0)) return fail('exposureMinutes must be a positive number');
    return good({ id: x.id, start: x.start, end: x.end, ...(x.exposureMinutes !== undefined ? { exposureMinutes: x.exposureMinutes as number } : {}) });
  });
  if (!plan.ok) return plan;
  const cut = listOf<string>(o.cut, 'cut', (x) => (isStr(x) ? good(x) : fail('must be a target id string')));
  if (!cut.ok) return cut;
  if (typeof o.fitsAll !== 'boolean') return { ok: false, error: 'fitsAll must be true or false' };
  if (o.notes !== undefined && typeof o.notes !== 'string') return { ok: false, error: 'notes must be a string' };
  const value: ModelPlan = { exposures: exposures.value, plan: plan.value, cut: cut.value, fitsAll: o.fitsAll };
  if (o.lastTarget !== undefined) {
    const v = parseVerdict(o.lastTarget);
    if (typeof v === 'string') return { ok: false, error: `lastTarget: ${v}` };
    value.lastTarget = v;
  }
  if (o.notes !== undefined) value.notes = o.notes;
  return { ok: true, value };
}

export function parseQualityReply(text: string): Parsed<QualityVerdict> {
  const j = parseJsonReply(text);
  if (!j.ok) return j;
  const o = j.value;
  if (!isObj(o)) return { ok: false, error: 'the reply must be one JSON object' };
  if (typeof o.good !== 'boolean') return { ok: false, error: 'good must be true or false' };
  if (typeof o.verdict !== 'string') return { ok: false, error: 'verdict must be a string' };
  for (const k of ['issue', 'fix'] as const) if (o[k] !== undefined && typeof o[k] !== 'string') return { ok: false, error: `${k} must be a string` };
  const v: QualityVerdict = { good: o.good, verdict: o.verdict };
  if (typeof o.issue === 'string') v.issue = o.issue;
  if (typeof o.fix === 'string') v.fix = o.fix;
  return { ok: true, value: v };
}
