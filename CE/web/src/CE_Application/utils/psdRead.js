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
 *
 * Each layer that knocks out gets `knockoutLevel` (1 shallow, 2 deep), read from its record; ag-psd's
 * `knockout` says only whether it does.
 */
import { initializeCanvas, readPsd } from 'ag-psd';
import { cmykToRgb, labToRgb } from './psdAdjustments.js';
import { readEffectsBlock } from './psdEffects.js';
import { iccCmykToRgb } from './iccProfile.js';

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
// The colour modes ag-psd does not read that are read here through it (readConverted).
const CONVERTED = new Set([4, 7, 8, 9]);

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

/**
 * A 32-bit document works in linear light, and so do the colours its settings keep (a shape's fill,
 * a gradient's stops, a style's colour): put through the same curve as its pixels (vector-mask.psd,
 * whose shapes otherwise come out darker than Photoshop's picture of them).
 */
function linearColours(layers) {
  const fix = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6 || ArrayBuffer.isView(value)) return;
    if (Array.isArray(value)) { for (const item of value) fix(item, depth + 1); return; }
    if (typeof value.r === 'number' && typeof value.g === 'number' && typeof value.b === 'number' && Object.keys(value).length <= 4) {
      for (const k of ['r', 'g', 'b']) value[k] = 255 * srgb(clamp01(value[k] / 255));
      return;
    }
    for (const [key, item] of Object.entries(value)) if (key !== 'imageData' && key !== 'picture') fix(item, depth + 1);
  };
  // Its gradients mix their stops in that linear light too (gradient-fill.psd): marked for the ramp.
  const mark = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6 || ArrayBuffer.isView(value)) return;
    if (Array.isArray(value)) { for (const item of value) mark(item, depth + 1); return; }
    if (Array.isArray(value.colorStops)) value.linearLight = true;
    for (const [key, item] of Object.entries(value)) if (key !== 'imageData' && key !== 'picture') mark(item, depth + 1);
  };
  for (const layer of layers ?? []) {
    fix(layer.vectorFill);
    fix(layer.effects);
    fix(layer.vectorStroke);
    mark(layer.vectorFill);
    mark(layer.effects);
    mark(layer.adjustment);
    linearColours(layer.children);
  }
}

function eightBitLayers(layers, colour = true) {
  for (const layer of layers ?? []) {
    if (layer.imageData) layer.imageData = eightBit(layer.imageData, colour);
    if (layer.mask?.imageData) layer.mask.imageData = eightBit(layer.mask.imageData, false);
    if (layer.realMask?.imageData) layer.realMask.imageData = eightBit(layer.realMask.imageData, false);
    if (layer.children) eightBitLayers(layer.children, colour);
  }
}

// Additional-information keys whose length is 8 bytes in a large document (.psb).
const LONG_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD', 'lnkE', 'extd', 'cinf']);

/**
 * The file's layer records, in the order it keeps them: each `{ knockout, channels: [{ id, at }] }`,
 * the knockout's level (Blending Options › Knockout: 0 none, 1 shallow, 2 deep; ag-psd keeps only
 * whether a layer knocks out) and where each channel's id is written. A 16- or 32-bit file keeps its
 * records in an 'Lr16' or 'Lr32' block instead. null where they cannot be read here.
 */
