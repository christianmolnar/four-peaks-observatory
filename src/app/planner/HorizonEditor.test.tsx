/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PROFILE_KEY, sampleProfile } from '@/planner/state';
import PlannerApp from './PlannerApp';

// Real keystrokes, one key at a time, through the whole page. The expected values are the rows of the
// round-2 and round-3 failure tables. The form holds the text and nothing else holds a copy of it, so
// "Discard", "Use sample horizon", a site change and an import are each one assertion away from the truth.

const twoSites = () => {
  const p = sampleProfile();
  const other = { ...p.sites[0], id: 'other', name: 'Other Site' }; // same arc on purpose
  return { ...p, sites: [p.sites[0], other] };
};

const START = 'Start azimuth';
const END = 'End azimuth';
const HEIGHT = 'Height';
const MINALT = 'Minimum altitude';
const ID: Record<string, string> = { [START]: 'arc-start', [END]: 'arc-end', [HEIGHT]: 'arc-height', [MINALT]: 'min-alt' };

const box = (name: string) => screen.getByRole('spinbutton', { name: new RegExp(`^${name} \\(deg\\)`) }) as HTMLInputElement;
const slider = (name: string) => screen.getByRole('slider', { name: `${name} slider` }) as HTMLInputElement;
/** The text of a field's message line, without the decorative "! " that is hidden from screen readers. */
const msg = (name: string) => ((document.getElementById(`${ID[name]}-msg`) as HTMLElement).textContent as string).replace(/^! /, '');
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const summary = () => screen.getByTestId('horizon-summary').textContent;
const nightSummary = () => screen.getByTestId('night-summary').textContent;
const status = () => screen.getByTestId('horizon-status').textContent;
const stored = () => window.localStorage.getItem(PROFILE_KEY);
const storedArc = () => JSON.parse(stored() as string).sites[0].blockedArc;
const user = () => userEvent.setup();
type U = ReturnType<typeof user>;

const app = (profile = sampleProfile()) => render(<PlannerApp initialDate="2026-12-15" initialProfile={profile} />);

/** Replaces the box content with real key presses, one key at a time; the box stays focused. */
async function type(u: U, name: string, text: string) {
  const el = box(name);
  await u.clear(el);
  for (const key of text) {
    await u.keyboard(key);
    expect(document.activeElement).toBe(el);
  }
  expect(el.value).toBe(text);
}
const slide = (name: string, value: string) => fireEvent.change(slider(name), { target: { value } });

/** Everything the page shows about the three horizon boxes and Minimum altitude. */
const clean = () => {
  expect(box(START).value).toBe('120');
  expect(slider(START).value).toBe('120');
  expect(box(END).value).toBe('320');
  expect(box(HEIGHT).value).toBe('42');
  expect(slider(HEIGHT).value).toBe('42');
  for (const n of [START, END, HEIGHT, MINALT]) expect(msg(n)).toBe('');
};

