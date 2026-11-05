/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// Real keystrokes, one key at a time, through the whole page: the number boxes and sliders are
// the real components wired to the real profile, so Discard, Reset and site changes are real too.

const twoSites = () => {
  const p = sampleProfile();
  const other = { ...p.sites[0], id: 'other', name: 'Other Site' }; // same start azimuth on purpose
  return { ...p, sites: [p.sites[0], other] };
};

const box = (name: string) => screen.getByRole('spinbutton', { name: new RegExp(`^${name} \\(deg\\)`) }) as HTMLInputElement;
const slider = (name: string) => screen.getByRole('slider', { name: `${name} slider` }) as HTMLInputElement;
const summary = () => screen.getByTestId('horizon-summary').textContent;
const nightSummary = () => screen.getByTestId('night-summary').textContent;
const noError = () => expect(screen.queryByRole('alert')).toBeNull();
const user = () => userEvent.setup();

const START = 'Start azimuth';
const END = 'End azimuth';
const HEIGHT = 'Height';
const MINALT = 'Minimum altitude';

/** Replaces the box content key by key, leaving the box focused. */
async function typeIn(u: ReturnType<typeof user>, name: string, text: string) {
  const el = box(name);
  await u.clear(el);
  await u.type(el, text);
}
const typeEnter = async (u: ReturnType<typeof user>, name: string, text: string) => {
  await typeIn(u, name, text);
  await u.keyboard('{Enter}');
};
const slide = (name: string, value: string) => fireEvent.change(slider(name), { target: { value } });

