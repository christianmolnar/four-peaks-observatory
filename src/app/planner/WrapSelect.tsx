'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { SelectHTMLAttributes } from 'react';

/**
 * A native select whose chosen option is shown as wrapping text, so a long name is never cut off at the box edge.
 * The real select sits invisibly on top: keyboard, screen readers and the phone's own picker work as before.
 */
export default function WrapSelect({ className = '', children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const ref = useRef<HTMLSelectElement>(null);
  const [text, setText] = useState('');
  useLayoutEffect(() => {
    const t = ref.current?.selectedOptions[0]?.text ?? '';
    if (t !== text) setText(t);
  });
  return (
    <div className={`relative focus-within:ring-2 focus-within:ring-sky-400 rounded ${rest.disabled ? 'opacity-40' : ''} ${className}`}>
      <div className="flex min-h-11 items-center gap-2 rounded border border-white/30 bg-black/60 px-2 py-1 text-sm font-normal text-white" aria-hidden="true">
        <span className="min-w-0 flex-1 break-words">{text || ' '}</span>
        <span className="shrink-0 text-white/70">▾</span>
      </div>
      <select ref={ref} {...rest} className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default">
        {children}
      </select>
    </div>
  );
}
