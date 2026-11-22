'use client';
import { useLayoutEffect, useState } from 'react';
import { THEME_KEY } from './themeScript';

const btn =
  'inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] rounded border border-p-line/30 text-p-t1 text-sm font-normal hover:bg-p-raised/10 px-0 min-[390px]:px-3 sm:px-4';

const setTheme = (red: boolean) => {
  if (red) document.documentElement.setAttribute('data-theme', 'red');
  else document.documentElement.removeAttribute('data-theme');
};

/**
 * Night mode (red) for the telescope: one control in the header row. Day is the default; the choice is kept in this browser only (localStorage `planner.theme`), never in the account.
 * With storage blocked the switch still works for this visit and is just not remembered. The head script (themeScript.ts) has already set `data-theme` before paint on a reload; this component only follows it.
 * It also draws the hatch patterns the red charts fill with (zero size, out of the layout): in red each zone is told apart by its hatch, not its hue.
 */
export default function ThemeToggle() {
  const [red, setRed] = useState(false);

  // Before paint: take the stored choice (a client-side visit from another page has no head-script run), and leave the page Day when the planner closes.
  useLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(THEME_KEY);
    } catch {
      // Storage is blocked: the page stays Day until the switch is used.
    }
    const on = stored === 'red' || document.documentElement.getAttribute('data-theme') === 'red';
    setTheme(on);
    setRed(on);
    return () => setTheme(false);
  }, []);

  const toggle = () => {
    const next = !red;
    setTheme(next);
    setRed(next);
    try {
      window.localStorage.setItem(THEME_KEY, next ? 'red' : 'day');
    } catch {
      // Storage is blocked: not remembered, nothing else is lost.
    }
  };

  return (
    <>
      <button type="button" className={btn} aria-pressed={red} onClick={toggle} data-testid="theme-toggle">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
        {/* The words show when the slim header has room (from 390 px "Night mode", from 640 px with "(red)"); below that the moon stands alone and the name is read aloud. */}
        <span className="sr-only min-[390px]:not-sr-only whitespace-nowrap">
          Night mode<span className="sr-only sm:not-sr-only">{' (red)'}</span>
        </span>
      </button>
      <svg aria-hidden="true" focusable="false" width="0" height="0" className="absolute" data-testid="theme-hatches">
        <defs>
          <pattern id="fp-hatch-0" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--p-t1)" strokeWidth="2" />
          </pattern>
          <pattern id="fp-hatch-1" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--p-t1)" strokeWidth="2" />
          </pattern>
          <pattern id="fp-hatch-2" width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="3" x2="6" y2="3" stroke="var(--p-t1)" strokeWidth="2" />
          </pattern>
          <pattern id="fp-hatch-3" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.4" fill="var(--p-t1)" />
          </pattern>
        </defs>
      </svg>
    </>
  );
}
