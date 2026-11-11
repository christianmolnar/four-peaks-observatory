import sample from '../data/sample-profile.json';
import { tonightsNight } from '../plan';
import { arcToHorizonPoints, validateProfile } from '../profile';
import { buildGuide } from './guide';
import type { GuideItem, GuideSection } from './guide';
import { planetTrainInfo } from './train';
import { dispersionArcsec, dispersionAltitudeDeg, planetCard, rotationClip } from './index';

const SITE = { latitude: 33.6115, longitude: -111.719, elevationM: 500 };
const night = tonightsNight(SITE, '2027-03-15');
const ARC = arcToHorizonPoints([{ startAz: 120, endAz: 320, heightDeg: 42 }]);
const NATIVE = { name: 'C11 + ASI676MC (planets)', scaleArcsecPx: (206.265 * 2) / 2800, nominal: false };
const POWERMATE = { name: 'C11 + 2.5x Powermate + ASI676MC (planets)', scaleArcsecPx: (206.265 * 2) / 7000, nominal: true };
const time = (d: Date) => d.toISOString().slice(11, 16);

const guideFor = (body: 'Jupiter' | 'Saturn' | 'Venus' | 'Moon' | 'Neptune' | 'Mars', trains = [NATIVE, POWERMATE], names = { scopeName: 'Celestron C11 EdgeHD', cameraName: 'ZWO ASI676MC', cameraColour: true as boolean | undefined }) => {
  const card = planetCard({ body, site: SITE, night, horizon: ARC, minAltitude: 20, apertureMm: 279.4, imageScaleArcsecPx: NATIVE.scaleArcsecPx, fieldArcmin: 8.72 });
  return { card, sections: buildGuide({ card, apertureMm: 279.4, trains, formatTime: time, ...names }) };
};
const items = (sections: GuideSection[]): GuideItem[] => sections.flatMap((s) => s.items);
const item = (sections: GuideSection[], id: string): GuideItem => {
  const i = items(sections).find((x) => x.id === id);
  if (!i) throw new Error(`no item ${id}`);
  return i;
};

