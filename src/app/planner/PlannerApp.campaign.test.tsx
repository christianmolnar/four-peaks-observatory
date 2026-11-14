/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MAX_NIGHTS, planCampaign } from '@/planner/campaign';
import type { CampaignInput, CampaignResult } from '@/planner/campaign';
import { answerCampaign } from '@/planner/campaign/handler';
import type { CampaignRequest, CampaignResponse } from '@/planner/campaign/handler';
import type { CampaignWorkerLike } from '@/planner/campaign/run';
import { modeForMinutes } from '@/planner/ai/view';
import { ITINERARY_KEY } from '@/planner/itinerary';
import { arcToHorizonPoints } from '@/planner/profile';
import { sampleProfile, saveMyPlan } from '@/planner/state';
import type { AuthState } from './authState';
import PlannerApp from './PlannerApp';
import { fakeCatalog, fakeWorkerRanker, ready } from './testkit';

// The several-night panel on the whole page. The worker is a fake that runs the engine's own handler, so every answer is the real
// `planCampaign` result for the request the page actually sent; the request is recorded and checked against the engine's types.

type Profile = ReturnType<typeof sampleProfile>;

/** A worker the page can use: records every request, and answers with the real engine, at once or when `release` is called. */
function fakeCampaignWorker({ hold = false, respond = answerCampaign }: { hold?: boolean; respond?: (m: CampaignRequest) => CampaignResponse | 'crash' } = {}) {
  const requests: CampaignRequest[] = [];
  const held: (() => void)[] = [];
  let terminated = 0;
  let created = 0;
  const createWorker = (): CampaignWorkerLike => {
    created++;
    const w: CampaignWorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => { terminated++; },
      postMessage: (m) => {
        requests.push(m);
        const r = respond(m);
        const deliver = () => (r === 'crash' ? w.onerror?.({ message: 'boom' }) : w.onmessage?.({ data: r }));
        if (hold) held.push(deliver);
        else setTimeout(deliver, 0);
      },
    };
    return w;
  };
  return {
    createWorker,
    requests,
    created: () => created,
    terminated: () => terminated,
    release: async () => {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
        held.splice(0).forEach((f) => f());
      });
    },
    sent: (): CampaignInput => {
      if (requests.length === 0) throw new Error('The page sent nothing to the engine');
      return requests[requests.length - 1].input;
    },
  };
}
type Worker = ReturnType<typeof fakeCampaignWorker>;

const SAMPLE_ARCS = [{ startAz: 120, endAz: 320, heightDeg: 42 }];
const DATE = '2026-11-14';
const THREE = ['m42', 'ngc1499', 'm81'];
const SIX = ['m42', 'ngc1499', 'm81', 'm31', 'm33', 'ngc2237'];

const mount = (worker: Worker, { plan = THREE, profile = sampleProfile(), date = DATE }: { plan?: string[]; profile?: Profile; date?: string } = {}) => {
  if (plan.length > 0) saveMyPlan(window.localStorage, plan);
  const catalog = fakeCatalog();
  const ranker = fakeWorkerRanker(catalog.load, { hold: false });
  return render(<PlannerApp initialDate={date} initialProfile={profile} rank={ranker.rank} loadCatalogIndex={catalog.load} campaignWorker={worker.createWorker} loadAuth={async (): Promise<AuthState> => ({ kind: 'signedOut' })} />);
};

const clock = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Phoenix' });
const hhmm = (d: Date) => clock.format(d);

