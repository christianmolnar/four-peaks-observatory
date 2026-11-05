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
  /** The committed value. The parent owns it; this control never holds a second copy. */
  value: number;
  /** Pure check: a message when the value would be refused, else null. */
  validate?: (value: number) => string | null;
  /** Applies a value that passed `validate`. */
  onCommit: (value: number) => void;
  /**
   * Anything else that can change what is committed without this control
   * changing `value` (Discard, Reset, a site change, an import, another field).
   * When it changes, the typed draft and its message are thrown away.
   */
  resetKey?: unknown;
}

interface Edit {
  /** Text being typed in the box; null when the user is not editing it. */
  draft: string | null;
  /** Why the last attempt was refused; null when there is none. */
  error: string | null;
}
const NO_EDIT: Edit = { draft: null, error: null };

/**
 * A range slider and a number box for one committed value.
 * - The slider commits immediately and ends any edit of the box.
 * - The box holds a local draft only while it is being edited. Typing changes
 *   nothing outside the box. Enter or leaving the box commits the draft if it
 *   is valid; otherwise the box shows the message and the committed value is
 *   untouched. Escape drops the draft.
 * - When `value` or `resetKey` changes, the draft and message are dropped.
 */
export default function NumberSlider({ id, label, unit, min, max, step, value, validate = () => null, onCommit, resetKey }: NumberSliderProps) {
  const [edit, setEdit] = useState<Edit>(NO_EDIT);
  const [seen, setSeen] = useState({ value, resetKey });
  if (seen.value !== value || seen.resetKey !== resetKey) {
    // The committed state moved under us: render again with no draft (React re-renders before painting).
    setSeen({ value, resetKey });
    setEdit(NO_EDIT);
  }
  const errorId = `${id}-error`;

  /** Commits text if it is valid, else keeps it and shows why. */
  const tryCommit = (text: string) => {
    const c = checkNumberText(text, min, max, label, unit);
    const error = c.ok ? validate(c.value) : c.error;
    if (c.ok && error === null) {
      setEdit(NO_EDIT);
      onCommit(c.value);
    } else {
      setEdit({ draft: text, error });
    }
  };
  const slide = (text: string) => {
    const n = Number(text);
    const error = validate(n);
    if (error === null) {
      setEdit(NO_EDIT);
      onCommit(n);
    } else {
      setEdit({ draft: null, error });
    }
  };

  const view = { text: edit.draft ?? String(value), error: edit.error };
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
          onChange={(e) => slide(e.target.value)}
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
          onChange={(e) => setEdit({ draft: e.target.value, error: null })}
          onBlur={() => {
            if (edit.draft !== null) tryCommit(edit.draft);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (edit.draft !== null) tryCommit(edit.draft);
            } else if (e.key === 'Escape') {
              setEdit(NO_EDIT);
            }
          }}
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
