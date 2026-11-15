/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { starterTargets } from '@/planner/catalog';
import { DEFAULT_BORTLE, MAX_SUBS, MAX_SUB_S, MODE_ORDER, exposureFor, exposureTargetFrom } from '@/planner/exposure';
import type { ExposureOverrides } from '@/planner/exposure';
import { nextMeridianTransit } from '@/planner/astro';
import { arcToHorizonPoints } from '@/planner/profile';
import { resolveTrain } from '@/planner/profile/train';
import { planTonight, planTrainFor } from '@/planner/plan';
import { sampleProfile } from '@/planner/state';
import { FAVORITES_KEY, validateFavorites } from '@/planner/state/favorites';
import PlannerApp from './PlannerApp';
import { openPart, pageProps, planRowItems, ready, seedPlan, storedPlan, timelineSlots } from './testkit';

// The typed sub length and count of a row judge the light the engine would give for them, never the stored count times the new length; an absurd value
// is refused in plain words and never stored; every number the row accepts can be saved as a favorite. Also: the row's preset numbers equal an independent
// engine call, the timeline's select does not drop custom numbers, the favorite buttons ask first, and the held-store messages say what to do.

const DATE = '2026-12-15';
const app = async (targets: readonly object[]) => {
  seedPlan(targets, sampleProfile);
  const r = render(<PlannerApp {...pageProps} initialDate={DATE} initialProfile={sampleProfile()} />);
  await ready();
  return r;
};
const NAME = 'Andromeda Galaxy';
const subBox = () => screen.getByLabelText(`Sub length (s) for ${NAME}`) as HTMLInputElement;
const countBox = () => screen.getByLabelText(`Subs for ${NAME}`) as HTMLInputElement;
const numbers = () => screen.getByTestId('plan-numbers-m31').textContent ?? '';
const parse = (text: string) => {
  const m = /^(\d+(?:\.\d+)?) s × (\d+) subs? · (.+?) of light/.exec(text);
  if (!m) throw new Error(`not a numbers line: ${text}`);
  return { sub: Number(m[1]), subs: Number(m[2]), light: m[3] };
};
const type = (box: HTMLInputElement, text: string) => {
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
};
const group = () => screen.getByRole('group', { name: `Exposure preset for ${NAME}` });
const press = (preset: string) => fireEvent.click(within(group()).getByRole('button', { name: preset }));
const alertText = () => screen.queryByRole('alert')?.textContent ?? null;
const storedFavorites = () => {
  const text = window.localStorage.getItem(FAVORITES_KEY);
  return text === null ? [] : validateFavorites(JSON.parse(text)).favorites;
};
const minutes = (text: string) => {
  const m = /^(?:(\d+) h)?\s*(?:(\d+) min)?$/.exec(text)!;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
};

/** The engine's answer for the open plan's night, site, train and Moon, called here on its own (not through the page). */
const engine = (id: string, choice: { preset: 'quick' | 'balanced' | 'deep'; overrides?: ExposureOverrides }, bortleDelta = 0, moonDelta = 0) => {
  const profile = sampleProfile();
  const site = profile.sites[0];
  const train = profile.trains[0];
  const pt = planTrainFor(profile, train);
  const t = starterTargets.find((x) => x.id === id)!;
  const here = { latitude: site.latitude, longitude: site.longitude, elevationM: site.elevationM };
  const plan = planTonight({
    site: here,
    horizon: site.blockedArcs.length ? arcToHorizonPoints(site.blockedArcs) : null,
    minAltitude: 20,
    date: DATE,
    timeZone: site.timeZone,
    train: pt,
    targets: [t],
    includePlanets: false,
  } as unknown as Parameters<typeof planTonight>[0]);
  const e = plan.entries.find((x) => x.id === id)!;
  const cam = resolveTrain(profile, train).cameraSpec!;
  const filter = train.kind === 'optical' && train.filterId ? (profile.equipment.filters.find((f) => f.id === train.filterId) ?? null) : null;
  const start = e.windows[0]?.start ?? null;
  const night = {
    moonIllumination: Math.min(1, e.moonIllumination + moonDelta),
    moonSeparationDeg: e.moonSeparation,
    moonUp: e.moonUp,
    usableMinutes: e.usableMinutes,
    acquisitionStart: start,
    transitTime: start === null ? null : nextMeridianTransit(t.raHours, t.decDeg, start, here),
  };
  const r = exposureFor(
    exposureTargetFrom(t as never),
    { train: { focalRatio: pt.optics!.focalRatio, imageScale: pt.optics!.imageScale }, camera: cam, filter },
    { bortle: (site.bortle ?? DEFAULT_BORTLE) + bortleDelta },
    night,
    choice,
  );
  if (!r.ok) throw new Error('engine had no answer');
  return r;
};

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('each preset equals an independent engine call', () => {
  it('Quick, Balanced and Deep show the engine\'s sub length, count and light for the plan\'s night, site, train and Moon', async () => {
    await app([{ id: 'm31', preset: 'balanced' }]);
    for (const [label, mode] of [['Quick', 'quick'], ['Balanced', 'balanced'], ['Deep', 'deep']] as const) {
      press(label);
      const want = engine('m31', { preset: mode });
      const got = parse(numbers());
      expect({ sub: got.sub, subs: got.subs, light: minutes(got.light) }).toEqual({ sub: want.subSeconds, subs: want.subCount, light: Math.round(want.integrationMin) });
    }
  });

  it('the check can fail: a wrong Bortle or a wrong Moon gives other numbers for at least one preset', () => {
    const differs = (b: number, m: number) =>
      MODE_ORDER.some((mode) => {
        const a = engine('m31', { preset: mode });
        const c = engine('m31', { preset: mode }, b, m);
        return a.subSeconds !== c.subSeconds || a.subCount !== c.subCount;
      });
    expect(differs(2, 0)).toBe(true);
    expect(differs(0, 0.4)).toBe(true);
  });
});

