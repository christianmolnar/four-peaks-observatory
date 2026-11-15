/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { planNightWithAi } from '@/planner/ai/plan';
import type { AiPlanResult } from '@/planner/ai/plan';
import { parseBody } from '@/planner/ai/request';
import type { AiPlanInput } from '@/planner/ai/facts';
import { clock, earliestSlot, night, planOf, validSlots } from '@/planner/ai/testkit';
import type { ModelPlan } from '@/planner/ai/schema';
import { SELECTION_KEY, sampleProfile, saveMyPlan } from '@/planner/state';
import type { AuthState } from './authState';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, ready, storedPlan, timelineSlots } from './testkit';

// The AI night plan panel on the whole page. The fetch is a fake; the "model" is a fake behind the real engine, so the answer
// is a real-shaped result (checked by the real checker) for the night and targets the page actually sent.

type Body = Record<string, unknown>;
interface Sent {
  body: Body;
  signal: AbortSignal;
  parsed: ReturnType<typeof parseBody>;
}
interface Reply {
  status: number;
  json?: unknown;
  headers?: Record<string, string>;
  /** The body cannot be read. */
  unreadable?: boolean;
}

const reply = (r: Reply) => ({
  ok: r.status >= 200 && r.status < 300,
  status: r.status,
  headers: { get: (k: string) => r.headers?.[k] ?? null },
  json: async () => {
    if (r.unreadable) throw new SyntaxError('Unexpected token');
    return JSON.parse(JSON.stringify(r.json));
  },
});

/** A fake model behind the real engine: valid slots for every target, or what `make` returns. */
const engine = async (input: AiPlanInput, make?: (i: AiPlanInput) => ModelPlan, qualityReview = false): Promise<Reply> => {
  const plan = make ? make(input) : planOf(input, validSlots(input));
  const result: AiPlanResult = await planNightWithAi(input, { callModel: async () => JSON.stringify(plan), qualityReview });
  return { status: 200, json: result };
};

/** The page's fetch: records every request (and checks it with the route's own parseBody), then answers with `answer`. */
function fakeFetch(answer: (sent: Sent, n: number) => Promise<Reply> | Reply) {
  const sent: Sent[] = [];
  const fn = jest.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe('/api/planner/ai-plan');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Body;
    const s: Sent = { body, signal: init.signal as AbortSignal, parsed: parseBody(body) };
    sent.push(s);
    return reply(await answer(s, sent.length)) as unknown as Response;
  });
  return { fn: fn as unknown as typeof fetch, sent, mock: fn };
}
const okInput = (s: Sent): AiPlanInput => {
  if (typeof s.parsed === 'string') throw new Error(`The page sent a request the route refuses: ${s.parsed}`);
  return s.parsed.input;
};
/** A request that waits until it is aborted, as a real fetch does. */
const hang = (s: Sent) =>
  new Promise<Reply>((_, reject) => s.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));

const OBJECTS: CatalogObject[] = [
  { id: 'ngc891', name: 'NGC 891', type: 'galaxy', raHours: 2.37, decDeg: 42.35, majorArcmin: 13, minorArcmin: 3, mag: 10, surfaceBrightness: 24.1, constellation: 'And' },
];
const ownerAuth = async (): Promise<AuthState> => ({ kind: 'signedIn', login: 'owner', owner: true });
const guestAuth = async (): Promise<AuthState> => ({ kind: 'signedOut' });

const mount = (ai: typeof fetch, { plan = ['m31', 'ic405'], auth = guestAuth, profile = sampleProfile() }: { plan?: string[]; auth?: () => Promise<AuthState>; profile?: ReturnType<typeof sampleProfile> } = {}) => {
  if (plan.length > 0) saveMyPlan(window.localStorage, plan);
  const catalog = fakeCatalog(OBJECTS);
  const worker = fakeWorkerRanker(catalog.load, { hold: false });
  return render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} rank={worker.rank} loadCatalogIndex={catalog.load} aiFetch={ai} loadAuth={auth} />);
};