beforeEach(() => {
  window.localStorage.clear();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('number box and slider', () => {
  it('starts in sync with the profile', () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    expect((box(START) as HTMLInputElement).value).toBe(String(120));
    expect(slider(START).value).toBe('120');
    expect((box(HEIGHT) as HTMLInputElement).value).toBe(String(42));
  });

  it('typing changes nothing but the box: no commit, no slider move, no error, until Enter', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    const before = summary();
    await typeIn(u, START, '150');
    expect((box(START) as HTMLInputElement).value).toBe(String(150));
    expect(slider(START).value).toBe('120');
    expect(summary()).toBe(before);
    noError();
    await u.keyboard('{Enter}');
    expect(slider(START).value).toBe('150');
    expect(summary()).toContain('150°');
    noError();
  });

  it('commits a valid draft on blur', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    await typeIn(u, START, '150');
    await u.tab();
    expect(slider(START).value).toBe('150');
    expect(summary()).toContain('150°');
  });

  describe.each([
    ['500 in Start', START, '500', /Start azimuth must be from 0 to 359/],
    ['361 in Start', START, '361', /Start azimuth must be from 0 to 359/],
    ['320 in Start (equals End)', START, '320', /Start and end must differ/],
    ['91 in Height', HEIGHT, '91', /Height must be from 0 to 90/],
    ['100 in Minimum altitude', MINALT, '100', /Minimum altitude must be from 0 to 89/],
  ])('a bad value typed key by key: %s', (_n, name, text, message) => {
    it('never moves the slider or the plan, and shows the message only on Enter', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      const sliderBefore = slider(name).value;
      const horizon = summary();
      const night = nightSummary();
      const el = box(name);
      await u.clear(el);
      for (const key of text) {
        await u.keyboard(key);
        expect(slider(name).value).toBe(sliderBefore); // after every single key
        expect(summary()).toBe(horizon);
        expect(nightSummary()).toBe(night);
      }
      noError();
      await u.keyboard('{Enter}');
      expect(screen.getByRole('alert').textContent).toMatch(message);
      expect((box(name) as HTMLInputElement).value).toBe(String(Number(text)));
      expect(slider(name).value).toBe(sliderBefore);
      expect(summary()).toBe(horizon);
      expect(nightSummary()).toBe(night);
    });

    it('on blur also shows the message and changes nothing', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      const sliderBefore = slider(name).value;
      const horizon = summary();
      await typeIn(u, name, text);
      await u.tab();
      expect(screen.getByRole('alert').textContent).toMatch(message);
      expect(slider(name).value).toBe(sliderBefore);
      expect(summary()).toBe(horizon);
    });
  });

  it('Save after bad typing stores the original arc', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    slide(HEIGHT, '50'); // a real change, so Save is enabled
    await typeEnter(u, START, '500');
    expect(screen.getByRole('alert')).toBeTruthy();
    await u.click(screen.getByRole('button', { name: 'Save horizon' }));
    const stored = JSON.parse(window.localStorage.getItem('fpo-planner-profile-v1') as string);
    expect(stored.sites[0].blockedArc).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
  });

  it('Save is not offered when the only thing typed was bad', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    await typeEnter(u, START, '500');
    expect((screen.getByRole('button', { name: 'Save horizon' }) as HTMLButtonElement).disabled).toBe(true);
    expect(window.localStorage.getItem('fpo-planner-profile-v1')).toBeNull();
  });

  it('Escape drops the draft and the message', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    await typeEnter(u, START, '500');
    expect(screen.getByRole('alert')).toBeTruthy();
    await u.keyboard('{Escape}');
    expect((box(START) as HTMLInputElement).value).toBe(String(120));
    noError();
    await typeIn(u, START, '150');
    await u.keyboard('{Escape}');
    expect((box(START) as HTMLInputElement).value).toBe(String(120));
    expect(slider(START).value).toBe('120');
  });

  it('the slider commits at once and ends the edit of the box', async () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    const u = user();
    await typeEnter(u, START, '500');
    slide(START, '200');
    expect((box(START) as HTMLInputElement).value).toBe(String(200));
    expect(summary()).toContain('200°');
    noError();
  });

  it('the slider refusing a value (start equals end) shows the message and keeps the arc', () => {
    render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
    slide(START, '320');
    expect(screen.getByRole('alert').textContent).toMatch(/Start and end must differ/);
    expect((box(START) as HTMLInputElement).value).toBe(String(120));
    expect(slider(START).value).toBe('120');
  });

  describe('old drafts do not come back', () => {
    it('type 150 in Start, Discard, then End to 150: Start shows 120 with no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      await typeEnter(u, START, '150');
      await u.click(screen.getByRole('button', { name: 'Discard changes' }));
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      await typeEnter(u, END, '150');
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      noError();
    });

    it('rejected 320 in Start, End to 300, End back to 320: Start stays 120, no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      await typeEnter(u, START, '320');
      expect(screen.getByRole('alert').textContent).toMatch(/must differ/);
      await typeEnter(u, END, '300'); // 320 would now be valid, but the draft is gone
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      noError();
      await typeEnter(u, END, '320');
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      noError();
    });

    it('Height 50, bad 500 in Start, Discard: Start 120 and Height 42, no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      await typeEnter(u, HEIGHT, '50');
      await typeEnter(u, START, '500');
      await u.click(screen.getByRole('button', { name: 'Discard changes' }));
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      expect((box(HEIGHT) as HTMLInputElement).value).toBe(String(42));
      expect(slider(HEIGHT).value).toBe('42');
      noError();
    });

    it('bad 500 in Start, Reset to sample: Start 120, no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      await typeEnter(u, START, '500');
      await u.click(screen.getByRole('button', { name: 'Reset to sample' }));
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      noError();
    });

    it('bad 95 in Height, Reset to sample: Height 42, no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={sampleProfile()} />);
      const u = user();
      await typeEnter(u, HEIGHT, '95');
      await u.click(screen.getByRole('button', { name: 'Reset to sample' }));
      expect((box(HEIGHT) as HTMLInputElement).value).toBe(String(42));
      expect(slider(HEIGHT).value).toBe('42');
      noError();
    });

    it('bad 500 in Start, switch to a site with the same start azimuth: 120, no error', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={twoSites()} />);
      const u = user();
      await typeEnter(u, START, '500');
      await u.selectOptions(screen.getByLabelText('Site'), 'other');
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
      noError();
    });

    it('an uncommitted valid draft (150) is dropped by a site change too', async () => {
      render(<PlannerApp initialDate="2026-12-15" initialProfile={twoSites()} />);
      const u = user();
      await typeIn(u, START, '150');
      await u.selectOptions(screen.getByLabelText('Site'), 'other'); // blur commits 150 to the first site's draft arc, then the site switch drops it
      expect((box(START) as HTMLInputElement).value).toBe(String(120));
      expect(slider(START).value).toBe('120');
    });
  });
});
