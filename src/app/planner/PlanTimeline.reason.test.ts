import { slotSubReason } from './PlanTimeline';
import type { Slot } from '@/planner/itinerary';

const slot = (subSeconds: number, subCount: number, minutes: number) => ({ subSeconds, subCount, start: new Date(0), end: new Date(minutes * 60000) }) as unknown as Slot;

describe('slotSubReason', () => {
  it('names the 500-sub cap only when the row was lengthened for it and the slot is shorter', () => {
    expect(slotSubReason(slot(15, 280, 110), { subSeconds: 20, subCount: 429, lengthenedForCap: true })).toBe('Row plans 20 s × 429, held to 500 subs; this slot 15 s × 280.');
  });

  it('says only that the slot is planned for its own sky when the row was not lengthened (Moon at the slot start, say)', () => {
    const t = slotSubReason(slot(30, 198, 110), { subSeconds: 20, subCount: 400, lengthenedForCap: false });
    expect(t).toBe('Row plans 20 s × 400; this slot 30 s × 198.');
    expect(t).not.toMatch(/share|500/);
  });

  it('does not name the cap when the slot sub is longer than a capped row sub', () => {
    expect(slotSubReason(slot(30, 100, 60), { subSeconds: 20, subCount: 400, lengthenedForCap: true })).not.toMatch(/held to/);
  });
});
