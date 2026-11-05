import {
  effectiveFocalLengthMm,
  imageScale,
  opticalTrain,
  targetFitsFrame,
} from './index';
import type { Accessory, Camera, Scope } from './index';

// Fixtures: 8" f/10 SCT (2032 mm, 203.2 mm) with a 0.63x reducer and a 3.76 um, 6248 x 4176 camera.
const sct: Scope = { name: 'SCT 8"', focalLengthMm: 2032, apertureMm: 203.2 };
const reducer: Accessory = { name: '0.63x reducer', factor: 0.63 };
const extender: Accessory = { name: '2x extender', factor: 2 };
const camera: Camera = { pixelSizeUm: 3.76, sensorWidthPx: 6248, sensorHeightPx: 4176 };

describe('image scale', () => {
  it('equals the hand-computed value without accessory', () => {
    // 206.265 * 3.76 / 2032 = 0.38167
    expect(Math.abs(imageScale(sct, camera)! - 0.38167)).toBeLessThan(0.01);
  });

  it('equals the hand-computed value with a reducer', () => {
    // f = 2032 * 0.63 = 1280.16 mm; 206.265 * 3.76 / 1280.16 = 0.60583
    expect(effectiveFocalLengthMm(sct, reducer)).toBeCloseTo(1280.16, 6);
    expect(Math.abs(imageScale(sct, camera, reducer)! - 0.6058)).toBeLessThan(0.01);
  });

  it('scales with an extender', () => {
    // f = 4064 mm; 206.265 * 3.76 / 4064 = 0.19083
    expect(Math.abs(imageScale(sct, camera, extender)! - 0.1908)).toBeLessThan(0.01);
  });
});

describe('opticalTrain', () => {
  it('computes focal ratio and field of view', () => {
    const t = opticalTrain(sct, camera, reducer);
    expect(t.missing).toEqual([]);
    expect(t.focalRatio).toBeCloseTo(6.3, 6);
    // 0.60583 * 6248 / 60 = 63.09 arcmin; 0.60583 * 4176 / 60 = 42.17 arcmin
    expect(Math.abs(t.fovWidthArcmin! - 63.09)).toBeLessThan(0.05);
    expect(Math.abs(t.fovHeightArcmin! - 42.17)).toBeLessThan(0.05);
  });

  it('accepts partial, user-corrected inputs and lists what is missing', () => {
    const t = opticalTrain({ focalLengthMm: 1000 }, { pixelSizeUm: 4 });
    expect(Math.abs(t.imageScale! - 0.8251)).toBeLessThan(0.01);
    expect(t.focalRatio).toBeUndefined();
    expect(t.fovWidthArcmin).toBeUndefined();
    expect(t.missing).toEqual([
      'camera.sensorWidthPx',
      'camera.sensorHeightPx',
      'scope.apertureMm',
    ]);
  });

  it('returns undefined values for empty inputs, never a guess', () => {
    const t = opticalTrain({}, {});
    expect(t.imageScale).toBeUndefined();
    expect(t.focalLengthMm).toBeUndefined();
    expect(t.missing).toHaveLength(5);
  });

  it('does not guess when an accessory has no factor', () => {
    const t = opticalTrain(sct, camera, { name: '0.7x reducer' });
    expect(t.imageScale).toBeUndefined();
    expect(t.focalLengthMm).toBeUndefined();
    expect(t.focalRatio).toBeUndefined();
    expect(t.fovWidthArcmin).toBeUndefined();
    expect(t.missing).toEqual(['accessory.factor']);
    expect(imageScale(sct, camera, { name: 'flattener' })).toBeUndefined();
  });

  it('lists aperture as missing when focal ratio cannot be computed', () => {
    const t = opticalTrain({ focalLengthMm: 2032 }, camera);
    expect(t.focalRatio).toBeUndefined();
    expect(t.missing).toEqual(['scope.apertureMm']);
  });

  it('throws on non-positive values', () => {
    expect(() => imageScale({ focalLengthMm: 0 }, camera)).toThrow(RangeError);
    expect(() => imageScale(sct, { pixelSizeUm: -1 })).toThrow(RangeError);
    expect(() => imageScale(sct, camera, { factor: NaN })).toThrow(RangeError);
  });
});

describe('targetFitsFrame', () => {
  const train = opticalTrain(sct, camera, reducer); // ~63 x 42 arcmin

  it('fits a small target and rejects a large one', () => {
    expect(targetFitsFrame(train, { widthArcmin: 20, heightArcmin: 10 })).toBe(true);
    expect(targetFitsFrame(train, { widthArcmin: 180, heightArcmin: 60 })).toBe(false); // M31
  });

  it('allows a quarter-turn of the camera', () => {
    expect(targetFitsFrame(train, { widthArcmin: 40, heightArcmin: 60 })).toBe(true);
  });

  it('honours a margin', () => {
    expect(targetFitsFrame(train, { widthArcmin: 60, heightArcmin: 30 })).toBe(true);
    expect(targetFitsFrame(train, { widthArcmin: 60, heightArcmin: 30 }, 0.2)).toBe(false);
  });

  it('returns null when sizes are unknown', () => {
    expect(targetFitsFrame(train, {})).toBeNull();
    expect(targetFitsFrame({}, { widthArcmin: 1, heightArcmin: 1 })).toBeNull();
  });
});