describe('the lucky-imaging guide', () => {
  it('covers every step the spec lists, in sections', () => {
    const { sections } = guideFor('Jupiter');
    const ids = items(sections).map((i) => i.id);
    for (const want of ['focus', 'exposure', 'histogram', 'roi', 'fps', 'ser', 'clip', 'session', 'dispersion', 'high', 'stack', 'sharpen', 'colour', 'native', 'extender']) {
      expect(ids).toContain(want);
    }
    expect(sections.map((s) => s.id)).toEqual(['before', 'camera', 'clip', 'adc', 'process', 'train']);
  });

  it('every item has a basis label, and no text prints undefined or NaN', () => {
    for (const body of ['Jupiter', 'Saturn', 'Venus', 'Moon'] as const) {
      for (const i of items(guideFor(body).sections)) {
        expect(['computed', 'sourced', 'assumption', 'practice', 'not-verified']).toContain(i.basis);
        expect(i.text).not.toMatch(/undefined|NaN|null/);
        expect(i.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('clip length is the card\'s rotation clip, in seconds, and the period basis is named', () => {
    const { card, sections } = guideFor('Jupiter');
    const rot = rotationClip('Jupiter', card.apparentDiameterArcsec, 279.4)!;
    const clip = item(sections, 'clip');
    expect(clip.text).toContain(`Up to ${Math.round(rot.suggestedS)} s per clip`);
    expect(clip.text).toMatch(/rotation period 9\.925 h, sourced/);
    expect(clip.text).toMatch(/computed; the half is an assumption/);
  });

  it('session length is its own item and says it is not the clip length; it counts the clips', () => {
    const { card, sections } = guideFor('Jupiter');
    const session = item(sections, 'session');
    expect(session.title).toMatch(/not the clip length/);
    expect(session.text).toMatch(/about 30 minutes \(assumption\)/);
    const clipS = Math.round(card.rotation!.suggestedS);
    expect(session.text).toContain(`clips of ${clipS} s with 30 s between them`);
    expect(session.text).toContain(`${Math.round(card.usableMinutes)} minutes`);
    expect(item(sections, 'clip').id).not.toBe(session.id);
  });

  it('a planet whose rotation allows more than the cap is held to the cap and says why', () => {
    const { sections } = guideFor('Venus');
    expect(item(sections, 'clip').text).toMatch(/Up to 180 s per clip/);
    expect(item(sections, 'clip').text).toMatch(/clips are held to 180 s/);
    expect(item(sections, 'clip').text).toMatch(/assumption/);
  });

  it('the Moon gets no rotation limit and a mosaic', () => {
    const { card, sections } = guideFor('Moon');
    expect(item(sections, 'clip').text).toMatch(/does not rotate under the camera/);
    expect(item(sections, 'clip').text).toContain(`${card.mosaicPanelsPerSide} by ${card.mosaicPanelsPerSide} panels`);
  });

  it('the Moon guide gives no pixel region, points to the mosaic line, and uses Moon wording', () => {
    const { card, sections } = guideFor('Moon');
    const roi = item(sections, 'roi');
    expect(roi.text).not.toMatch(/\d+ pixels/);
    expect(roi.text).not.toMatch(/18448/);
    expect(roi.text).toContain(`${card.mosaicPanelsPerSide} by ${card.mosaicPanelsPerSide}`);
    expect(roi.text).toMatch(/Clip length/);
    expect(roi.basis).toBe('practice');
    expect(item(sections, 'focus').title).toBe('Focus on the Moon');
    for (const id of ['focus', 'histogram', 'roi']) expect(item(sections, id).text).not.toMatch(/planet/i);
    const panels = card.mosaicPanelsPerSide! ** 2;
    expect(item(sections, 'session').text).toMatch(new RegExp(`The mosaic is ${panels} panels at one clip each, against \\d+ clips in the session`));
    // A planet keeps its ROI number.
    expect(item(guideFor('Jupiter').sections, 'roi').text).toMatch(/\d+ pixels square/);
  });

  it('the Moon guide never says planet, and its stacking line names no planet mode', () => {
    const { sections } = guideFor('Moon');
    for (const id of ['collimate', 'dispersion', 'high', 'stack']) expect(`${item(sections, id).title} ${item(sections, id).text}`).not.toMatch(/planet/i);
    expect(item(sections, 'stack').text).toMatch(/^Open the SER in AutoStakkert, place alignment points/);
    // A planet keeps its wording.
    expect(item(guideFor('Jupiter').sections, 'stack').text).toContain('choose the planet mode');
    expect(item(guideFor('Jupiter').sections, 'collimate').text).toContain('before the planet.');
  });

  describe('the mosaic line', () => {
    const withPanels = (perSide: number) => {
      const { card } = guideFor('Moon');
      const sections = buildGuide({ card: { ...card, mosaicPanelsPerSide: perSide }, apertureMm: 279.4, trains: [NATIVE], formatTime: time, scopeName: 'C11', cameraName: 'ASI676MC', cameraColour: true });
      return item(sections, 'session').text;
    };
    it('one panel is not "1 panels"', () => {
      const text = withPanels(1);
      expect(text).toContain('The mosaic is 1 panel at one clip each');
      expect(text).not.toMatch(/1 panels/);
      expect(text).toContain('the session covers it');
    });
    it('says the session covers the mosaic only when the clips reach the panels', () => {
      expect(withPanels(2)).toContain('the session covers it');
      const big = withPanels(30);
      expect(big).toContain('one session does not cover it');
      expect(big).not.toContain('the session covers it');
    });
  });

  it('dispersion numbers are the computed ones, and the threshold altitude is the 279.4 mm figure', () => {
    const { card, sections } = guideFor('Jupiter');
    const d = item(sections, 'dispersion');
    expect(d.text).toContain(`60°: ${dispersionArcsec(60).toFixed(2)}"`);
    expect(d.text).toContain(`30°: ${dispersionArcsec(30).toFixed(2)}"`);
    expect(d.basis).toBe('computed');
    const high = item(sections, 'high');
    expect(high.text).toContain(`at ${Math.round(dispersionAltitudeDeg(279.4))}°`);
    expect(high.text).toMatch(/an ADC might help/);
    expect(high.text).toContain(`peaks at ${Math.round(card.peak.altitude)}°`);
  });

  it('ASIAIR is never claimed to work: the only mention is marked not verified', () => {
    const { sections } = guideFor('Jupiter');
    const mentions = items(sections).filter((i) => /ASIAIR/.test(i.text));
    expect(mentions.map((i) => i.id)).toEqual(['ser']);
    expect(mentions[0].basis).toBe('not-verified');
    expect(mentions[0].text).toMatch(/not verified/);
  });

  it('the extender line is nominal and not verified; the native line comes first and says near the limit', () => {
    const { sections } = guideFor('Jupiter');
    const native = item(sections, 'native');
    expect(native.text).toMatch(/0\.15 arcsec per pixel against a sampling limit of 0\.18/);
    expect(native.text).toMatch(/near the limit \(computed\)/);
    expect(native.text).toMatch(/assumed 2 arcsec \(assumption\)/);
    const ext = item(sections, 'extender');
    expect(ext.text).toMatch(/nominal 0\.06 arcsec per pixel, oversampled \(computed\)/);
    expect(ext.text).toMatch(/no stated camera spacing/);
    expect(ext.text).toMatch(/not verified/);
    const order = items(sections).map((i) => i.id);
    expect(order.indexOf('native')).toBeLessThan(order.indexOf('extender'));
  });

  it('the ROI is a multiple of 16 and grows for Saturn because of the rings', () => {
    const jup = item(guideFor('Jupiter').sections, 'roi').text;
    const sat = item(guideFor('Saturn').sections, 'roi').text;
    const px = (t: string) => Number(/about (\d+) pixels square/.exec(t)![1]);
    expect(px(jup) % 16).toBe(0);
    expect(px(sat) % 16).toBe(0);
    expect(sat).toMatch(/With the rings/);
  });

  it('without a native or extender train the train section is left out rather than invented', () => {
    expect(guideFor('Jupiter', []).sections.map((s) => s.id)).not.toContain('train');
  });

  describe('the exposure line is qualified per body', () => {
    it('Jupiter keeps its assumed 10 ms, labelled so, and the frame rate follows from it', () => {
      const { sections } = guideFor('Jupiter');
      const e = item(sections, 'exposure');
      expect(e.text).toMatch(/^Start near 10 ms/);
      expect(e.basis).toBe('assumption');
      expect(item(sections, 'fps').text).toMatch(/10 ms allows at most 100 per second/);
    });

    it('Saturn and Neptune get a longer, sourced starting point and are told they are fainter than Jupiter; not "10 ms"', () => {
      for (const [body, ms, gain] of [['Saturn', 64, 104], ['Neptune', 130, 478]] as const) {
        const { sections } = guideFor(body);
        const e = item(sections, 'exposure');
        expect(e.basis).toBe('sourced');
        expect(e.text).toContain(`${ms} ms at gain ${gain}`);
        expect(e.text).toMatch(/fainter than Jupiter/);
        expect(e.text).toMatch(/on its own telescope and camera/);
        expect(e.text).not.toMatch(/near 10 ms/);
        expect(item(sections, 'fps').text).toContain(`${ms} ms allows at most ${Math.floor(1000 / ms)} per second`);
      }
    });

    it('Mars is not called fainter than Jupiter (near opposition it is as bright), and its source used a Barlow', () => {
      const e = item(guideFor('Mars').sections, 'exposure');
      expect(e.text).toMatch(/15 ms at gain 246 for Mars with a 2x Barlow lens/);
      expect(e.text).not.toMatch(/fainter than Jupiter/);
    });

    it("Neptune's source also used a 2x Barlow, and the guide says so", () => {
      expect(item(guideFor('Neptune').sections, 'exposure').text).toMatch(/130 ms at gain 478 for Neptune with a 2x Barlow lens/);
    });

    it('Venus and the Moon get no number at all: no source was found', () => {
      for (const body of ['Venus', 'Moon'] as const) {
        const { sections } = guideFor(body);
        const e = item(sections, 'exposure');
        expect(e.text).toMatch(/^No starting exposure is given for/);
        expect(e.basis).toBe('practice');
        expect(e.text).not.toMatch(/\d+ ms/);
        expect(item(sections, 'fps').text).not.toMatch(/\d+ ms allows/);
      }
    });
  });

  describe('the profile\'s own scope and camera are named', () => {
    const profile = validateProfile(sample);
    const guideOn = (p: typeof profile, trainId: string) => {
      const info = planetTrainInfo(p, p.trains.find((t) => t.id === trainId)!);
      const card = planetCard({ body: 'Jupiter', site: SITE, night, horizon: ARC, minAltitude: 20, apertureMm: info.apertureMm, imageScaleArcsecPx: info.scaleArcsecPx, fieldArcmin: info.fieldArcmin });
      return buildGuide({ card, apertureMm: info.apertureMm!, scopeName: info.scopeName!, cameraName: info.cameraName!, cameraColour: info.cameraColour, trains: info.variants, formatTime: time });
    };
    const allText = (sections: GuideSection[]) => items(sections).map((i) => i.text).join('\n');

    it('the ASI533MC reducer train says ASI533MC and never ASI676MC', () => {
      const sections = guideOn(profile, 'deep-c11-reducer-533');
      const text = allText(sections);
      expect(item(sections, 'debayer').text).toMatch(/^The ZWO ASI533MC is a colour camera/);
      expect(item(sections, 'fps').text).toMatch(/What the ZWO ASI533MC delivers/);
      expect(text).not.toMatch(/ASI676MC/);
    });

    it('a different scope name replaces "C11"; the native train still reads its own name', () => {
      const p = validateProfile({ ...sample, equipment: { ...sample.equipment, scopes: sample.equipment.scopes.map((s) => ({ ...s, name: 'Sky-Watcher 8 inch Newtonian' })) } });
      const sections = guideOn(p, 'deep-c11-reducer-533');
      expect(item(sections, 'cooldown').text).toMatch(/^Let the Sky-Watcher 8 inch Newtonian settle/);
      // The train's own name is profile data and may contain it; no other line may.
      expect(allText(sections.filter((x) => x.id !== 'train'))).not.toMatch(/C11/);
    });

    it('a camera the profile calls mono, or does not classify, is not called colour', () => {
      const cams = (colour: boolean | undefined) => sample.equipment.cameras.map((c) => (c.id === 'asi533mc' ? { ...c, colour } : c));
      const mono = validateProfile({ ...sample, equipment: { ...sample.equipment, cameras: cams(false) } });
      expect(item(guideOn(mono, 'deep-c11-reducer-533'), 'debayer').text).toMatch(/lists the ZWO ASI533MC as a mono camera/);
      const unknown = validateProfile({ ...sample, equipment: { ...sample.equipment, cameras: cams(undefined) } });
      expect(item(guideOn(unknown, 'deep-c11-reducer-533'), 'debayer').text).toMatch(/does not say whether the ZWO ASI533MC is a colour or a mono camera/);
    });
  });
});