function layerRecords(view) {
  try {
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    const large = data.getUint16(4) === 2;
    const tag = (i) => String.fromCharCode(view[i], view[i + 1], view[i + 2], view[i + 3]);
    const length = (i, long) => (long ? Number(data.getBigUint64(i)) : data.getUint32(i));
    const records = (from) => {
      let at = from;
      const count = Math.abs(data.getInt16(at));
      at += 2;
      const out = [];
      for (let i = 0; i < count; i += 1) {
        at += 16;
        const channelCount = data.getUint16(at);
        at += 2;
        const channels = [];
        for (let c = 0; c < channelCount; c += 1) {
          channels.push({ id: data.getInt16(at), at });
          at += large ? 10 : 6;
        }
        at += 12; // blend signature and key, opacity, clipping, flags, filler
        const extra = data.getUint32(at);
        at += 4;
        const end = at + extra;
        let inner = at;
        // Layer mask data: the "real" mask (the user and vector masks together) counts only where its
        // flags say parameters were applied to it, as psd-tools reads it.
        const maskLength = data.getUint32(inner);
        const realApplied = maskLength >= 36 && (view[inner + 4 + 18] & 16) !== 0;
        // The mask's parameters (Properties › Density and Feather), where its flags say it has them:
        // ag-psd does not always pass them on (mask-parameters-no-real-channel.psd).
        let maskParameters = null;
        if (maskLength >= 20 && (view[inner + 4 + 17] & 16) !== 0) {
          const which = view[inner + 4 + 18];
          let p = inner + 4 + 19;
          maskParameters = {};
          if (which & 1) { maskParameters.userMaskDensity = view[p] / 255; p += 1; }
          if (which & 2) { maskParameters.userMaskFeather = data.getFloat64(p); p += 8; }
          if (which & 4) { maskParameters.vectorMaskDensity = view[p] / 255; p += 1; }
          if (which & 8) { maskParameters.vectorMaskFeather = data.getFloat64(p); p += 8; }
          if (p > inner + 4 + maskLength) maskParameters = null;
        }
        inner += 4 + maskLength;
        inner += 4 + data.getUint32(inner); // blending ranges
        inner += (((view[inner] + 1) + 3) & ~3); // name, a Pascal string padded to 4
        let knockout = 0;
        let black = null;
        let effectsAt = null;
        let effectsKey = '';
        let restricted = null;
        while (inner + 12 <= end) {
          if (tag(inner) !== '8BIM' && tag(inner) !== '8B64') { inner += 1; continue; }
          const key = tag(inner + 4);
          const long = large && LONG_KEYS.has(key);
          const body = inner + 8 + (long ? 8 : 4);
          if (key === 'knko') knockout = view[body];
          if (key === 'curv' || key === 'levl') black = blackChannel(data, key, body);
          // The layer's styles: 'lmfx' (several of one style) over 'lfx2', and that over 'lfxs', which a
          // group may keep instead (group-stroke-off-canvas.psd: its strokes only there).
          if (key === 'lmfx') { effectsAt = body; effectsKey = key; }
          if (key === 'lfx2' && effectsKey !== 'lmfx') { effectsAt = body; effectsKey = key; }
          if (key === 'lfxs' && effectsAt == null) { effectsAt = body; effectsKey = key; }
          // Advanced Blending's Channels: the channels the layer leaves alone, four bytes each (ag-psd
          // drops the last of them, so one channel is none).
          if (key === 'brst') {
            restricted = [];
            const size = length(inner + 8, long);
            for (let k = 0; k + 4 <= size; k += 4) restricted.push(data.getInt32(body + k));
          }
          inner = body + length(inner + 8, long);
        }
        out.push({ knockout, channels, black, realApplied, effectsAt, effectsKey, restricted, maskParameters });
        at = end;
      }
      return out;
    };
    let at = 26;
    at += 4 + data.getUint32(at); // colour mode data
    at += 4 + data.getUint32(at); // image resources
    const sectionLength = length(at, large);
    if (!sectionLength) return []; // no layers at all: the file's picture alone
    const sectionEnd = at + (large ? 8 : 4) + sectionLength;
    at += large ? 8 : 4;
    const infoLength = length(at, large);
    at += large ? 8 : 4;
    if (infoLength > 0) return records(at);
    // No records there: a 16- or 32-bit file's, in the global additional information.
    let p = at + infoLength;
    p += 4 + data.getUint32(p); // global layer mask information
    while (p + 12 <= sectionEnd) {
      if (tag(p) !== '8BIM' && tag(p) !== '8B64') { p += 1; continue; }
      const key = tag(p + 4);
      const long = large && LONG_KEYS.has(key);
      const body = p + 8 + (long ? 8 : 4);
      if (key === 'Lr16' || key === 'Lr32') return records(body);
      p = body + length(p + 8, long);
    }
    return [];
  } catch {
    return null;
  }
}

