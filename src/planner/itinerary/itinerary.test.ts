import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { moonIllumination, moonSeparation, bodyAltAz, nextMeridianTransit } from '../astro';
import { nextBodyTransit } from '../astro/bodies';
import { planExposure } from '../exposure';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import {
  FILTER_CHANGE_MIN,
  ItineraryError,
  MAX_SLOTS,
  PLANET_SLOT_MIN,
  REFOCUS_AFTER_CHANGE_MIN,
  SLEW_CENTER_MIN,
  TRAIN_CHANGE_MIN,
  buildItinerary,
  changeoverBetween,
  moveItem,
  parseItinerary,
  serializeItinerary,
  validateItinerary,
  worstCaseWarningTexts,
} from './index';
import type { ItineraryItem } from './index';
import { slotInputFor } from './resolve';

const profile = validateProfile(sample);
const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 0 };
const HORIZON = arcToHorizonPoints({ startAz: 120, endAz: 320, heightDeg: 42 });
const NIGHT = tonightsNight(SITE, '2026-12-15'); // 01:49 to 12:55 UTC
const fmt = (d: Date) => d.toISOString().slice(11, 16);
const REDUCER_533 = 'deep-c11-reducer-533';
const NATIVE_2600 = 'deep-c11-2600';

let n = 0;
const item = (targetId: string, over: Partial<ItineraryItem> = {}): ItineraryItem => ({
  id: `i${++n}`, targetId, trainId: REDUCER_533, filterId: null, mode: 'balanced', note: '', ...over,
});
const build = (items: ItineraryItem[], over: Partial<Parameters<typeof buildItinerary>[0]> = {}) =>
  buildItinerary({ site: SITE, night: NIGHT, horizon: HORIZON, minAltitude: 20, bortle: 6, slots: items.map((i) => slotInputFor(i, profile, starterTargets)), formatTime: fmt, ...over });
const codes = (s: { warnings: { code: string }[] }) => s.warnings.map((w) => w.code);
const MIN = 60000;

describe('changeover between slots', () => {
  it('same train and filter: slew and centre only', () => {
    expect(changeoverBetween({ trainId: 'a', filterId: null }, { trainId: 'a', filterId: null }).minutes).toBe(SLEW_CENTER_MIN);
  });
  it('a filter change adds the swap and a refocus', () => {
    const c = changeoverBetween({ trainId: 'a', filterId: null }, { trainId: 'a', filterId: 'f' });
    expect(c.minutes).toBe(SLEW_CENTER_MIN + FILTER_CHANGE_MIN + REFOCUS_AFTER_CHANGE_MIN);
    expect(c.parts.map((p) => p.label)).toEqual(['slew and centre', 'filter change', 'refocus']);
  });
  it('a train change adds the swap and a refocus', () => {
    const c = changeoverBetween({ trainId: 'a', filterId: null }, { trainId: 'b', filterId: null });
    expect(c.minutes).toBe(SLEW_CENTER_MIN + TRAIN_CHANGE_MIN + REFOCUS_AFTER_CHANGE_MIN);
  });
  it('both: one refocus, not two', () => {
    const c = changeoverBetween({ trainId: 'a', filterId: null }, { trainId: 'b', filterId: 'f' });
    expect(c.minutes).toBe(3 + 15 + 2 + 3);
    expect(c.parts.filter((p) => p.label === 'refocus')).toHaveLength(1);
  });
});

describe('the saved form', () => {
  const items = [item('m31'), item('m33', { filterId: 'zwo-duo-band', mode: 'quick', note: 'check the guide star' })];
  it('round-trips through the versioned text', () => {
    const text = serializeItinerary(items);
    expect(JSON.parse(text).version).toBe(1);
    expect(parseItinerary(text)).toEqual({ version: 1, items });
  });
  it('rejects a wrong version, a bad mode, a duplicate id, too many slots and bad JSON, each with a path', () => {
    const ok = { version: 1, items };
    expect(() => validateItinerary({ ...ok, version: 2 })).toThrow(/\$\.version/);
    expect(() => validateItinerary({ ...ok, items: [{ ...items[0], mode: 'fast' }] })).toThrow(/\$\.items\[0\]\.mode/);
    expect(() => validateItinerary({ ...ok, items: [items[0], items[0]] })).toThrow(/\$\.items\[1\]\.id: duplicate/);
    expect(() => validateItinerary({ ...ok, items: Array.from({ length: MAX_SLOTS + 1 }, (_, i) => ({ ...items[0], id: `x${i}` })) })).toThrow(/at most 8 slots/);
    expect(() => validateItinerary({ ...ok, items: [{ ...items[0], filterId: 3 }] })).toThrow(/filterId/);
    expect(() => validateItinerary({ ...ok, items: [{ ...items[0], note: 'x'.repeat(201) }] })).toThrow(/at most 200/);
    expect(() => parseItinerary('{nope')).toThrow(ItineraryError);
    expect(() => parseItinerary('null')).toThrow(/\$: must be an object/);
  });
});

