/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { starterTargets } from '@/planner/catalog';
import { MAX_SLOTS } from '@/planner/itinerary';
import { tonightsNight } from '@/planner/plan';
import { sampleProfile } from '@/planner/state';
import AiPlanFlyout from './AiPlanFlyout';
import type { AiPlanFlyoutProps } from './AiPlanFlyout';

// The flyout on its own, with an answer that has more slots than an itinerary holds (the page's own plan limit makes it hard to reach).

const profile = sampleProfile();
const site = { latitude: 33.6, longitude: -111.7 };
const night = tonightsNight(site, '2026-12-15', 'America/Phoenix');
if (night.kind !== 'normal') throw new Error('test night must be normal');
const picks = starterTargets.slice(0, MAX_SLOTS + 1);
const slots = picks.map((t, i) => ({ id: t.id, start: `2026-12-15T${String(19 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}-07:00`, end: `2026-12-15T${String(19 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '25' : '55'}-07:00` }));
const answer = { status: 'verified', plan: { exposures: [], plan: slots, cut: [], fitsAll: true }, violations: [], warnings: [], lastTarget: null, flips: 0, repairRounds: 0, modelCalls: 1 };

afterEach(cleanup);

const reply = (status: number, json: unknown, headers: Record<string, string> = {}) => ({ ok: status < 400, status, headers: { get: (k: string) => headers[k] ?? null }, json: async () => json });
const fetching = (r: ReturnType<typeof reply>) => jest.fn(async () => r) as unknown as typeof fetch;
const hang = () => jest.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch;

const propsFor = (fetchPlan: typeof fetch, over: Partial<AiPlanFlyoutProps> = {}, n = 2): AiPlanFlyoutProps => {
  const chosen = starterTargets.slice(0, n);
  return {
    base: { site, timeZone: 'America/Phoenix', horizon: null, minAltitude: 20, date: '2026-12-15' },
    targets: chosen.map((t) => ({ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg })),
    blocked: null,
    leftOutNote: '',
    profile,
    train: profile.trains.find((t) => t.kind === 'optical')!,
    siteName: 'Test site',
    nightWord: 'tonight',
    night,
    nightText: 'Astronomical night 20:00 to 05:00.',
    horizonText: 'Horizon not set: only the flat minimum altitude applies.',
    presetLabels: new Map(chosen.map((t, i) => [t.id, i === 0 ? 'Balanced' : 'Deep'])),
    catalogTargets: starterTargets,
    formatTime: (d: Date) => d.toISOString().slice(11, 16),
    owner: false,
    fetchPlan,
    onApply: jest.fn(async () => true),
    onClose: jest.fn(),
    ...over,
  };
};

it('a verified plan with more slots than the night timeline holds cannot be applied, and says how many fit', async () => {
  const props = propsFor(fetching(reply(200, answer)), {}, MAX_SLOTS + 1);
  render(<AiPlanFlyout {...props} />);
  await userEvent.setup().click(screen.getByRole('button', { name: /^Ask the AI to order and time/ }));
  const result = await screen.findByTestId('ai-result');
  expect(within(result).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('ai-slot-'))).toHaveLength(MAX_SLOTS + 1);
  expect((screen.getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('ai-apply-note').textContent).toBe(`The night timeline schedules at most ${MAX_SLOTS} targets and this AI plan has ${MAX_SLOTS + 1}. Remove a target from the plan and ask again.`);
  expect(props.onApply).not.toHaveBeenCalled();
});

// ---- The flyout's states: step 1, step 2, step 3, the result, Use this plan, the errors, Close.

const two = starterTargets.slice(0, 2);
const twoSlots = [
  { id: two[0].id, start: '2026-12-15T19:00:00-07:00', end: '2026-12-15T20:30:00-07:00' },
  { id: two[1].id, start: '2026-12-15T20:40:00-07:00', end: '2026-12-15T21:40:00-07:00' },
];
const twoAnswer = (over: object = {}) => ({ status: 'verified', plan: { exposures: [], plan: twoSlots, cut: [], fitsAll: true, notes: '' }, violations: [], warnings: [], lastTarget: null, flips: 0, repairRounds: 0, modelCalls: 1, ...over });
const ask = () => screen.getByRole('button', { name: /^Ask the AI to order and time/ });
const stateOf = (n: number) => screen.getByTestId(`ai-step-${n}`).getAttribute('data-state');