const panel = () => screen.getByRole('dialog', { name: 'PLAN MY NIGHT WITH AI' });
const trigger = () => within(screen.getByRole('region', { name: /^PLAN:/ })).getByRole('button', { name: 'Plan my night with AI' }) as HTMLButtonElement;
/** Waits for the page, then opens the flyout from the plan's own button. */
const readyOpen = async () => {
  await ready();
  fireEvent.click(trigger());
};
/** The button that asks the AI: "Ask the AI to order and time N targets" first, "Ask again" after an answer or an error. */
const go = () => (within(panel()).queryByRole('button', { name: /^Ask the AI to order and time/ }) ?? within(panel()).getByRole('button', { name: 'Ask again' })) as HTMLButtonElement;
const problemText = () => screen.getByTestId('ai-problem').textContent ?? '';
const status = () => screen.getByTestId('ai-status');
const result = () => screen.getByTestId('ai-result');
const slotsText = () => within(result()).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('ai-slot-')).map((li) => li.textContent ?? '');
const myPlan = () => screen.getByRole('region', { name: /^PLAN:/ });
const timeline = () => document.getElementById('night-timeline-body') as HTMLElement;
const itinerarySlots = timelineSlots;
const apply = () => within(panel()).getByRole('button', { name: 'Use this plan' }) as HTMLButtonElement;
const planned = async () => {
  const user = userEvent.setup();
  await user.click(go());
  await screen.findByTestId('ai-result', {}, { timeout: 20000 });
  return user;
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('empty plan', () => {
  it('disables the button and says why; nothing is sent', async () => {
    const f = fakeFetch(() => engine(null as never));
    mount(f.fn, { plan: [] });
    await readyOpen();
    expect(go().disabled).toBe(true);
    expect(go().getAttribute('aria-describedby')).toBe('ai-plan-reason');
    expect(screen.getByTestId('ai-plan-reason').textContent).toBe('Add at least one target to the plan first.');
    fireEvent.click(go());
    expect(f.mock).not.toHaveBeenCalled();
  });

  it('a plan of only planets says the AI plans fixed objects', async () => {
    const f = fakeFetch(() => engine(null as never));
    mount(f.fn, { plan: ['planet-jupiter'] });
    await readyOpen();
    expect(go().disabled).toBe(true);
    expect(screen.getByTestId('ai-plan-reason').textContent).toMatch(/not the Moon and planets/);
  });
});

describe('the request', () => {
  it('is the chosen night, site, horizon, minimum altitude, train and the plan in order, and the route accepts it', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { plan: ['ic405', 'm31'] });
    await readyOpen();
    await planned();
    expect(f.sent).toHaveLength(1);
    const input = okInput(f.sent[0]);
    expect(input.targets.map((t) => t.id)).toEqual(['ic405', 'm31']); // the user's order, not the score's
    expect(input.date).toBe('2026-12-15');
    expect(input.site.latitude).toBeCloseTo(33.6, 0);
    expect(input.timeZone).toBe('America/Phoenix');
    expect(input.minAltitude).toBe(20);
    expect(input.horizon && input.horizon.length > 1).toBe(true); // the sample site's blocked zones
    expect(input.rig?.focalLengthMm).toBeGreaterThan(0); // the selected train
    expect(f.sent[0].body.qualityReview).toBeUndefined();
    expect(f.sent[0].body.startTime).toBeUndefined();
    const inputs = screen.getByTestId('ai-inputs').textContent ?? '';
    expect(inputs).toMatch(/Night: Astronomical night \d\d:\d\d to \d\d:\d\d \(\d+\.\d h\), Moon \d+% lit at mid-night\./);
    expect(inputs).toContain('Site: Fountain Hills, AZ, minimum altitude 20°.');
    expect(inputs).toMatch(/Horizon: blocked \d+° \(\w+\) to \d+° \(\w+\), \d+° high/);
    expect(inputs).toContain('Train: C11 f/10 + ASI2600MC Duo.');
    expect(inputs).toContain("2 targets, in the plan's order: Flaming Star Nebula (Balanced), Andromeda Galaxy (Balanced).");
  });

  it('uses the train that is selected, and a changed minimum altitude', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'deep-c11-reducer-533' } });
    fireEvent.change(screen.getByLabelText(/^Minimum altitude \(deg\)/), { target: { value: '35' } });
    await planned();
    const input = okInput(f.sent[0]);
    expect(input.minAltitude).toBe(35);
    expect(input.rig?.camera).toMatch(/533/);
  });

  it('leaves planets out of the request and says so', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { plan: ['m31', 'planet-jupiter', 'ic405'] });
    await readyOpen();
    expect(screen.getByTestId('ai-left-out-note').textContent).toMatch(/1 solar-system body is left out/);
    await planned();
    expect(okInput(f.sent[0]).targets.map((t) => t.id)).toEqual(['m31', 'ic405']);
  });

  it('focus moves to Cancel while planning and to the flyout heading when the answer is in', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const f = fakeFetch(async (s) => { await gate; return engine(okInput(s)); });
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    release();
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(document.activeElement).toBe(within(panel()).getByRole('heading', { level: 2 }));
  });

  it('focus goes to the flyout heading after Cancel', async () => {
    const f = fakeFetch((s) => hang(s));
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(within(panel()).getByRole('heading', { level: 2 })));
  });

  it('one key press on the focused button plans (keyboard operable)', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(f.mock).toHaveBeenCalledTimes(1);
  });
});

