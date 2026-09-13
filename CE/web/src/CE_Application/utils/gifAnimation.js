import { parseGIF, decompressFrame } from 'gifuct-js';

// Compose GIF patches before sampling them into the screen's mono/colour grid.
// A frame can update only part of the image; transparent pixels preserve what
// was already there, and disposal 2/3 clears/restores it before the next frame.
export function decodeGifAnimation(bytes, grab, limit = 180) {
  const gif = parseGIF(bytes);
  const width = gif.lsd.width, height = gif.lsd.height;
  if (!width || !height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const patch = document.createElement('canvas');
  const frames = [], durations = [];
  for (const raw of gif.frames.filter(frame => frame.image).slice(0, limit)) {
    const frame = decompressFrame(raw, gif.gct, true);
    const { left, top, width: w, height: h } = frame.dims;
    const previous = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
    patch.width = w; patch.height = h;
    patch.getContext('2d').putImageData(new ImageData(frame.patch, w, h), 0, 0);
    ctx.drawImage(patch, left, top);
    const sampled = grab(canvas, 0, 0, width, height);
    if (sampled) {
      frames.push(sampled);
      durations.push(Math.max(20, frame.delay ?? 100));
    }
    if (frame.disposalType === 2) ctx.clearRect(left, top, w, h);
    else if (previous) ctx.putImageData(previous, 0, 0);
  }
  return frames.length ? { frames, durations, total: durations.reduce((a, b) => a + b, 0) } : null;
}
