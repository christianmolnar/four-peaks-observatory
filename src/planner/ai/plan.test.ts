import { createAnthropicCaller, DEFAULT_MODEL, MissingKeyError, redactKey } from './anthropic';
import { planNightWithAi, ModelReplyError } from './plan';
import type { CallModel, ModelMessage } from './plan';
import { SYSTEM_PROMPT } from './prompt';
import { INPUT, clock, lowMinute, MIN, planOf, validSlots } from './testkit';
import { readFileSync } from 'fs';
import { join } from 'path';

/** A fake model: answers from a script, records every message list it was given. */
function fake(replies: (string | Error)[]): { call: CallModel; seen: ModelMessage[][] } {
  const seen: ModelMessage[][] = [];
  let i = 0;
  const call: CallModel = async (messages) => {
    seen.push(messages);
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { call, seen };
}

const good = (): string => JSON.stringify(planOf(INPUT, validSlots()));
const lowStart = lowMinute(INPUT, 't1', 25, 40);
const bad = (): string => JSON.stringify(planOf(INPUT, [['t1', clock(lowStart), clock(lowStart + 40 * MIN)], ...validSlots().slice(1)]));

describe('planNightWithAi', () => {
  it('a valid plan verifies in one call', async () => {
    const m = fake([good()]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(r.status).toBe('verified');
    expect(r.violations).toEqual([]);
    expect(r.repairRounds).toBe(0);
    expect(r.modelCalls).toBe(1);
    expect(r.plan.plan).toHaveLength(3);
    expect(r.facts.targets).toHaveLength(3);
    expect(m.seen[0][0].role).toBe('system');
    expect(m.seen[0][1].content).toContain('"sampleTimes"');
  });

  it('a low-altitude slot gets violations and the repaired reply verifies', async () => {
    const m = fake([bad(), good()]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(r.status).toBe('verified');
    expect(r.repairRounds).toBe(1);
    expect(r.modelCalls).toBe(2);
    const repair = m.seen[1];
    expect(repair[2].role).toBe('assistant');
    expect(repair[2].content).toBe(JSON.stringify(JSON.parse(bad())));
    expect(repair[3].content).toContain('is below 25 deg');
  });

  it('three failed repairs give unverified with the remaining violations', async () => {
    const m = fake([bad()]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(r.status).toBe('unverified');
    expect(r.repairRounds).toBe(3);
    expect(r.modelCalls).toBe(4);
    expect(r.violations.length).toBeGreaterThan(0);
    expect(r.violations[0].message).toContain('below 25 deg');
  });

  it('returns the best plan, not the last, when repairs get worse', async () => {
    const worse = JSON.stringify(planOf(INPUT, []));
    const m = fake([bad(), worse]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(r.status).toBe('unverified');
    expect(r.plan.plan).toHaveLength(3);
  });

  it('malformed JSON is retried once', async () => {
    const m = fake(['sorry, here is your plan: {', good()]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(r.status).toBe('verified');
    expect(r.modelCalls).toBe(2);
    expect(m.seen[1][3].content).toContain('could not be used');
  });

  it('malformed twice on the first call is an error; in a repair round it keeps the best plan', async () => {
    await expect(planNightWithAi(INPUT, { callModel: fake(['x', 'y']).call })).rejects.toBeInstanceOf(ModelReplyError);
    const r = await planNightWithAi(INPUT, { callModel: fake([bad(), 'x', 'y']).call });
    expect(r.status).toBe('unverified');
    expect(r.repairRounds).toBe(1);
  });

  it('a schema violation (bad time) counts as malformed', async () => {
    const wrong = JSON.stringify({ ...planOf(INPUT, validSlots()), plan: [{ id: 't1', start: '9pm', end: '10pm' }] });
    const m = fake([wrong, good()]);
    const r = await planNightWithAi(INPUT, { callModel: m.call });
    expect(m.seen[1][3].content).toContain('start must be "HH:MM"');
    expect(r.status).toBe('verified');
  });

  it('a target missing from both lists is a violation', async () => {
    const slots = validSlots().slice(0, 2);
    const plan = { ...planOf(INPUT, slots), cut: [], fitsAll: true };
    const r = await planNightWithAi(INPUT, { callModel: fake([JSON.stringify(plan)]).call });
    expect(r.status).toBe('unverified');
    expect(r.violations.map((v) => v.kind)).toContain('missing-target');
  });

  it('a model transport error propagates', async () => {
    await expect(planNightWithAi(INPUT, { callModel: fake([new Error('boom')]).call })).rejects.toThrow('boom');
  });

  describe('quality review', () => {
    it('is off by default: no extra call', async () => {
      const m = fake([good()]);
      const r = await planNightWithAi(INPUT, { callModel: m.call });
      expect(m.seen).toHaveLength(1);
      expect(r.quality).toBeUndefined();
    });
    it('a good verdict adds one call and leaves the plan', async () => {
      const m = fake([good(), '{"good":true,"verdict":"Fine."}']);
      const r = await planNightWithAi(INPUT, { callModel: m.call, qualityReview: true });
      expect(r.quality).toEqual({ good: true, verdict: 'Fine.', repaired: false });
      expect(m.seen).toHaveLength(2);
    });
    it('a bad verdict with an issue gets one repair round; a passing fix replaces the plan', async () => {
      const better = JSON.stringify({ ...JSON.parse(good()), notes: 'reordered' });
      const m = fake([good(), '{"good":false,"verdict":"Weak.","issue":"Order wastes the best sky.","fix":"Swap two."}', better]);
      const r = await planNightWithAi(INPUT, { callModel: m.call, qualityReview: true });
      expect(r.quality?.repaired).toBe(true);
      expect(r.plan.notes).toBe('reordered');
      expect(m.seen[2][3].content).toContain('Order wastes the best sky.');
      expect(m.seen).toHaveLength(3);
    });
    it('a quality fix that fails the check is dropped', async () => {
      const m = fake([good(), '{"good":false,"verdict":"Weak.","issue":"x"}', bad()]);
      const r = await planNightWithAi(INPUT, { callModel: m.call, qualityReview: true });
      expect(r.status).toBe('verified');
      expect(r.quality?.repaired).toBe(false);
      expect(r.plan.notes).toBeUndefined();
    });
    it('a malformed review twice keeps the verified plan and reports the error', async () => {
      const r = await planNightWithAi(INPUT, { callModel: fake([good(), 'no', 'no']).call, qualityReview: true });
      expect(r.status).toBe('verified');
      expect(r.qualityError).toContain('malformed twice');
    });
  });
});

describe('prompt', () => {
  it('tells the model to use only the facts table and not compute positions', () => {
    expect(SYSTEM_PROMPT).toContain('Use only the FACTS table');
    expect(SYSTEM_PROMPT).toContain('Do not compute positions yourself');
  });
  it('PROMPT.md holds the exact system prompt', () => {
    expect(readFileSync(join(__dirname, 'PROMPT.md'), 'utf8')).toContain(SYSTEM_PROMPT);
  });
});

describe('anthropic caller', () => {
  it('fails clearly without a key, naming the variable but no value', () => {
    expect(() => createAnthropicCaller({})).toThrow(MissingKeyError);
    expect(() => createAnthropicCaller({ ANTHROPIC_API_KEY: '  ' })).toThrow('ANTHROPIC_API_KEY is not set');
  });
  it('builds with a key without making a call', () => {
    expect(typeof createAnthropicCaller({ ANTHROPIC_API_KEY: 'sk-ant-fake-key-0123456789' })).toBe('function');
    expect(DEFAULT_MODEL).toBe('claude-sonnet-5-5');
  });
  it('redacts the key from text', () => {
    expect(redactKey('401 for sk-ant-fake-key-0123456789 bad', 'sk-ant-fake-key-0123456789')).toBe('401 for [redacted] bad');
    expect(redactKey('plain', undefined)).toBe('plain');
  });
  it('no source file names a target', () => {
    for (const f of ['facts.ts', 'check.ts', 'prompt.ts', 'plan.ts', 'schema.ts', 'anthropic.ts', 'request.ts']) {
      expect(readFileSync(join(__dirname, f), 'utf8')).not.toMatch(/\bM ?\d{1,3}\b|\bNGC ?\d|Orion|Andromeda|Pleiades/);
    }
  });
});