describe('step 1, checking the night', () => {
  it('shows what the AI is given in plain words, with each target\'s preset, and sends nothing until asked', () => {
    const f = fetching(reply(200, twoAnswer()));
    render(<AiPlanFlyout {...propsFor(f)} />);
    const inputs = screen.getByTestId('ai-inputs').textContent ?? '';
    expect(inputs).toContain('Night: Astronomical night 20:00 to 05:00.');
    expect(inputs).toContain('Site: Test site, minimum altitude 20°.');
    expect(inputs).toContain('Horizon not set');
    expect(inputs).toMatch(/Train: .+\./);
    expect(inputs).toContain(`2 targets, in the plan's order: ${two[0].name} (Balanced), ${two[1].name} (Deep).`);
    expect(stateOf(1)).toBe('now');
    expect(stateOf(2)).toBe('waiting');
    expect(stateOf(3)).toBe('waiting');
    expect(screen.getByRole('heading', { name: '1. Checking the night (now)', level: 3 })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '2. Asking the AI to order and time 2 targets (waiting)' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 3, name: '3. Checking the plan against the sky (waiting)' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use this plan' })).toBeNull();
  });

  it('says why it cannot ask (no targets) and keeps the button off', () => {
    const f = fetching(reply(200, twoAnswer()));
    render(<AiPlanFlyout {...propsFor(f, { blocked: 'Add at least one target to the plan first.', targets: [] })} />);
    expect(screen.getByTestId('ai-plan-reason').textContent).toBe('Add at least one target to the plan first.');
    expect((ask() as HTMLButtonElement).disabled).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('step 2, asking the AI', () => {
  it('shows a live status and Cancel; Cancel stops the request, changes nothing and offers Ask again', async () => {
    const f = hang();
    const props = propsFor(f);
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    expect(stateOf(1)).toBe('done');
    expect(stateOf(2)).toBe('now');
    expect(screen.getByTestId('ai-status').textContent).toBe('Planning tonight. The AI can take a minute or two.');
    expect(screen.getByTestId('ai-status').getAttribute('aria-live')).toBe('polite');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    await user.click(cancel);
    expect((f as unknown as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(screen.getByTestId('ai-status').textContent).toBe('Cancelled. Nothing was changed.');
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('step 3 and the result', () => {
  it('a passing plan: step 3 says passed; slots show start, end, minutes and preset; nothing is applied yet', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())));
    render(<AiPlanFlyout {...props} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(stateOf(2)).toBe('done');
    expect(stateOf(3)).toBe('done');
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/^Passed\. Every slot is above your minimum altitude/);
    const rows = [0, 1].map((i) => screen.getByTestId(`ai-slot-${i}`).textContent ?? '');
    expect(rows[0]).toMatch(new RegExp(`^1\\. ${two[0].name} 19:00 to 20:30 \\(90 min, Balanced\\)`));
    expect(rows[1]).toMatch(new RegExp(`^2\\. ${two[1].name} 20:40 to 21:40 \\(60 min, Deep\\)`));
    expect(screen.getByRole('button', { name: 'Use this plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('a plan the code repaired says so', async () => {
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, twoAnswer({ repairRounds: 2 }))))} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/^Repaired: the code found problems in the first answer and sent it back 2 times; it passes now\./);
  });

  it('targets left out are listed with why, and the checker\'s warnings are shown', async () => {
    const out = starterTargets[2];
    const a = twoAnswer({ plan: { exposures: [], plan: twoSlots, cut: [out.id], fitsAll: false, notes: '' }, flips: 1 });
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, a)), { targets: starterTargets.slice(0, 3).map((t) => ({ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg })) })} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.getByTestId('ai-cut').textContent).toMatch(new RegExp(`^${out.name}\\. The AI judged it did not fit this night`));
    expect(screen.getByTestId('ai-checker').textContent).toMatch(/1 slot crosses the meridian/);
    expect(screen.getByTestId('ai-status').textContent).toMatch(/2 targets planned, 1 left out\. Checked by code\./);
  });

  it('a plan the checker could not clear cannot be used', async () => {
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, twoAnswer({ status: 'unverified', violations: [{ code: 'x', message: 'Slot overlaps.' }], repairRounds: 3 }))))} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(stateOf(3)).toBe('failed');
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/^Not fully checked/);
    expect((screen.getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Use this plan, Ask again, Close', () => {
  it('Use this plan hands the order and first start to the plan, once pressed, and says it is done', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())));
    render(<AiPlanFlyout {...props} />);
    const user = await (async () => {
      const u = userEvent.setup();
      await u.click(ask());
      await screen.findByTestId('ai-result');
      return u;
    })();
    expect(screen.getByTestId('ai-apply-explain').textContent).toMatch(/^Use this plan sets the open plan.s order and first start time, replacing the earlier times\./);
    expect(screen.queryByTestId('ai-apply-note')).toBeNull(); // nothing to warn about before it is used
    await user.click(screen.getByRole('button', { name: 'Use this plan' }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    const [items, startTime] = (props.onApply as jest.Mock).mock.calls[0];
    expect(items.map((i: { targetId: string }) => i.targetId)).toEqual([two[0].id, two[1].id]);
    expect(startTime).toBe('19:00');
    await screen.findByText('Done: the open plan now has this order and first start time.');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('when the page refuses it the flyout says the plan was left as it was', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())), { onApply: jest.fn(async () => false) });
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    await user.click(screen.getByRole('button', { name: 'Use this plan' }));
    await screen.findByText('The open plan was left as it was.');
  });

  it('Ask again sends the request again and shows only the new answer', async () => {
    const f = jest.fn().mockResolvedValueOnce(reply(200, twoAnswer())).mockResolvedValueOnce(reply(200, twoAnswer({ plan: { exposures: [], plan: [twoSlots[0]], cut: [two[1].id], fitsAll: false, notes: '' } })));
    render(<AiPlanFlyout {...propsFor(f as unknown as typeof fetch)} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    await user.click(screen.getByRole('button', { name: 'Ask again' }));
    await waitFor(() => expect(screen.getByTestId('ai-status').textContent).toMatch(/1 target planned, 1 left out/));
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('Close (and Escape) closes without applying; a request in flight is stopped', async () => {
    const f = hang();
    const props = propsFor(f);
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect((f as unknown as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('Close after a result changes nothing', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())));
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
  });
});

describe('errors, in plain words with the next step', () => {
  const failing = async (status: number, json: unknown, headers: Record<string, string> = {}) => {
    const props = propsFor(fetching(reply(status, json, headers)));
    render(<AiPlanFlyout {...props} />);
    await userEvent.setup().click(ask());
    return { problem: await screen.findByTestId('ai-problem'), props };
  };

  it('limit reached: says when to try again, no raw text, no Ask again', async () => {
    const { problem } = await failing(429, { error: 'Hourly planner limit reached' }, { 'Retry-After': '1500' });
    expect(problem.getAttribute('role')).toBe('alert');
    expect(problem.textContent).toMatch(/allowance for now\. Try again in about 25 minutes\./);
    expect(problem.textContent).not.toMatch(/Hourly planner limit/);
    expect(stateOf(2)).toBe('failed');
    expect(screen.queryByRole('button', { name: 'Ask again' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('AI unavailable: says so without the route text', async () => {
    const { problem } = await failing(503, { error: 'ANTHROPIC_API_KEY is not set' });
    expect(problem.textContent).toMatch(/The AI planner is not available right now/);
    expect(problem.textContent).not.toMatch(/ANTHROPIC/);
  });

  it('no usable night: says to pick another night or site', async () => {
    const { problem } = await failing(422, { error: 'No astronomical night on 2026-12-15' });
    expect(problem.textContent).toMatch(/There is no usable night to plan.*Pick another night or site\./);
  });

  it('a failed answer offers Ask again, which sends the same request', async () => {
    const f = jest.fn().mockResolvedValueOnce(reply(502, { error: 'Model call failed: x' })).mockResolvedValueOnce(reply(200, twoAnswer()));
    render(<AiPlanFlyout {...propsFor(f as unknown as typeof fetch)} />);
    const user = userEvent.setup();
    await user.click(ask());
    expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/did not give a usable answer/);
    await user.click(screen.getByRole('button', { name: 'Ask again' }));
    await screen.findByTestId('ai-result');
    expect(screen.queryByTestId('ai-problem')).toBeNull();
    expect(f.mock.calls[1][1].body).toBe(f.mock.calls[0][1].body);
  });

  it('no error shows a validator or raw route text', async () => {
    const { problem } = await failing(400, { error: 'rig.camera must be a short string' });
    expect(problem.textContent).toMatch(/could not accept this request/);
    expect(problem.textContent).not.toMatch(/rig\.camera|must be/);
  });
});

describe('the owner\'s review switch', () => {
  it('is only for the owner, and its choice goes in the request', async () => {
    const f = fetching(reply(200, twoAnswer()));
    const { unmount } = render(<AiPlanFlyout {...propsFor(f)} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    unmount();
    render(<AiPlanFlyout {...propsFor(f, { owner: true })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: /review the plan/ }));
    await user.click(ask());
    await screen.findByTestId('ai-result');
    expect(JSON.parse((f as unknown as jest.Mock).mock.calls[0][1].body).qualityReview).toBe(true);
  });
});
