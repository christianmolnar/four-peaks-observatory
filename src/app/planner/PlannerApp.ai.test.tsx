/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogObject } from '@/planner/catalog/openngc';
import { planNightWithAi } from '@/planner/ai/plan';
import { modeForMinutes } from '@/planner/ai/view';
import type { AiPlanResult } from '@/planner/ai/plan';
import { parseBody } from '@/planner/ai/request';
import type { AiPlanInput } from '@/planner/ai/facts';
import { clock, earliestSlot, night, planOf, validSlots } from '@/planner/ai/testkit';
import type { ModelPlan } from '@/planner/ai/schema';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { SELECTION_KEY, sampleProfile, saveMyPlan } from '@/planner/state';
import type { AuthState } from './authState';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, ready } from './testkit';

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

const panel = () => screen.getByRole('region', { name: 'PLAN MY NIGHT WITH AI' });
const go = () => within(panel()).getByRole('button', { name: 'Plan my night with AI' }) as HTMLButtonElement;
const status = () => screen.getByTestId('ai-status');
const result = () => screen.getByTestId('ai-result');
const slotsText = () => within(result()).getAllByRole('listitem').filter((li) => li.getAttribute('data-testid')?.startsWith('ai-slot-')).map((li) => li.textContent ?? '');
const myPlan = () => screen.getByRole('region', { name: /^MY PLAN/ });
const itinerary = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
const itinerarySlots = () => within(itinerary()).queryAllByRole('listitem').filter((li) => /^slot-s\d/.test(li.getAttribute('data-testid') ?? '') && !li.getAttribute('data-testid')!.startsWith('slot-time'));
const apply = () => within(panel()).getByRole('button', { name: 'Use this plan as my itinerary' }) as HTMLButtonElement;
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

describe('empty My plan', () => {
  it('disables the button and says why; nothing is sent', async () => {
    const f = fakeFetch(() => engine(null as never));
    mount(f.fn, { plan: [] });
    await ready();
    expect(go().disabled).toBe(true);
    expect(go().getAttribute('aria-describedby')).toBe('ai-plan-reason');
    expect(screen.getByTestId('ai-plan-reason').textContent).toBe('Add at least one target to My plan first.');
    fireEvent.click(go());
    expect(f.mock).not.toHaveBeenCalled();
  });

  it('a plan of only planets says the AI plans fixed objects', async () => {
    const f = fakeFetch(() => engine(null as never));
    mount(f.fn, { plan: ['planet-jupiter'] });
    await ready();
    expect(go().disabled).toBe(true);
    expect(screen.getByTestId('ai-plan-reason').textContent).toMatch(/not the Moon and planets/);
  });
});