describe('the result', () => {
  it('shows the slots with times and minutes, the AI\'s words, what was checked and what the AI decided, and the night graph', async () => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => ({ ...planOf(i, validSlots(i)), notes: 'Both are high before midnight; the nebula goes first while the Moon is down.' })));
    mount(f.fn);
    await readyOpen();
    await planned();
    const rows = slotsText();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^1\. Andromeda Galaxy \d\d:\d\d to \d\d:\d\d \(60 min, Balanced\)/);
    expect(rows[0]).toMatch(/The AI wants about 60 min of light for this target\./);
    expect(rows[1]).toMatch(/Last slot, worth shooting: Enough frames to stack\./);
    expect(screen.getByTestId('ai-notes').textContent).toMatch(/the nebula goes first/);
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/^Passed\. Every slot is above your minimum altitude/);
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/The AI decided the order, the times, how long each target gets and the reasons/);
    expect(status().textContent).toBe('Plan ready for Tue 15 Dec: 2 targets planned, 0 left out. Checked by code.');
    expect(status().getAttribute('aria-live')).toBe('polite');
    // The page's own night graph, drawn for these slots.
    expect(within(result()).getByRole('img', { name: /Altitude through the night/ })).toBeTruthy();
    expect(within(result()).getByText('Left out (0)')).toBeTruthy();
  });

  it('shows no frame count, sub length or preset total on the card, and says where they come from', async () => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, validSlots(i))));
    mount(f.fn);
    await readyOpen();
    await planned();
    const text = result().textContent ?? '';
    expect(text).not.toMatch(/subs of/);
    expect(text).not.toMatch(/\b\d+ (frames|subs)\b/);
    expect(text).not.toMatch(/\d+ s\b/);
    expect(text).not.toMatch(/the itinerary uses|itinerary/i);
    expect(within(result()).queryByTestId('ai-slot-calc-0')).toBeNull();
    expect(within(result()).getByTestId('ai-frames-note').textContent).toBe('Frame counts and sub lengths come from the exposure rules when you use this plan; they are not shown here.');
  });

  it('after apply the plan\'s slots hold the AI plan\'s order and every target keeps the preset it had', async () => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, validSlots(i))));
    mount(f.fn);
    await readyOpen();
    // The user chose Deep for the nebula before asking; the AI's minutes do not change that choice.
    fireEvent.click(within(screen.getByRole('group', { name: 'Exposure preset for Flaming Star Nebula' })).getByRole('button', { name: 'Deep' }));
    const user = await planned();
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    expect(itinerarySlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. Andromeda Galaxy', '2. Flaming Star Nebula']);
    expect(storedPlan()!.targets.map((t) => [t.id, t.preset])).toEqual([['m31', 'balanced'], ['ic405', 'deep']]);
  });

  it('lists what was left out with why, and the checker\'s warning in plain words (no ids, no ISO times)', async () => {
    const f = fakeFetch((s) =>
      engine(okInput(s), (i) => {
        const slot = earliestSlot(i, 'ic405', night(i).start.getTime(), 60);
        return planOf(i, [['ic405', clock(slot.start, i.timeZone), clock(slot.end, i.timeZone)]]);
      }),
    );
    mount(f.fn);
    await readyOpen();
    await planned();
    const cut = screen.getByTestId('ai-cut').textContent ?? '';
    expect(cut).toMatch(/^Andromeda Galaxy\./);
    expect(cut).toMatch(/The AI (left it out|judged it did not fit)/);
    const checker = screen.getByTestId('ai-checker').textContent ?? '';
    expect(checker).toMatch(/NoteAndromeda Galaxy is cut, but it is usable for \d+ min in free night time \(\d\d:\d\d-\d\d:\d\d\)/);
    expect(checker).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(checker).not.toMatch(/\bm31\b/);
    expect(status().textContent).toMatch(/1 target planned, 1 left out/);
  });

  it('says in plain words when a slot crosses the meridian (a flip)', async () => {
    const f = fakeFetch(async (s) => {
      const r = await engine(okInput(s));
      (r.json as { flips: number }).flips = 1;
      return r;
    });
    mount(f.fn);
    await readyOpen();
    await planned();
    expect(screen.getByTestId('ai-checker').textContent).toMatch(/1 slot crosses the meridian, so the mount flips during it\./);
  });

  it('a plan the checker could not clear is shown as not fully checked, with its problems, and cannot be applied', async () => {
    const f = fakeFetch((s) =>
      engine(okInput(s), (i) => {
        const bad = validSlots(i);
        bad[1] = [bad[1][0], bad[0][1], bad[0][2]]; // overlaps the first
        return planOf(i, bad);
      }),
    );
    mount(f.fn);
    await readyOpen();
    await planned();
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/^Not fully checked/);
    expect(screen.getByTestId('ai-checker').textContent).toMatch(/Problem/);
    expect(status().textContent).toMatch(/Not fully checked/);
    expect(apply().disabled).toBe(true);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/not fully checked/);
  });
});

