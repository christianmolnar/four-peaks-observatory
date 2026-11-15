'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A closed-by-default part of the open plan: one button that names it, a body that stays in the page while closed (so what it
 * measures and what the print sheet reads keep working) and is hidden. The open or closed state is the user's.
 */
export default function Collapsible({ id, title, children, defaultOpen = false }: { id: string; title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="border-t border-white/10">
      <h3 className="text-base font-normal text-white">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center gap-2 rounded text-left focus:outline-none focus:ring-2 focus:ring-sky-400"
        >
          <span aria-hidden="true" className="w-4 shrink-0 text-white/70">{open ? '▾' : '▸'}</span>
          {title}
        </button>
      </h3>
      <div id={`${id}-body`} hidden={!open} className="pb-3">
        {children}
      </div>
    </div>
  );
}