/**
 * A CMYK file's Curves or Levels for its Black channel, which ag-psd does not read (it names the first
 * three channels red, green and blue): Curves' fifth channel, Levels' fifth record. Null if none.
 */
function blackChannel(data, key, body) {
  try {
    if (key === 'levl') {
      const at = body + 2 + 4 * 10;
      const v = (i) => data.getInt16(at + i * 2);
      return { shadowInput: v(0), highlightInput: v(1), shadowOutput: v(2), highlightOutput: v(3), midtoneInput: v(4) / 100 };
    }
    const bits = data.getUint16(body + 5);
    if (!(bits & 16)) return null;
    let at = body + 7;
    for (let channel = 0; channel < 4; channel += 1) if (bits & (1 << channel)) at += 2 + 4 * data.getUint16(at);
    const points = [];
    for (let i = 0, count = data.getUint16(at); i < count; i += 1) points.push({ output: data.getInt16(at + 2 + i * 4), input: data.getInt16(at + 4 + i * 4) });
    return points;
  } catch {
    return null;
  }
}

/**
 * The picture of the whole file Photoshop keeps after its layers, its first `count` channels, 8 bits a
 * channel, raw or run-length coded (as Photoshop writes it). Planes of `width` × `height`, or null.
 */
function compositeChannels(view, count) {
  try {
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    const large = data.getUint16(4) === 2;
    const channels = data.getUint16(12);
    const height = data.getUint32(14);
    const width = data.getUint32(18);
    const depth = data.getUint16(22);
    if (depth !== 8 && depth !== 16) return null;
    let at = 26;
    at += 4 + data.getUint32(at);
    at += 4 + data.getUint32(at);
    at += (large ? 8 : 4) + (large ? Number(data.getBigUint64(at)) : data.getUint32(at));
    const compression = data.getUint16(at);
    at += 2;
    const bytes = depth / 8;
    const rowBytes = width * bytes;
    const planes = [];
    if (compression === 0) {
      for (let c = 0; c < Math.min(count, channels); c += 1) planes.push(view.subarray(at + c * rowBytes * height, at + (c + 1) * rowBytes * height));
    } else if (compression === 1) {
      const counts = [];
      for (let r = 0; r < channels * height; r += 1) counts.push(large ? data.getUint32(at + r * 4) : data.getUint16(at + r * 2));
      let p = at + channels * height * (large ? 4 : 2);
      for (let c = 0; c < channels; c += 1) {
        const plane = new Uint8Array(rowBytes * height);
        for (let r = 0; r < height; r += 1) {
          const end = p + counts[c * height + r];
          let o = r * rowBytes;
          while (p < end && o < (r + 1) * rowBytes) {
            const n = view[p] > 127 ? view[p] - 256 : view[p];
            p += 1;
            if (n >= 0) { plane.set(view.subarray(p, p + n + 1), o); o += n + 1; p += n + 1; } else if (n !== -128) { plane.fill(view[p], o, o + 1 - n); o += 1 - n; p += 1; }
          }
          p = end;
        }
        if (c < count) planes.push(plane);
      }
    } else {
      return null;
    }
    // 16 bits: the high byte.
    const eight = bytes === 1 ? planes : planes.map((plane) => plane.filter((_, i) => i % 2 === 0));
    return { width, height, planes: eight };
  } catch {
    return null;
  }
}