describe('states', () => {
  it('loading announces itself, offers Cancel, and Cancel stops the request and leaves the page usable', async () => {
    const f = fakeFetch(hang);
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    await user.click(go());
    expect(status().textContent).toMatch(/^Planning Tue 15 Dec\. /);
    expect(status().getAttribute('aria-busy')).toBe('true');
    expect(within(panel()).queryByRole('button', { name: /^Ask/ })).toBeNull(); // one request at a time
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    expect(f.sent[0].signal.aborted).toBe(true);
    expect(status().textContent).toBe('Cancelled. Nothing was changed.');
    expect(within(panel()).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(go().disabled).toBe(false);
    expect(screen.queryByTestId('ai-problem')).toBeNull();
  });

  it('a change of My plan while it works drops the answer, says so, and a late answer shows nothing', async () => {
    let late: (r: Reply) => void = () => {};
    const f = fakeFetch(
      (s) =>
        new Promise<Reply>((resolve) => {
          late = resolve;
          s.signal.addEventListener('abort', () => undefined);
        }),
    );
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    await user.click(go());
    expect(status().textContent).toMatch(/^Planning/);
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Remove Flaming Star Nebula from the plan' }));
    await waitFor(() => expect(status().textContent).toMatch(/You changed something while the AI was working, so its answer was dropped/));
    expect(f.sent[0].signal.aborted).toBe(true);
    await act(async () => {
      late(await engine(okInput(f.sent[0])));
    });
    expect(screen.queryByTestId('ai-result')).toBeNull();
    expect(go().disabled).toBe(false);
  });

  it('a new request after cancelling is sent clean and shows only its own answer', async () => {
    const f = fakeFetch((s, n) => (n === 1 ? hang(s) : engine(okInput(s))));
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    await user.click(go());
    await user.click(within(panel()).getByRole('button', { name: 'Cancel' }));
    await user.click(go());
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(f.sent).toHaveLength(2);
    expect(status().textContent).toMatch(/^Plan ready/);
  });

  it('429 says when to try again from Retry-After', async () => {
    const f = fakeFetch(() => ({ status: 429, json: { error: 'Hourly planner limit reached' }, headers: { 'Retry-After': '1500' } }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/allowance for now\. Try again in about 25 minutes\./);
    expect(p.textContent).not.toMatch(/Hourly planner limit/);
    expect(within(panel()).queryByRole('button', { name: 'Ask again' })).toBeNull(); // asking again now would only be refused
    expect(p.getAttribute('role')).toBe('alert');
  });

  it('503 says the AI planner is not available right now, without the route text', async () => {
    const f = fakeFetch(() => ({ status: 503, json: { error: 'ANTHROPIC_API_KEY is not set' } }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/The AI planner is not available right now/);
    expect(p.textContent).not.toMatch(/ANTHROPIC/);
  });

  it('502 offers Ask again, and it sends the same request again', async () => {
    const f = fakeFetch((s, n) => (n === 1 ? { status: 502, json: { error: 'Model call failed: x' } } : engine(okInput(s))));
    mount(f.fn);
    await readyOpen();
    const user = userEvent.setup();
    await user.click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/did not give a usable answer/);
    await user.click(within(panel()).getByRole('button', { name: 'Ask again' }));
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].body).toEqual(f.sent[0].body);
    expect(screen.queryByTestId('ai-problem')).toBeNull();
  });

  it('422 explains that there is no usable night', async () => {
    const f = fakeFetch(() => ({ status: 422, json: { error: 'No astronomical night on 2026-12-15' } }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/There is no usable night to plan.*Pick another night or site\./);
  });

  it('a network failure is said in words and offers Ask again', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/could not be reached\. Check your connection/);
    expect(within(panel()).getByRole('button', { name: 'Ask again' })).toBeTruthy();
  });

  it('a 200 that is not JSON (a proxy page) reads as an unreadable answer, not as a lost connection', async () => {
    const f = fakeFetch(() => ({ status: 200, unreadable: true }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/answer could not be read/);
    expect(p.textContent).not.toMatch(/could not be reached|connection/);
    expect(screen.queryByTestId('ai-result')).toBeNull();
  });

  it('a 400 does not tell the user to remove targets', async () => {
    const f = fakeFetch(() => ({ status: 400, json: { error: 'rig.camera must be a short string' } }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    const p = (await screen.findByTestId('ai-problem')).textContent ?? '';
    expect(p).toMatch(/could not accept this request/);
    expect(p).not.toMatch(/fewer targets|horizon/);
  });

  it('a 200 that is not a plan is an error, not a crash', async () => {
    const f = fakeFetch(() => ({ status: 200, json: { hello: 'world' } }));
    mount(f.fn);
    await readyOpen();
    await userEvent.setup().click(go());
    expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/answer could not be read/);
    expect(screen.queryByTestId('ai-result')).toBeNull();
  });

  it('a request that never answers is stopped after the time limit', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const f = fakeFetch(hang);
      mount(f.fn);
      await readyOpen();
      fireEvent.click(go());
      expect(status().textContent).toMatch(/^Planning/);
      await act(async () => {
        jest.advanceTimersByTime(131_000);
      });
      expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/took too long and was stopped/);
      expect(go().disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('a stale plan', () => {
  it('is marked when the plan changes, and the marker names what changed', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    await planned();
    expect(screen.queryByTestId('ai-stale')).toBeNull();
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Remove Andromeda Galaxy from the plan' }));
    expect(screen.getByTestId('ai-stale').textContent).toBe('Out of date: you changed the plan after this plan was made. Ask again to match.');
    expect(apply().disabled).toBe(true);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/out of date/);
  });

  it('is marked when the train changes, and when the night changes', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    await planned();
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'deep-c11-reducer-533' } });
    expect(screen.getByTestId('ai-stale').textContent).toMatch(/you changed the train after/);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-12-16' } });
    expect(screen.getByTestId('ai-stale').textContent).toMatch(/you changed the night and the train after/);
  });

  it('is marked when the site changes', async () => {
    const profile = sampleProfile();
    const second = { ...profile.sites[0], id: 'second', name: 'Second site', latitude: 34.5, longitude: -112.2 };
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { profile: { ...profile, sites: [...profile.sites, second] } });
    await readyOpen();
    await planned();
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'second' } });
    expect(screen.getByTestId('ai-stale').textContent).toMatch(/you changed the site after/);
  });

  it('goes away when the user plans again', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    const user = await planned();
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Remove Andromeda Galaxy from the plan' }));
    expect(screen.getByTestId('ai-stale')).toBeTruthy();
    await user.click(go());
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(screen.queryByTestId('ai-stale')).toBeNull();
    expect(okInput(f.sent[1]).targets.map((t) => t.id)).toEqual(['ic405']);
  });
});