const panel = () => screen.getByRole('region', { name: 'PLAN SEVERAL NIGHTS' });
const go = () => within(panel()).getByRole('button', { name: /^Plan \d+ nights?$/ }) as HTMLButtonElement;
const status = () => screen.getByTestId('campaign-status');
const resultBox = () => screen.getByTestId('campaign-result');
const itinerary = () => screen.getByRole('region', { name: 'NIGHT ITINERARY' });
const itinerarySlots = () => within(itinerary()).queryAllByRole('listitem').filter((li) => /^slot-s\d/.test(li.getAttribute('data-testid') ?? '') && !li.getAttribute('data-testid')!.startsWith('slot-time'));
const nightButton = (n: number) => within(screen.getByTestId(`campaign-night-${n}`)).getByRole('button', { name: new RegExp(`^Night ${n},`) });
const openNight = (n: number) => {
  const b = nightButton(n);
  if (b.getAttribute('aria-expanded') !== 'true') fireEvent.click(b);
};
const planned = async () => {
  const user = userEvent.setup();
  await user.click(go());
  await screen.findByTestId('campaign-result', {}, { timeout: 20000 });
  return user;
};
const setNights = (n: number) => fireEvent.change(within(panel()).getByLabelText('Number of nights'), { target: { value: String(n) } });
const openLimits = () => {
  const summary = within(panel()).getByText('Limits per target (optional)');
  const details = summary.closest('details') as HTMLDetailsElement;
  if (!details.open) fireEvent.click(summary);
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

describe('empty and planet-only My plan', () => {
  it('empty: the button is disabled, says why, and nothing is planned', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: [] });
    await ready();
    expect(go().disabled).toBe(true);
    expect(go().getAttribute('aria-describedby')).toBe('campaign-reason');
    expect(screen.getByTestId('campaign-reason').textContent).toBe('Add at least one target to My plan first.');
    expect(screen.queryByTestId('campaign-inputs')).toBeNull();
    fireEvent.click(go());
    expect(w.created()).toBe(0);
  });

  it('only planets: disabled, and says the plan places fixed objects', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: ['planet-jupiter'] });
    await ready();
    expect(go().disabled).toBe(true);
    expect(screen.getByTestId('campaign-reason').textContent).toMatch(/no deep-sky targets.*not planets/);
    expect(screen.getByTestId('campaign-left-out-note').textContent).toBe('1 planet is left out: planets move across the sky from night to night, and this plan places fixed objects.');
  });

  it('planets among targets are left out of the request, with the reason', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: ['m42', 'planet-jupiter', 'm81'] });
    await ready();
    expect(screen.getByTestId('campaign-left-out-note').textContent).toMatch(/^1 planet is left out: planets move/);
    await planned();
    expect(w.sent().subjects.map((s) => s.id)).toEqual(['m42', 'm81']);
  });

  it('has no season control, and no second date, site, train or horizon control', async () => {
    mount(fakeCampaignWorker());
    await ready();
    const p = within(panel());
    expect(p.queryByLabelText(/season/i)).toBeNull();
    expect(p.queryByLabelText(/evening|date|site|train|horizon/i)).toBeNull();
    expect(p.getAllByRole('combobox')).toHaveLength(1); // the number of nights
  });
});

describe('the request', () => {
  it('is the chosen night as the first night, 3 nights, site, horizon, minimum altitude and My plan in order, as the engine takes it', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: ['ngc1499', 'm42', 'm81'] });
    await ready();
    expect(screen.getByTestId('campaign-inputs').textContent).toBe('Will plan 3 nights from Sat 14 Nov at Fountain Hills, AZ, with C11 f/10 + ASI2600MC Duo, minimum altitude 20°, and your horizon, for 3 targets from My plan.');
    await planned();
    expect(w.requests).toHaveLength(1);
    const input: CampaignInput = w.sent();
    expect(input.subjects.map((s) => s.id)).toEqual(['ngc1499', 'm42', 'm81']); // the user's order
    expect(input.subjects.map((s) => s.targets[0].id)).toEqual(['ngc1499', 'm42', 'm81']);
    expect(input.subjects.map((s) => s.type)).toEqual(['nebula', 'nebula', 'galaxy']);
    for (const s of input.subjects) {
      expect(s.hoursPerNight).toBeUndefined();
      expect(s.useful).toBeUndefined();
      expect(s.value).toBeUndefined();
      expect(s.aim).toBeUndefined();
    }
    expect(input.startDate).toBe(DATE);
    expect(input.nights).toBe(3);
    expect(input.timeZone).toBe('America/Phoenix');
    expect(input.minAltitude).toBe(20);
    expect(input.site.latitude).toBeCloseTo(33.6115, 4);
    expect(input.site.longitude).toBeCloseTo(-111.719, 4);
    expect(input.horizon).toEqual(arcToHorizonPoints(SAMPLE_ARCS));
    expect(input.startTime).toBeUndefined();
    expect(input.candidates).toBeUndefined();
    expect(() => planCampaign(input)).not.toThrow(); // the engine accepts it
  });

  it('follows the page: another date, minimum altitude and number of nights', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText(/^Minimum altitude \(deg\)/), { target: { value: '35' } });
    setNights(5);
    await planned();
    expect(w.sent()).toMatchObject({ startDate: '2026-11-20', minAltitude: 35, nights: 5 });
    expect(screen.getByTestId('campaign-inputs').textContent).toMatch(/^Will plan 5 nights from Fri 20 Nov .* minimum altitude 35°/);
  });

  it('the number of nights runs from 1 to the engine\'s maximum', async () => {
    mount(fakeCampaignWorker());
    await ready();
    const options = within(within(panel()).getByLabelText('Number of nights')).getAllByRole('option').map((o) => Number(o.getAttribute('value')));
    expect(options).toEqual(Array.from({ length: MAX_NIGHTS }, (_, i) => i + 1));
    expect(go().textContent).toBe('Plan 3 nights');
    setNights(1);
    expect(go().textContent).toBe('Plan 1 night');
  });

  it('a changed date plans from that date: the first night is always the chosen one (no season filter)', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    await planned();
    expect(w.sent().startDate).toBe(DATE);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-12-02' } });
    expect(screen.getByTestId('campaign-stale').textContent).toMatch(/you changed the first night/);
    await planned();
    expect(w.sent().startDate).toBe('2026-12-02');
    expect(nightButton(1).textContent).toMatch(/^▾Night 1, Wed 2 Dec/);
  });
});

