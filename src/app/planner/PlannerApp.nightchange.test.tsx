/**
 * @jest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { sampleProfile } from '@/planner/state';
import { FAVORITES_KEY } from '@/planner/state/favorites';
import PlannerApp from './PlannerApp';
import { PLANS_KEY } from '@/planner/state/plans';
import { openPart, pageProps, ready, storedPlan, timelineSlots } from './testkit';

// A stored Custom value is judged on every render, not only when it is typed: when the night, site, train or filter changes and the engine's count for the
// same sub length goes over 5,000 (or the sub no longer fits), the row says so, the preset's own numbers are used everywhere (row, timeline, print, CSV),
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
const app = async (date: string, trainId: string, filterId: string | null, targets: readonly object[]) => {
  render(<PlannerApp {...pageProps} initialDate={date} initialProfile={seed(date, trainId, filterId, targets)} />);
  await ready();
};
const dateBox = () => screen.getByLabelText('Evening of') as HTMLInputElement;
const subBox = (id: string) => screen.getByLabelText(`Sub length (s) for ${NAMES[id]}`) as HTMLInputElement;
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
  const m = /Light: (\d+(?:\.\d+)?) s x (\d+) subs? =/.exec(timelineSlots()[k].textContent ?? '');
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
  it('1 s accepted on 2026-05-15 becomes a plain message on 2026-01-15: preset numbers used, favorite refused, value kept', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    openPart('Night timeline');
    const preset = parse(numbers('m31'));
    type(subBox('m31'), '1');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(parse(numbers('m31')).sub).toBe(1);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 1 } });

    fireEvent.change(dateBox(), { target: { value: JAN } });
    // The row: the plain message, and the preset's own numbers (never 1 s x 7,598).
    expect(unusable('m31')).toBe(
      'That would need more than 5,000 subs on this night; use longer subs. Your custom numbers do not work on this night, so the Balanced preset is used.',
    );
    const row = parse(numbers('m31'));
    expect(row.subs).toBeLessThanOrEqual(5000);
    expect(row.sub).toBeGreaterThan(1);
    // The timeline schedules the same preset numbers and says so.
    expect(slotNumbers(0)).toEqual(row);
    expect(screen.getByTestId('it-preset-used-m31').textContent).toMatch(/Your custom sub length does not work on this night, so the preset is used/);
    // The stored value stays stored.
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'custom', base: 'balanced', custom: { subSeconds: 1 } });
    // Save as favorite is refused in plain words, with no validator text anywhere.
    fireEvent.click(favoriteBox('m31'));
    expect(screen.getByTestId('plan-favorite-refused-m31').textContent).toMatch(/^The favorite was not saved: your custom numbers do not work on this night/);
    expect(document.body.textContent).not.toMatch(VALIDATOR);
    expect(window.localStorage.getItem(FAVORITES_KEY)).toBeNull();

    // Back to the first night: the stored value works again, 1 s as before, and the favorite saves.
    fireEvent.change(dateBox(), { target: { value: MAY } });
    expect(unusable('m31')).toBeNull();
    expect(parse(numbers('m31')).sub).toBe(1);
    expect(screen.queryByTestId('plan-favorite-refused-m31')).toBeNull();
    expect(preset.sub).toBeGreaterThan(1);
  });

  it('Update favorite is refused the same way', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    fireEvent.click(favoriteBox('m31')); // favorite = Balanced numbers on this night
    expect(window.localStorage.getItem(FAVORITES_KEY)).not.toBeNull();
    const saved = window.localStorage.getItem(FAVORITES_KEY);
    type(subBox('m31'), '1');
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
              expect([where, row.subs <= 5000]).toEqual([where, true]);
              if (unusable(id) !== null) {
                unusableSeen += 1;
                expect(unusable(id)).toMatch(/so the Balanced preset is used\.$/);
                expect([where, row.sub]).not.toEqual([where, sub]);
                fireEvent.click(favoriteBox(id));
                expect(screen.getByTestId(`plan-favorite-refused-${id}`)).toBeTruthy();
              } else {
                expect([where, row.sub]).toEqual([where, sub]);
                fireEvent.click(favoriteBox(id));
                expect(screen.queryByTestId(`plan-favorite-refused-${id}`)).toBeNull();
              }
              // The timeline gives each slot its own part of the night, so its count may be cut; its sub length is the row's, and never over the limit.
              if (timelineSlots()[k].textContent?.includes('Light:')) expect([where, slotNumbers(k).sub, slotNumbers(k).subs <= 5000]).toEqual([where, row.sub, true]);
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
  it.each([1800, 3600])('%i s on 2026-05-15 (M31, reducer, 2600) names the usable minutes, not "no usable time"', async (sub) => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    type(subBox('m31'), String(sub));
    const text = screen.getByRole('alert').textContent ?? '';
    expect(text).toMatch(new RegExp(`^A ${sub} s sub does not fit in the \\d+ usable minutes of this night; use shorter subs\\.$`));
    expect(text).not.toMatch(/no usable time/);
    expect(storedPlan()!.targets[0]).toEqual({ id: 'm31', preset: 'balanced' });
  });

  it('keeps "no usable time" for a night with none', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    // A night where M31 is never up: the row has no numbers to type into; the message text itself is the zero-usable case.
    const { resultProblem } = await import('./rowExposure');
    expect(resultProblem({ subSeconds: 600, subCount: 0 } as never, 0)).toBe('There is no usable time on this night for that, so it would give no subs.');
  });
});

describe('a refused typing error goes when the other box makes it valid', () => {
  it('1 s refused (over 5,000 subs), then count 5000: the sub box is judged again and the message goes', async () => {
    await app(JAN, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    type(subBox('m31'), '1');
    expect(screen.getByRole('alert').textContent).toMatch(/more than 5,000 subs/);
    type(countBox('m31'), '5000');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(subBox('m31').getAttribute('aria-invalid')).toBe('false');
  });
});

describe('plain words', () => {
  it('one sub, no echo of a huge number', async () => {
    await app(MAY, 'deep-c11-reducer-2600', null, [{ id: 'm31', preset: 'balanced' }]);
    type(subBox('m31'), '99999999999999999999');
    expect(screen.getByRole('alert').textContent).toBe('That sub length is longer than 3600 s (1 hour): too long for one sub.');
    type(subBox('m31'), '1');
    type(countBox('m31'), '1');
    expect(numbers('m31')).toMatch(/^1 s × 1 sub · under 1 min of light/);
  });
});