describe('the owner\'s review switch', () => {
  it('is not there for a guest, and a guest\'s request never asks for a review', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    expect(within(panel()).queryByRole('checkbox')).toBeNull();
    await planned();
    expect(f.sent[0].body.qualityReview).toBeUndefined();
  });

  it('is not there for a signed-in visitor who is not the owner', async () => {
    mount(fakeFetch(() => engine(null as never)).fn, { auth: async () => ({ kind: 'signedIn', login: 'someone', owner: false }) });
    await readyOpen();
    await act(async () => {});
    expect(within(panel()).queryByRole('checkbox')).toBeNull();
  });

  it('is there for the owner, off by default, and when ticked the request asks for the review and the answer shows it', async () => {
    const f = fakeFetch(async (s) => {
      const input = okInput(s);
      const plan = planOf(input, validSlots(input));
      const calls: string[] = [];
      const result = await planNightWithAi(input, {
        qualityReview: (s.parsed as { qualityReview: boolean }).qualityReview,
        callModel: async (m) => {
          calls.push(m[m.length - 1].content);
          return calls.length === 1 ? JSON.stringify(plan) : JSON.stringify({ good: true, verdict: 'A sound order for the night.' });
        },
      });
      return { status: 200, json: result };
    });
    mount(f.fn, { auth: ownerAuth });
    await readyOpen();
    const box = (await within(panel()).findByRole('checkbox', { name: /review the plan/ })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.setup().click(box);
    await planned();
    expect(f.sent[0].body.qualityReview).toBe(true);
    expect((f.sent[0].parsed as { qualityReview: boolean }).qualityReview).toBe(true);
    expect(screen.getByTestId('ai-quality').textContent).toMatch(/A sound order for the night\./);
  });
});