describe('limits per target', () => {
  it('hours per night and a useful range go to the engine in its own fields; empty boxes send nothing', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    openLimits();
    const m42 = within(screen.getByTestId('campaign-limit-m42'));
    fireEvent.change(m42.getByLabelText('Hours per night, at most'), { target: { value: '1.5' } });
    const m81 = within(screen.getByTestId('campaign-limit-m81'));
    fireEvent.change(m81.getByLabelText('Useful from (min)'), { target: { value: '45' } });
    fireEvent.change(m81.getByLabelText('Full at (min)'), { target: { value: '150' } });
    await planned();
    const subjects = w.sent().subjects;
    expect(subjects.find((s) => s.id === 'm42')).toMatchObject({ hoursPerNight: 1.5 });
    expect(subjects.find((s) => s.id === 'm42')?.useful).toBeUndefined();
    expect(subjects.find((s) => s.id === 'm81')).toMatchObject({ useful: { minMin: 45, maxMin: 150 } });
    expect(subjects.find((s) => s.id === 'm81')?.hoursPerNight).toBeUndefined();
    expect(subjects.find((s) => s.id === 'ngc1499')).toEqual(expect.not.objectContaining({ hoursPerNight: expect.anything() }));
    // The result honours them: the cap holds on every night, and the range is the engine's.
    const result = planCampaign(w.sent());
    result.nights.forEach((n) => n.slots.filter((s) => s.subjectId === 'm42').forEach((s) => expect(s.integrationMin).toBeLessThanOrEqual(90)));
    expect(result.perSubject.find((p) => p.subjectId === 'm81')).toMatchObject({ minUsefulMin: 45, maxUsefulMin: 150 });
    expect(within(screen.getByTestId('campaign-target-m81')).getByText(/Useful: enough to process \(from 45 min\); more would help up to 150 min\.|Full: it reached its most useful length \(150 min\)\./)).toBeTruthy();
  });

  it('shows each target\'s default range in the empty boxes', async () => {
    mount(fakeCampaignWorker());
    await ready();
    openLimits();
    const m81 = within(screen.getByTestId('campaign-limit-m81'));
    expect((m81.getByLabelText('Useful from (min)') as HTMLInputElement).placeholder).toBe('90'); // a galaxy: the medium class
    expect((m81.getByLabelText('Full at (min)') as HTMLInputElement).placeholder).toBe('300');
  });

  it.each([
    ['hours that are not whole 5-minute steps', 'hours', '0.1', /multiple of 5 minutes/],
    ['zero hours', 'hours', '0', /more than 0/],
    ['words', 'hours', 'lots', /more than 0/],
    ['only the least useful minutes', 'min', '60', /both the least and the most/],
    ['a least above the most', 'both', '200', /least no more than the most/],
    ['minutes off the 5-minute grid', 'both', '61', /multiples of 5/],
  ])('refuses %s: says so under the target, disables planning, sends nothing', async (_name, which, value, message) => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    openLimits();
    const box = within(screen.getByTestId('campaign-limit-m42'));
    if (which === 'hours') fireEvent.change(box.getByLabelText('Hours per night, at most'), { target: { value } });
    if (which === 'min') fireEvent.change(box.getByLabelText('Useful from (min)'), { target: { value } });
    if (which === 'both') {
      fireEvent.change(box.getByLabelText('Useful from (min)'), { target: { value } });
      fireEvent.change(box.getByLabelText('Full at (min)'), { target: { value: '100' } });
    }
    expect(box.getByText(message)).toBeTruthy();
    expect(go().disabled).toBe(true);
    expect(screen.getByTestId('campaign-reason').textContent).toMatch(/limit below is not valid/);
    fireEvent.click(go());
    expect(w.created()).toBe(0);
    // Emptying the box clears the refusal.
    fireEvent.change(box.getByLabelText('Hours per night, at most'), { target: { value: '' } });
    fireEvent.change(box.getByLabelText('Useful from (min)'), { target: { value: '' } });
    fireEvent.change(box.getByLabelText('Full at (min)'), { target: { value: '' } });
    expect(go().disabled).toBe(false);
  });
});