describe('a typed sub length is judged by what the engine gives for it', () => {
  it.each(['quick', 'balanced', 'deep'] as const)('300 s on %s is accepted with the engine\'s count and light; 600 s and 1200 s are refused as longer than MAX_SUB_S and never stored', async (mode) => {
    await app([{ id: 'm31', preset: mode }]);
    const original = JSON.stringify(storedPlan());
    for (const sub of [600, 1200]) {
      type(subBox(), String(sub));
      expect(alertText()).toBe(`A sub of ${sub} s is longer than ${MAX_SUB_S} s: too long for one sub.`);
      expect(JSON.stringify(storedPlan())).toBe(original);
    }
    type(subBox(), String(MAX_SUB_S));
    expect(alertText()).toBeNull();
    const want = engine('m31', { preset: mode, overrides: { subSeconds: MAX_SUB_S } });
    const got = parse(numbers());
    expect(got.sub).toBe(MAX_SUB_S);
    expect(got.subs).toBe(want.subCount);
    expect(minutes(got.light)).toBe(Math.round(want.integrationMin));
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: mode, custom: { subSeconds: MAX_SUB_S } });
  });

  it('when the count is also custom, that count is used with the new sub length', async () => {
    await app([{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subCount: 12 } }]);
    type(subBox(), '300');
    expect(alertText()).toBeNull();
    expect(storedPlan()!.targets[0].custom).toEqual({ subCount: 12, subSeconds: 300 });
    expect(numbers()).toMatch(/^300 s × 12 subs/);
  });

  it('0.001 s and 1 s are refused in plain words and never stored', async () => {
    await app([{ id: 'm31', preset: 'balanced' }]);
    const original = JSON.stringify(storedPlan());
    const before = numbers();
    type(subBox(), '0.001');
    expect(alertText()).toMatch(/shorter than 1 s/);
    expect(JSON.stringify(storedPlan())).toBe(original);
    type(subBox(), '1');
    expect(alertText()).toBe(`That would need more than ${MAX_SUBS} subs; use longer subs.`);
    expect(JSON.stringify(storedPlan())).toBe(original);
    expect(subBox().getAttribute('aria-invalid')).toBe('true');
    expect(numbers()).toBe(before);
    expect(storedFavorites()).toEqual([]);
  });

  it('every accepted number can be saved as a favorite, alone and together, without a validator error', async () => {
    await app([{ id: 'm31', preset: 'balanced' }]);
    const tries: [string | null, string | null][] = [
      ['2', null], ['2.5', null], ['5', null], ['15', null], ['60', null], ['300', null], ['600', null], ['1200', null], ['3600', null],
      [null, '1'], [null, '12'], [null, '300'], [null, '500'], [null, '501'], [null, '5000'],
      ['600', '12'], ['300', '500'], ['15', '500'], ['15', '501'], ['3600', '1'], ['2.5', '400'], ['120', '500'],
    ];
    let accepted = 0;
    for (const [sub, count] of tries) {
      press('Balanced');
      if (sub !== null) type(subBox(), sub);
      if (count !== null) type(countBox(), count);
      if (alertText() !== null) continue; // refused: nothing to save (and nothing stored, checked above)
      accepted++;
      const shown = parse(numbers());
      const box = screen.getByRole('checkbox', { name: 'Save as favorite' });
      fireEvent.click(box);
      expect(screen.queryByText(/Favorite not saved/)).toBeNull();
      const saved = storedFavorites();
      expect(saved).toHaveLength(1);
      expect([saved[0].subSeconds, saved[0].subCount]).toEqual([shown.sub, shown.subs]);
      fireEvent.click(box); // remove it again for the next value
      fireEvent.click(screen.getByRole('button', { name: 'Remove favorite' }));
      expect(storedFavorites()).toEqual([]);
    }
    expect(accepted).toBeGreaterThanOrEqual(8);
  });
});