beforeEach(() => {
  window.localStorage.clear();
  jest.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

describe('draft and commit', () => {
  it('starts with box and slider in sync with the saved arc, no message, nothing to save', () => {
    app();
    clean();
    expect(status()).toBe('');
    expect(button('Save horizon').disabled).toBe(true);
    expect(button('Discard changes').disabled).toBe(true);
  });

  it('typing a valid value previews it but stores nothing; only Save commits', async () => {
    app();
    const u = user();
    await type(u, START, '150');
    expect(slider(START).value).toBe('150');
    expect(summary()).toContain('150°');
    expect(status()).toBe('Unsaved changes');
    expect(stored()).toBeNull();
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 150, endAz: 320, heightDeg: 42 });
    expect(status()).toBe('Saved');
    await type(u, START, '151');
    expect(status()).toBe('Unsaved changes');
  });

  it('blur does nothing and there is no Escape handler: the text stays, nothing is stored', async () => {
    app();
    const u = user();
    await type(u, START, '500');
    await u.tab();
    await u.tab();
    expect(box(START).value).toBe('500');
    expect(msg(START)).toBe('Use 0 to 359 degrees.');
    await u.click(box(START));
    await u.keyboard('{Escape}');
    expect(box(START).value).toBe('500');
    expect(stored()).toBeNull();
  });

  it('retyping the saved value is not a change', async () => {
    app();
    const u = user();
    await type(u, START, '150');
    await type(u, START, '120');
    expect(status()).toBe('');
    expect(button('Save horizon').disabled).toBe(true);
  });

  it('Enter in a box saves when the form is valid and changed, and does nothing otherwise', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '95');
    await u.keyboard('{Enter}');
    expect(stored()).toBeNull();
    expect(document.activeElement).toBe(box(HEIGHT));
    expect(box(HEIGHT).value).toBe('95');
    await type(u, HEIGHT, '50');
    await u.keyboard('{Enter}');
    expect(storedArc()).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
    expect(status()).toBe('Saved');
  });

  it('the slider writes into the same text as the box', () => {
    app();
    slide(START, '200');
    expect(box(START).value).toBe('200');
    expect(summary()).toContain('200°');
    slide(START, '320'); // equals End: refused, the slider goes back to the plan's number
    expect(box(START).value).toBe('320');
    expect(msg(START)).toBe('Start and End must differ.');
    expect(msg(END)).toBe('Start and End must differ.');
    expect(slider(START).value).toBe('120');
    expect(summary()).toContain('120°');
  });

  it('whole degrees only: the box refuses a decimal with a message, the slider stays', async () => {
    app();
    const u = user();
    await type(u, START, '1.5');
    expect(msg(START)).toBe('Whole degrees only.');
    expect(slider(START).value).toBe('120');
    expect(summary()).toContain('120°');
  });

  it('the tab order is the number box, then its slider, field by field, then the buttons', async () => {
    app();
    const u = user();
    box(START).focus();
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      const el = document.activeElement as HTMLElement;
      seen.push(el.getAttribute('aria-label') || el.id || el.textContent || '');
      await u.tab();
    }
    expect(seen.slice(0, 6)).toEqual(['arc-start-number', 'Start azimuth slider', 'arc-end-number', 'End azimuth slider', 'arc-height-number', 'Height slider']);
    // Save and Discard are disabled on a clean form, so the next stop is Use sample horizon, then Clear horizon.
    expect(seen.slice(6, 9)).toEqual(['Use sample horizon', 'Clear horizon', 'Horizon as a table']);
  });

  it('the Edit horizon link jumps to the editor', () => {
    app();
    expect(screen.getByRole('link', { name: 'Edit horizon' }).getAttribute('href')).toBe('#horizon');
    expect(document.getElementById('horizon')).not.toBeNull();
  });
});

describe('nothing moves: the message lines and buttons are always there', () => {
  it('every message line exists before any error, and the same elements are used after', async () => {
    app();
    const u = user();
    const lines = [START, END, HEIGHT, MINALT].map((n) => document.getElementById(`${ID[n]}-msg`));
    expect(lines.every((l) => l !== null)).toBe(true);
    const buttons = ['Save horizon', 'Discard changes', 'Use sample horizon', 'Clear horizon'].map(button);
    await type(u, START, '500');
    await type(u, MINALT, '100');
    expect([START, END, HEIGHT, MINALT].map((n) => document.getElementById(`${ID[n]}-msg`))).toEqual(lines);
    expect(['Save horizon', 'Discard changes', 'Use sample horizon', 'Clear horizon'].map(button)).toEqual(buttons);
    for (const n of [START, END, HEIGHT, MINALT]) {
      expect(box(n).getAttribute('aria-describedby')).toBe(`${ID[n]}-msg`);
    }
    expect(box(START).getAttribute('aria-invalid')).toBe('true');
    expect(box(END).getAttribute('aria-invalid')).toBe('false');
  });
});

// Round-2 table 1: a bad value typed key by key.
describe.each([
  ['500 in Start', START, '500', 'Use 0 to 359 degrees.', '120'],
  ['361 in Start', START, '361', 'Use 0 to 359 degrees.', '120'],
  ['320 in Start (equals End)', START, '320', 'Start and End must differ.', '120'],
  ['91 in Height', HEIGHT, '91', 'Use 0 to 90 degrees.', '42'],
])('a bad value typed key by key: %s', (_n, name, text, message, original) => {
  it('shows the message, keeps slider and plan where they were, and Save is off', async () => {
    app();
    const u = user();
    const horizon = summary();
    await type(u, name, text);
    expect(msg(name)).toBe(message);
    expect(slider(name).value).toBe(original);
    expect(summary()).toBe(horizon);
    expect(button('Save horizon').disabled).toBe(true);
    expect(status()).toBe('Fix the highlighted box to save');
    expect(stored()).toBeNull();
  });

  it('then Discard on the first click restores the box and clears the message', async () => {
    app();
    const u = user();
    await type(u, name, text);
    await u.click(button('Discard changes'));
    clean();
  });
});

