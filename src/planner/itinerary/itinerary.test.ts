import sample from '../data/sample-profile.json';
import { starterTargets } from '../catalog';
import { moonIllumination, moonSeparation, bodyAltAz, nextMeridianTransit } from '../astro';
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

  it('a long slot before a short window overlaps it: visible warning with times, and the second slot is cut short', () => {
    const plan = build([item('m31'), item('m42')]); // M42's window is 03:17 to 04:06
    const s = plan.slots[1];
    expect(codes(s)).toEqual(expect.arrayContaining(['overlap', 'cut-short']));
    const overlap = s.warnings.find((w) => w.code === 'overlap')!;
    expect(overlap.severity).toBe('warning');
    expect(overlap.text).toMatch(/Overlaps its usable window: the slot before ends \d\d:\d\d, \d+ min after Orion Nebula's window opened \(03:17\), and the window closes 04:06\./);
    expect(fmt(s.window!.end)).toBe('04:06');
    expect(s.end.getTime()).toBeLessThanOrEqual(s.window!.end.getTime());
    // The other order gives the Orion Nebula its whole window: no overlap.
    const other = build([item('m42'), item('m31')]);
    expect(codes(other.slots[0])).not.toContain('overlap');
    expect(codes(other.slots[0])).toContain('waits');
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

  it('a planet takes a short block, not subs, and is clipped by its own window', () => {
    const plan = build([item('planet-saturn')]);
    const s = plan.slots[0];
    expect(s.subSeconds).toBeNull();
    expect(s.subCount).toBeNull();
    expect((s.end.getTime() - s.start.getTime()) / MIN).toBe(PLANET_SLOT_MIN);
    expect(fmt(s.window!.end)).toBe('04:50');
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
    expect(s.warnings[1].text).toMatch(/^The window closes 03:42, so the planet slot is cut to \d+ min \(planned 20\)\./);
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
    const ids = ['m31', 'm42', 'ngc2359', 'm81', 'planet-saturn', 'm13', 'ic405'];
    for (const order of [ids, [...ids].reverse(), [ids[1], ids[0], ids[4], ids[2]]]) {
      const plan = build(order.map((id) => item(id)), { minAltitude: 30 });
      for (const s of plan.slots) {
        const worst = worstCaseWarningTexts(s.name);
        for (const w of s.warnings.filter((x) => ['overlap', 'cut-short', 'flip'].includes(x.code))) {
          const ruler = worst.find((x) => (w.code === 'cut-short' ? x.label === 'Cut short' : w.code === 'flip' ? x.label === 'Meridian flip' : x.label === 'Overlaps window'))!;
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
