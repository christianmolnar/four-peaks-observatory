/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { planNightWithAi } from '@/planner/ai/plan';
import type { AiPlanResult } from '@/planner/ai/plan';
import { parseBody } from '@/planner/ai/request';
import type { AiPlanInput } from '@/planner/ai/facts';
import { clock, earliestSlot, night, planOf, validSlots } from '@/planner/ai/testkit';
import type { ModelPlan } from '@/planner/ai/schema';
import type { Profile } from '@/planner/profile';
import { sampleProfile, saveMyPlan } from '@/planner/state';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, openControls, openPlanTab, ready, untickNarrowband } from './testkit';

// The filter mix in the AI night plan result: worked out by code from the light each slot gets once the plan is used (the same numbers the plan row shows),
// never by the model. The fetch is a fake; the "model" is a fake behind the real engine and the real checker.

const NBZ = { id: 'nbz', name: 'IDAS NBZ-II', kind: 'dual-band' as const, passbands: [{ centreNm: 656.3, widthNm: 9.5 }, { centreNm: 500.7, widthNm: 8 }] };
const NB3 = { id: 'nb3', name: 'IDAS NB3-PM', kind: 'dual-band' as const, passbands: [{ centreNm: 672, widthNm: 19 }, { centreNm: 500.7, widthNm: 21 }] };
const profileWith = (filterId: string | undefined, filters = [NBZ, NB3]): Profile => {
  const p = sampleProfile();
  p.equipment.filters = [...filters];
  p.trains = p.trains.map((t, i) => (i === 0 && t.kind === 'optical' ? { ...t, ...(filterId === undefined ? {} : { filterId }) } : t));
  return p;
};

const engine = async (input: AiPlanInput, make?: (i: AiPlanInput) => ModelPlan) => {
  const plan = make ? make(input) : planOf(input, validSlots(input));
  const result: AiPlanResult = await planNightWithAi(input, { callModel: async () => JSON.stringify(plan), qualityReview: false });
  return { status: 200, json: result };
};
const okInput = (body: unknown): AiPlanInput => {
  const parsed = parseBody(body as Record<string, unknown>);
  if (typeof parsed === 'string') throw new Error(parsed);
  return parsed.input;
};
const fetchWith = (make?: (i: AiPlanInput) => ModelPlan) =>
  jest.fn(async (_url: string, init: RequestInit) => {
    const r = await engine(okInput(JSON.parse(init.body as string)), make);
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => JSON.parse(JSON.stringify(r.json)) } as unknown as Response;
  }) as unknown as typeof fetch;

const mount = (ai: typeof fetch, plan: string[], profile: Profile) => {
  saveMyPlan(window.localStorage, plan);
  const catalog = fakeCatalog([]);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  return render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} rank={worker.rank} loadCatalogIndex={catalog.load} aiFetch={ai} loadAuth={async () => ({ kind: 'signedOut' as const })} />);
};
const panel = () => screen.getByRole('dialog', { name: 'PLAN MY NIGHT WITH AI' });
const planned = async () => {
  await ready();
  fireEvent.click(within(screen.getByRole('region', { name: /^PLAN:/ })).getByRole('button', { name: 'Plan my night with AI' }));
  const user = userEvent.setup();
  await user.click(within(panel()).getByRole('button', { name: /^Ask the AI to order and time/ }));
  await screen.findByTestId('ai-result', {}, { timeout: 20000 });
  return user;
};
const slotMix = (i: number) => screen.getByTestId(`ai-slot-mix-${i}`).textContent ?? '';
const flyoutLight = (i: number) => /light after Use this plan: (.+?)\)/.exec(slotMix(i))![1];
const apply = () => within(panel()).getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement;
const rowMix = (id: string) => {
  const fold = document.getElementById(`plan-mix-fold-${id}`) as HTMLButtonElement;
  if (fold.getAttribute('aria-expanded') === 'false') fireEvent.click(fold);
  return screen.getByTestId(`plan-mix-${id}`).textContent ?? '';
};
const afterUse = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(apply());
  await waitFor(() => expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/^Done/));
  fireEvent.click(within(panel()).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByTestId('ai-flyout')).toBeNull());
  openPlanTab();
};
/** "IDAS NBZ-II: 2 h 14 min" pairs from a flyout slot or a row. */
const pairs = (text: string): string[] => [...text.matchAll(/(IDAS [\w-]+|Broadband \([^)]*\)|Broadband): (\d+ h(?: \d+ min)?|\d+ min)/g)].map((m) => `${m[1]}: ${m[2]}`);

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('the Filters line under each slot of the AI result', () => {
  it('shows the hours per filter of the setup under each ordered slot, and nothing under the left-out targets', async () => {
    mount(fetchWith(), ['ic405', 'm31'], profileWith('nbz'));
    await planned();
    expect(slotMix(0)).toMatch(/^Filters/);
    expect(slotMix(0)).toMatch(/IDAS NBZ-II: \d/);
    expect(slotMix(0)).toMatch(/adds Ha and OIII|adds/i);
    // Andromeda has faint HII knots (Ha only): it gets the knots suggestion, not the gate.
    expect(slotMix(1)).toMatch(/adds Ha/);
    expect(slotMix(1)).not.toMatch(/almost no emission light/);
    expect(screen.queryByTestId('ai-cut')?.textContent ?? '').not.toMatch(/Filters/);
    expect(document.body.textContent).not.toMatch(/NaN|Infinity|undefined|e\+\d/);
  });

  it('flags a filter that adds nothing, "covered by" the one that does, and the row says the same after Use this plan', async () => {
    const COPY = { ...NBZ, id: 'nbz2', name: 'IDAS NBZ-II copy' };
    mount(fetchWith(), ['ic405'], profileWith('nbz', [NBZ, COPY]));
    await ready();
    openControls();
    fireEvent.click(within(screen.getByTestId('mix-filters')).getByRole('checkbox', { name: 'Use IDAS NBZ-II copy' }));
    const user = await planned();
    untickNarrowband();
    expect(slotMix(0)).toContain('IDAS NBZ-II copy: 0 min (covered by IDAS NBZ-II)');
    const shown = pairs(slotMix(0));
    await afterUse(user);
    expect(rowMix('ic405')).toContain('IDAS NBZ-II copy: 0 min');
    expect(pairs(rowMix('ic405'))).toEqual(shown);
  });

  it('says plainly when the setup has no filter, and for a smart scope', async () => {
    mount(fetchWith(), ['ic405'], profileWith(undefined));
    await planned();
    untickNarrowband();
    expect(slotMix(0)).toMatch(/No filter/);
    expect(slotMix(0)).not.toMatch(/\d+ min|\d+ h/);
  });

  it('is not shown when the answer is out of date', async () => {
    mount(fetchWith(), ['ic405', 'm31'], profileWith('nbz'));
    await planned();
    expect(screen.getByTestId('ai-slot-mix-0')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Minimum altitude \(deg\)/), { target: { value: '35' } });
    await screen.findByTestId('ai-stale');
    expect(screen.queryByTestId('ai-slot-mix-0')).toBeNull();
  });
});