describe('Minimum altitude uses the same pattern and applies live once valid', () => {
  it('100 typed key by key: message names the number in use, slider and night summary stay', async () => {
    app();
    const u = user();
    const night = nightSummary();
    await type(u, MINALT, '100');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 20 until fixed.');
    expect(slider(MINALT).value).toBe('20');
    expect(nightSummary()).toBe(night);
    await type(u, MINALT, '35');
    expect(msg(MINALT)).toBe('');
    expect(slider(MINALT).value).toBe('35');
    expect(window.localStorage.getItem(PROFILE_KEY)).toBeNull(); // a plan input, not a saved draft
  });

  it('empty and decimal boxes say what is wrong', async () => {
    app();
    const u = user();
    await u.clear(box(MINALT));
    expect(msg(MINALT)).toBe('Enter a number from 0 to 89. Planning with 20 until fixed.');
    await type(u, MINALT, '2.5');
    expect(msg(MINALT)).toBe('Whole degrees only. Planning with 20 until fixed.');
  });
});

// Round-2 table 2: old drafts must not come back. Round-3 table 2: Minimum altitude too.
describe('external events set the boxes from the saved data, in one place', () => {
  it('type 150 in Start, Discard, then End to 150: Start shows 120, no message', async () => {
    app();
    const u = user();
    await type(u, START, '150');
    await u.click(button('Discard changes'));
    clean();
    await type(u, END, '150');
    expect(box(START).value).toBe('120');
    expect(slider(START).value).toBe('120');
    expect(msg(START)).toBe('');
    expect(msg(END)).toBe('');
    expect(box(END).value).toBe('150'); // the new End is a real edit, not a stale one
  });

  it('the message is derived: rejected 320 in Start, End to 300 (valid), End back to 320 (refused again)', async () => {
    app();
    const u = user();
    await type(u, START, '320');
    expect(msg(START)).toBe('Start and End must differ.');
    await type(u, END, '300');
    expect(msg(START)).toBe(''); // computed from the text on every render, so it cannot linger
    expect(msg(END)).toBe('');
    await type(u, END, '320');
    expect(msg(START)).toBe('Start and End must differ.');
    await u.click(button('Discard changes'));
    clean();
  });

  it('Height 50, bad 500 in Start, Discard: Start 120 and Height 42, no message', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '50');
    await type(u, START, '500');
    await u.click(button('Discard changes'));
    clean();
  });

  it.each([
    ['Use sample horizon', 'a horizon-only draft'],
    ['Replace profile with sample', 'the whole profile'],
  ])('bad 500 in Start, %s (%s): Start 120, no message, first click', async (label) => {
    app();
    const u = user();
    await type(u, START, '500');
    await u.click(button(label));
    clean();
  });

  it.each([['Use sample horizon'], ['Replace profile with sample']])('bad 95 in Height, %s: Height 42', async (label) => {
    app();
    const u = user();
    await type(u, HEIGHT, '95');
    await u.click(button(label));
    clean();
  });

  it('bad 500 in Start, switch to a site with the same start azimuth: 120, no message', async () => {
    app(twoSites());
    const u = user();
    await type(u, START, '500');
    await u.selectOptions(screen.getByLabelText('Site'), 'other');
    clean();
  });

  it('an unsaved valid 150 is dropped by a site change', async () => {
    app(twoSites());
    const u = user();
    await type(u, START, '150');
    await u.selectOptions(screen.getByLabelText('Site'), 'other');
    clean();
    expect(status()).toBe('');
  });

  it('Use sample horizon is an unsaved draft: Discard undoes it and nothing was stored', async () => {
    const p = sampleProfile();
    const saved = { ...p, sites: [{ ...p.sites[0], blockedArc: { startAz: 10, endAz: 100, heightDeg: 20 } }] };
    app(saved);
    const u = user();
    expect(box(START).value).toBe('10');
    await u.click(button('Use sample horizon'));
    clean();
    expect(status()).toBe('Unsaved changes');
    expect(stored()).toBeNull();
    await u.click(button('Discard changes'));
    expect(box(START).value).toBe('10');
    expect(box(HEIGHT).value).toBe('20');
  });

  describe.each([
    ['Use sample horizon'],
    ['Replace profile with sample'],
  ])('Minimum altitude has no stale draft after %s', (label) => {
    it('100 typed, then the button: 20, no message', async () => {
      app();
      const u = user();
      await type(u, MINALT, '100');
      await u.click(button(label));
      expect(box(MINALT).value).toBe('20');
      expect(slider(MINALT).value).toBe('20');
      expect(msg(MINALT)).toBe('');
    });
  });

  it('Minimum altitude: 100 typed, then a site change: 20, no message', async () => {
    app(twoSites());
    const u = user();
    await type(u, MINALT, '100');
    await u.selectOptions(screen.getByLabelText('Site'), 'other');
    expect(box(MINALT).value).toBe('20');
    expect(slider(MINALT).value).toBe('20');
    expect(msg(MINALT)).toBe('');
  });

  it('Minimum altitude: 100 typed, then an import: 20, no message', async () => {
    if (!Blob.prototype.text) {
      Blob.prototype.text = function (this: Blob) {
        return new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(String(r.result));
          r.onerror = () => rej(r.error);
          r.readAsText(this);
        });
      };
    }
    app();
    const u = user();
    await type(u, MINALT, '100');
    await type(u, START, '500');
    const file = new File([JSON.stringify(sampleProfile())], 'profile.json', { type: 'application/json' });
    await u.upload(screen.getByLabelText('Import profile (JSON)'), file);
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Imported/));
    expect(box(MINALT).value).toBe('20');
    expect(msg(MINALT)).toBe('');
    clean();
  });
});

