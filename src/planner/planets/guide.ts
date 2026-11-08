import { CLIP_GAP_S, COOLDOWN_MIN, MAX_CLIP_S, MOON_CLIP_S, MOSAIC_OVERLAP, SESSION_MIN, SEEING_ASSUMED_ARCSEC, START_EXPOSURE } from './constants';
import { clipsInSession, dawesArcsec, dispersionArcsec, samplingFor } from './index';
import type { PlanetCard } from './index';

/**
 * Where a guide line comes from. computed: from the ephemeris or a formula. sourced: a cited figure.
 * assumption: a starting value chosen here, not measured. practice: common amateur practice, no source for this build.
 * not-verified: a claim about a product or program that was not checked.
 */
export type GuideBasis = 'computed' | 'sourced' | 'assumption' | 'practice' | 'not-verified';

export interface GuideItem {
  id: string;
  title: string;
  text: string;
  basis: GuideBasis;
}
export interface GuideSection {
  id: string;
  title: string;
  items: GuideItem[];
}

export interface GuideTrain {
  name: string;
  scaleArcsecPx: number;
  /** An extender or Barlow is in the train, so its real scale depends on spacing the maker does not state. */
  nominal: boolean;
}

export interface GuideInput {
  card: PlanetCard;
  apertureMm: number;
  /** Names from the profile, so the text names the owner's own gear on any train. */
  scopeName: string;
  cameraName: string;
  /** From the profile; absent: the profile does not say. */
  cameraColour?: boolean;
  trains: readonly GuideTrain[];
  formatTime: (d: Date) => string;
}

/** ASSUMPTION: Saturn's rings span about this many globe diameters (outer edge of the A ring, rounded). */
export const SATURN_RING_SPAN_FACTOR = 2.3;
/** ASSUMPTION: the region of interest is this multiple of the object's size across. */
export const ROI_MARGIN = 1.5;
/** ASSUMPTION: the region of interest is rounded up to a multiple of this many pixels. */
export const ROI_STEP_PX = 16;
/** ASSUMPTION: fraction of frames to keep in the first stack. */
export const KEEP_FRACTION = 0.25;

const f2 = (x: number): string => x.toFixed(2);
const round = (x: number): string => String(Math.round(x));

const MIN_ALT_NOTE = 'below that an ADC might help';