describe('Use this plan', () => {
  it('puts the AI plan\'s order, presets and first start into the open plan, saved like the rest of the plan', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    const user = await planned();
    expect(apply().disabled).toBe(false);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/^This sets the open plan.s order and first start time, replacing the earlier times\. Each target keeps its own exposure/);
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    expect(itinerarySlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. Andromeda Galaxy', '2. Flaming Star Nebula']);
    const plan = storedPlan()!;
    expect(plan.targets.map((t) => t.id)).toEqual(['m31', 'ic405']);
    expect(plan.trainId).toBe('deep-c11-2600'); // the plan's own train is not changed
    expect(plan.targets.every((t) => t.note === undefined)).toBe(true); // the AI's slot notes are not written over the user's own
    expect(plan.startTime).toMatch(/^\d\d:\d\d$/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/^Done: the open plan now has this order and first start time\. Each target keeps its own exposure/);
    // The plan's own start box shows the AI plan's first start.
    expect((within(timeline()).getByLabelText('Imaging can start at') as HTMLInputElement).value).toBe(plan.startTime);
    expect(document.body.textContent).not.toMatch(/itinerary/i);
  });

  it('keeps the targets the AI left out (here a planet), after the ones it placed, with their own preset and note', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { plan: ['m31', 'planet-jupiter', 'ic405'] });
    await readyOpen();
    const user = await planned();
    await user.click(apply());
    await waitFor(() => expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/^Done:/));
    expect(storedPlan()!.targets.map((t) => t.id)).toEqual(['m31', 'ic405', 'planet-jupiter']);
    expect(storedPlan()!.targets[2]).toEqual({ id: 'planet-jupiter', preset: 'balanced' }); // untouched
  });

  it.each([
    ['2 targets', ['m31', 'ic405'], 50],
    ['6 targets', ['m31', 'ic405', 'm33', 'm42', 'ngc1499', 'ngc2264'], 25],
  ])('%s: the plan keeps the AI order and first start, never prints AI times beside its own, and says the times are not kept', async (_name, plan, len) => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, validSlots(i, len))));
    mount(f.fn, { plan });
    await readyOpen();
    const user = await planned();
    expect(apply().disabled).toBe(false);
    const aiSlots = slotsText();
    expect(aiSlots).toHaveLength(plan.length);
    const aiTimes = aiSlots.map((t) => t.match(/(\d\d:\d\d) to (\d\d:\d\d)/)!.slice(1, 3));
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/its times can differ from the AI.s/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/code check covers the AI.s times, not the timeline.s: the timeline shows its own flip and window notes/);
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(plan.length));
    // The order and the first start are the AI's.
    const saved = storedPlan()!;
    expect(saved.targets.map((t) => t.id).sort()).toEqual([...plan].sort());
    expect(saved.startTime).toBe(aiTimes[0][0]);
    // The timeline shows its own estimated times; where they differ from the AI's, no target note carries the AI's.
    const shown = plan.map((_, k) => screen.getByTestId(`slot-time-${k}`).textContent ?? '');
    expect(shown.every((t) => /\(estimate\)/.test(t))).toBe(true);
    for (const t of saved.targets) expect(t.note ?? '').not.toMatch(/\d\d:\d\d|\d min/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/its times can differ from the AI.s/);
    // The print sheet prints what the timeline shows.
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const sheetText = screen.getByTestId('print-sheet').textContent ?? '';
    for (const t of shown) {
      const [a, b] = t.match(/(\d\d:\d\d) to (\d\d:\d\d)/)!.slice(1, 3);
      expect(sheetText).toContain(a);
      expect(sheetText).toContain(b);
    }
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });

  it('the print sheet carries the plan because the night timeline now holds it', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await readyOpen();
    const user = await planned();
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getByText('Night timeline')).toBeTruthy();
    expect(sheet.textContent).toMatch(/Andromeda Galaxy/);
    expect(sheet.textContent).toMatch(/Flaming Star Nebula/);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });

  it('is not offered for a smart scope, which plans its own exposures', async () => {
    const profile = sampleProfile();
    const smart = profile.trains.find((t) => t.kind === 'smart')!;
    expect(smart).toBeDefined();
    window.localStorage.setItem(SELECTION_KEY, JSON.stringify({ siteId: profile.sites[0].id, trainId: smart.id }));
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { profile });
    await readyOpen();
    await planned();
    expect(apply().disabled).toBe(true);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/optical train/);
  });
});