// Round-3 table 1: the first mouse click after bad typing, no Enter or Tab in between.
describe('the first click after bad typing works (no key pressed after the last digit)', () => {
  it('500 in Start, Use sample horizon / Replace profile with sample: reset at once', async () => {
    for (const label of ['Use sample horizon', 'Replace profile with sample']) {
      app();
      const u = user();
      await type(u, START, '500');
      await u.click(button(label));
      clean();
      cleanup();
    }
  });

  it('95 in Height, Use sample horizon: 42, no message', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '95');
    await u.click(button('Use sample horizon'));
    clean();
  });

  it('Height 50, 500 in Start, Discard: 120 and 42, no message', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '50');
    await type(u, START, '500');
    await u.click(button('Discard changes'));
    clean();
  });

  it('Height 50, 500 in Start, Save horizon: nothing is stored; fix the box and one click stores it', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '50');
    await type(u, START, '500');
    await u.click(button('Save horizon'));
    expect(stored()).toBeNull();
    await type(u, START, '130');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 130, endAz: 320, heightDeg: 50 });
  });

  it('Height 50, bad Minimum altitude, Save horizon: stores the horizon with the original Start and End', async () => {
    app();
    const u = user();
    await type(u, HEIGHT, '50');
    await type(u, MINALT, '100');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
  });

  it('500 in Start, Clear horizon: cleared at once, and the message is gone', async () => {
    app();
    const u = user();
    await type(u, START, '500');
    await u.click(button('Clear horizon'));
    expect(screen.getByTestId('horizon-not-set')).toBeTruthy();
    expect(screen.queryByRole('spinbutton', { name: /^Start azimuth/ })).toBeNull();
  });
});

describe('Save after bad typing, then reload', () => {
  it('bad typing stores nothing; Discard and Save keep the original arc; a reload shows it', async () => {
    app();
    const u = user();
    await type(u, START, '500');
    expect(button('Save horizon').disabled).toBe(true);
    await u.click(button('Discard changes'));
    await type(u, HEIGHT, '50');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
    cleanup();
    render(<PlannerApp initialDate="2026-12-15" />);
    await waitFor(() => expect(box(HEIGHT).value).toBe('50'));
    expect(box(START).value).toBe('120');
    expect(box(END).value).toBe('320');
    expect(status()).toBe('');
  });

  it('an arc that crosses north saves and reloads', async () => {
    app();
    const u = user();
    await type(u, START, '300');
    await type(u, END, '60');
    await type(u, HEIGHT, '35');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 300, endAz: 60, heightDeg: 35 });
    cleanup();
    render(<PlannerApp initialDate="2026-12-15" />);
    await waitFor(() => expect(box(START).value).toBe('300'));
    expect(box(END).value).toBe('60');
  });
});

describe('Clear horizon and Add a blocked arc', () => {
  it('Clear is a draft: Discard brings the arc back; Save stores null', async () => {
    app();
    const u = user();
    await u.click(button('Clear horizon'));
    expect(screen.getByTestId('horizon-not-set')).toBeTruthy();
    expect(stored()).toBeNull();
    await u.click(button('Discard changes'));
    clean();
    await u.click(button('Clear horizon'));
    await u.click(button('Save horizon'));
    expect(storedArc()).toBeNull();
    await u.click(button('Add a blocked arc'));
    expect(box(START).value).toBe('90');
    expect(status()).toBe('Unsaved changes');
  });
});