describe('the result is the engine\'s own', () => {
  /** What the page must show for `result`: every target's total, nights and status, the cut line, and each night's slots. */
  const checkAgainstEngine = (result: CampaignResult, input: CampaignInput) => {
    expect(result.perSubject).toHaveLength(input.subjects.length);
    const rows = within(screen.getByTestId('campaign-targets')).getAllByTestId(/^campaign-target-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(input.subjects.map((s) => `campaign-target-${s.id}`)); // list order
    result.perSubject.forEach((p, i) => {
      const text = rows[i].textContent as string;
      expect(text).toContain(input.subjects[i].name);
      expect(text).toContain(`${p.totalMin} min of light over ${p.nightsUsed} ${p.nightsUsed === 1 ? 'night' : 'nights'}`);
      expect(text).toContain(`(${{ full: 'Full', useful: 'Useful', cut: 'Cut' }[p.status]})`);
      if (p.status === 'cut') expect(text).toContain(p.reason?.text ?? '');
    });
    const cutLine = screen.queryByTestId('campaign-cut-line');
    if (result.cutLine.firstCutId === null) {
      expect(cutLine).toBeNull();
      expect(screen.getByTestId('campaign-no-cut').textContent).toBe('Nothing is cut: every target reaches a useful length.');
    } else {
      expect(cutLine?.textContent).toContain(result.cutLine.text);
      // The line sits directly above the first cut target.
      expect(cutLine?.closest('li')?.querySelector('[data-testid^="campaign-target-"]')?.getAttribute('data-testid')).toBe(`campaign-target-${result.cutLine.firstCutId}`);
    }
    result.nights.forEach((n, i) => {
      openNight(i + 1);
      const box = screen.getByTestId(`campaign-night-${i + 1}`);
      if (n.start === null) {
        expect(box.textContent).toMatch(/No usable darkness/);
        return;
      }
      expect(within(box).getByTestId(`campaign-night-${i + 1}-dark`).textContent).toBe(
        `Dark from ${hhmm(n.start)} to ${hhmm(n.end as Date)} (${n.packing.nightMin} min): ${n.packing.usedMin} min in slots, ${n.packing.slewMin} min of slewing and centring between them, ${n.packing.leftMin} min free.`,
      );
      n.slots.forEach((s, k) => {
        const slot = (within(box).getByTestId(`campaign-slot-${i + 1}-${k}`).textContent as string).replace(/\s+/g, ' ');
        const name = input.subjects.find((x) => x.id === s.subjectId)?.name;
        expect(slot).toContain(`${k + 1}. ${name} ${hhmm(s.start)} to ${hhmm(s.end)} (${s.integrationMin} min of light)`);
        expect(slot).toContain(`Averages ${Math.round(s.meanAltitude)}° up`);
        if (s.flip) expect(slot).toContain(`so the mount flips: ${s.flipMin} min of the slot are for the flip`);
        else expect(slot).not.toContain('mount flips');
      });
      expect(within(box).queryAllByTestId(/^campaign-slot-/)).toHaveLength(n.slots.length);
      if (n.slots.length > 0) expect(within(box).getByRole('img', { name: /Altitude of every slot through the night/ })).toBeTruthy(); // the page's own night graph
      else expect(within(box).queryByRole('img')).toBeNull();
      if (n.cutLine.text !== null) expect(within(box).getByTestId(`campaign-night-${i + 1}-cut`).textContent).toContain(n.cutLine.text);
    });
  };

  it.each([
    ['3 targets', THREE],
    ['6 targets', SIX],
  ])('%s at Fountain Hills, 2026-11-14 and the two nights after: totals, nights, statuses, cut line and schedules match planCampaign', async (_name, plan) => {
    const w = fakeCampaignWorker();
    mount(w, { plan });
    await ready();
    await planned();
    const input = w.sent();
    expect(input.nights).toBe(3);
    const result = planCampaign(input);
    expect(result.nights.map((n) => n.date)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16']);
    checkAgainstEngine(result, input);
    expect(status().textContent).toMatch(new RegExp(`^Plan ready for 3 nights: ${result.perSubject.filter((p) => p.status !== 'cut').length} of ${plan.length} targets reach a useful length`));
  });

  it('says in one statement that code decided all of it, with no AI', async () => {
    mount(fakeCampaignWorker());
    await ready();
    await planned();
    const text = screen.getByTestId('campaign-decided').textContent as string;
    expect(text).toMatch(/^Code decided all of this: fixed rules, run in your browser\. Nothing here comes from an AI, there is no cost and no sign-in\./);
  });

  it('a list too long for the nights shows a cut line, names the cut targets and says what the first needs', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: SIX });
    await ready();
    setNights(1);
    // Three targets that each want 5 hours at least cannot all fit one night of 11 hours.
    openLimits();
    for (const id of ['m42', 'ngc1499', 'm81']) {
      fireEvent.change(within(screen.getByTestId(`campaign-limit-${id}`)).getByLabelText('Useful from (min)'), { target: { value: '300' } });
      fireEvent.change(within(screen.getByTestId(`campaign-limit-${id}`)).getByLabelText('Full at (min)'), { target: { value: '480' } });
    }
    await planned();
    const result = planCampaign(w.sent());
    expect(result.cutLine.cutIds.length).toBeGreaterThan(0);
    expect(screen.getByTestId('campaign-cut-line').textContent).toContain(result.cutLine.text as string);
    const first = within(screen.getByTestId(`campaign-target-${result.cutLine.firstCutId}`)).getByText(/^Cut: it never reached/);
    expect(first.textContent).toMatch(/the least that is useful\. /);
    expect(status().textContent).toMatch(new RegExp(`${result.cutLine.cutIds.length} cut\\.$`));
  });

  it('a night with nothing to do says what is left out and why', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    await planned();
    const result = planCampaign(w.sent());
    result.nights.forEach((n, i) => {
      const left = n.outcomes.filter((o) => o.slot === null);
      if (left.length === 0) return;
      openNight(i + 1);
      const list = screen.getByTestId(`campaign-night-${i + 1}-left`);
      left.forEach((o) => expect(list.textContent).toContain(o.reason?.text ?? 'It already has its most useful length.'));
    });
  });
});

