'use client';

import type { TextareaHTMLAttributes } from 'react';

/**
 * A one-line text box that wraps and grows down the screen instead of hiding text behind its edge.
 * Enter submits the form (as in a plain input) and never inserts a line break.
 */
export default function WrapText({ className = '', onChange, onKeyDown, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={1}
      {...rest}
      className={`block resize-none overflow-hidden [field-sizing:content] break-words ${className}`}
      onChange={(e) => {
        if (e.target.value.includes('\n')) e.target.value = e.target.value.replace(/\s*\n+\s*/g, ' ');
        onChange?.(e);
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === 'Enter' && !e.defaultPrevented) {
          e.preventDefault();
          e.currentTarget.form?.requestSubmit();
        }
      }}
    />
  );
}
