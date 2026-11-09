import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import { buildItinerary } from '../itinerary';
import type { ItineraryItem } from '../itinerary';
import { slotInputFor } from '../itinerary/resolve';
import { ITINERARY_CSV_HEADER, itineraryToCsv, itineraryToJson } from './index';

const profile = validateProfile(sample);
const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
const NIGHT = tonightsNight(SITE, '2026-12-15');
const fmt = (d: Date) => d.toISOString().slice(11, 16);
const items: ItineraryItem[] = ['m31', 'm42'].map((targetId, i) => ({ id: `e${i}`, targetId, trainId: 'deep-c11-reducer-533', filterId: null, mode: 'balanced', note: i ? 'say, "hi"' : '' }));
const plan = buildItinerary({ site: SITE, night: NIGHT, horizon: arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 }), minAltitude: 20, bortle: 6, slots: items.map((i) => slotInputFor(i, profile, starterTargets)), formatTime: fmt });

describe('itinerary export', () => {
  it('CSV: a header, then one row per slot with start, end and the three altitudes with directions', () => {
    const lines = itineraryToCsv(plan, fmt).trimEnd().split('\r\n');
    expect(lines[0].split(',')).toHaveLength(ITINERARY_CSV_HEADER.length);
    expect(lines).toHaveLength(3);
    const a = plan.slots[0].altitudes!;
    expect(lines[1]).toContain(`${fmt(plan.slots[0].start)},${fmt(plan.slots[0].end)}`);
    expect(lines[1]).toContain(`${a.start.altitude.toFixed(1)},${a.start.direction},${a.middle.altitude.toFixed(1)},${a.middle.direction},${a.end.altitude.toFixed(1)},${a.end.direction}`);
    expect(lines[2]).toContain('"say, ""hi"""');
  });
  it('CSV: a note that starts like a formula is exported as text; JSON keeps it as typed', () => {
    const hostile = items.map((i, k) => ({ ...i, note: k ? '+1+2' : '=HYPERLINK("http://x","click")' }));
    const p = buildItinerary({ site: SITE, night: NIGHT, horizon: null, minAltitude: 20, bortle: 6, slots: hostile.map((i) => slotInputFor(i, profile, starterTargets)), formatTime: fmt });
    const lines = itineraryToCsv(p, fmt).trimEnd().split('\r\n');
    expect(lines[1].endsWith(',"\'=HYPERLINK(""http://x"",""click"")"')).toBe(true);
    expect(lines[2].endsWith(",'+1+2")).toBe(true);
    expect(JSON.parse(itineraryToJson(p)).slots.map((s: { note: string }) => s.note)).toEqual(['=HYPERLINK("http://x","click")', '+1+2']);
  });
  it('JSON: start time, instants and altitudes per slot', () => {
    const j = JSON.parse(itineraryToJson(plan));
    expect(j.startsAt).toBe(plan.startsAt.toISOString());
    expect(j.slots).toHaveLength(2);
    expect(j.slots[0].start).toBe(plan.slots[0].start.toISOString());
    expect(Object.keys(j.slots[0].altitudes)).toEqual(['start', 'middle', 'end', 'trend']);
    expect(Math.abs(j.slots[0].altitudes.start.altitudeDeg - plan.slots[0].altitudes!.start.altitude)).toBeLessThan(0.1);
  });
  it('a slot with no time has blank times and altitudes, not zeros', () => {
    const none = buildItinerary({ site: SITE, night: NIGHT, horizon: null, minAltitude: 20, bortle: 6, slots: items.map((i) => slotInputFor(i, profile, starterTargets)), startAt: new Date((NIGHT.end as Date).getTime() + 3600000), formatTime: fmt });
    const row = itineraryToCsv(none, fmt).split('\r\n')[1].split(',');
    expect(row.slice(5, 7)).toEqual(['', '']);
    expect(row.slice(8, 15)).toEqual(['', '', '', '', '', '', '']);
    expect(JSON.parse(itineraryToJson(none)).slots[0]).toMatchObject({ start: null, altitudes: null });
  });
});