describe('nights without usable darkness', () => {
  const north = (): Profile => {
    const p = sampleProfile();
    return { ...p, sites: [{ ...p.sites[0], id: 'north', name: 'Far north', latitude: 60.2, longitude: 24.9, timeZone: 'Europe/Helsinki', blockedArcs: [{ startAz: 0, endAz: 1, heightDeg: 0 }] }] };
  };

  it('says so for each such night, and plans the nights that have one, exactly as the engine does', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: ['m42', 'm81'], profile: north(), date: '2026-08-20' });
    await waitFor(() => expect(go().disabled).toBe(false));
    setNights(14);
    await planned();
    const result = planCampaign(w.sent());
    const dark = result.nights.map((n) => n.start !== null);
    expect(dark).toContain(false); // the engine finds nights with none
    expect(dark).toContain(true); // and nights with some, later
    result.nights.forEach((n, i) => {
      openNight(i + 1);
      const box = screen.getByTestId(`campaign-night-${i + 1}`);
      if (n.start === null) {
        const text = within(box).getByTestId(`campaign-night-${i + 1}-dark`).textContent as string;
        expect(text).toMatch(/^No usable darkness on /);
        expect(box.textContent).toMatch(/no usable darkness/); // in the night's heading too
        expect(within(box).queryByTestId(`campaign-apply-${i + 1}`)).toBeNull(); // nothing to use
      } else {
        expect(within(box).queryAllByTestId(/^campaign-slot-/)).toHaveLength(n.slots.length);
        if (n.slots.length > 0) expect((within(box).getByTestId(`campaign-apply-${i + 1}`) as HTMLButtonElement).disabled).toBe(false);
      }
    });
  });

  it('a stretch with no dark at all is said night by night', async () => {
    const w = fakeCampaignWorker();
    mount(w, { plan: ['m42'], profile: north(), date: '2026-06-20' });
    await waitFor(() => expect(go().disabled).toBe(false));
    setNights(2);
    await planned();
    for (const n of [1, 2]) {
      openNight(n);
      expect(screen.getByTestId(`campaign-night-${n}-dark`).textContent).toMatch(/^No usable darkness on .*: No astronomical night on 2026-06-2\d\./);
    }
    expect(screen.getByTestId('campaign-target-m42').textContent).toMatch(/\(Cut\)/);
    expect(screen.getByTestId('campaign-target-m42').textContent).toContain('0 min of light over 0 nights');
  });
});