describe('the request', () => {
  it('is the chosen night, site, horizon, minimum altitude, train and My plan in order, and the route accepts it', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn, { plan: ['ic405', 'm31'] });
    await ready();
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
    expect(screen.getByTestId('ai-inputs').textContent).toMatch(/^Will plan Tue 15 Dec at Fountain Hills, AZ, with C11 f\/10 \+ ASI2600MC Duo, minimum altitude 20°, and your horizon, for 2 targets from My plan\.$/);
  });

  it('uses the train that is selected, and a changed minimum altitude', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
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
    await ready();
    expect(screen.getByTestId('ai-left-out-note').textContent).toMatch(/1 solar-system body is left out/);
    await planned();
    expect(okInput(f.sent[0]).targets.map((t) => t.id)).toEqual(['m31', 'ic405']);
  });

  it('focus moves to Cancel while planning and comes back to the Plan button when it ends', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const f = fakeFetch(async (s) => { await gate; return engine(okInput(s)); });
    mount(f.fn);
    await ready();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    release();
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(document.activeElement).toBe(go());
  });

  it('focus returns to the Plan button after Cancel', async () => {
    const f = fakeFetch((s) => hang(s));
    mount(f.fn);
    await ready();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.activeElement).toBe(go()));
  });

  it('one key press on the focused button plans (keyboard operable)', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
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
    await ready();
    await planned();
    const rows = slotsText();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/^1\. Andromeda Galaxy \d\d:\d\d to \d\d:\d\d \(60 min\)/);
    expect(rows[0]).toMatch(/The AI wants about 60 min of light for this target\./);
    expect(rows[1]).toMatch(/Last slot, worth shooting: Enough frames to stack\./);
    expect(screen.getByTestId('ai-notes').textContent).toMatch(/the nebula goes first/);
    expect(screen.getByTestId('ai-checked').textContent).toMatch(/Checked by code against the sky facts/);
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
    await ready();
    await planned();
    const text = result().textContent ?? '';
    expect(text).not.toMatch(/subs of/);
    expect(text).not.toMatch(/\b\d+ (frames|subs)\b/);
    expect(text).not.toMatch(/\d+ s\b/);
    expect(text).not.toMatch(/the itinerary uses/);
    expect(within(result()).queryByTestId('ai-slot-calc-0')).toBeNull();
    expect(within(result()).getByTestId('ai-frames-note').textContent).toBe('Frame counts and sub lengths come from the exposure rules when you use this plan; they are not shown here.');
  });

  it('after apply the itinerary slots hold the plan\'s order and minutes', async () => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, validSlots(i))));
    mount(f.fn);
    await ready();
    const user = await planned();
    const planMinutes = slotsText().map((t) => Number(t.match(/\((\d+) min\)/)![1]));
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    expect(itinerarySlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. Andromeda Galaxy', '2. Flaming Star Nebula']);
    const saved = JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string);
    expect(saved.items.map((i: { mode: string }) => i.mode)).toEqual(planMinutes.map((m) => modeForMinutes(m)));
  });

  it('lists what was left out with why, and the checker\'s warning in plain words (no ids, no ISO times)', async () => {
    const f = fakeFetch((s) =>
      engine(okInput(s), (i) => {
        const slot = earliestSlot(i, 'ic405', night(i).start.getTime(), 60);
        return planOf(i, [['ic405', clock(slot.start, i.timeZone), clock(slot.end, i.timeZone)]]);
      }),
    );
    mount(f.fn);
    await ready();
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
    await ready();
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
    await ready();
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
    await ready();
    const user = userEvent.setup();
    await user.click(go());
    expect(status().textContent).toMatch(/^Planning Tue 15 Dec\. /);
    expect(status().getAttribute('aria-busy')).toBe('true');
    expect(go().disabled).toBe(true);
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
    await ready();
    const user = userEvent.setup();
    await user.click(go());
    expect(status().textContent).toMatch(/^Planning/);
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Remove Flaming Star Nebula from my plan' }));
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
    await ready();
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
    await ready();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/allowance for now\. Try again in about 25 minutes\./);
    expect(p.textContent).not.toMatch(/Hourly planner limit/);
    expect(within(p).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(p.getAttribute('role')).toBe('alert');
    expect(go().disabled).toBe(false);
  });

  it('503 says the AI planner is not available right now, without the route text', async () => {
    const f = fakeFetch(() => ({ status: 503, json: { error: 'ANTHROPIC_API_KEY is not set' } }));
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/The AI planner is not available right now/);
    expect(p.textContent).not.toMatch(/ANTHROPIC/);
  });

  it('502 offers Retry, and Retry sends the same request again', async () => {
    const f = fakeFetch((s, n) => (n === 1 ? { status: 502, json: { error: 'Model call failed: x' } } : engine(okInput(s))));
    mount(f.fn);
    await ready();
    const user = userEvent.setup();
    await user.click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/did not give a usable answer/);
    await user.click(within(p).getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1].body).toEqual(f.sent[0].body);
    expect(screen.queryByTestId('ai-problem')).toBeNull();
  });

  it('422 explains that there is no usable night', async () => {
    const f = fakeFetch(() => ({ status: 422, json: { error: 'No astronomical night on 2026-12-15' } }));
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/There is no usable night to plan.*Pick another night or site\./);
  });

  it('a network failure is said in words and offers Retry', async () => {
    const f = fakeFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/could not be reached\. Check your connection/);
    expect(within(p).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('a 200 that is not JSON (a proxy page) reads as an unreadable answer, not as a lost connection', async () => {
    const f = fakeFetch(() => ({ status: 200, unreadable: true }));
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    const p = await screen.findByTestId('ai-problem');
    expect(p.textContent).toMatch(/answer could not be read/);
    expect(p.textContent).not.toMatch(/could not be reached|connection/);
    expect(screen.queryByTestId('ai-result')).toBeNull();
  });

  it('a 400 does not tell the user to remove targets', async () => {
    const f = fakeFetch(() => ({ status: 400, json: { error: 'rig.camera must be a short string' } }));
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    const p = (await screen.findByTestId('ai-problem')).textContent ?? '';
    expect(p).toMatch(/could not accept this request/);
    expect(p).not.toMatch(/fewer targets|horizon/);
  });

  it('a 200 that is not a plan is an error, not a crash', async () => {
    const f = fakeFetch(() => ({ status: 200, json: { hello: 'world' } }));
    mount(f.fn);
    await ready();
    await userEvent.setup().click(go());
    expect((await screen.findByTestId('ai-problem')).textContent).toMatch(/answer could not be read/);
    expect(screen.queryByTestId('ai-result')).toBeNull();
  });

  it('a request that never answers is stopped after the time limit', async () => {
    jest.useFakeTimers({ advanceTimers: true });
    try {
      const f = fakeFetch(hang);
      mount(f.fn);
      await ready();
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
  it('is marked when My plan changes, and the marker names what changed', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    await planned();
    expect(screen.queryByTestId('ai-stale')).toBeNull();
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Move Andromeda Galaxy down' }));
    expect(screen.getByTestId('ai-stale').textContent).toBe('Out of date: you changed My plan after this plan was made. Plan again to match.');
    expect(apply().disabled).toBe(true);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/out of date/);
  });

  it('is marked when the train changes, and when the night changes', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
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
    await ready();
    await planned();
    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'second' } });
    expect(screen.getByTestId('ai-stale').textContent).toMatch(/you changed the site after/);
  });

  it('goes away when the user plans again', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    const user = await planned();
    fireEvent.click(within(myPlan()).getByRole('button', { name: 'Move Andromeda Galaxy down' }));
    expect(screen.getByTestId('ai-stale')).toBeTruthy();
    await user.click(go());
    await screen.findByTestId('ai-result', {}, { timeout: 20000 });
    expect(screen.queryByTestId('ai-stale')).toBeNull();
    expect(okInput(f.sent[1]).targets.map((t) => t.id)).toEqual(['ic405', 'm31']);
  });
});