describe('the plan and the AI flyout', () => {
  it('"Plan my night with AI" is a button in the open plan; the flyout is closed until it is pressed and there is no AI panel on the page', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('region', { name: 'PLAN MY NIGHT WITH AI' })).toBeNull();
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(panel()).toBeTruthy();
    expect(f.mock).not.toHaveBeenCalled(); // opening asks nothing
    await planned();
    expect(okInput(f.sent[0]).targets.map((t) => t.id)).toEqual(['m31', 'ic405']);
  });

  it('Close leaves the plan exactly as it was, returns the keyboard to the button, and a new opening starts at step 1', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    const before = JSON.stringify(storedPlan());
    fireEvent.click(trigger());
    const user = await planned();
    await user.click(within(panel()).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
    expect(JSON.stringify(storedPlan())).toBe(before);
    fireEvent.click(trigger());
    expect(screen.getByTestId('ai-step-1').getAttribute('data-state')).toBe('now');
    expect(screen.queryByTestId('ai-result')).toBeNull();
  });

  it('nothing in the plan changes before Use this plan; Use this plan replaces the earlier start time and the AI order stays (no other control reorders it)', async () => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, [...validSlots(i)].reverse())));
    mount(f.fn, { plan: ['m31', 'ic405'] });
    await ready();
    const user = userEvent.setup();
    // The plan had an earlier start time.
    await user.type(within(timeline()).getByLabelText('Imaging can start at'), '{Control>}a{/Control}2300{Enter}');
    expect(storedPlan()!.startTime).toBe('23:00');
    const before = JSON.stringify(storedPlan());
    fireEvent.click(trigger());
    await user.click(go());
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(JSON.stringify(storedPlan())).toBe(before);
    await user.click(apply());
    await waitFor(() => expect(storedPlan()!.startTime).not.toBe('23:00'));
    const after = storedPlan()!;
    expect(after.targets.map((t) => t.id)).toEqual(slotsText().map((t) => (t.includes('Andromeda') ? 'm31' : 'ic405')));
    // The itinerary's own "Use this order" is gone, so nothing puts the order back.
    expect(screen.queryByRole('button', { name: 'Use this order' })).toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(storedPlan()!.targets.map((t) => t.id)).toEqual(after.targets.map((t) => t.id));
  });
});