/** What the notice says of a file read from a colour mode other than RGB (readConverted). */
export function convertedNotice(mode, { inks = false, profile = false } = {}) {
  if (mode === 'Duotone') return 'This Photoshop file is in Duotone colour: it comes in grey, without its inks\' colours.';
  if (mode === 'Multichannel') return 'This Photoshop file is in Multichannel colour: it has no layers, and its channels come as inks in the colours their Channel Options give them, printed one over another, as Photoshop shows them.';
  if (mode === 'CMYK') {
    const how = profile
      ? 'its colours are made RGB through the colour profile it carries, as Photoshop shows them'
      : 'its colours are made RGB as a standard press profile shows them (U.S. Web Coated SWOP), the file carrying none CEditor can read, so they can differ a little from Photoshop\'s';
    return `This Photoshop file is in CMYK colour: ${how}; ${inks ? 'it is flattened on its inks, as Photoshop flattens it' : 'its adjustment layers act on the RGB colours'}.`;
  }
  return `This Photoshop file is in ${mode} colour: its colours are made RGB plainly, without the file's colour profile, so they can differ a little from Photoshop's own conversion; adjustment layers act on the RGB colours.`;
}

/** Stored CMYK (255 no ink) as sRGB, through `convert` (inks 0..1) or the polynomial. */
const cmyk8 = (c, m, y, k, convert = cmykToRgb) => convert(1 - c / 255, 1 - m / 255, 1 - y / 255, 1 - k / 255);

/** An image resource's bytes (`id`), or null. */
function imageResource(view, wanted) {
  try {
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    let at = 26;
    at += 4 + data.getUint32(at);
    const end = at + 4 + data.getUint32(at);
    at += 4;
    while (at + 12 <= end) {
      if (String.fromCharCode(view[at], view[at + 1], view[at + 2], view[at + 3]) !== '8BIM') return null;
      const id = data.getUint16(at + 4);
      const nameLength = view[at + 6];
      at += 6 + ((nameLength + 2) & ~1);
      const size = data.getUint32(at);
      at += 4;
      if (id === wanted) return view.subarray(at, at + size);
      at += (size + 1) & ~1;
    }
  } catch {
    // none to read
  }
  return null;
}

/**
 * A Multichannel file, as Photoshop shows one: no layers (it keeps none), each channel an ink in the
 * colour its Channel Options give a spot channel (image resource 1077, DisplayInfo), at its solidity,
 * printed over white one on another; any other channel cyan, magenta, yellow or black by its place.
 */
function readMultichannel(view) {
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  const count = data.getUint16(12);
  const read = compositeChannels(view, count);
  if (!read || !read.planes.length) return null;
  const inks = [];
  const info = imageResource(view, 1077);
  if (info && info.byteLength >= 4) {
    const d = new DataView(info.buffer, info.byteOffset, info.byteLength);
    for (let at = 4; at + 13 <= info.byteLength; at += 13) {
      const space = d.getUint16(at);
      const c = [0, 1, 2, 3].map((k) => d.getUint16(at + 2 + 2 * k));
      const solidity = Math.min(100, d.getUint16(at + 10)) / 100;
      let rgb = null;
      if (space === 0) rgb = c.slice(0, 3).map((v) => v / 257);
      else if (space === 2) rgb = cmykToRgb(...c.map((v) => 1 - v / 65535));
      else if (space === 8) rgb = [0, 1, 2].map(() => 255 * (1 - c[0] / 10000));
      else if (space === 7) rgb = labToRgb(c[0] / 100, (c[1] > 32767 ? c[1] - 65536 : c[1]) / 100, (c[2] > 32767 ? c[2] - 65536 : c[2]) / 100);
      // Only a spot channel's colour is an ink's (kind 2); an alpha channel's is the overlay it is shown
      // with as a selection, so it takes the default ink for its place.
      inks.push(d.getUint8(at + 12) === 2 && rgb ? { rgb, solidity: solidity || 1 } : null);
    }
  }
  const fallback = [[0, 174, 239], [236, 0, 140], [255, 242, 0], [35, 31, 32]];
  const n = read.width * read.height;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i += 1) {
    const colour = [1, 1, 1];
    read.planes.forEach((plane, c) => {
      const ink = inks[c] ?? { rgb: fallback[c % 4], solidity: 1 };
      const amount = (1 - plane[i] / 255) * ink.solidity;
      for (let k = 0; k < 3; k += 1) colour[k] *= 1 - amount * (1 - ink.rgb[k] / 255);
    });
    out.set([colour[0] * 255, colour[1] * 255, colour[2] * 255, 255], i * 4);
  }
  return { width: read.width, height: read.height, channels: count, bitsPerChannel: data.getUint16(22), colorMode: 7, children: [], imageResources: {}, imageData: { width: read.width, height: read.height, data: out } };
}

