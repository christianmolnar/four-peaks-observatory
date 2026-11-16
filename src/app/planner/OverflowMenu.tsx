'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface OverflowItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
}

/**
 * A "More" button with a short menu under it (Export CSV, Print). Keyboard: Enter, Space or Down opens it on the first item,
 * Up and Down move, Home and End jump, Escape closes and returns to the button, Tab closes. A press outside closes it.
 */
export default function OverflowMenu({ label, items, triggerId }: { label: string; items: readonly OverflowItem[]; triggerId?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const itemEls = useRef<(HTMLButtonElement | null)[]>([]);
  // Which item takes focus when the menu opens: -1 for the last, else its index.
  const first = useRef(0);

  const enabled = () => itemEls.current.filter((el): el is HTMLButtonElement => el !== null && !el.disabled);
  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const list = enabled();
    (first.current < 0 ? list[list.length - 1] : list[first.current])?.focus();
    const outside = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const move = (to: (list: HTMLButtonElement[], at: number) => number) => {
    const list = enabled();
    if (list.length === 0) return;
    list[to(list, list.indexOf(document.activeElement as HTMLButtonElement))]?.focus();
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          first.current = 0;
          setOpen(!open);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            first.current = e.key === 'ArrowDown' ? 0 : -1;
            setOpen(true);
          }
        }}
        className="min-h-11 rounded border border-p-line/30 px-3 text-sm font-normal text-p-t1 hover:bg-p-raised/10"
      >
        {label} <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className="absolute left-0 z-40 md:left-auto md:right-0 mt-1 min-w-48 rounded border border-p-line/30 bg-p-surface py-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close(true);
            } else if (e.key === 'Tab') close(false);
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              move((l, at) => (at + 1) % l.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move((l, at) => (at <= 0 ? l.length - 1 : at - 1));
            } else if (e.key === 'Home') {
              e.preventDefault();
              move(() => 0);
            } else if (e.key === 'End') {
              e.preventDefault();
              move((l) => l.length - 1);
            }
          }}
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              ref={(el) => {
                itemEls.current[i] = el;
              }}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                close(true);
                it.onSelect();
              }}
              className="block min-h-11 w-full px-3 text-left text-sm font-normal text-p-t1 hover:bg-p-raised/10 focus:bg-p-raised/10 focus:outline-none disabled:opacity-40"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
