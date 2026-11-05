'use client';

import { useState } from 'react';
import { checkNumberText } from '@/planner/state';

export interface NumberSliderProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Slider step; the number box accepts any decimal in range. */
  step: number;
  value: number;
  /** Applies the value; returns an error message, or null when it was accepted. */
  onCommit: (value: number) => string | null;
}

/**
 * A range slider and a number box for one value, kept in sync both ways.
 * A typed value that is empty, not a number, out of range or refused by
 * `onCommit` shows a message and leaves the committed value (and slider) alone.
 */
export default function NumberSlider({ id, label, unit, min, max, step, value, onCommit }: NumberSliderProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = `${id}-error`;

  const apply = (text: string): string | null => {
    const c = checkNumberText(text, min, max, label, unit);
    return c.ok ? onCommit(c.value) : c.error;
  };

  const onSlider = (text: string) => {
    setDraft(null);
    setError(apply(text));
  };

  const onNumber = (text: string) => {
    setDraft(text);
    setError(apply(text));
  };

  const shown = draft ?? String(value);
  const inputClass =
    'bg-black/60 border border-white/30 rounded px-2 py-1 text-white font-normal text-sm focus:outline-none focus:ring-2 focus:ring-sky-400';
  return (
    <div className="mb-4">
      <label htmlFor={`${id}-number`} className="block text-white/90 font-normal text-sm mb-1">
        {label} ({unit})
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => onSlider(e.target.value)}
          className="flex-1 accent-sky-400"
        />
        <input
          id={`${id}-number`}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={0.1}
          value={shown}
          onChange={(e) => onNumber(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          className={`${inputClass} w-24`}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-orange-300 font-normal text-sm mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
