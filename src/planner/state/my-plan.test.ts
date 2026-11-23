import { MAX_MY_PLAN, MY_PLAN_KEY, loadMyPlan, saveMyPlan } from './index';

const store = (text: string | null) => ({ getItem: (k: string) => (k === MY_PLAN_KEY ? text : null), removeItem: () => {} });

describe('saved my plan', () => {
  it('is empty when nothing is stored, and round-trips the order that was saved', () => {
    expect(loadMyPlan(store(null))).toEqual([]);
    let written = '';
    saveMyPlan({ setItem: (_k, v) => { written = v; } }, ['ngc891', 'm31', 'planet-jupiter']);
    expect(loadMyPlan(store(written))).toEqual(['ngc891', 'm31', 'planet-jupiter']);
  });

  it.each([
    '{nope',
    '[]',
    'null',
    '{"version":2,"ids":[]}',
    '{"version":1,"ids":"m31"}',
    '{"version":1,"ids":[1]}',
    '{"version":1,"ids":[""]}',
    '{"version":1,"ids":["m31","m31"]}',
    `{"version":1,"ids":[${Array.from({ length: MAX_MY_PLAN + 1 }, (_, i) => `"t${i}"`).join(',')}]}`,
  ])('says a damaged value is damaged: %s', (text) => {
    expect(() => loadMyPlan(store(text))).toThrow(/Saved plan damaged\. Starting empty/);
  });

  it('removes a damaged value, leaves a good one, and says when it cannot remove or read', () => {
    const removed: string[] = [];
    const s = (text: string) => ({ getItem: () => text, removeItem: (k: string) => { removed.push(k); } });
    expect(() => loadMyPlan(s('{nope'))).toThrow(/damaged/);
    expect(removed).toEqual([MY_PLAN_KEY]);
    loadMyPlan(s('{"version":1,"ids":["m31"]}'));
    expect(removed).toEqual([MY_PLAN_KEY]);
    expect(() => loadMyPlan({ getItem: () => 'x', removeItem: () => { throw new Error('denied'); } })).toThrow(/damaged, not cleared.*denied/);
    expect(() => loadMyPlan({ getItem: () => { throw new Error('denied'); }, removeItem: () => {} })).toThrow(/unreadable.*denied/);
  });
});