describe('stale marker', () => {
  const twoSites = (): Profile => {
    const p = sampleProfile();
    return { ...p, sites: [...p.sites, { ...p.sites[0], id: 'other', name: 'Other site', latitude: 35.2, longitude: -111.65 }] };
  };

  it('says nothing while nothing changed, then names what changed, and planning again clears it', async () => {
    const w = fakeCampaignWorker();
    mount(w, { profile: twoSites() });
    await ready();
    await planned();
    expect(screen.queryByTestId('campaign-stale')).toBeNull();
    const stale = () => screen.queryByTestId('campaign-stale')?.textContent ?? '';

    setNights(4);
    expect(stale()).toBe('Out of date: you changed the number of nights after this plan was made. Plan again to match.');
    setNights(3);
    expect(stale()).toBe(''); // changed back: the plan is right again

    fireEvent.change(screen.getByLabelText(/^Minimum altitude \(deg\)/), { target: { value: '30' } });
    expect(stale()).toMatch(/the horizon or minimum altitude/);
    fireEvent.change(screen.getByLabelText(/^Minimum altitude \(deg\)/), { target: { value: '20' } });
    expect(stale()).toBe('');

    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: '2026-11-15' } });
    expect(stale()).toMatch(/the first night/);
    fireEvent.change(screen.getByLabelText('Evening of'), { target: { value: DATE } });

    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'deep-c11-reducer-533' } });
    expect(stale()).toMatch(/the train/);
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'deep-c11-2600' } });
    expect(stale()).toBe('');

    fireEvent.change(screen.getByLabelText('Site'), { target: { value: 'other' } });
    expect(stale()).toMatch(/the site/);

    // Several things: all named, and planning again makes it current.
    setNights(2);
    expect(stale()).toMatch(/the number of nights and the site|the site and the number of nights/);
    await planned();
    expect(screen.queryByTestId('campaign-stale')).toBeNull();
    expect(w.sent()).toMatchObject({ nights: 2, site: { latitude: 35.2 } });
  });

  it('My plan changes (a target removed, one moved) and a limit change are named; apply is off while out of date', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    await planned();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Orion Nebula from my plan' }));
    expect(screen.getByTestId('campaign-stale').textContent).toMatch(/you changed My plan/);
    const apply = screen.getByTestId('campaign-apply-1') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    expect(screen.getByTestId('campaign-apply-note-1').textContent).toBe('This plan is out of date. Plan again first.');
    await planned();
    expect(w.sent().subjects.map((s) => s.id)).toEqual(['ngc1499', 'm81']);
    expect((screen.getByTestId('campaign-apply-1') as HTMLButtonElement).disabled).toBe(false);
    openLimits();
    fireEvent.change(within(screen.getByTestId('campaign-limit-m81')).getByLabelText('Hours per night, at most'), { target: { value: '2' } });
    expect(screen.getByTestId('campaign-stale').textContent).toMatch(/you changed a limit/);
  });

  it('moving a target in My plan makes the plan out of date', async () => {
    mount(fakeCampaignWorker());
    await ready();
    await planned();
    fireEvent.click(screen.getByRole('button', { name: 'Move Orion Nebula down' }));
    expect(screen.getByTestId('campaign-stale').textContent).toMatch(/My plan/);
  });
});

