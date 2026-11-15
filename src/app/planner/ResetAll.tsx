'use client';

import { useEffect, useRef, useState } from 'react';

const btn =
  'min-h-11 px-3 py-1.5 rounded border border-white/30 text-white font-normal text-sm hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-400';

/** What "Reset all" clears, in the words the confirmation shows. One list, so the page and the test say the same. */
export const RESET_LOSES = [
  'Your sites, each with its horizon and Minimum altitude.',
  'Your gear: scopes, cameras, filters, accessories and trains.',
  'Your plans: every saved plan, with its targets, times and notes, and every backup copy kept when plans could not be read or were replaced.',
  'Your favorite exposures, and every backup copy kept of them.',
  'The captured ticks.',
  'The remembered site and train choice.',
] as const;

/**
 * "Reset all" with its confirmation in the page (no browser dialog). Opening it moves focus to Cancel, the safe choice;
 * Cancel changes nothing and puts focus back on "Reset all". Confirming calls `onConfirm`, which returns the planner to
 * what a first visit shows; the page then puts focus back on the button (id `reset-all`).
 */
export default function ResetAll({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) cancel.current?.focus();
  }, [open]);
  return (
    <div>
      <button
        ref={opener}
        id="reset-all"
        type="button"
        className={btn}
        aria-expanded={open}
        aria-controls="reset-all-confirm"
        onClick={() => setOpen(true)}
      >
        Reset all
      </button>
      {open && (
        <div
          id="reset-all-confirm"
          role="group"
          aria-labelledby="reset-all-title"
          data-testid="reset-confirm"
          className="mt-3 max-w-xl rounded-lg border border-orange-300/50 bg-black/80 p-4"
        >
          <p id="reset-all-title" className="text-white font-normal text-sm">Reset everything to the starting point?</p>
          <p className="mt-1 text-white/90 font-normal text-sm">This clears, in this browser, and cannot be undone:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-white/90 font-normal text-sm">
            {RESET_LOSES.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-2 text-white/70 font-normal text-xs">The planner then shows the sample profile, as on a first visit. Export your profile first to keep a copy of it. Plans are not part of the profile export and cannot be recovered.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={btn} onClick={() => { setOpen(false); onConfirm(); }}>
              Yes, reset everything
            </button>
            <button
              ref={cancel}
              type="button"
              className={btn}
              onClick={() => {
                setOpen(false);
                opener.current?.focus();
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
