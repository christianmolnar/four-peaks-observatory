/**
 * @jest-environment jsdom
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { starterTargets } from '@/planner/catalog';
import { MAX_SLOTS } from '@/planner/itinerary';
import { sampleProfile } from '@/planner/state';
import AiPlanFlyout from './AiPlanFlyout';
import type { AiPlanFlyoutProps } from './AiPlanFlyout';

// The flyout on its own, with an answer that has more slots than an itinerary holds (the page's own plan limit makes it hard to reach).

const profile = sampleProfile();
const site = { latitude: 33.6, longitude: -111.7 };
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
    train: profile.trains.find((t) => t.kind === 'optical')!,
    presetLabels: new Map(chosen.map((t, i) => [t.id, i === 0 ? 'Balanced' : 'Deep'])),
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
  await userEvent.setup().click(screen.getByRole('button', { name: /^Plan \d+ targets?$/ }));
  const result = await screen.findByTestId('ai-result');
  expect(within(result).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('ai-slot-'))).toHaveLength(MAX_SLOTS + 1);
  expect((screen.getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId('ai-apply-note').textContent).toBe(`Max ${MAX_SLOTS} targets`);
  expect(screen.getByTestId('ai-apply-note').className).not.toMatch(/text-p-t1\/\d/); // a reason the button is disabled keeps full colour
  expect(props.onApply).not.toHaveBeenCalled();
});

// ---- The flyout's states: step 1, step 2, step 3, the result, Use this plan, the errors, Close.

const two = starterTargets.slice(0, 2);
const twoSlots = [
  { id: two[0].id, start: '2026-12-15T19:00:00-07:00', end: '2026-12-15T20:30:00-07:00' },
  { id: two[1].id, start: '2026-12-15T20:40:00-07:00', end: '2026-12-15T21:40:00-07:00' },
];
const twoAnswer = (over: object = {}) => ({ status: 'verified', plan: { exposures: [], plan: twoSlots, cut: [], fitsAll: true, notes: '' }, violations: [], warnings: [], lastTarget: null, flips: 0, repairRounds: 0, modelCalls: 1, ...over });
const ask = () => screen.getByRole('button', { name: /^Plan \d+ targets?$/ });
describe('before asking', () => {
  it('shows only the Ask button; sends nothing until asked', () => {
    const f = fetching(reply(200, twoAnswer()));
    render(<AiPlanFlyout {...propsFor(f)} />);
    expect(ask().textContent).toBe('Plan 2 targets');
    expect(screen.queryByTestId('ai-inputs')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }));
    expect(f).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use this plan' })).toBeNull();
  });

  it('says why it cannot ask (no targets) and keeps the button off', () => {
    const f = fetching(reply(200, twoAnswer()));
    render(<AiPlanFlyout {...propsFor(f, { blocked: 'Add a target first', targets: [] })} />);
    expect(screen.getByTestId('ai-plan-reason').textContent).toBe('Add a target first');
    expect((ask() as HTMLButtonElement).disabled).toBe(true);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('asking the AI', () => {
  it('shows a live status and Cancel; Cancel stops the request, changes nothing and offers Ask again', async () => {
    const f = hang();
    const props = propsFor(f);
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    expect(screen.getByTestId('ai-status').textContent).toBe('Planning...');
    expect(screen.getByTestId('ai-status').getAttribute('aria-live')).toBe('polite');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(document.activeElement).toBe(cancel);
    await user.click(cancel);
    expect((f as unknown as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
    expect(screen.getByTestId('ai-status').textContent).toBe('Cancelled');
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy();
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe('the result', () => {
  it('a passing plan: nothing says passed; slots show start, end, minutes and preset; nothing is applied yet', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())));
    render(<AiPlanFlyout {...props} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.queryByTestId('ai-checked')).toBeNull();
    const rows = [0, 1].map((i) => screen.getByTestId(`ai-slot-${i}`).textContent ?? '');
    expect(rows[0]).toMatch(new RegExp(`^1\\. ${two[0].name} 19:00 to 20:30 \\(90 min, Balanced\\)`));
    expect(rows[1]).toMatch(new RegExp(`^2\\. ${two[1].name} 20:40 to 21:40 \\(60 min, Deep\\)`));
    expect(screen.getByRole('button', { name: 'Use this plan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it('a plan the code repaired says nothing', async () => {
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, twoAnswer({ repairRounds: 2 }))))} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.queryByTestId('ai-checked')).toBeNull();
  });

  it('targets left out are listed by name, and the checker\'s problems are short chips', async () => {
    const out = starterTargets[2];
    const a = twoAnswer({ plan: { exposures: [], plan: twoSlots, cut: [out.id], fitsAll: false, notes: '' }, flips: 1 });
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, a)), { targets: starterTargets.slice(0, 3).map((t) => ({ id: t.id, name: t.name, raHours: t.raHours, decDeg: t.decDeg })) })} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.getByTestId('ai-cut').textContent).toBe(`Left out: ${out.name}`);
    expect(screen.queryByTestId('ai-checker')).toBeNull();
  });

  it('a plan the checker could not clear cannot be used', async () => {
    render(<AiPlanFlyout {...propsFor(fetching(reply(200, twoAnswer({ status: 'unverified', violations: [{ kind: 'overlap', id: two[0].id, message: 'Slot overlaps.' }], repairRounds: 3 }))))} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.getByTestId('ai-checked').textContent).toBe('Not fully checked');
    expect(screen.getByTestId('ai-checker').textContent).toBe(`${two[0].name}: Overlap`);
    expect(screen.getByTestId('ai-apply-note').textContent).toBe('Not fully checked');
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
    expect(screen.queryByTestId('ai-apply-note')).toBeNull(); // nothing to warn about before it is used
    await user.click(screen.getByRole('button', { name: 'Use this plan' }));
    expect(props.onApply).toHaveBeenCalledTimes(1);
    const [items, startTime] = (props.onApply as jest.Mock).mock.calls[0];
    expect(items.map((i: { targetId: string }) => i.targetId)).toEqual([two[0].id, two[1].id]);
    expect(startTime).toBe('19:00');
    await screen.findByText('Applied');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('an answer that reorders the plan stays usable after Use this plan and says Done', async () => {
    const reversed = [twoSlots[1], twoSlots[0]].map((sl, i) => ({ ...sl, start: twoSlots[i].start, end: twoSlots[i].end }));
    const first = propsFor(fetching(reply(200, twoAnswer({ plan: { exposures: [], plan: reversed, cut: [], fitsAll: true, notes: '' } }))));
    const view = render(<AiPlanFlyout {...first} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    // Applying reorders the open plan: the page hands the flyout the same targets in the AI's order.
    const onApply = jest.fn(async () => {
      view.rerender(<AiPlanFlyout {...first} targets={[...first.targets].reverse()} />);
      return true;
    });
    view.rerender(<AiPlanFlyout {...first} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: 'Use this plan' }));
    await screen.findByText('Applied');
    expect(screen.queryByTestId('ai-stale')).toBeNull();
    expect((screen.getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('a target added after the answer still makes it out of date', async () => {
    const first = propsFor(fetching(reply(200, twoAnswer())));
    const view = render(<AiPlanFlyout {...first} />);
    await userEvent.setup().click(ask());
    await screen.findByTestId('ai-result');
    const more = starterTargets[2];
    view.rerender(<AiPlanFlyout {...first} targets={[...first.targets, { id: more.id, name: more.name, raHours: more.raHours, decDeg: more.decDeg }]} />);
    expect(screen.getByTestId('ai-stale').textContent).toBe('Out of date');
  });

  it('when the page refuses it the flyout says Not applied', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())), { onApply: jest.fn(async () => false) });
    render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    await user.click(screen.getByRole('button', { name: 'Use this plan' }));
    await screen.findByText('Not applied');
  });

  it('Ask again sends the request again and shows only the new answer', async () => {
    const f = jest.fn().mockResolvedValueOnce(reply(200, twoAnswer())).mockResolvedValueOnce(reply(200, twoAnswer({ plan: { exposures: [], plan: [twoSlots[0]], cut: [two[1].id], fitsAll: false, notes: '' } })));
    render(<AiPlanFlyout {...propsFor(f as unknown as typeof fetch)} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    await user.click(screen.getByRole('button', { name: 'Ask again' }));
    await waitFor(() => expect(screen.getByTestId('ai-cut').textContent).toBe(`Left out: ${two[1].name}`));
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

  it('keeps focus in the flyout: the page behind is inert, Tab wraps both ways, Escape works from the page body', async () => {
    const props = propsFor(fetching(reply(200, twoAnswer())));
    render(<div data-testid="page"><button type="button">behind</button></div>);
    const view = render(<AiPlanFlyout {...props} />);
    const user = userEvent.setup();
    await user.click(ask());
    await screen.findByTestId('ai-result');
    expect(screen.getByTestId('page').parentElement!.hasAttribute('inert')).toBe(true);
    const flyout = screen.getByTestId('ai-flyout');
    const close = within(flyout).getByRole('button', { name: 'Close' });
    close.focus();
    await user.tab();
    expect(flyout.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(close);
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(screen.getByTestId('page').parentElement!.hasAttribute('inert')).toBe(false);
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
    await user.click(screen.getByRole('checkbox', { name: 'Ask the AI to review' }));
    await user.click(ask());
    await screen.findByTestId('ai-result');
    expect(JSON.parse((f as unknown as jest.Mock).mock.calls[0][1].body).qualityReview).toBe(true);
  });
});
