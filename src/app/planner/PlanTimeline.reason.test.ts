import { slotSubReason } from './PlanTimeline';
import type { Slot } from '@/planner/itinerary';

const slot = (subSeconds: number, subCount: number, minutes: number) => ({ subSeconds, subCount, start: new Date(0), end: new Date(minutes * 60000) }) as unknown as Slot;

describe('slotSubReason', () => {
  it('names the 500-sub cap only when the row was lengthened for it and the slot is shorter', () => {
    expect(slotSubReason(slot(15, 280, 110), { subSeconds: 20, subCount: 429, lengthenedForCap: true })).toBe(
      "The target's row plans 20 s x 429 subs for the night. The row's sub is lengthened so the whole night stays within 500 subs; this slot has 110 minutes, which need no such stretch: 15 s x 280.",
    );
  });

  it('says only that the slot is planned for its own sky when the row was not lengthened (Moon at the slot start, say)', () => {
    const t = slotSubReason(slot(30, 198, 110), { subSeconds: 20, subCount: 400, lengthenedForCap: false });
    expect(t).toBe("The target's row plans 20 s x 400 subs for the night. This slot is planned for the sky during its own time: 30 s x 198.");
    expect(t).not.toMatch(/share|500/);
  });

  it('does not name the cap when the slot sub is longer than a capped row sub', () => {
    expect(slotSubReason(slot(30, 100, 60), { subSeconds: 20, subCount: 400, lengthenedForCap: true })).toMatch(/for the sky during its own time/);
  });
});
