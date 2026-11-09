/**
 * @jest-environment jsdom
 */
import { act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
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
// The page ends a run of typing 600 ms after the last key (a real timer). On a busy machine one key took longer than that to render,
// and the run ended in the middle of a test. A fake clock moves only when the test says so (`pause`), whatever the load.
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  act(() => jest.runOnlyPendingTimers());
  jest.useRealTimers();
});
const user = () => userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
type U = ReturnType<typeof user>;

/** A pause in typing longer than the run boundary (600 ms in PlannerApp). */
const pause = async () => {
  await act(async () => {
    jest.advanceTimersByTime(750);
  });
};

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
/**
 * One arrow key on a focused range input. jsdom has no native slider behaviour, so after the real key events
 * this does what a browser does: moves the slider's own value by one step and fires the change.
 */
async function arrow(u: U, el: HTMLInputElement, key: 'ArrowRight' | 'ArrowLeft') {
  expect(document.activeElement).toBe(el);
  await u.keyboard(`{${key}}`);
  fireEvent.change(el, { target: { value: String(Number(el.value) + (key === 'ArrowRight' ? 1 : -1)) } });
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
    expect(summary()).toContain('120°'); // the plan uses the saved arc until Save
    expect(screen.getByRole('img', { name: /Horizon, seen from above/ }).textContent).toContain('from 150 deg'); // the chart previews
    expect(status()).toBe('Unsaved changes');
    expect(stored()).toBeNull();
    await u.click(button('Save horizon'));
    expect(summary()).toContain('150°');
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
    expect(summary()).toContain('120°');
    slide(START, '320'); // equals End: refused, but the slider still follows its own box
    expect(box(START).value).toBe('320');
    expect(msg(START)).toBe('Start and End must differ.');
    expect(msg(END)).toBe('Start and End must differ.');
    expect(slider(START).value).toBe('320');
    expect(summary()).toContain('120°');
  });

  it('arrow keys on the Start slider cross End one degree at a time: 318 then five presses gives 319 to 323', async () => {
    app();
    const u = user();
    await type(u, START, '318');
    await u.tab();
    expect(document.activeElement).toBe(slider(START));
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      await arrow(u, slider(START), 'ArrowRight');
      seen.push(box(START).value);
      expect(slider(START).value).toBe(box(START).value);
    }
    expect(seen).toEqual(['319', '320', '321', '322', '323']);
    expect(msg(START)).toBe('');
  });

  it('arrow keys on the End slider cross Start one degree at a time: 122 then four presses gives 121 to 118', async () => {
    app();
    const u = user();
    await type(u, END, '122');
    await u.tab();
    expect(document.activeElement).toBe(slider(END));
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      await arrow(u, slider(END), 'ArrowLeft');
      seen.push(box(END).value);
      expect(slider(END).value).toBe(box(END).value);
    }
    expect(seen).toEqual(['121', '120', '119', '118']);
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
    // A box with a message that is not a number in range leaves the slider alone; a refused arc made of two good numbers does not.
    expect(slider(name).value).toBe(text === '320' ? '320' : original);
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

  it('from a saved 30, typing 450 key by key ends on 30 and the message names 30, never a prefix', async () => {
    app();
    const u = user();
    await type(u, MINALT, '30');
    const rows = screen.getByTestId('target-table').textContent;
    expect(msg(MINALT)).toBe('');
    await pause(); // 30 is now the value in effect; a new run of typing begins
    await u.clear(box(MINALT));
    for (const key of '450') {
      await u.keyboard(key);
      if (box(MINALT).value === '450') {
        expect(slider(MINALT).value).toBe('30');
        expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 30 until fixed.');
        expect(screen.getByTestId('target-table').textContent).toBe(rows);
      }
    }
    expect(box(MINALT).value).toBe('450');
    expect(slider(MINALT).value).toBe('30');
    expect(screen.getByTestId('target-table').textContent).toBe(rows);
  });

  it('a bad Minimum altitude keeps 30 whether it is emptied or has a digit added', async () => {
    app();
    const u = user();
    await type(u, MINALT, '30');
    const rows = screen.getByTestId('target-table').textContent;
    await pause();
    await u.clear(box(MINALT));
    expect(msg(MINALT)).toBe('Enter a number from 0 to 89. Planning with 30 until fixed.');
    expect(slider(MINALT).value).toBe('30');
    await type(u, MINALT, '30');
    await pause();
    await u.keyboard('0'); // 300, appended to the 30 in effect
    expect(box(MINALT).value).toBe('300');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 30 until fixed.');
    expect(screen.getByTestId('target-table').textContent).toBe(rows);
  });

  // Backspace and one-run rules: real key events, one at a time.
  it('45 in effect, Backspace twice: plan, slider and message name 45, never the prefix 4', async () => {
    app();
    const u = user();
    await type(u, MINALT, '45');
    await u.tab();
    await u.click(box(MINALT)); // focus: 45 is in effect
    const rows45 = screen.getByTestId('target-table').textContent;
    await u.keyboard('{End}{Backspace}');
    expect(box(MINALT).value).toBe('4'); // 4 is a valid number and applies live
    await u.keyboard('{Backspace}');
    expect(box(MINALT).value).toBe('');
    expect(msg(MINALT)).toBe('Enter a number from 0 to 89. Planning with 45 until fixed.');
    expect(slider(MINALT).value).toBe('45');
    expect(screen.getByTestId('target-table').textContent).toBe(rows45);
  });

  it('default 20, Backspace twice: plan stays 20 and the list keeps its rows', async () => {
    app();
    const u = user();
    const rows20 = screen.getByTestId('target-table').textContent;
    const count = screen.getByTestId('target-table').querySelectorAll('tbody tr').length;
    await u.click(box(MINALT));
    await u.keyboard('{End}{Backspace}');
    expect(box(MINALT).value).toBe('2');
    await u.keyboard('{Backspace}');
    expect(box(MINALT).value).toBe('');
    expect(msg(MINALT)).toBe('Enter a number from 0 to 89. Planning with 20 until fixed.');
    expect(slider(MINALT).value).toBe('20');
    expect(screen.getByTestId('target-table').textContent).toBe(rows20);
    expect(screen.getByTestId('target-table').querySelectorAll('tbody tr').length).toBe(count);
  });

  it('focus capture: 30 set, Tab away, click, select all, 450 without clearing: the message names 30', async () => {
    app();
    const u = user();
    await type(u, MINALT, '30');
    await u.tab(); // leaves the box
    const rows30 = screen.getByTestId('target-table').textContent;
    await u.click(box(MINALT));
    await u.keyboard('{Control>}a{/Control}');
    for (const key of '450') await u.keyboard(key);
    expect(box(MINALT).value).toBe('450');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 30 until fixed.');
    expect(slider(MINALT).value).toBe('30');
    expect(screen.getByTestId('target-table').textContent).toBe(rows30);
  });

  it('one run: click, 30, select all, 450 with no pause names the value before the run (20), not 30', async () => {
    app();
    const u = user();
    await u.click(box(MINALT));
    await u.keyboard('{Control>}a{/Control}30');
    expect(box(MINALT).value).toBe('30');
    await u.keyboard('{Control>}a{/Control}450');
    expect(box(MINALT).value).toBe('450');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 20 until fixed.'); // within one run
    expect(slider(MINALT).value).toBe('20');
  });

  it('a pause ends the run: type 30, pause, select all, 450: the message names 30', async () => {
    app();
    const u = user();
    await u.click(box(MINALT));
    await u.keyboard('{Control>}a{/Control}30');
    await pause();
    await u.keyboard('{Control>}a{/Control}450');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 30 until fixed.');
    expect(slider(MINALT).value).toBe('30');
  });

  it('Enter ends the run: type 30, Enter, select all, 450: the message names 30', async () => {
    app();
    const u = user();
    await u.click(box(MINALT));
    await u.keyboard('{Control>}a{/Control}30{Enter}{Control>}a{/Control}450');
    expect(msg(MINALT)).toBe('Use 0 to 89. Planning with 30 until fixed.');
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

describe('the target list plans from the saved arc until Save', () => {
  const rows = () => screen.getByTestId('target-table').textContent;

  it('typing 500 in Start, key by key, never changes the list or the Tonight summary', async () => {
    app();
    const u = user();
    const before = [rows(), summary()];
    await u.clear(box(START));
    for (const key of '500') {
      await u.keyboard(key);
      expect([rows(), summary()]).toEqual(before);
    }
  });

  it('a valid draft (Height 80) previews in the chart only; Save moves the list', async () => {
    app();
    const u = user();
    const before = [rows(), summary()];
    await type(u, HEIGHT, '80');
    expect([rows(), summary()]).toEqual(before);
    expect(screen.getByRole('img', { name: /Horizon, seen from above/ }).textContent).toContain('up to 80 deg');
    await u.click(button('Save horizon'));
    expect(rows()).not.toBe(before[0]);
    expect(summary()).toContain('80°');
  });

  it('Minimum altitude still applies live', async () => {
    app();
    const u = user();
    const before = rows();
    await type(u, MINALT, '60');
    expect(rows()).not.toBe(before);
  });

  it('a number written differently is the same arc: 0120 over a saved 120 is no change, and 045 saves as 45 and reads Saved', async () => {
    app();
    const u = user();
    fireEvent.change(box(START), { target: { value: '0120' } });
    expect(box(START).value).toBe('0120');
    expect(status()).toBe('');
    expect(button('Save horizon').disabled).toBe(true);
    fireEvent.change(box(HEIGHT), { target: { value: '045' } });
    expect(box(HEIGHT).value).toBe('045');
    expect(status()).toBe('Unsaved changes');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 120, endAz: 320, heightDeg: 45 });
    expect(status()).toBe('Saved');
    expect(button('Save horizon').disabled).toBe(true);
  });
});

describe('toasts clear themselves and never take a click', () => {
  afterEach(() => jest.useRealTimers());

  it('the notice carries pointer-events-none up its chain and is gone after the timeout; Save then works first time', async () => {
    jest.useFakeTimers();
    app();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await u.click(button('Replace profile with sample'));
    const toast = screen.getByRole('status');
    expect(toast.textContent).toBe('Sample profile restored.');
    for (let el: HTMLElement | null = toast; el && el !== document.body; el = el.parentElement) {
      if (el.className.includes('fixed')) break;
      expect(el.className).toContain('pointer-events-none');
    }
    expect(toast.parentElement?.className).toContain('pointer-events-none');
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(screen.queryByRole('status')).toBeNull();
    await type(u, HEIGHT, '50');
    await u.click(button('Save horizon'));
    expect(storedArc()).toEqual({ startAz: 120, endAz: 320, heightDeg: 50 });
  });

  it('an error toast also clears and is click-through', async () => {
    jest.useFakeTimers();
    window.localStorage.setItem(PROFILE_KEY, '{not json');
    render(<PlannerApp initialDate="2026-12-15" />);
    const alert = await screen.findByRole('alert');
    expect(alert.className).toContain('pointer-events-none');
    expect(alert.parentElement?.className).toContain('pointer-events-none');
    act(() => {
      jest.advanceTimersByTime(9000);
    });
    expect(screen.queryByRole('alert')).toBeNull();
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
