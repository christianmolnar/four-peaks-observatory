import { CLOCK_RE } from '../itinerary/timeline';

/** One imaging slot. Times are local 24 h "HH:MM" in the facts' time zone. */
export interface PlanSlot {
  id: string;
  start: string;
  end: string;
}

export interface ExposureEntry {
  id: string;
  /** Optimal one-night integration, minutes. */
  minutes: number;
}

/** The model's answer for one night. */
export interface ModelPlan {
  exposures: ExposureEntry[];
  /** In time order. */
  plan: PlanSlot[];
  /** Targets that do not fit tonight, any order. */
  cut: string[];
  fitsAll: boolean;
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
        required: ['id', 'minutes'],
        additionalProperties: false,
        properties: { id: { type: 'string' }, minutes: { type: 'number', exclusiveMinimum: 0 } },
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
          start: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
          end: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        },
      },
    },
    cut: { type: 'array', items: { type: 'string' } },
    fitsAll: { type: 'boolean' },
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

function listOf<T>(v: unknown, what: string, item: (x: unknown, i: number) => T | string): Parsed<T[]> {
  if (!Array.isArray(v)) return { ok: false, error: `${what} must be an array` };
  const out: T[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = item(v[i], i);
    if (typeof r === 'string') return { ok: false, error: `${what}[${i}]: ${r}` };
    out.push(r);
  }
  return { ok: true, value: out };
}

/** Parses and validates a plan reply. Unknown keys are dropped; anything missing or mistyped is an error naming the field. */
export function parsePlanReply(text: string): Parsed<ModelPlan> {
  const j = parseJsonReply(text);
  if (!j.ok) return j;
  const o = j.value;
  if (!isObj(o)) return { ok: false, error: 'the reply must be one JSON object' };

  const exposures = listOf<ExposureEntry>(o.exposures, 'exposures', (x) => {
    if (!isObj(x) || !isStr(x.id)) return 'needs a string id';
    if (typeof x.minutes !== 'number' || !Number.isFinite(x.minutes) || x.minutes <= 0) return 'minutes must be a positive number';
    return { id: x.id, minutes: x.minutes };
  });
  if (!exposures.ok) return exposures;
  const plan = listOf<PlanSlot>(o.plan, 'plan', (x) => {
    if (!isObj(x) || !isStr(x.id)) return 'needs a string id';
    if (typeof x.start !== 'string' || !CLOCK_RE.test(x.start)) return 'start must be "HH:MM" (24 h)';
    if (typeof x.end !== 'string' || !CLOCK_RE.test(x.end)) return 'end must be "HH:MM" (24 h)';
    return { id: x.id, start: x.start, end: x.end };
  });
  if (!plan.ok) return plan;
  const cut = listOf<string>(o.cut, 'cut', (x) => (isStr(x) ? x : 'must be a target id string'));
  if (!cut.ok) return cut;
  if (typeof o.fitsAll !== 'boolean') return { ok: false, error: 'fitsAll must be true or false' };
  if (o.notes !== undefined && typeof o.notes !== 'string') return { ok: false, error: 'notes must be a string' };
  const value: ModelPlan = { exposures: exposures.value, plan: plan.value, cut: cut.value, fitsAll: o.fitsAll };
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