export function buildGuide(input: GuideInput): GuideSection[] {
  const { card, apertureMm, trains, formatTime, scopeName, cameraName, cameraColour } = input;
  const name = card.body;
  const moon = card.body === 'Moon';
  const dawes = dawesArcsec(apertureMm);
  const nativeTrain = trains.find((t) => !t.nominal) ?? trains[0] ?? null;
  const extenderTrain = trains.find((t) => t.nominal) ?? null;

  const sections: GuideSection[] = [];

  // -------------------------------------------------------------- before you start
  const when = card.usableMinutes > 0
    ? `${name} peaks at ${round(card.peak.altitude)}° at ${formatTime(card.peak.time)} and is clear of your horizon for ${round(card.usableMinutes)} min tonight (computed).`
    : `${name} is not clear of your horizon at any time tonight (computed), so there is nothing to capture.`;
  sections.push({
    id: 'before',
    title: 'Before you start',
    items: [
      {
        id: 'cooldown',
        title: 'Let the telescope cool',
        text: `Let the ${scopeName} settle toward the night air before you focus; plan about ${COOLDOWN_MIN} minutes. The time is a planning allowance, not measured.`,
        basis: 'assumption',
      },
      {
        id: 'collimate',
        title: 'Check collimation on a star',
        text: `${moon ? 'Lunar' : 'Planet'} detail needs a collimated telescope. Check it on a bright star at high power before the ${moon ? 'Moon' : 'planet'}.`,
        basis: 'practice',
      },
      { id: 'when', title: 'Choose the time', text: `${when} Image when it is highest.`, basis: 'computed' },
    ],
  });

  // ------------------------------------------------------------------ camera
  const size = card.diameterPx;
  const span = card.body === 'Saturn' ? SATURN_RING_SPAN_FACTOR : 1;
  const roi = size !== null ? Math.ceil((size * span * ROI_MARGIN) / ROI_STEP_PX) * ROI_STEP_PX : null;
  const start = START_EXPOSURE[card.body];
  const exposure: { text: string; basis: GuideBasis } =
    start.ms === null
      ? {
          text: `No starting exposure is given for ${name}: no source for one was found. Start short with a low to middle gain, then change the exposure until the histogram is right. Short exposures freeze the seeing. The camera's unity-gain setting is not verified here.`,
          basis: 'practice',
        }
      : start.basis === 'assumption'
        ? {
            text: `Start near ${start.ms} ms and a middle gain, then change the exposure until the histogram is right. Short exposures freeze the seeing. The starting value is an assumption for a Jupiter-bright planet at f/10, and the camera's unity-gain setting is not verified here.`,
            basis: 'assumption',
          }
        : {
            text: `${start.fainterThanJupiter ? `${name} is fainter than Jupiter in the source's own table, so it needs a longer exposure. ` : ''}One university astronomy club published ${start.ms} ms at gain ${start.gain} for ${name}${start.setup ?? ''} on its own telescope and camera (sourced): yours will differ, so take it as the order of magnitude. Start there, then change the exposure until the histogram is right. Longer exposures let the seeing blur each frame.`,
            basis: 'sourced',
          };
  const camera: GuideItem[] = [
    {
      id: 'focus',
      title: moon ? 'Focus on the Moon' : 'Focus on the planet',
      text: `Focus on ${moon ? 'the lunar surface, a sharp crater edge near the terminator' : 'the planet itself, or a bright star beside it'}, with the focus aid of your capture software if it has one (SharpCap, FireCapture). Check focus again every clip or two: the mirror and the air keep changing.`,
      basis: 'practice',
    },
    {
      id: 'exposure',
      title: 'Exposure and gain',
      text: exposure.text,
      basis: exposure.basis,
    },
    {
      id: 'histogram',
      title: 'Histogram',
      text: `Bring the peak to about half way across the scale and keep the brightest part of ${moon ? 'the lunar surface' : 'the planet'} off the right edge. A clipped ${moon ? 'surface' : 'planet'} cannot be sharpened.`,
      basis: 'practice',
    },
    {
      id: 'roi',
      title: 'Region of interest (ROI)',
      text: moon
        ? card.mosaicPanelsPerSide !== null
          ? card.mosaicPanelsPerSide === 1
            ? `The Moon fits the ${cameraName}'s field at your scale, so there is no small region to cut down to: shoot at full frame. Full frames may send fewer frames a second.`
            : `The Moon is larger than the ${cameraName}'s field at your scale, so there is no small region to cut down to: shoot each panel at full frame (the panel count is on the Clip length line: ${card.mosaicPanelsPerSide} by ${card.mosaicPanelsPerSide}). Full frames may send fewer frames a second.`
          : "Pick a train to see the Moon's mosaic on the Clip length line. The Moon is larger than most fields, so shoot each panel at full frame."
        : roi !== null && size !== null
          ? `${name}${card.body === 'Saturn' ? "'s globe" : ''} is about ${round(size)} pixels across at your scale (computed).${card.body === 'Saturn' ? ` With the rings, allow about ${SATURN_RING_SPAN_FACTOR} times that (assumption).` : ''} Set the ROI to about ${roi} pixels square (assumption: ${ROI_MARGIN} times the object, in steps of ${ROI_STEP_PX}). A small ROI lets the camera send more frames per second.`
          : 'Pick a train to see the planet\'s size in pixels. Then set the ROI to about one and a half times the planet\'s size.',
      basis: !moon && roi !== null ? 'computed' : 'practice',
    },
    {
      id: 'fps',
      title: 'Frame rate',
      text: `The camera cannot take more frames a second than 1000 divided by the exposure in milliseconds${start.ms !== null ? `: ${start.ms} ms allows at most ${Math.floor(1000 / start.ms)} per second (computed)` : ', so a longer exposure means fewer frames (computed)'}. What the ${cameraName} delivers ${moon ? 'at full frame' : 'at your ROI'} over USB is not verified here: read the rate in the capture software.`,
      basis: 'not-verified',
    },
    {
      id: 'ser',
      title: 'Capture as SER',
      text: 'Record SER (a video of raw frames) and let AutoStakkert read it. FireCapture and SharpCap can record SER (widely documented, not re-checked here). Whether ASIAIR can record planetary video with an ROI is not verified, so do not plan on it.',
      basis: 'not-verified',
    },
  ];
  sections.push({ id: 'camera', title: 'Camera and capture', items: camera });

  // -------------------------------------------------------------- clip and session
  const clipItems: GuideItem[] = [];
  const rot = card.rotation;
  if (rot) {
    const clip = Math.round(rot.suggestedS);
    clipItems.push({
      id: 'clip',
      title: 'Clip length',
      text: `Up to ${clip} s per clip for ${name}. A feature at the middle of the disc moves ${f2(rot.smearArcsecPerMin)} arcsec a minute (rotation period ${rot.periodH} h, ${rot.periodBasis}). ${round(rot.limitS)} s smears it by half the telescope's resolution of ${f2(rot.resolutionArcsec)} arcsec (computed; the half is an assumption).${rot.cappedByMax ? ` Rotation would allow longer; clips are held to ${MAX_CLIP_S} s because seeing drifts and files grow (assumption).` : ''} Longer than that needs derotation (WinJUPOS, optional).`,
      basis: 'computed',
    });
  } else {
    clipItems.push({
      id: 'clip',
      title: 'Clip length',
      text: `The Moon does not rotate under the camera, so there is no rotation limit. Use clips of about ${MOON_CLIP_S} s (assumption) and take them again as the terminator light shifts.${card.mosaicPanelsPerSide !== null ? ` At your field the Moon needs about ${card.mosaicPanelsPerSide} by ${card.mosaicPanelsPerSide} ${card.mosaicPanelsPerSide === 1 ? 'panel' : 'panels'} with ${round(MOSAIC_OVERLAP * 100)}% overlap (computed; the overlap is an assumption).` : ''}`,
      basis: 'computed',
    });
  }
  const clipS = rot ? rot.suggestedS : MOON_CLIP_S;
  const panels = card.mosaicPanelsPerSide !== null ? card.mosaicPanelsPerSide * card.mosaicPanelsPerSide : null;
  const clips = clipsInSession(SESSION_MIN, clipS);
  const mosaicFit = moon && panels !== null ? ` The mosaic is ${panels} ${panels === 1 ? 'panel' : 'panels'} at one clip each, against ${clips} clips in the session: ${clips >= panels ? 'the session covers it' : 'one session does not cover it, so shoot fewer panels or spread it over more than one'} (computed).` : '';
  const good = card.goodMinutes !== null ? ` ${round(card.goodMinutes)} of them are above ${round(card.dispersionAltitudeDeg ?? 0)}° (computed).` : '';
  clipItems.push({
    id: 'session',
    title: 'Session length (not the clip length)',
    text: `The session is the time at the telescope after cool-down: plan about ${SESSION_MIN} minutes (assumption). That is ${clips} clips of ${round(clipS)} s with ${CLIP_GAP_S} s between them to save and check focus (computed from those). Tonight ${name} is clear of your horizon for ${round(card.usableMinutes)} minutes (computed).${good}${mosaicFit}`,
    basis: 'assumption',
  });
  clipItems.push({
    id: 'repeat',
    title: 'Short attempts, repeated',
    text: 'Take many short clips and stack the best, not one long one: this is not deep-sky integration. A moment of steady air is worth more than extra minutes.',
    basis: 'practice',
  });
  sections.push({ id: 'clip', title: 'Clip and session', items: clipItems });

  // ------------------------------------------------------------------- no ADC
  const at = (alt: number) => `${alt}°: ${f2(dispersionArcsec(alt))}"`;
  const limitAlt = card.dispersionAltitudeDeg;
  sections.push({
    id: 'adc',
    title: 'No ADC: altitude',
    items: [
      {
        id: 'dispersion',
        title: `Colour fringing grows as the ${moon ? 'Moon' : 'planet'} gets lower`,
        text: `This train has no atmospheric dispersion corrector. The air spreads blue and red images apart by ${at(80)}, ${at(70)}, ${at(60)}, ${at(45)}, ${at(30)} (computed, red 650 nm to blue 450 nm, Edlen air, standard pressure; at the site's height it is a little less).`,
        basis: 'computed',
      },
      {
        id: 'high',
        title: moon ? 'Favour the high Moon' : 'Favour the high planets',
        text:
          limitAlt !== null
            ? `The spread equals the telescope's resolution (${f2(dawes)}") at ${round(limitAlt)}° (computed; one resolution element is an assumption). Image above it when you can; ${MIN_ALT_NOTE}. ${name} peaks at ${round(card.peak.altitude)}° tonight, a spread of ${card.dispersionAtPeakArcsec !== null ? f2(card.dispersionAtPeakArcsec) : 'n/a'}".`
            : 'Give the telescope aperture to see the altitude where dispersion matters.',
        basis: 'computed',
      },
      {
        id: 'align',
        title: 'Fix what is left in processing',
        text: 'A mild spread can be reduced by shifting the red and blue channels against green after stacking (RGB align). A corrector does it before the camera. Not verified for your software.',
        basis: 'not-verified',
      },
    ],
  });

  // ------------------------------------------------------------------- stacking
  sections.push({
    id: 'process',
    title: 'Stack and process',
    items: [
      {
        id: 'stack',
        title: 'Stack in AutoStakkert',
        text: `Open the SER in AutoStakkert, ${moon ? '' : 'choose the planet mode, '}place alignment points, and stack the best ${round(KEEP_FRACTION * 100)} per cent of frames as a first try (assumption; try 10 and 50 and compare).`,
        basis: 'assumption',
      },
      {
        id: 'debayer',
        title: 'Colour camera',
        text:
          cameraColour === true
            ? `The ${cameraName} is a colour camera, so the frames are raw colour. Check AutoStakkert reads them as colour (its Bayer pattern setting). Not verified for this camera.`
            : cameraColour === false
              ? `The profile lists the ${cameraName} as a mono camera, so its frames have no Bayer pattern and colour needs filters and separate runs. Not verified for this camera.`
              : `The profile does not say whether the ${cameraName} is a colour or a mono camera. If it is colour, check AutoStakkert reads the frames as colour (its Bayer pattern setting). Not verified for this camera.`,
        basis: 'not-verified',
      },
      {
        id: 'sharpen',
        title: 'Sharpen',
        text: 'Sharpen the stack with wavelets (RegiStax) or deconvolution. Stop when noise or rings show.',
        basis: 'practice',
      },
      {
        id: 'colour',
        title: 'Colour and derotation',
        text: 'Balance colour and saturation last. Derotating several clips into one image (WinJUPOS) is optional and lets the total time run past one clip.',
        basis: 'practice',
      },
    ],
  });

  // ------------------------------------------------------------------- train
  const trainItems: GuideItem[] = [];
  if (nativeTrain) {
    const s = samplingFor(nativeTrain.scaleArcsecPx, apertureMm);
    trainItems.push({
      id: 'native',
      title: 'Start native',
      text: `${nativeTrain.name}: ${f2(s.scaleArcsecPx)} arcsec per pixel against a sampling limit of ${f2(s.nyquistArcsecPx)} for this telescope at 500 nm: ${s.verdict === 'oversampled' ? 'oversampled' : s.verdict === 'coarse' ? 'coarse' : 'near the limit'} (computed). Seeing is assumed ${SEEING_ASSUMED_ARCSEC} arcsec (assumption), wider than the telescope's ${f2(s.dawesArcsec)}: detail is usually limited by the air, not the pixels.`,
      basis: 'computed',
    });
  }
  if (extenderTrain) {
    const s = samplingFor(extenderTrain.scaleArcsecPx, apertureMm);
    trainItems.push({
      id: 'extender',
      title: 'Add the extender only when seeing justifies it',
      text: `${extenderTrain.name}: nominal ${f2(s.scaleArcsecPx)} arcsec per pixel, ${s.verdict === 'oversampled' ? 'oversampled' : s.verdict === 'coarse' ? 'coarse' : 'near the limit'} (computed). Nominal because the 2.5x Powermate is a 1.25 inch eyepiece amplifier with no stated camera spacing: the real scale depends on the spacing and is not verified. Add it only after a native stack is sharp at full size on a night of steady air.`,
      basis: 'computed',
    });
  }
  if (trainItems.length > 0) sections.push({ id: 'train', title: 'Which train', items: trainItems });

  return sections;
}