/** The ICC profile the file carries (image resource 1039), as bytes, or null. */
function embeddedProfile(view) {
  try {
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    let at = 26;
    at += 4 + data.getUint32(at);
    const end = at + 4 + data.getUint32(at);
    at += 4;
    while (at + 12 <= end) {
      if (String.fromCharCode(view[at], view[at + 1], view[at + 2], view[at + 3]) !== '8BIM') return null;
      const id = data.getUint16(at + 4);
      const nameLength = view[at + 6];
      at += 6 + ((nameLength + 2) & ~1);
      const size = data.getUint32(at);
      at += 4;
      if (id === 1039) return view.subarray(at, at + size);
      at += (size + 1) & ~1;
    }
  } catch {
    // none to read
  }
  return null;
}
/** Photoshop's 8-bit Lab (L 0..255 for 0..100, a and b offset by 128) to sRGB. */
const lab8 = (l, a, b) => labToRgb((l * 100) / 255, a - 128, b - 128);

/**
 * A file in a colour mode ag-psd does not read, read through it as one it does: its header said to be
 * RGB (Lab, CMYK) or Grayscale (Duotone), so ag-psd reads its layers, groups, masks, styles and text as
 * ever, and their colours worked out here. CMYK's black is a fourth channel: read once more on its own,
 * its id given to the first colour, the others' set aside. `{ psd, mode }` or null.
 */
function readConverted(view, mode, composite) {
  if (mode === 7) return readMultichannel(view);
  const records = layerRecords(view);
  if (!records) return null;
  const parse = (relabel, as) => {
    const copy = new Uint8Array(view);
    copy[24] = 0;
    copy[25] = as;
    for (const record of records) {
      for (const channel of record.channels) {
        const id = relabel(channel.id);
        if (id !== channel.id) { copy[channel.at] = (id >> 8) & 0xff; copy[channel.at + 1] = id & 0xff; }
      }
    }
    const read = readPsd(copy.buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: true, skipLinkedFilesData: true });
    // 16 bits a channel made 8 first (as stored, not through a colour curve: these are not RGB).
    if (read.bitsPerChannel && read.bitsPerChannel !== 8) eightBitLayers(read.children, false);
    return read;
  };
  // An id ag-psd sets aside: below -3 (its masks), any other it reads.
  const aside = (id) => -4 - id;
  if (mode === 2) {
    // Indexed Color, where ag-psd's own reading of it fails: its one channel of palette numbers read as
    // grey, each looked up in the palette the file keeps (256 reds, then greens, then blues).
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    if (data.getUint32(26) < 768) return null;
    const palette = view.subarray(30, 30 + 768);
    const lookup = (index) => [palette[index], palette[256 + index], palette[512 + index]];
    const psd = parse((id) => id, 1);
    walkPictures(psd.children, (pixels) => { for (let i = 0; i < pixels.length; i += 4) pixels.set(lookup(pixels[i]), i); });
    return finishConverted(psd, view, composite, 1, (p) => lookup(p[0]));
  }
  if (mode === 8) {
    // Duotone: its one channel as grey (its inks' colours are Photoshop's, not in its pixels).
    const psd = parse((id) => id, 1);
    return finishConverted(psd, view, composite, 1, (p) => [p[0], p[0], p[0]]);
  }
  if (mode === 9) {
    const psd = parse((id) => id, 3);
    walkPictures(psd.children, (data) => { for (let i = 0; i < data.length; i += 4) data.set(lab8(data[i], data[i + 1], data[i + 2]).map(Math.round), i); });
    return finishConverted(psd, view, composite, 3, (p) => lab8(p[0], p[1], p[2]));
  }
  if (mode === 4) {
    // Through the file's own profile where it carries one this reads (as Photoshop shows it).
    const profile = iccCmykToRgb(embeddedProfile(view));
    const convert = profile ?? cmykToRgb;
    const psd = parse((id) => (id === 3 ? aside(3) : id), 3);
    if (profile) psd.cmykProfile = profile;
    const black = parse((id) => (id === 3 ? 0 : id >= 0 && id <= 2 ? aside(id) : id), 3);
    const inks = [];
    walkPictures(black.children, (data) => inks.push(data));
    let n = 0;
    walkPictures(psd.children, (data, layer) => {
      const k = inks[n++];
      // The inks as stored (255 no ink) kept beside the colours: cyan, magenta and yellow in one
      // picture, black in another, for the panel flattening to work on the inks as Photoshop does.
      layer.inkPlanes = { cmy: Uint8ClampedArray.from(data), k: k ? Uint8ClampedArray.from(k) : null };
      for (let i = 0; i < data.length; i += 4) data.set(cmyk8(data[i], data[i + 1], data[i + 2], k ? k[i] : 255, convert).map(Math.round), i);
    });
    return finishConverted(psd, view, composite, 4, (p) => cmyk8(p[0], p[1], p[2], p[3], convert));
  }
  return null;
}

