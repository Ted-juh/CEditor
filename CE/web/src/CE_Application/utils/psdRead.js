/**
 * psdRead.js — a Photoshop file read for CEditor's two Photoshop imports (utils/psdPanelImport.js,
 * utils/psdComponentImport.js), as 8-bit sRGB pictures whatever it was saved in.
 *
 *   readPhotoshop(bytes, { composite })  →  { ok: true, psd } | { ok: false, error }
 *
 * ag-psd reads a 16-bit file's pixels as 0..65535 and a 32-bit file's as 0..1 in linear light (as
 * Photoshop works in 32 bits); the imports composite and store 8 bits a channel, so read as they came
 * a 16-bit layer was near white and a 32-bit one transparent. They are made 8-bit here, a 32-bit one's
 * colour through the sRGB curve (its opacity and its masks are coverage, and stay linear).
 *
 * A colour mode ag-psd does not read (CMYK, Lab, Duotone, Multichannel, Indexed Color) is said by name,
 * with how to convert the file, where its message was "Color mode not supported: 9".
 *
 * `composite`: the picture of the whole file Photoshop keeps beside its layers, read too: a file of
 * one Background layer has no layers at all, only that.
 */
import { initializeCanvas, readPsd } from 'ag-psd';

// ag-psd makes its pixel arrays through a canvas unless told otherwise — a canvas it borrows from the
// page in a browser, and has none of in node. A plain array is all `useImageData` needs, is the same
// everywhere, and never passes through a canvas's premultiplied alpha.
initializeCanvas(
  (width, height) => {
    if (typeof document === 'undefined') throw new Error('a canvas is not available here');
    return Object.assign(document.createElement('canvas'), { width, height });
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
);

const MODES = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed Color', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'Lab' };

const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);

/** A picture's pixels as 8 bits a channel; `colour` false for a mask (coverage, kept linear). */
export function eightBit(image, colour = true) {
  const data = image?.data;
  if (!data || data instanceof Uint8ClampedArray || data instanceof Uint8Array) return image;
  const out = new Uint8ClampedArray(data.length);
  if (data instanceof Uint16Array) {
    for (let i = 0; i < data.length; i += 1) out[i] = Math.round(data[i] / 257);
  } else {
    for (let i = 0; i < data.length; i += 1) {
      const v = clamp01(data[i]);
      out[i] = Math.round(255 * (colour && i % 4 !== 3 ? srgb(v) : v));
    }
  }
  return { ...image, data: out };
}

function eightBitLayers(layers) {
  for (const layer of layers ?? []) {
    if (layer.imageData) layer.imageData = eightBit(layer.imageData);
    if (layer.mask?.imageData) layer.mask.imageData = eightBit(layer.mask.imageData, false);
    if (layer.realMask?.imageData) layer.realMask.imageData = eightBit(layer.realMask.imageData, false);
    if (layer.children) eightBitLayers(layer.children);
  }
}

/** The colour mode a Photoshop file's header says (bytes 24 and 25), or -1. */
function headerMode(bytes) {
  return bytes.length > 26 && bytes[0] === 0x38 && bytes[1] === 0x42 ? (bytes[24] << 8) | bytes[25] : -1;
}

export function readPhotoshop(bytes, { composite = false } = {}) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  let psd;
  try {
    psd = readPsd(buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: !composite, skipLinkedFilesData: true });
  } catch (error) {
    const mode = MODES[headerMode(view)];
    if (mode && mode !== 'RGB' && mode !== 'Grayscale' && mode !== 'Bitmap') {
      return { ok: false, error: `This Photoshop file is in ${mode} colour, which CEditor cannot read. In Photoshop, choose Image › Mode › RGB Color and save it again.` };
    }
    return { ok: false, error: `This is not a Photoshop file CEditor can read (${error?.message ?? error}).` };
  }
  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8) {
    eightBitLayers(psd.children);
    if (psd.imageData) psd.imageData = eightBit(psd.imageData);
  }
  return { ok: true, psd };
}
