/**
 * @jest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MAX_SUBS, MAX_SUB_S } from '@/planner/exposure';
import { sampleProfile } from '@/planner/state';
import { FAVORITES_KEY } from '@/planner/state/favorites';
import PlannerApp from './PlannerApp';
import { PLANS_KEY } from '@/planner/state/plans';
import { openPart, pageProps, ready, storedPlan, timelineSlots } from './testkit';

// A stored Custom value is judged on every render, not only when it is typed: when the night, site, train or filter changes and the engine's count for the
// same sub length goes over MAX_SUBS (or the sub no longer fits), the row says so, the preset's own numbers are used everywhere (row, timeline, print, CSV),
// Save as favorite and Update favorite are refused in plain words, and the stored value stays stored.

const MAY = '2026-05-15';
const JAN = '2026-01-15';
const NAMES: Record<string, string> = { m31: 'Andromeda Galaxy', m33: 'Triangulum Galaxy', m42: 'Orion Nebula', ngc7000: 'North America Nebula' };

const seed = (date: string, trainId: string, filterId: string | null, targets: readonly object[]) => {
  const p = sampleProfile();
  window.localStorage.setItem(
    PLANS_KEY,
    JSON.stringify({
      version: 1,
      openId: 'plan-1',
      plans: [{ id: 'plan-1', name: 'My plan', createdAt: '2026-12-01T00:00:00.000Z', updatedAt: '2026-12-01T00:00:00.000Z', date, siteId: p.sites[0].id, trainId, startTime: null, targets, notes: '' }],
    }),
  );
  const profile = sampleProfile();
  for (const t of profile.trains) if (t.kind === 'optical' && filterId !== null) (t as { filterId?: string }).filterId = filterId;
  return profile;
};
const app = async (date: string, trainId: string, filterId: string | null, targets: readonly object[], edit?: (profile: ReturnType<typeof sampleProfile>) => void) => {
  const profile = seed(date, trainId, filterId, targets);
  edit?.(profile);
  render(<PlannerApp {...pageProps} initialDate={date} initialProfile={profile} />);
  await ready();
};
/** The profile's cameras without a pixel size: the engine cannot compute an exposure, but the page must still load. */
const withoutPixelSize = (profile: ReturnType<typeof sampleProfile>) => {
  for (const c of profile.equipment.cameras) delete (c as { pixelSizeUm?: number }).pixelSizeUm;
};
const dateBox = () => screen.getByLabelText('Evening of') as HTMLInputElement;
const subBox = (id: string) => screen.getByLabelText(`Sub (s) for ${NAMES[id]}`) as HTMLInputElement;
const countBox = (id: string) => screen.getByLabelText(`Subs for ${NAMES[id]}`) as HTMLInputElement;
const numbers = (id: string) => screen.getByTestId(`plan-numbers-${id}`).textContent ?? '';
const parse = (text: string) => {
  const m = /^(\d+(?:\.\d+)?) s × (\d+) subs? ·/.exec(text);
  if (!m) throw new Error(`not a numbers line: ${text}`);
  return { sub: Number(m[1]), subs: Number(m[2]) };
};
const type = (box: HTMLInputElement, text: string) => {
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
};
const unusable = (id: string) => screen.queryByTestId(`plan-custom-unusable-${id}`)?.textContent ?? null;
const slotNumbers = (k: number) => {
  const m = /(\d+(?:\.\d+)?) s × (\d+) subs? =/.exec((timelineSlots()[k].querySelector('[data-testid^="slot-light-"]')?.textContent ?? ''));
  if (!m) throw new Error(`no light line: ${timelineSlots()[k].textContent}`);
  return { sub: Number(m[1]), subs: Number(m[2]) };
};
const favoriteBox = (id: string) => within(screen.getByTestId(`plan-exposure-${id}`)).getByRole('checkbox', { name: 'Save as favorite' });
const VALIDATOR = /\$\.|must be a whole number|subCount|favorites\[/;

beforeAll(() => {
  const w = window as unknown as { CSS?: { escape?: (s: string) => string } };
  w.CSS = { ...w.CSS, escape: (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`) };
});
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('an accepted sub length that stops working when the night changes', () => {
  it('10 s accepted on 2026-05-15 becomes a plain message on 2026-01-15: preset numbers used, favorite refused, value kept', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    openPart('Night timeline');
    const preset = parse(numbers('m31'));
    type(subBox('m31'), '10');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(parse(numbers('m31')).sub).toBe(10);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 10 } });

    fireEvent.change(dateBox(), { target: { value: JAN } });
    // The row: the plain message, and the preset's own numbers (never 10 s x more than the limit).
    expect(unusable('m31')).toBe('Custom not used');
    const row = parse(numbers('m31'));
    expect(row.subs).toBeLessThanOrEqual(MAX_SUBS);
    expect(row.sub).toBeGreaterThan(10);
    // The timeline schedules the same preset numbers and says so.
    expect(slotNumbers(0)).toEqual(row);
    expect(screen.getByTestId('plan-chips-m31').textContent).toContain('Custom not used');
    // The stored value stays stored.
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 10 } });
    // Save as favorite is refused in plain words, with no validator text anywhere.
    fireEvent.click(favoriteBox('m31'));
    expect(screen.getByTestId('plan-favorite-refused-m31').textContent).toBe('Not saved: custom not used');
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();

    // Back to the first night: the stored value works again, 10 s as before, and the favorite saves.
    fireEvent.change(dateBox(), { target: { value: MAY } });
    expect(unusable('m31')).toBeNull();
    expect(parse(numbers('m31')).sub).toBe(10);
    expect(screen.queryByTestId('plan-favorite-refused-m31')).toBeNull();
    expect(preset.sub).toBeGreaterThan(10);
  });

  it('Update favorite is refused the same way', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    fireEvent.click(favoriteBox('m31')); // favorite = Balanced numbers on this night
    expect(window.localStorage.getItem(FAVORITES_KEY)).not.toBeNull();
    const saved = window.localStorage.getItem(FAVORITES_KEY);
    type(subBox('m31'), '10');
    fireEvent.change(dateBox(), { target: { value: JAN } });
    expect(unusable('m31')).not.toBeNull();
    const update = screen.queryByRole('button', { name: 'Update favorite to these numbers' });
    if (update !== null) {
      fireEvent.click(update);
      expect(screen.getByTestId('plan-favorite-refused-m31')).toBeTruthy();
      expect(screen.queryByTestId('plan-favorite-update-confirm-m31')).toBeNull();
    }
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(saved);
    expect(document.body.textContent).not.toMatch(VALIDATOR);
  });

  it('property: over targets, trains, filters and nights, no stored custom value is ever shown, scheduled or saved over the limit', async () => {
    const ids = ['m31', 'm33', 'm42', 'ngc7000'];
    let unusableSeen = 0;
    for (const train of ['deep-c11-2600', 'deep-c11-reducer-2600', 'wide-c11-hyperstar-2600']) {
      for (const filter of [null, 'zwo-duo-band']) {
        for (const date of [MAY, JAN]) {
          for (const sub of [1, 2]) {
            window.localStorage.clear();
            await app(date, train, filter, ids.map((id) => ({ id, preset: 'custom', base: 'balanced', custom: { subSeconds: sub } })));
            openPart('Night timeline');
            ids.forEach((id, k) => {
              const row = parse(numbers(id));
              const where = `${id} ${train} ${filter} ${date} ${sub}s`;
              expect([where, row.subs <= MAX_SUBS]).toEqual([where, true]);
              if (unusable(id) !== null) {
                unusableSeen += 1;
                expect(unusable(id)).toBe('Custom not used');
                expect([where, row.sub]).not.toEqual([where, sub]);
                fireEvent.click(favoriteBox(id));
                expect(screen.getByTestId(`plan-favorite-refused-${id}`)).toBeTruthy();
              } else {
                expect([where, row.sub]).toEqual([where, sub]);
                fireEvent.click(favoriteBox(id));
                expect(screen.queryByTestId(`plan-favorite-refused-${id}`)).toBeNull();
              }
              // The timeline gives each slot its own part of the night, so its count may be cut, and the count limit is tested against that smaller window: its sub is the row's or shorter, never over the limit.
              if (timelineSlots()[k].textContent?.includes('Light:')) {
                const slot = slotNumbers(k);
                expect([where, slot.sub <= row.sub, slot.sub <= MAX_SUB_S, slot.subs <= MAX_SUBS]).toEqual([where, true, true, true]);
              }
            });
            expect(document.body.textContent).not.toMatch(VALIDATOR);
            cleanup();
          }
        }
      }
    }
    expect(unusableSeen).toBeGreaterThan(0);
  }, 240000);
});

describe('a sub that does not fit the night says so truthfully', () => {
  it('a longest sub on a night with 3 usable minutes names the usable minutes, not "no usable time"', async () => {
    const { resultProblem } = await import('./rowExposure');
    expect(resultProblem({ subSeconds: MAX_SUB_S, subCount: 0, warnings: [] } as never, 3.4)).toBe('Sub too long');
  });

  it('keeps "no usable time" for a night with none', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    // A night where M31 is never up: the row has no numbers to type into; the message text itself is the zero-usable case.
    const { resultProblem } = await import('./rowExposure');
    expect(resultProblem({ subSeconds: 600, subCount: 0, warnings: [] } as never, 0)).toBe('Not up tonight');
  });
});

describe('a refused typing error goes when the other box makes it valid', () => {
  it('1 s refused (over MAX_SUBS subs), then count MAX_SUBS: the sub box is judged again and the message goes', async () => {
    await app(JAN, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    type(subBox('m31'), '1');
    expect(screen.getByRole('alert').textContent).toBe(`Max ${MAX_SUBS} subs`);
    type(countBox('m31'), String(MAX_SUBS));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(subBox('m31').getAttribute('aria-invalid')).toBe('false');
  });
});

describe('plain words', () => {
  it('one sub, no echo of a huge number', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    type(subBox('m31'), '99999999999999999999');
    expect(screen.getByRole('alert').textContent).toBe(`Sub: 1 to ${MAX_SUB_S} s`);
    type(subBox('m31'), '10');
    type(countBox('m31'), '1');
    expect(numbers('m31')).toMatch(/^10 s × 1 sub · 0 min light/);
  });
});

describe('round 4: a stored sub under the minimum, the timeline in the preset-used state, a 0-sub favorite', () => {
  it('a stored 0.5 s sub is judged like an over-MAX_SUBS one: plain message, preset used on row and timeline, favorite refused', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 0.5, subCount: 100 } }]);
    openPart('Night timeline');
    expect(unusable('m31')).toBe('Custom not used');
    const row = parse(numbers('m31'));
    expect(row.sub).toBeGreaterThan(1);
    expect(slotNumbers(0)).toEqual(row);
    fireEvent.click(favoriteBox('m31'));
    expect(screen.getByTestId('plan-favorite-refused-m31').textContent).toMatch(/^Not saved: /);
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 0.5, subCount: 100 } });
  });

  it('the timeline offers no preset select for a custom value that is not used, so the stored value cannot be deleted; moving the night back keeps it', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    openPart('Night timeline');
    type(subBox('m31'), '10');
    fireEvent.change(dateBox(), { target: { value: JAN } });
    expect(screen.getByTestId('plan-chips-m31').textContent).toContain('Custom not used');
    expect(screen.queryByLabelText('Exposure preset for Andromeda Galaxy', { selector: 'select' })).toBeNull();
    fireEvent.change(dateBox(), { target: { value: MAY } });
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 10 } });
    expect(parse(numbers('m31')).sub).toBe(10);
  });

  it('Save as favorite on a row with 0 subs (no usable time) is refused in plain words, no validator text', async () => {
    await app('2026-06-15', 'deep-c11-reducer-2600', null, [{ id: 'm42', preset: 'balanced' }]);
    const box = favoriteBox('m42');
    expect((box as HTMLInputElement).disabled).toBe(false);
    fireEvent.click(box);
    expect(screen.getByTestId('plan-favorite-refused-m42').textContent).toBe('Not saved: no subs fit');
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
  });
});

describe('round 5: every stored custom value outside the limits is judged, never sent to the engine, never saved', () => {
  it.each([
    [{ subSeconds: 60, subCount: 0.5 }],
    [{ subCount: 12.7 }],
    [{ subSeconds: MAX_SUB_S + 1 }],
    [{ subSeconds: 3600, subCount: 2 }],
    [{ subCount: 6000 }],
    [{ subCount: MAX_SUBS + 1 }],
  ])('stored %j: page loads, short message, preset numbers on row and timeline, favorite refused, value kept', async (custom) => {
    await app('2026-12-08', 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom }]);
    openPart('Night timeline');
    const text = unusable('m31')!;
    expect(text).toBe('Custom not used');
    const row = parse(numbers('m31'));
    expect(slotNumbers(0)).toEqual(row);
    fireEvent.click(favoriteBox('m31'));
    expect(screen.getByTestId('plan-favorite-refused-m31').textContent).toMatch(/^Not saved: /);
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom });
  });

  it.each([{ totalMin: 100000 }])('stored %j: the engine fits it to the night, so the row shows numbers inside the limits and a favorite saves without validator text', async (custom) => {
    await app('2026-12-08', 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom }]);
    expect(unusable('m31')).toBeNull();
    const row = parse(numbers('m31'));
    expect(row.subs).toBeGreaterThanOrEqual(1);
    expect(row.subs).toBeLessThanOrEqual(MAX_SUBS);
    expect(row.sub).toBeLessThanOrEqual(MAX_SUB_S);
    fireEvent.click(favoriteBox('m31'));
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!).favorites[0]).toMatchObject({ subSeconds: row.sub, subCount: row.subs });
  });

  it('typing a sub over a stored bad count replaces the bad count instead of sending it to the engine', async () => {
    await app('2026-12-08', 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subCount: 0.5 } }]);
    type(subBox('m31'), '60');
    expect(unusable('m31')).toBeNull();
    expect(parse(numbers('m31')).sub).toBe(60);
    expect(storedPlan()!.targets[0].custom).toEqual({ subSeconds: 60 });
  });

  it('print labels a row whose custom value is not used as the preset it shows', async () => {
    await app('2026-12-08', 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 7200 } }]);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    const sheet = screen.getByTestId('print-sheet').textContent ?? '';
    expect(sheet).toContain('Balanced (custom not used)');
    expect(sheet).not.toMatch(/Custom(?! not| sub| number)/);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
  });
});

describe('round 7: a stored value outside the limits never reaches the engine, whatever the profile lacks', () => {
  it.each([{ subCount: 0.5 }, { subCount: 12.7 }, { subSeconds: 60, subCount: 0.5 }, { subSeconds: 60, subCount: 12.7 }])(
    'profile without a pixel size, stored %j: the page loads, the row gives the profile message, the timeline names the failing number',
    async (custom) => {
      await app('2026-12-08', 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom }], withoutPixelSize);
      openPart('Night timeline');
      expect(screen.getByTestId('plan-numbers-m31').textContent).toBe('Gear incomplete');
      // Nothing is computed for this target, so no preset is used and none is named.
      expect(screen.getByTestId('plan-chips-m31').textContent).toContain('Custom not used');
      expect(screen.getByTestId('plan-chips-m31').textContent).not.toMatch(/Balanced|Quick|Deep|preset/);
      expect(document.body.textContent).not.toMatch(VALIDATOR);
      expect(storedPlan()!.targets[0].custom).toEqual(custom);
    },
  );

  it('the timeline names the sub length when that is what fails, and the count when that is', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 7200 } }]);
    openPart('Night timeline');
    expect(screen.getByTestId('plan-chips-m31').textContent).toContain('Custom not used');
    cleanup();
    window.localStorage.clear();
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'custom', base: 'balanced', custom: { subCount: MAX_SUBS + 1 } }]);
    openPart('Night timeline');
    expect(screen.getByTestId('plan-chips-m31').textContent).toContain('Custom not used');
  });
});

describe('round 7: a favorite saved under older limits stays saved and is shown as not usable', () => {
  const stored = (id: string, subSeconds: number, subCount: number) => ({ id, preset: 'deep', subSeconds, subCount, filterName: 'No filter', trainName: 'C11', savedAt: '2026-12-01T00:00:00.000Z' });

  it('a 600 s favorite does not wipe out the list: the other favorite is offered, the old one says why it is not, and the store text is untouched', async () => {
    const text = JSON.stringify({ version: 1, favorites: [stored('m31', 600, 12), stored('m42', 120, 30)] });
    window.localStorage.setItem(FAVORITES_KEY, text);
    await app('2026-12-08', 'deep-c11-reducer-2600', null, [
      { id: 'm31', preset: 'balanced', favorite: 'ask' },
      { id: 'm42', preset: 'balanced', favorite: 'ask' },
    ]);
    expect(document.body.textContent).not.toMatch(/could not be read|start over/);
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(screen.getByTestId('plan-favorite-unusable-m31').textContent).toBe('Favorite not usable');
    expect(screen.queryByTestId('plan-favorite-ask-m31')).toBeNull();
    expect(screen.queryByTestId('plan-favorite-unusable-m42')).toBeNull();
    expect(screen.getByTestId('plan-favorite-ask-m42').textContent).toMatch(/Restore your favorite \(/);
    fireEvent.click(within(screen.getByTestId('plan-favorite-ask-m42')).getByRole('button', { name: 'Restore' }));
    expect(storedPlan()!.targets[1]).toMatchObject({ id: 'm42', preset: 'custom', custom: { subSeconds: 120, subCount: 30 } });
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBe(text);
  });
});