/** Each layer's own picture's pixels (8-bit), in order, groups' layers too. */
function walkPictures(layers, visit) {
  for (const layer of layers ?? []) {
    if (layer.imageData?.data instanceof Uint8ClampedArray || layer.imageData?.data instanceof Uint8Array) visit(layer.imageData.data, layer);
    walkPictures(layer.children, visit);
  }
}

/**
 * The file's picture of itself, where it keeps more channels than its colours: the first is its
 * transparency (matted against white) where Photoshop says so, by a negative layer count or by naming
 * it Transparency, or where the file names no channels at all (other programs' files); one Photoshop
 * names otherwise is an alpha channel (a saved selection, colormodes/4x4_8bit_rgba.psd's "Alpha 1"),
 * not part of the picture. ag-psd takes the first as transparency either way, and puts any after it
 * into the next pixel's colour, so the picture is read again here.
 */
function extraChannels(psd, view, colours) {
  const channels = Number(psd.channels ?? colours);
  if (!(channels > colours) || !psd.imageData) return;
  const read = compositeChannels(view, channels);
  if (!read || read.planes.length < colours) return;
  const names = psd.imageResources?.alphaChannelNames;
  const ids = psd.imageResources?.alphaIdentifiers;
  let merged = !Array.isArray(names) || !names.length || /^transparency$/i.test(String(names[0]).trim()) || ids?.[0] === 0;
  try {
    const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
    const large = data.getUint16(4) === 2;
    let at = 26;
    at += 4 + data.getUint32(at);
    at += 4 + data.getUint32(at);
    const sectionLength = large ? Number(data.getBigUint64(at)) : data.getUint32(at);
    at += large ? 8 : 4;
    const infoLength = sectionLength > 0 ? (large ? Number(data.getBigUint64(at)) : data.getUint32(at)) : 0;
    at += large ? 8 : 4;
    if (infoLength > 0 && data.getInt16(at) < 0) merged = true;
  } catch {
    // (the names decide)
  }
  const n = read.width * read.height;
  const out = new Uint8ClampedArray(n * 4);
  const alpha = merged ? read.planes[colours] : null;
  for (let i = 0; i < n; i += 1) {
    const a = alpha ? alpha[i] : 255;
    for (let c = 0; c < 3; c += 1) {
      let v = read.planes[colours === 1 ? 0 : c][i];
      // Matted against white where partly transparent.
      if (a > 0 && a < 255) v = (v - 255 * (1 - a / 255)) / (a / 255);
      out[i * 4 + c] = v;
    }
    out[i * 4 + 3] = a;
  }
  psd.imageData = { width: read.width, height: read.height, data: out };
}

