/**
 * imageFrames.js — a part that is one of several pictures, chosen by a value: a part's Image
 * section in mode 'frames'.
 *
 *   Image: { mode: 'frames', frames: [{ source, x, y, width, height }, ...], frameIndex, blendFrames }
 *
 * Each frame is a picture of its own, placed in the part (x, y, width, height in % of it, so frames
 * cropped to what they hold keep their places), and `frameIndex` says which shows. With
 * `blendFrames` it may fall between two, and the part is the two mixed by how near each is: a
 * turning part's light or shadow rendered at angles a step apart (tools/blender/ceditor_layers.py),
 * shown between them as the two mixed.
 *
 * Mixed exactly, whatever the part's blend mode. Two layers faded against each other, each laid
 * onto the panel on its own, are not their mix: two shadows at half strength each let through a
 * quarter more than one, and two multiplies at half the same, so a knob would brighten between
 * every two angles. Here the two are added, each at its share, inside the part (CSS plus-lighter
 * adds colour and opacity alike), which is their mix; the part then lays that on what is under it
 * in its own mode.
 */
import { numberOr } from './primitives.js';

/** Whether an Image section is a part of frames. */
export function isFramesImage(image) {
  return String(image?.mode ?? '') === 'frames' && Array.isArray(image?.frames);
}

/**
 * What the section draws: `[{ frame, opacity }]`, one picture, or with `blendFrames` and the index
 * between two, the two with their shares (lower first). A frame with no picture (an angle at which
 * there was nothing to draw) draws nothing, and the other its share.
 */
export function imageFrameLayers(image) {
  if (!isFramesImage(image) || !image.frames.length) return [];
  const frames = image.frames;
  const last = frames.length - 1;
  const at = Math.max(0, Math.min(last, numberOr(image?.frameIndex, 0)));
  let layers;
  if (image?.blendFrames !== true) layers = [{ frame: frames[Math.round(at)], opacity: 1 }];
  else {
    const lower = Math.floor(at);
    const share = at - lower;
    // A share too small to change a level of an 8-bit picture is none.
    if (share < 0.5 / 255 || lower >= last) layers = [{ frame: frames[lower], opacity: 1 }];
    else if (share > 1 - 0.5 / 255) layers = [{ frame: frames[lower + 1], opacity: 1 }];
    else layers = [{ frame: frames[lower], opacity: 1 - share }, { frame: frames[lower + 1], opacity: share }];
  }
  return layers.filter((layer) => String(layer.frame?.source ?? ''));
}

const percent = (value, fallback) => `${Math.round(numberOr(value, fallback) * 10000) / 10000}%`;

/** A frame layer's CSS: the picture in its place, at its share; added to the other when there are two. */
export function imageFrameLayerStyle({ frame, opacity }, { mixed = false, smooth = true } = {}) {
  const source = String(frame.source).replaceAll('"', '\\"');
  return [
    'position:absolute',
    `left:${percent(frame.x, 0)}`,
    `top:${percent(frame.y, 0)}`,
    `width:${percent(frame.width, 100)}`,
    `height:${percent(frame.height, 100)}`,
    `background-image:url("${source}")`,
    'background-size:100% 100%',
    'background-repeat:no-repeat',
    `image-rendering:${smooth ? 'auto' : 'pixelated'}`,
    `opacity:${Math.round(opacity * 10000) / 10000}`,
    mixed ? 'mix-blend-mode:plus-lighter' : '',
    'pointer-events:none',
  ].filter(Boolean).join('; ');
}
