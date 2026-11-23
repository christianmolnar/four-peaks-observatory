'use client';

import { MAX_NOTE_CHARS, TREND_TEXT } from '@/planner/itinerary';
import type { Slot } from '@/planner/itinerary';
import WrapText from './WrapText';

const field = 'bg-p-bg/60 border border-p-line/30 rounded px-2 py-1 text-p-t1 font-normal text-sm';

/**
 * The figures of one slot of the night, behind its card's Details: the changeover before it, its usable window, the altitude at its start,
 * middle and end, and the target's note. Labels and numbers only.
 */
export default function SlotDetails({ slot, first, formatTime, note, onNote }: { slot: Slot; first: boolean; formatTime: (d: Date) => string; note: string; onNote: (text: string) => void }) {
  const alt = slot.altitudes;
  return (
    <div className="space-y-1" data-testid={`slot-${slot.id}`}>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm font-normal text-p-t1">
        {!first && slot.changeover.parts.length > 0 && (
          <>
            <dt className="text-p-t2">Before</dt>
            <dd data-testid={`slot-before-${slot.id}`}>{slot.changeover.parts.map((p) => `${p.label} ${p.minutes} min`).join(', ')}</dd>
          </>
        )}
        {slot.integrationMin > 0 && (
          <>
            <dt className="text-p-t2">Slot</dt>
            <dd className="tabular-nums" data-testid={`slot-light-${slot.id}`}>
              {slot.subSeconds !== null && slot.subCount !== null ? `${slot.subSeconds} s × ${slot.subCount} subs = ${Math.round(slot.integrationMin * 10) / 10} min` : `${Math.round(slot.integrationMin)} min`}
            </dd>
          </>
        )}
        <dt className="text-p-t2">Window</dt>
        <dd>{slot.window ? `${formatTime(slot.window.start)} to ${formatTime(slot.window.end)}` : 'none'}</dd>
        <dt className="text-p-t2">Altitude</dt>
        <dd data-testid="slot-altitude">
          {alt
            ? `${Math.round(alt.start.altitude)}° ${alt.start.direction}, ${Math.round(alt.middle.altitude)}° ${alt.middle.direction}, ${Math.round(alt.end.altitude)}° ${alt.end.direction} (${TREND_TEXT[alt.trend]})`
            : 'none'}
        </dd>
      </dl>
      <div>
        <label htmlFor={`it-note-${slot.id}`} className="block text-p-t2 text-sm mb-0.5">Note</label>
        <WrapText id={`it-note-${slot.id}`} aria-label={`Note for ${slot.name}`} maxLength={MAX_NOTE_CHARS} className={`${field} min-h-11 w-full`} value={note} onChange={(e) => onNote(e.target.value)} />
      </div>
    </div>
  );
}
