'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A closed-by-default part of the open plan: one button that names it, a body that stays in the page while closed (so what it
 * measures and what the print sheet reads keep working) and is hidden. The open or closed state is the user's.
 */
export default function Collapsible({ id, title, children, defaultOpen = false, openTick = 0 }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean; openTick?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  // A count the page raises to open this part (the plan rail's warnings link); the user's own open and close are unchanged.
  useEffect(() => {
    if (openTick > 0) setOpen(true);
  }, [openTick]);
  return (
    <div id={id} className="scroll-mt-4 border-t border-p-line/10">
      <h3 className="text-base font-normal text-p-t1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-2 rounded text-left"
        >
          <span aria-hidden="true" className="w-4 shrink-0 text-p-t1/70">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </h3>
      <div id={`${id}-body`} hidden={!open} className="pb-3">
        {children}
      </div>
    </div>
  );
}