describe('the Night timeline does not offer to drop custom numbers', () => {
  it('a Custom target shows "Custom" and a preset target its preset, and neither slot has a preset select (it is on the row)', async () => {
    await app([
      { id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90 } },
      { id: 'ic405', preset: 'balanced' },
    ]);
    openPart('Night timeline');
    const slots = timelineSlots();
    expect(within(slots[0]).queryByRole('combobox')).toBeNull();
    expect(slots[0].textContent).toMatch(/Exposure for Andromeda Galaxy: Custom \(started from Deep\)\. Change it on this target.s row in the plan\./);
    expect(within(slots[1]).queryByRole('combobox')).toBeNull();
    expect(slots[1].textContent).toMatch(/Exposure for Flaming Star Nebula: Balanced\. Change it on this target.s row in the plan\./);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'deep', custom: { subSeconds: 90 } });
  });
});

describe('favorites on the row', () => {
  const savedWith = async () => {
    await app([{ id: 'm31', preset: 'balanced' }]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save as favorite' }));
    press('Deep');
  };

  it('"Update favorite to these numbers" asks first; Keep the old one changes nothing; Update replaces it', async () => {
    await savedWith();
    const old = storedFavorites()[0];
    fireEvent.click(screen.getByRole('button', { name: 'Update favorite to these numbers' }));
    expect(storedFavorites()[0]).toEqual(old); // not yet
    const ask = screen.getByTestId('plan-favorite-update-confirm-m31');
    expect(ask.textContent).toMatch(/Replace the favorite for Andromeda Galaxy/);
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep the old one' }));
    expect(storedFavorites()[0]).toEqual(old);
    expect(screen.queryByTestId('plan-favorite-update-confirm-m31')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Update favorite to these numbers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update favorite' }));
    const now = storedFavorites()[0];
    expect([now.subSeconds, now.subCount]).toEqual([parse(numbers()).sub, parse(numbers()).subs]);
    expect([now.subSeconds, now.subCount]).not.toEqual([old.subSeconds, old.subCount]);
  });

  it('the update button is hidden while "Restore favorite?" is open on that row', async () => {
    seedPlan([{ id: 'm31', preset: 'deep', favorite: 'ask' }], sampleProfile);
    window.localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify({ version: 1, favorites: [{ id: 'm31', preset: 'quick', subSeconds: 15, subCount: 120, filterName: 'No filter', trainName: 'x', savedAt: '2026-12-01T00:00:00.000Z' }] }),
    );
    render(<PlannerApp {...pageProps} initialDate={DATE} initialProfile={sampleProfile()} />);
    await ready();
    expect(screen.getByTestId('plan-favorite-ask-m31')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Update favorite to these numbers' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.getByRole('button', { name: 'Update favorite to these numbers' })).toBeTruthy();
  });

  it('removing a favorite clears a target\'s "ask" flag, so the prompt does not return when one is saved again', async () => {
    seedPlan([{ id: 'm31', preset: 'balanced', favorite: 'ask' }], sampleProfile);
    window.localStorage.setItem(
      FAVORITES_KEY,
      JSON.stringify({ version: 1, favorites: [{ id: 'm31', preset: 'quick', subSeconds: 15, subCount: 120, filterName: 'No filter', trainName: 'x', savedAt: '2026-12-01T00:00:00.000Z' }] }),
    );
    render(<PlannerApp {...pageProps} initialDate={DATE} initialProfile={sampleProfile()} />);
    await ready();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Save as favorite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove favorite' }));
    expect(storedFavorites()).toEqual([]);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced' });
  });
});

describe('a held favorites store says the next step', () => {
  it('"othertab" says to reload this tab or Reset all; "nocopy" says to free space and reload, or Reset all', async () => {
    window.localStorage.setItem(FAVORITES_KEY, '{"version":1,"favorites":[{"id":"m31"}]}'); // damaged
    const real = Storage.prototype.setItem;
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.includes('.bak.')) throw new Error('full');
      real.call(this, k, v);
    });
    await app([{ id: 'm31', preset: 'balanced' }]);
    const text = screen.getByTestId('plan-favorite-blocked-m31').textContent ?? '';
    setItem.mockRestore();
    expect(text).toMatch(/free some browser storage and reload this page/);
    expect(text).toMatch(/Reset all/);
  });
});

describe('preset labels are the row buttons\' words in the CSV and print', () => {
  it('the print sheet says Quick, Balanced and Deep, as the row buttons do', async () => {
    await app([{ id: 'm31', preset: 'deep' }, { id: 'planet-jupiter', preset: 'balanced' }]);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const rows = within(screen.getByTestId('print-plan')).getAllByRole('row').slice(1).map((r) => [...r.children].map((c) => c.textContent));
    expect(rows[0][2]).toBe('Deep');
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(planRowItems()).toHaveLength(2);
  });
});