describe('the owner\'s review switch', () => {
  it('is not there for a guest, and a guest\'s request never asks for a review', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    expect(within(panel()).queryByRole('checkbox')).toBeNull();
    await planned();
    expect(f.sent[0].body.qualityReview).toBeUndefined();
  });

  it('is not there for a signed-in visitor who is not the owner', async () => {
    mount(fakeFetch(() => engine(null as never)).fn, { auth: async () => ({ kind: 'signedIn', login: 'someone', owner: false }) });
    await ready();
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
    await ready();
    const box = (await within(panel()).findByRole('checkbox', { name: /review the plan/ })) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.setup().click(box);
    await planned();
    expect(f.sent[0].body.qualityReview).toBe(true);
    expect((f.sent[0].parsed as { qualityReview: boolean }).qualityReview).toBe(true);
    expect(screen.getByTestId('ai-quality').textContent).toMatch(/A sound order for the night\./);
  });
});

describe('Use this plan as my itinerary', () => {
  it('puts the slots into the itinerary section in time order, remembered like the rest of the itinerary', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    const user = await planned();
    expect(apply().disabled).toBe(false);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/replaces your night itinerary/);
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    expect(itinerarySlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. Andromeda Galaxy', '2. Flaming Star Nebula']);
    const saved = JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string);
    expect(saved.items.map((i: { targetId: string }) => i.targetId)).toEqual(['m31', 'ic405']);
    expect(saved.items[0].trainId).toBe('deep-c11-2600');
    expect(saved.items[0].note).toBe('From the AI plan, slot 1 of 2. The itinerary times it again with its own estimate.');
    expect(saved.startTime).toMatch(/^\d\d:\d\d$/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/^Done: your itinerary below now holds this plan.s order, first start time and, for each slot, the closest exposure mode to its length/);
    // The page's own itinerary start box shows the AI plan's first start.
    expect((within(itinerary()).getByLabelText('Imaging can start at') as HTMLInputElement).value).toBe(saved.startTime);
  });

  it('asks before it replaces an itinerary that has slots, and keeps theirs when they say no', async () => {
    const items = [{ id: 's1', targetId: 'ngc891', trainId: 'deep-c11-2600', filterId: null, mode: 'balanced', note: 'mine' }];
    window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 2, items, startTime: null }));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    const user = await planned();
    await user.click(apply());
    await waitFor(() => expect(screen.getByTestId('ai-apply-note').textContent).toBe('Your itinerary was left as it was.'));
    expect(confirm).toHaveBeenCalledWith('Replace your itinerary (1 slot) with the AI plan?');
    expect(itinerarySlots().map((li) => li.querySelector('h3')!.textContent)).toEqual(['1. NGC 891']);
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string).items).toHaveLength(1);
    confirm.mockReturnValue(true);
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    expect(JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string).items.map((i: { targetId: string }) => i.targetId)).toEqual(['m31', 'ic405']);
  });

  it.each([
    ['2 targets', ['m31', 'ic405'], 50],
    ['6 targets', ['m31', 'ic405', 'm33', 'm42', 'ngc1499', 'ngc2264'], 25],
  ])('%s: the itinerary keeps the AI order and first start, never prints AI times beside its own, and says the times are not kept', async (_name, plan, len) => {
    const f = fakeFetch((s) => engine(okInput(s), (i) => planOf(i, validSlots(i, len))));
    mount(f.fn, { plan });
    await ready();
    const user = await planned();
    expect(apply().disabled).toBe(false);
    const aiSlots = slotsText();
    expect(aiSlots).toHaveLength(plan.length);
    const aiTimes = aiSlots.map((t) => t.match(/(\d\d:\d\d) to (\d\d:\d\d)/)!.slice(1, 3));
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/times will not match the plan above/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/code check above covers the AI.s times, not the itinerary.s: the itinerary shows its own flip and window notes/);
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(plan.length));
    // The order and the first start are the AI's.
    const saved = JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string);
    expect(saved.items.map((i: { targetId: string }) => i.targetId)).toEqual(plan);
    expect(saved.startTime).toBe(aiTimes[0][0]);
    // The itinerary shows its own estimated times; where they differ from the AI's, no item note carries the AI's.
    const shown = plan.map((_, k) => screen.getByTestId(`slot-time-${k}`).textContent ?? '');
    expect(shown.every((t) => /\(estimate\)/.test(t))).toBe(true);
    for (const item of saved.items as { note: string }[]) expect(item.note).not.toMatch(/\d\d:\d\d|\d min/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/does not keep the AI.s slot times or exact lengths/);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/code check above covers the AI.s times, not the itinerary.s/);
    // The print sheet prints what the itinerary shows.
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

  it('the print sheet carries the plan because the itinerary now holds it', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    const user = await planned();
    await user.click(apply());
    await waitFor(() => expect(itinerarySlots()).toHaveLength(2));
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const sheet = screen.getByTestId('print-sheet');
    expect(within(sheet).getByText('Night itinerary')).toBeTruthy();
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
    await ready();
    await planned();
    expect(apply().disabled).toBe(true);
    expect(screen.getByTestId('ai-apply-note').textContent).toMatch(/optical train/);
  });
});

describe('the My plan links', () => {
  it('My plan\'s header links to the panel, beside "Plan an itinerary"', async () => {
    const f = fakeFetch((s) => engine(okInput(s)));
    mount(f.fn);
    await ready();
    expect(within(myPlan()).getByRole('link', { name: 'Plan my night with AI' }).getAttribute('href')).toBe('#ai-plan-heading');
    expect(within(myPlan()).getByRole('link', { name: 'Plan an itinerary' }).getAttribute('href')).toBe('#itinerary-heading');
    expect(document.getElementById('ai-plan-heading')).not.toBeNull();
  });
});