describe('moving a slot', () => {
  const a = item('m31');
  const b = item('m33');
  const c = item('ic405');
  const list = [a, b, c];
  it('up and down swap neighbours and leave the input alone', () => {
    expect(moveItem(list, b.id, -1).map((x) => x.id)).toEqual([b.id, a.id, c.id]);
    expect(moveItem(list, b.id, 1).map((x) => x.id)).toEqual([a.id, c.id, b.id]);
    expect(list.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });
  it('at either end, or for an unknown id, the order stays', () => {
    expect(moveItem(list, a.id, -1).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(moveItem(list, c.id, 1).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
    expect(moveItem(list, 'nope', 1).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe('the schedule', () => {
  it('the first slot starts when its target clears the horizon and takes subs and count from the exposure module', () => {
    const m31 = item('m31');
    const plan = build([m31]);
    const s = plan.slots[0];
    expect(fmt(s.start)).toBe('01:49'); // M31 is up from dusk
    expect(s.window && fmt(s.window.end)).toBe('06:35');
    const target = starterTargets.find((t) => t.id === 'm31')!;
    const src = slotInputFor(m31, profile, starterTargets);
    const direct = planExposure({
      target: src.exposureTarget, train: src.optics!, camera: src.camera!, filter: null,
      sky: { bortle: 6, moonIllumination: moonIllumination(s.start), moonSeparationDeg: moonSeparation(target.raHours, target.decDeg, s.start, SITE), moonUp: bodyAltAz('Moon', s.start, SITE).altitude > 0 },
      usableMinutes: (s.window!.end.getTime() - s.start.getTime()) / MIN, acquisitionStart: s.start,
      transitTime: nextMeridianTransit(target.raHours, target.decDeg, s.start, SITE),
    });
    if (!direct.ok) throw new Error('not ok');
    expect(s.subSeconds).toBe(direct.modes.balanced.subSeconds);
    expect(s.subCount).toBe(direct.modes.balanced.subCount);
    expect(s.integrationMin).toBe(direct.modes.balanced.integrationMin);
    expect(s.end.getTime()).toBe(direct.modes.balanced.finish!.getTime());
    expect(s.label).toBe('estimate');
  });

  it('the second slot starts after the first ends plus the changeover; reordering moves the start times', () => {
    const a = item('m31');
    const b = item('ic405');
    const ab = build([a, b]);
    expect(ab.slots[1].start.getTime()).toBe(ab.slots[0].end.getTime() + SLEW_CENTER_MIN * MIN);
    expect(ab.slots[1].changeover.minutes).toBe(SLEW_CENTER_MIN);
    const ba = build(moveItem([a, b], b.id, -1));
    expect(ba.slots[0].name).toBe(ab.slots[1].name);
    expect(ba.slots[1].start.getTime()).toBe(ba.slots[0].end.getTime() + SLEW_CENTER_MIN * MIN);
    expect(ba.slots[0].start.getTime()).toBe(ab.slots[0].start.getTime());
    expect(ba.slots[1].start.getTime()).not.toBe(ab.slots[1].start.getTime());
  });

  it('a different filter on the second slot adds the swap and a refocus to the gap', () => {
    const plan = build([item('m31'), item('ic405', { filterId: 'zwo-duo-band' })]);
    expect(plan.slots[1].changeover.minutes).toBe(8);
    expect(plan.slots[1].start.getTime()).toBe(plan.slots[0].end.getTime() + 8 * MIN);
    expect(plan.totals.filterChanges).toBe(1);
    expect(plan.totals.changeoverMin).toBe(8);
  });

  it('a different train adds the train change, and a different focal ratio changes the subs', () => {
    const same = build([item('m31'), item('ic405')]);
    const swapped = build([item('m31'), item('ic405', { trainId: NATIVE_2600 })]);
    expect(swapped.slots[1].changeover.minutes).toBe(3 + 15 + 3);
    expect(swapped.totals.trainChanges).toBe(1);
    expect(swapped.slots[1].subSeconds).not.toBe(same.slots[1].subSeconds);
  });

  it('dropping the overhead would be visible: the gap between two slots is never shorter than the changeover', () => {
    const plan = build([item('m31'), item('ic405', { filterId: 'zwo-duo-band', trainId: NATIVE_2600 })]);
    const gap = (plan.slots[1].start.getTime() - plan.slots[0].end.getTime()) / MIN;
    expect(gap).toBeGreaterThanOrEqual(plan.slots[1].changeover.minutes);
    expect(plan.slots[1].changeover.minutes).toBe(3 + 15 + 2 + 3);
  });

  it('a slot that waits for its target says how long and when the window opens', () => {
    const plan = build([item('m81')]); // m81 clears the horizon at 03:22
    expect(fmt(plan.slots[0].start)).toBe('03:22');
    expect(plan.slots[0].waitMin).toBeCloseTo((plan.slots[0].start.getTime() - NIGHT.start!.getTime()) / MIN, 6);
    expect(codes(plan.slots[0])).toContain('waits');
    expect(plan.slots[0].warnings.find((w) => w.code === 'waits')!.text).toMatch(/^Waits 93 min for Bode's Galaxy to clear the horizon \(its window opens 03:22\)\./);
  });

  it('a slot that starts after its window opened and gets too little is flagged with times, and is cut short', () => {
    const plan = build([item('m42'), item('m33')]); // Orion waits for 05:25 and ends 07:00; Triangulum's only window is 01:49 to 07:11
    const s = plan.slots[1];
    expect(codes(s)).toEqual(['overlap', 'cut-short']);
    const overlap = s.warnings.find((w) => w.code === 'overlap')!;
    expect(overlap.severity).toBe('warning');
    expect(overlap.text).toMatch(/Overlaps its usable window: the slot before ends 07:00, 3\d\d min after Triangulum Galaxy's window opened \(\d\d:\d\d\), and the window closes 07:11\./);
    expect(fmt(s.window!.end)).toBe('07:11');
    expect(s.end.getTime()).toBeLessThanOrEqual(s.window!.end.getTime());
    // The other order gives the Triangulum Galaxy its whole window: no overlap.
    const other = build([item('m33'), item('m42')]);
    expect(codes(other.slots[0])).not.toContain('overlap');
    expect(codes(other.slots[0])).not.toContain('cut-short');
  });

  it('"Overlaps window" warns only when too little is left: a start inside the window that still reaches the mode range is not flagged', () => {
    // California Nebula after Rosette, both Deep: it starts 06:55, 5 hours after its window opened, and gets 165 min of Deep's 120 to 300.
    const plan = build([item('ngc2264', { mode: 'deep' }), item('ngc1499', { mode: 'deep' })]);
    const s = plan.slots[1];
    expect(s.integrationMin).toBeGreaterThanOrEqual(120);
    expect(s.integrationMin).toBeLessThanOrEqual(300);
    expect(codes(s)).toContain('cut-short');
    expect(codes(s)).not.toContain('overlap');
    // Over many pairs and modes: every overlap goes with light below the low end of the mode's range.
    const ids = ['m31', 'm33', 'm42', 'ic405', 'ngc1499', 'ngc2264', 'ngc2359', 'm81', 'm51'];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        for (const mode of ['balanced', 'deep'] as const) {
          const sl = build([item(a, { mode }), item(b, { mode })]).slots[1];
          const cut = sl.warnings.find((w) => w.code === 'cut-short');
          if (sl.warnings.some((w) => w.code === 'overlap')) {
            const low = Number(/aims for (\d+) to/.exec(cut!.text)![1]);
            expect(sl.integrationMin).toBeLessThan(low);
          }
        }
      }
    }
  });

  it('a first window much shorter than a later free one: the slot waits for the later window and says so (Andromeda, then Orion)', () => {
    const plan = build([item('m31'), item('m42')]); // Orion: 03:17 to 04:06 gives 27 min of Balanced's 60 to 120; 05:25 to 09:21 is free
    const s = plan.slots[1];
    expect(fmt(s.window!.start)).toBe('05:25');
    expect(fmt(s.start)).toBe('05:25');
    expect(s.integrationMin).toBeGreaterThanOrEqual(60);
    const waits = s.warnings.find((w) => w.code === 'waits')!;
    expect(waits.text).toMatch(/^Skips its short first window \(03:17 to 04:06, 27 min of light\) and waits 1\d\d min for the window 05:25 to 09:21, which suits the mode better\.$/);
    expect(codes(s)).not.toContain('overlap');
    expect(plan.totals.waitMin).toBeGreaterThan(100);
    // Nothing to skip when the first window is enough, or when no later window exists.
    expect(build([item('m31'), item('m33')]).slots[1].warnings.some((w) => w.text.startsWith('Skips'))).toBe(false);
    expect(build([item('m42', { mode: 'quick' })]).slots[0].warnings.some((w) => w.text.startsWith('Skips'))).toBe(false);
  });

  it('a target that crosses the meridian during its slot is flagged, with the flip time added', () => {
    const plan = build([item('ngc2359')]);
    expect(codes(plan.slots[0])).toContain('flip');
    expect(plan.slots[0].warnings.find((w) => w.code === 'flip')!.text).toMatch(/Thor's Helmet crosses the meridian during this slot: a flip adds 10 min\./);
    expect(codes(build([item('m33', { mode: 'quick' })]).slots[0])).not.toContain('flip');
  });

  it('a slot whose window has closed before its turn takes no time, says so, and is not charged a changeover', () => {
    const plan = build([item('ngc2359'), item('m31')]); // Thor's Helmet runs from 08:23; M31 closed at 06:35
    const s = plan.slots[1];
    expect(codes(s)).toEqual(['no-time']);
    expect(s.warnings[0].severity).toBe('warning');
    expect(s.warnings[0].text).toMatch(/No usable time left for Andromeda Galaxy tonight: its window closed at 06:35/);
    expect(s.end.getTime()).toBe(s.start.getTime());
    expect(s.integrationMin).toBe(0);
    expect(plan.totals.changeoverMin).toBe(0);
  });

  it('the no-time sentence says a changeover ended after the window closed, when that is what happened', () => {
    // Orion balanced ends 07:00; the 21 minute train change plus refocus that follows runs to 07:21, ten minutes after Triangulum's window closed at 07:11.
    const plan = build([item('m42'), item('m33', { trainId: NATIVE_2600 })]);
    const w = plan.slots[1].warnings[0];
    expect(w.code).toBe('no-time');
    expect(w.text).toBe(
      'No usable time left for Triangulum Galaxy tonight: its window closed at 07:11. The slots before end 07:00, then the changeover (slew and centre 3 min, train change 15 min, refocus 3 min; 21 min in all) runs to 07:21, after the window closed.',
    );
    expect(w.text).not.toMatch(/and the slots before end/);
  });

  it('a target that never opens says so without "slots before", first or later', () => {
    // With a 60 degree minimum only Andromeda (high near the meridian) opens; Orion never gets that high.
    const high = { minAltitude: 60 };
    const first = build([item('m42')], high).slots[0].warnings[0].text;
    expect(first).toBe('No usable time left for Orion Nebula tonight: its window never opens.');
    const later = build([item('m31'), item('m42')], high).slots[1].warnings[0].text;
    expect(later).toBe(first);
  });

  it('the one-slot sentence counts the slots that open, not the slots listed', () => {
    const high = { minAltitude: 60 };
    expect(build([item('m31'), item('m42')], high).why).toBe('Only Andromeda Galaxy has a usable window tonight.');
    expect(build([item('m42')], high).why).toBe('The slot has no usable window tonight.');
    expect(build([item('m42'), item('m43')], high).why).toBe('No slot has a usable window tonight.');
    expect(build([item('m31')]).why).toBe('One slot to place.');
  });

  it('the totals count a train or filter change only when the slot behind it runs', () => {
    const first = build([item('m31', { mode: 'quick' })]).slots[0];
    // Cut the night so that Flaming Star's window leaves 1.2 minutes after the changeover: too little for one sub, so it takes no time.
    const change = changeoverBetween({ trainId: REDUCER_533, filterId: null }, { trainId: NATIVE_2600, filterId: 'zwo-duo-band' }).minutes;
    const earliest = first.end.getTime() + change * MIN;
    const night = { ...NIGHT, end: new Date(earliest + 1.2 * MIN) };
    const plan = build([item('m31', { mode: 'quick' }), item('ic405', { mode: 'quick', trainId: NATIVE_2600, filterId: 'zwo-duo-band' })], { night });
    expect(plan.slots[0].integrationMin).toBeGreaterThan(0);
    expect(plan.slots[1].end.getTime()).toBe(plan.slots[1].start.getTime());
    expect(plan.slots[1].warnings.map((w) => w.text)).toContain("1 min is left in Flaming Star Nebula's window, too little for one sub.");
    expect(plan.totals.filterChanges).toBe(0);
    expect(plan.totals.trainChanges).toBe(0);
    expect(plan.totals.changeoverMin).toBe(0);
  });

  it('a planet takes a short block, not subs, and is clipped by its own window', () => {
    const plan = build([item('planet-saturn')]);
    const s = plan.slots[0];
    expect(s.subSeconds).toBeNull();
    expect(s.subCount).toBeNull();
    expect(s.integrationMin).toBe(PLANET_SLOT_MIN);
    expect(fmt(s.window!.end)).toBe('04:50');
  });

  it('a planet slot starts at its best altitude: centred on the meridian crossing, not when the window opens', () => {
    const plan = build([item('planet-saturn')]);
    const s = plan.slots[0];
    const transit = nextBodyTransit('Saturn', NIGHT.start!, SITE);
    expect(fmt(s.window!.start)).toBe('01:49');
    expect(s.start.getTime()).toBeCloseTo(transit.getTime() - (PLANET_SLOT_MIN / 2) * MIN, -3);
    expect(s.start.getTime()).toBeGreaterThan(s.window!.start.getTime());
    const waits = s.warnings.find((w) => w.code === 'waits')!;
    expect(waits.text).toMatch(/^Waits 2\d min so the slot is centred on Saturn's highest point \(02:21\), not on the moment its window opens\.$/);
    // The slot's middle is at the highest altitude of its window to within a few minutes.
    const alt = (t: number) => bodyAltAz('Saturn', new Date(t), SITE).altitude;
    const mid = s.start.getTime() + (PLANET_SLOT_MIN / 2) * MIN;
    for (const off of [-60, -30, 30, 60]) expect(alt(mid)).toBeGreaterThan(alt(mid + off * MIN));
  });

  it('a planet whose peak is past the window close ends its slot at the close; one that sets starts when it opens', () => {
    // Jupiter rises late: with the saturated arc its window runs to dawn and the crossing is inside, so test the edges with Moon (sets 02:25) and a closing-edge case.
    const moon = build([item('planet-moon')]).slots[0];
    expect(fmt(moon.start)).toBe('01:49'); // already falling at the window's open: best altitude is the start
    expect(fmt(moon.window!.end)).toBe('02:25');
    const rising = build([item('planet-jupiter')], { night: { ...NIGHT, end: new Date(NIGHT.start!.getTime() + 7.2 * 3600000) } }).slots[0]; // Jupiter crosses at 11:44, after this shortened night
    expect(rising.end.getTime()).toBe(rising.window!.end.getTime());
    expect(codes(rising)).not.toContain('flip');
  });

  describe('a planet on a night with two windows takes the one where it is highest', () => {
    const on = (date: string, items: ItineraryItem[]) => build(items, { night: tonightsNight(SITE, date) });
    const alt = (body: 'Neptune' | 'Moon', s: { start: Date; integrationMin: number }) => bodyAltAz(body, new Date(s.start.getTime() + (s.integrationMin / 2) * MIN), SITE).altitude;

    it('Neptune 2027-09-28: the slot holds the 57 degree culmination window, not the 36 degree first one', () => {
      const s = on('2027-09-28', [item('planet-neptune')]).slots[0];
      expect(fmt(s.window!.start)).toBe('04:48');
      expect(fmt(s.start)).toBe('07:07');
      expect(alt('Neptune', s)).toBeGreaterThan(56);
      expect(s.warnings.find((w) => w.code === 'waits')!.text).toMatch(/centred on Neptune's highest point \(07:17\)/);
    });

    it('Neptune 2027-10-13: the slot holds the culmination the card reports (06:16 UTC), so the two agree', () => {
      const s = on('2027-10-13', [item('planet-neptune')]).slots[0];
      const transit = nextBodyTransit('Neptune', tonightsNight(SITE, '2027-10-13').start!, SITE);
      expect(fmt(transit)).toBe('06:16');
      expect(s.start.getTime()).toBeLessThanOrEqual(transit.getTime());
      expect(s.end.getTime()).toBeGreaterThanOrEqual(transit.getTime());
      expect(s.warnings.find((w) => w.code === 'waits')!.text).toContain('highest point (06:16)');
    });

    it('Moon 2027-01-26: the slot is at the 46 degree it can reach, not the 22 degree early one', () => {
      const s = on('2027-01-26', [item('planet-moon')]).slots[0];
      expect(alt('Moon', s)).toBeGreaterThan(45);
    });

    it('when the window ends before the peak the slot says "the highest it reaches in this window" and never "highest point" (Neptune 2027-06-12)', () => {
      const s = on('2027-06-12', [item('planet-neptune')]).slots[0];
      expect(s.end.getTime()).toBe(s.window!.end.getTime());
      const text = s.warnings.find((w) => w.code === 'waits')!.text;
      expect(text).toMatch(/at the highest Neptune reaches in this window/);
      expect(text).not.toMatch(/highest point|centred/);
    });

    it('a planet slot never uses the deep-sky wording about the mode', () => {
      for (const date of ['2026-12-15', '2027-09-28', '2027-06-12', '2027-01-26']) {
        for (const id of ['planet-neptune', 'planet-moon', 'planet-saturn']) {
          for (const w of on(date, [item(id)]).slots[0].warnings) expect(w.text).not.toMatch(/suits the mode|Skips/);
        }
      }
    });
  });

  it('a target whose only window closes as the night starts says so, not "the slots before end" (Thor\'s Helmet, 2027-03-27)', () => {
    const plan = build([item('ngc2359')], { night: tonightsNight(SITE, '2027-03-27') });
    const text = plan.slots[0].warnings[0].text;
    expect(codes(plan.slots[0])).toEqual(['no-time']);
    expect(text).toMatch(/^No usable time left for Thor's Helmet tonight: its window closes at \d\d:\d\d, as the night starts \(\d\d:\d\d\)\.$/);
    expect(text).not.toMatch(/slots before/);
  });

  describe('a longer later window that is not taken is named in the Cut short sentence', () => {
    const on = (date: string, items: ItineraryItem[]) => build(items, { night: tonightsNight(SITE, date) });

    it('Orion, Deep, 2027-10-03: the later window is also under the minimum, so it is not taken, and the sentence says so', () => {
      const s = on('2027-10-03', [item('m42', { mode: 'deep' })]).slots[0];
      expect(fmt(s.start)).toBe('08:05'); // the first window; the later one (10:13) is not taken
      expect(fmt(s.window!.start)).toBe('08:05');
      expect(s.integrationMin).toBeLessThan(120);
      expect(s.warnings.some((w) => w.text.startsWith('Skips'))).toBe(false);
      const cut = s.warnings.find((w) => w.code === 'cut-short')!.text;
      expect(cut).toContain('A later window, 10:13 to 12:00, would give 102 min, still under the 120 the mode needs; the slot keeps this one.');
    });

    it('Orion, Quick, 2027-01-06: a later window with more light is named even though the first one reaches the minimum', () => {
      const s = on('2027-01-06', [item('m42', { mode: 'quick' })]).slots[0];
      expect(fmt(s.start)).toBe('02:02');
      const cut = s.warnings.find((w) => w.code === 'cut-short')!.text;
      expect(cut).toContain('A later window, 03:59 to 07:55, would give 45 min; the slot keeps this one.');
      expect(cut).not.toMatch(/still under/);
    });

    it('a slot with no longer window later has no such sentence', () => {
      const s = build([item('m33', { mode: 'deep' })]).slots[0];
      for (const w of s.warnings) expect(w.text).not.toMatch(/A later window/);
    });
  });

  it('a planet slot that crosses the meridian gets the flip warning and the flip minutes (Neptune, 2026-12-15)', () => {
    const plan = build([item('planet-neptune')]);
    const s = plan.slots[0];
    const transit = nextBodyTransit('Neptune', NIGHT.start!, SITE);
    expect(fmt(transit)).toBe('01:56');
    expect(fmt(s.start)).toBe('01:49'); // centring would start at 01:46, before the night: the night's start holds
    expect(s.start.getTime()).toBeLessThanOrEqual(transit.getTime());
    expect(codes(s)).toContain('flip');
    expect(s.warnings.find((w) => w.code === 'flip')!.text).toBe('Neptune crosses the meridian during this slot: a flip adds 10 min.');
    expect(s.integrationMin).toBe(PLANET_SLOT_MIN);
    expect((s.end.getTime() - s.start.getTime()) / MIN).toBe(PLANET_SLOT_MIN + 10);
    // The next slot starts after the flip, not after the light.
    const next = build([item('planet-neptune'), item('m31')]).slots[1];
    expect(next.start.getTime()).toBeGreaterThanOrEqual(s.end.getTime() + SLEW_CENTER_MIN * MIN);
  });

  it('a planet slot that does not cross the meridian gets no flip', () => {
    const moon = build([item('planet-moon')]).slots[0];
    expect(codes(moon)).not.toContain('flip');
    expect(moon.integrationMin).toBe(PLANET_SLOT_MIN);
    expect((moon.end.getTime() - moon.start.getTime()) / MIN).toBe(PLANET_SLOT_MIN);
  });

  it('the Moon can be an itinerary slot, with a name, a window, and no problem', () => {
    const si = slotInputFor(item('planet-moon'), profile, starterTargets);
    expect(si.problem).toBeUndefined();
    expect(si.name).toBe('Moon');
    expect(si.source).toEqual({ kind: 'planet', body: 'Moon' });
    const s = build([item('planet-moon')]).slots[0];
    expect(s.integrationMin).toBeGreaterThan(0);
    expect(s.subSeconds).toBeNull();
  });

  it('a planet slot that starts late in a closing window is cut to what is left, and the overlap is named', () => {
    // With a 52 degree minimum, Saturn's window closes at 03:42; M33 (balanced) ends 03:35, so Saturn starts 03:38.
    const plan = build([item('m33'), item('planet-saturn')], { minAltitude: 52 });
    const s = plan.slots[1];
    expect(fmt(s.window!.end)).toBe('03:42');
    const left = (s.window!.end.getTime() - s.start.getTime()) / MIN;
    expect(left).toBeLessThan(PLANET_SLOT_MIN);
    expect((s.end.getTime() - s.start.getTime()) / MIN).toBeCloseTo(left, 6);
    expect(codes(s)).toEqual(['overlap', 'cut-short']);
    expect(s.warnings[1].text).toMatch(/^The window closes 03:42, so the slot is cut to \d+ min \(planned 20\)\./);
  });

  it('a slot that would start after the planet is gone is a no-time slot', () => {
    const plan = build([item('ic405', { mode: 'deep' }), item('planet-saturn')]); // IC 405 deep ends 05:01, Saturn's window closed 04:50
    expect(codes(plan.slots[1])).toEqual(['no-time']);
  });

  it('a stale item shows a problem on its slot and does not stop the others', () => {
    const plan = build([item('nope'), item('m31', { filterId: 'gone' }), item('m31', { trainId: 'gone' }), item('m31')]);
    expect(plan.slots.map((s) => codes(s).includes('problem'))).toEqual([true, true, true, false]);
    expect(plan.slots[0].warnings[0].text).toMatch(/"nope" is not in the target list/);
    expect(plan.slots[1].warnings[0].text).toMatch(/Filter "gone" is not in the profile/);
    expect(plan.slots[2].warnings[0].text).toMatch(/Train "gone" is not in the profile/);
    expect(plan.slots[3].integrationMin).toBeGreaterThan(0);
  });

  it('a smart-scope train is refused with a reason, not guessed', () => {
    const plan = build([item('m31', { trainId: 'smart-seestar-s50' })]);
    expect(codes(plan.slots[0])).toEqual(['problem']);
    expect(plan.slots[0].warnings[0].text).toMatch(/no optics numbers/);
  });

  it('why this order: one short sentence, sorted by opening or your own order named as such', () => {
    const sorted = build([item('m31'), item('m81')]);
    expect(sorted.why).toBe('Ordered by when each target clears the horizon.');
    const unsorted = build([item('m81'), item('m31')]);
    expect(unsorted.why).toBe("Your order: Andromeda Galaxy opens at 01:49, before Bode's Galaxy at 03:22.");
    expect(build([]).why).toBe('Add targets to build a schedule.');
    expect(build([item('m31')]).why).toBe('One slot to place.');
    for (const p of [sorted, unsorted]) expect(p.why.length).toBeLessThan(120);
  });

  it('the totals count the changes and the waiting the sentence leaves out', () => {
    const plan = build([item('m31'), item('ic405', { filterId: 'zwo-duo-band', trainId: NATIVE_2600 })]);
    expect(plan.totals.filterChanges).toBe(1);
    expect(plan.totals.trainChanges).toBe(1);
    expect(plan.totals.changeoverMin).toBe(23);
    expect(plan.totals.waitMin).toBe(0);
    expect(plan.totals.ends).toEqual(plan.slots[1].end);
  });

  it('no real warning is longer than the worst case the page reserves room for', () => {
    const ids = ['m31', 'm42', 'ngc2359', 'm81', 'planet-saturn', 'planet-neptune', 'planet-moon', 'm13', 'ic405'];
    for (const order of [ids, [...ids].reverse(), [ids[1], ids[0], ids[4], ids[2]]]) {
      const plan = build(order.map((id) => item(id)), { minAltitude: 30 });
      for (const s of plan.slots) {
        const worst = worstCaseWarningTexts(s.name);
        for (const w of s.warnings.filter((x) => ['overlap', 'cut-short', 'flip', 'waits'].includes(x.code))) {
          const label = { 'cut-short': 'Cut short', flip: 'Meridian flip', waits: 'Waits', overlap: 'Overlaps window' }[w.code as string]!;
          const ruler = worst.find((x) => x.label === label)!;
          expect(w.text.length).toBeLessThanOrEqual(ruler.text.length);
        }
      }
    }
  });

  it('invariants over many orders: slots never overlap, stay inside their window and the night, and gaps cover the changeover', () => {
    const ids = ['m31', 'ic405', 'm81', 'm42', 'ngc2359', 'planet-saturn', 'm33'];
    const orders = [ids, [...ids].reverse(), [ids[3], ids[0], ids[5], ids[2], ids[6], ids[1], ids[4]], [ids[4], ids[3], ids[2]]];
    for (const order of orders) {
      const plan = build(order.map((id, i) => item(id, { trainId: i % 2 ? NATIVE_2600 : REDUCER_533, filterId: i % 3 ? 'zwo-duo-band' : null })));
      const real = plan.slots.filter((s) => s.end > s.start);
      for (let i = 0; i < real.length; i++) {
        const s = real[i];
        expect(s.start.getTime()).toBeGreaterThanOrEqual(NIGHT.start!.getTime());
        expect(s.end.getTime()).toBeLessThanOrEqual(NIGHT.end!.getTime());
        expect(s.start.getTime()).toBeGreaterThanOrEqual(s.window!.start.getTime() - 1000);
        expect(s.end.getTime()).toBeLessThanOrEqual(s.window!.end.getTime() + 1000);
        if (i > 0) expect(s.start.getTime()).toBeGreaterThanOrEqual(real[i - 1].end.getTime() + s.changeover.minutes * MIN - 1000);
      }
      expect(plan.totals.integrationMin).toBeCloseTo(real.reduce((x, s) => x + s.integrationMin, 0), 9);
    }
  });

  it('refuses a night that is not a normal astronomical night', () => {
    expect(() => build([item('m31')], { night: { kind: 'none', start: null, end: null } })).toThrow(RangeError);
  });
});