/** A converted file's picture of itself, read here, where it is wanted. */
function finishConverted(psd, view, composite, channels, toRgb) {
  if (composite) {
    const read = compositeChannels(view, channels);
    if (read && read.planes.length === channels) {
      const data = new Uint8ClampedArray(read.width * read.height * 4);
      const pixel = new Array(channels);
      for (let i = 0; i < read.width * read.height; i += 1) {
        for (let c = 0; c < channels; c += 1) pixel[c] = read.planes[c][i];
        const rgb = toRgb(pixel);
        data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
      }
      psd.imageData = { width: read.width, height: read.height, data };
    }
  }
  return psd;
}

/** ag-psd's layers in the file's order of records: a group's closing divider, its layers, the group. */
function recordOrder(layers, out = []) {
  for (const layer of layers ?? []) {
    if (Array.isArray(layer.children)) {
      out.push(null);
      recordOrder(layer.children, out);
    }
    out.push(layer);
  }
  return out;
}

/** The colour mode a Photoshop file's header says (bytes 24 and 25), or -1. */
function headerMode(bytes) {
  return bytes.length > 26 && bytes[0] === 0x38 && bytes[1] === 0x42 ? (bytes[24] << 8) | bytes[25] : -1;
}

export function readPhotoshop(bytes, { composite = false } = {}) {
  const view = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const fileMode = headerMode(view);
  let psd;
  let converted = '';
  try {
    if (CONVERTED.has(fileMode)) {
      psd = readConverted(view, fileMode, composite);
      if (!psd) throw new Error('its layers could not be read');
      converted = MODES[fileMode];
    } else {
      try {
        psd = readPsd(buffer, { useImageData: true, skipThumbnail: true, skipCompositeImageData: !composite, skipLinkedFilesData: true });
      } catch (error) {
        // An Indexed Color file ag-psd cannot read itself (it reads some): read through its palette.
        if (fileMode !== 2) throw error;
        psd = readConverted(view, fileMode, composite);
        if (!psd) throw error;
      }
    }
  } catch (error) {
    const mode = MODES[fileMode];
    if (mode && mode !== 'RGB' && mode !== 'Grayscale' && mode !== 'Bitmap' && mode !== 'Indexed Color') {
      return { ok: false, error: `This Photoshop file is in ${mode} colour, which CEditor cannot read${converted || CONVERTED.has(fileMode) ? ` (${error?.message ?? error})` : ''}. In Photoshop, choose Image › Mode › RGB Color and save it again.` };
    }
    return { ok: false, error: `This is not a Photoshop file CEditor can read (${error?.message ?? error}).` };
  }
  if (composite && !converted && (fileMode === 3 || fileMode === 1)) extraChannels(psd, view, fileMode === 3 ? 3 : 1);
  // Each knockout's level, where the records and ag-psd's layers line up one for one.
  const records = layerRecords(view);
  const order = recordOrder(psd.children);
  if (records && records.length === order.length) {
    order.forEach((layer, i) => {
      if (layer && records[i].knockout) layer.knockoutLevel = records[i].knockout;
      if (layer?.adjustment && records[i].black && converted === 'CMYK') layer.adjustment.black = records[i].black;
      if (layer?.mask && records[i].realApplied && layer.realMask?.imageData) layer.mask.real = layer.realMask;
      if (layer && records[i].restricted) layer.channelBlendingRestrictions = records[i].restricted;
      if (layer?.mask && records[i].maskParameters) {
        for (const [key, value] of Object.entries(records[i].maskParameters)) if (layer.mask[key] == null && Number.isFinite(value)) layer.mask[key] = value;
      }
      // Styles ag-psd could not read from the descriptor (it keeps the legacy block, without `scale`).
      if (layer && records[i].effectsAt != null && (!(layer.effects && 'scale' in layer.effects) || records[i].effectsKey === 'lfxs')) {
        const effects = readEffectsBlock(new DataView(view.buffer, view.byteOffset, view.byteLength), records[i].effectsAt);
        if (effects) layer.effects = effects;
      }
    });
  }
  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8 && !converted) {
    eightBitLayers(psd.children);
    if (psd.imageData) psd.imageData = eightBit(psd.imageData);
    if (psd.bitsPerChannel === 32) linearColours(psd.children);
  }
  globalLight(psd);
  binaryColours(psd.children);
  // (A converted file's patterns are in its own colours, not RGB.)
  if (!converted) attachPatterns(psd);
  // The file's own colour mode: a Grayscale or Duotone file's adjustments work on its one channel.
  psd.grey = fileMode === 1 || fileMode === 8;
  return { ok: true, psd, ...(converted ? { converted } : {}) };
}

