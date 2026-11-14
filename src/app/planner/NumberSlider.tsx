'use client';

export interface NumberSliderProps {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** The text in the number box. The parent owns it; this control holds no state of its own. */
  text: string;
  /** Where the slider sits: always a number in range, chosen by the parent. */
  sliderValue: number;
  /** Called with the new text, from the box or the slider. */
  onText: (text: string) => void;
  /** The message for the current text, or null. Computed by the parent on every render. */
  error: string | null;
  /** Called when the box or the slider gets focus. */
  onFocus?: () => void;
  /** Called when Enter is pressed in the box. */
  onEnter?: () => void;
  /** Lines the message slot reserves. Two for a long message in a narrow column. */
  lines?: 1 | 2;
  /** From xl up, the box sits above the slider and both fill the column, so three of these fit in a row; the message gets two lines there, and no room at all while there is no message. */
  stackedAtXl?: boolean;
}

/**
 * A number box and a range slider for one text value. No state, no timers, no
 * blur handling: it shows what it is given and reports what the user types.
 * The message line is always in the page (so a screen reader hears it), at a fixed height while it
 * is in use; in the stacked layout it takes no room while there is no message.
 */
export default function NumberSlider({ id, label, unit, min, max, text, sliderValue, onText, error, onFocus, onEnter, lines = 1, stackedAtXl = false }: NumberSliderProps) {
  const msgId = `${id}-msg`;
  return (
    <div className="mb-3">
      <label htmlFor={`${id}-number`} className="block text-white/90 font-medium text-sm mb-1 leading-5">
        {label} ({unit})
      </label>
      <div className={`flex items-center gap-3 ${stackedAtXl ? 'xl:flex-col xl:items-stretch xl:gap-0' : ''}`}>
        <input
          id={`${id}-number`}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onFocus={onFocus}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
          aria-invalid={error !== null}
          aria-describedby={msgId}
          className={`h-11 w-20 shrink-0 ${stackedAtXl ? 'xl:w-full' : ''} rounded-lg bg-black/60 px-2 text-right text-white font-normal text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-400 ${
            error ? 'border-2 border-orange-400' : 'border border-white/30'
          }`}
        />
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={1}
          value={sliderValue}
          onChange={(e) => onText(e.target.value)}
          onFocus={onFocus}
          className={`h-11 min-w-0 flex-1 ${stackedAtXl ? 'xl:flex-none' : ''} accent-sky-400`}
        />
      </div>
      <p id={msgId} aria-live="polite" className={`${lines === 2 ? 'h-10' : stackedAtXl ? (error ? 'h-5 xl:h-10' : 'h-5 xl:h-0') : 'h-5'} text-sm leading-5 text-orange-300 font-normal overflow-hidden`}>
        {error && (
          <>
            <span aria-hidden="true">! </span>
            {error}
          </>
        )}
      </p>
    </div>
  );
}