describe('one source: the flyout and the plan row after Use this plan', () => {
  it('the row shows the same light and the same hours per filter as the flyout showed, including a filter picked beside the setup’s', async () => {
    mount(fetchWith(), ['ic405', 'm31'], profileWith('nbz'));
    await ready();
    openControls();
    fireEvent.click(within(screen.getByTestId('mix-filters')).getByRole('checkbox', { name: 'Use IDAS NB3-PM' }));
    const user = await planned();
    untickNarrowband();
    const shown = [0, 1].map((i) => ({ light: flyoutLight(i), pairs: pairs(slotMix(i)), id: ['ic405', 'm31'][i] }));
    expect(shown[0].pairs.length).toBeGreaterThanOrEqual(2);
    await afterUse(user);
    for (const s of shown) {
      const row = rowMix(s.id);
      expect(row).toContain(`Light: ${s.light}`);
      expect(pairs(row)).toEqual(s.pairs);
    }
  });

  it('a slot shorter than the AI’s planned light: the flyout still shows the light the plan will get, and the row agrees after Use this plan', async () => {
    const short = (i: AiPlanInput): ModelPlan => {
      const a = earliestSlot(i, 'm31', night(i).start.getTime(), 25);
      const b = earliestSlot(i, 'ic405', a.end + 5 * 60000, 25);
      // The AI asks for 60 min each (exposures) but its slots are 25 min long.
      return planOf(i, [['m31', clock(a.start, i.timeZone), clock(a.end, i.timeZone)], ['ic405', clock(b.start, i.timeZone), clock(b.end, i.timeZone)]]);
    };
    mount(fetchWith(short), ['ic405', 'm31'], profileWith('nbz'));
    const user = await planned();
    untickNarrowband();
    const ids = ['m31', 'ic405'];
    const shown = [0, 1].map((i) => ({ light: flyoutLight(i), pairs: pairs(slotMix(i)) }));
    expect(shown[1].light).not.toBe('25 min');
    expect(shown.every((x) => x.pairs.length > 0)).toBe(true);
    await afterUse(user);
    ids.forEach((id, i) => {
      const row = rowMix(id);
      expect(row).toContain(`Light: ${shown[i].light}`);
      expect(pairs(row)).toEqual(shown[i].pairs);
    });
  });
});

describe('the narrowband panel in the AI result', () => {
  const slotOf = (id: string) => screen.getByTestId(`nb-ai-${id}`).closest('[data-testid^="ai-slot-mix-"]') as HTMLElement;
  /** The slot's mix lines without the panel's own rows. */
  const mixText = (id: string) => (slotOf(id).textContent ?? '').replace(screen.getByTestId(`nb-ai-${id}`).textContent ?? '', '');
  it('is under the slot; a tick changed there changes that slot’s mix, and the plan row after Use this plan says the same', async () => {
    mount(fetchWith(), ['ic405', 'm31'], profileWith('nbz'));
    const user = await planned();
    expect(slotOf('ic405').textContent).toMatch(/Light: broadband/);
    expect(pairs(mixText('ic405')).some((p) => p.startsWith('IDAS NB3-PM'))).toBe(true);
    fireEvent.click(document.getElementById('nb-fold-ai-ic405') as HTMLButtonElement);
    expect(document.getElementById('nb-fold-ai-ic405')).not.toBeNull();
    const nb3 = screen.getByTestId('nb-tick-ai-ic405-nb3') as HTMLInputElement;
    expect(nb3.checked).toBe(true);
    fireEvent.click(nb3); // untick: the plan keeps broadband and NBZ II only
    expect(slotOf('ic405').textContent).toMatch(/Light: broadband/);
    expect(slotOf('ic405').textContent).toMatch(/Broadband \(no narrowband filter\): \d/);
    expect((screen.getByTestId('nb-tick-ai-ic405-nb3') as HTMLInputElement).checked).toBe(false);
    const flyout = pairs(mixText('ic405'));
    expect(flyout.some((p) => p.startsWith('IDAS NB3-PM'))).toBe(false);
    await afterUse(user);
    expect(pairs(rowMix('ic405'))).toEqual(flyout);
  });
});