/**
 * A Photo Filter's colour, which ag-psd reads from the binary colour structure in fractions (Lab's L
 * over 100, a and b over 128; HSB over 1), into the units its colours have everywhere else (L 0..100,
 * a and b ±128; degrees and percent): read as they were, a warming filter's orange was black.
 */
function binaryColours(layers) {
  for (const layer of layers ?? []) {
    const adjustment = layer.adjustment;
    const colour = adjustment?.type === 'photo filter' ? adjustment.color : null;
    if (colour && Number.isFinite(colour.l) && Math.abs(colour.l) <= 1 && Math.abs(colour.a) <= 1.01 && Math.abs(colour.b) <= 1.01) {
      adjustment.color = { l: colour.l * 100, a: colour.a * (colour.a < 0 ? 128 : 127), b: colour.b * (colour.b < 0 ? 128 : 127) };
    } else if (colour && Number.isFinite(colour.h) && colour.h <= 1 && colour.s <= 1) {
      adjustment.color = { h: colour.h * 360, s: colour.s * 100, b: colour.b * 100 };
    }
    binaryColours(layer.children);
  }
}

/**
 * A style set to Use Global Light takes the document's light, whatever angle it kept from when it was
 * made: Photoshop draws it so.
 */
function globalLight(psd) {
  const angle = psd.imageResources?.globalAngle;
  const altitude = psd.imageResources?.globalAltitude;
  if (angle == null && altitude == null) return;
  const walk = (layers) => {
    for (const layer of layers ?? []) {
      for (const value of Object.values(layer.effects ?? {})) {
        for (const effect of Array.isArray(value) ? value : [value]) {
          if (!effect || typeof effect !== 'object' || !effect.useGlobalLight) continue;
          if (angle != null && 'angle' in effect) effect.angle = angle;
          if (altitude != null && 'altitude' in effect) effect.altitude = altitude;
        }
      }
      walk(layer.children);
    }
  };
  walk(psd.children);
}

/**
 * The picture of each pattern a layer is filled with (a Pattern Fill layer, a Pattern Overlay), put
 * beside its name as `picture` ({ width, height, data } RGBA), from the patterns the file keeps. A
 * pattern the file does not keep (Photoshop saves only those in use, but not always) stays unfilled.
 */
function attachPatterns(psd) {
  const pictures = new Map();
  for (const pattern of psd.patterns ?? []) {
    const width = pattern.bounds?.w ?? 0;
    const height = pattern.bounds?.h ?? 0;
    if (width > 0 && height > 0 && pattern.data?.length === width * height * 4) pictures.set(pattern.id, { width, height, data: pattern.data });
  }
  if (!pictures.size) return;
  const walk = (layers) => {
    for (const layer of layers ?? []) {
      if (layer.vectorFill?.type === 'pattern' && pictures.has(layer.vectorFill.id)) layer.vectorFill.picture = pictures.get(layer.vectorFill.id);
      const overlay = layer.effects?.patternOverlay;
      if (overlay?.pattern && pictures.has(overlay.pattern.id)) overlay.picture = pictures.get(overlay.pattern.id);
      for (const stroke of layer.effects?.stroke ?? []) {
        if (stroke?.pattern && pictures.has(stroke.pattern.id)) stroke.pattern.picture = pictures.get(stroke.pattern.id);
      }
      walk(layer.children);
    }
  };
  walk(psd.children);
}