describe('loading, cancel and superseded', () => {
  it('shows a loading state with aria-live and aria-busy, moves focus to Cancel, and back to Plan when the answer arrives', async () => {
    const w = fakeCampaignWorker({ hold: true });
    mount(w);
    await ready();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().getAttribute('aria-busy')).toBe('true');
    expect(status().textContent).toBe('Planning 3 nights from Sat 14 Nov. This runs in your browser and takes a few seconds.');
    expect(go().disabled).toBe(true);
    expect(w.requests).toHaveLength(1);
    await w.release();
    await screen.findByTestId('campaign-result');
    expect(status().getAttribute('aria-busy')).toBe('false');
    expect(status().textContent).toMatch(/^Plan ready for 3 nights: /);
    expect(document.activeElement).toBe(go());
    expect(within(panel()).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('Cancel ends the work, says nothing was changed, returns focus to Plan, ignores a late answer, and planning works again', async () => {
    const w = fakeCampaignWorker({ hold: true });
    mount(w);
    await ready();
    const user = userEvent.setup();
    go().focus();
    await user.keyboard('{Enter}');
    const cancel = await within(panel()).findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    await user.keyboard('{Enter}');
    expect(status().textContent).toBe('Cancelled. Nothing was changed.');
    expect(status().getAttribute('aria-busy')).toBe('false');
    expect(w.terminated()).toBe(1); // the worker was ended, not left running
    expect(go().disabled).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(go()));
    await w.release(); // the worker's answer arrives after it was ended
    expect(screen.queryByTestId('campaign-result')).toBeNull();
    expect(status().textContent).toBe('Cancelled. Nothing was changed.');
    // Not stuck: plan again.
    await user.click(go());
    await w.release();
    await screen.findByTestId('campaign-result');
    expect(w.created()).toBe(2);
    expect(within(panel()).queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it('a change while it works drops that answer and says so; planning again uses the new choices', async () => {
    const w = fakeCampaignWorker({ hold: true });
    mount(w);
    await ready();
    const user = userEvent.setup();
    await user.click(go());
    await within(panel()).findByRole('button', { name: 'Cancel' });
    setNights(5);
    expect(status().textContent).toBe('You changed something while the plan was being made, so its answer was dropped. Plan again to use your new choices.');
    expect(w.terminated()).toBe(1);
    expect(within(panel()).queryByRole('button', { name: 'Cancel' })).toBeNull();
    await w.release();
    expect(screen.queryByTestId('campaign-result')).toBeNull();
    await user.click(go());
    await w.release();
    await screen.findByTestId('campaign-result');
    expect(w.sent().nights).toBe(5);
  });

  it('a second click while it works is not possible, and a newer run replaces an older one', async () => {
    const w = fakeCampaignWorker({ hold: true });
    mount(w);
    await ready();
    fireEvent.click(go());
    await within(panel()).findByRole('button', { name: 'Cancel' });
    fireEvent.click(go());
    expect(w.created()).toBe(1);
  });

  it('a failure says so in plain words with Retry, shows no developer message, and Retry works', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let fail = true;
    const w = fakeCampaignWorker({ respond: (m) => (fail ? { kind: 'error', message: 'RangeError: nights must be a whole number from 1 to 14' } : answerCampaign(m)) });
    mount(w);
    await ready();
    const user = userEvent.setup();
    await user.click(go());
    const alert = await screen.findByTestId('campaign-problem');
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe('The several-night plan could not be made. Nothing was changed. Try again.Retry');
    expect(alert.textContent).not.toMatch(/RangeError|nights must be/);
    expect(screen.queryByTestId('campaign-result')).toBeNull();
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await screen.findByTestId('campaign-result');
    expect(screen.queryByTestId('campaign-problem')).toBeNull();
  });

  it('a crashed worker is a failure too, not a stuck spinner', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const w = fakeCampaignWorker({ respond: () => 'crash' });
    mount(w);
    await ready();
    fireEvent.click(go());
    await screen.findByTestId('campaign-problem');
    expect(status().getAttribute('aria-busy')).toBe('false');
    expect(go().disabled).toBe(false);
  });
});

describe('Use night N as my itinerary', () => {
  const savedItems = () => JSON.parse(window.localStorage.getItem(ITINERARY_KEY) as string) as { items: { targetId: string; trainId: string; filterId: string | null; mode: string; note: string }[]; startTime: string | null };

  it.each([1, 2, 3])('night %i: the itinerary holds that night\'s order, modes from the AI apply\'s own helper, and its first start', async (n) => {
    const w = fakeCampaignWorker();
    mount(w, { plan: SIX });
    await ready();
    const user = await planned();
    const night = planCampaign(w.sent()).nights[n - 1];
    expect(night.slots.length).toBeGreaterThan(0);
    openNight(n);
    const button = screen.getByTestId(`campaign-apply-${n}`) as HTMLButtonElement;
    expect(button.textContent).toBe(`Use night ${n} as my itinerary`);
    expect(button.disabled).toBe(false);
    expect(screen.getByTestId(`campaign-apply-note-${n}`).textContent).toMatch(/^This replaces your night itinerary below with this night.s order, first start time and, for each slot, the closest exposure mode to its length\./);
    await user.click(button);
    await waitFor(() => expect(itinerarySlots()).toHaveLength(night.slots.length));
    const saved = savedItems();
    expect(saved.items.map((i) => i.targetId)).toEqual(night.slots.map((s) => s.subjectId));
    expect(saved.items.map((i) => i.mode)).toEqual(night.slots.map((s) => modeForMinutes(s.integrationMin)));
    expect(saved.items.every((i) => i.trainId === 'deep-c11-2600')).toBe(true);
    expect(saved.items[0].note).toMatch(new RegExp(`^From the several-night plan, night ${n}, slot 1 of ${night.slots.length}\\.`));
    expect(saved.startTime).toBe(hhmm(night.slots[0].start).replace(/^24:/, '00:'));
    expect((within(itinerary()).getByLabelText('Imaging can start at') as HTMLInputElement).value).toBe(saved.startTime);
    const note = screen.getByTestId(`campaign-apply-note-${n}`).textContent as string;
    expect(note).toMatch(/^Done: your itinerary below now holds this night.s order/);
    expect(note).toMatch(/does not keep the plan.s slot times or exact lengths/);
    if (n > 1) expect(note).toMatch(/timed on the evening chosen at the top of the page; set Evening of to this night.s date/);
    else expect(note).not.toMatch(/set Evening of/);
  });

  it('asks before replacing slots that are there, in words about this night, keeps theirs on No, and takes the night on Yes', async () => {
    const mine = [{ id: 's1', targetId: 'm31', trainId: 'deep-c11-2600', filterId: null, mode: 'balanced', note: 'mine' }];
    window.localStorage.setItem(ITINERARY_KEY, JSON.stringify({ version: 2, items: mine, startTime: null }));
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    const user = await planned();
    openNight(2);
    await user.click(screen.getByTestId('campaign-apply-2'));
    await waitFor(() => expect(screen.getByTestId('campaign-apply-note-2').textContent).toBe('Your itinerary was left as it was.'));
    expect(confirm).toHaveBeenCalledWith('Replace your itinerary (1 slot) with night 2 of the several-night plan?');
    expect(savedItems().items.map((i) => i.targetId)).toEqual(['m31']);
    confirm.mockReturnValue(true);
    await user.click(screen.getByTestId('campaign-apply-2'));
    const night = planCampaign(w.sent()).nights[1];
    await waitFor(() => expect(itinerarySlots()).toHaveLength(night.slots.length));
    expect(savedItems().items.map((i) => i.targetId)).toEqual(night.slots.map((s) => s.subjectId));
  });

  it('is off with the reason for a smart scope, and for a night with no slots', async () => {
    const w = fakeCampaignWorker();
    mount(w);
    await ready();
    fireEvent.change(screen.getByLabelText('Train'), { target: { value: 'smart-seestar-s50' } });
    await planned();
    expect((screen.getByTestId('campaign-apply-1') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('campaign-apply-note-1').textContent).toBe('Pick an optical train at the top of the page: a smart scope plans its own exposures.');
  });

  it('does not touch the AI plan panel: its button and text are unchanged', async () => {
    mount(fakeCampaignWorker());
    await ready();
    expect(screen.getByRole('region', { name: 'PLAN MY NIGHT WITH AI' })).toBeTruthy();
  });
});

describe('reaching the panel', () => {
  it('My plan\'s header and the line under the strip link to it', async () => {
    mount(fakeCampaignWorker());
    await ready();
    const mine = within(screen.getByRole('region', { name: /^MY PLAN/ })).getByRole('link', { name: 'Plan several nights' });
    expect(mine.getAttribute('href')).toBe('#campaign-heading');
    expect(screen.getByRole('link', { name: 'Plan several nights from this evening' }).getAttribute('href')).toBe('#campaign-heading');
    expect(document.getElementById('campaign-heading')).toBeTruthy();
  });
});
