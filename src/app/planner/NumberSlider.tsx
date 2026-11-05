'use client';

import { useState } from 'react';
import { checkNumberText, numberView } from '@/planner/state';
import type { NumberDraft } from '@/planner/state';

export interface NumberSliderProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Slider step; the number box accepts any decimal in range. */
  step: number;
  value: number;
  /** Pure check: a message when the value would be refused, else null. Runs on every render. */
  validate?: (value: number) => string | null;
  /** Applies a value that passed `validate`. */
  onCommit: (value: number) => void;
}

/**
 * A range slider and a number box for one value, kept in sync both ways.
 * A typed value that is empty, not a number, out of range or refused by
 * `validate` shows a message and leaves the committed value (and slider) alone.
 * The box text and message are derived from the draft and `value` each render
 * (see `numberView`), so Discard, Reset or a change elsewhere cannot leave them stale.
 */
export default function NumberSlider({ id, label, unit, min, max, step, value, validate = () => null, onCommit }: NumberSliderProps) {
  const [draft, setDraft] = useState<NumberDraft | null>(null);
  const errorId = `${id}-error`;

  const view = numberView(draft, value, min, max, label, unit, validate);
  const enter = (text: string) => {
    setDraft({ text, base: value });
    const c = checkNumberText(text, min, max, label, unit);
    if (c.ok && validate(c.value) === null) onCommit(c.value);
  };

  const shown = view.text;
  const error = view.error;
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
          onChange={(e) => enter(e.target.value)}
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
          onChange={(e) => enter(e.target.value)}
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
