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
import { labToRgb } from './psdAdjustments.js';

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
const CONVERTED = new Set([4, 8, 9]);

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
        inner += 4 + data.getUint32(inner); // layer mask data
        inner += 4 + data.getUint32(inner); // blending ranges
        inner += (((view[inner] + 1) + 3) & ~3); // name, a Pascal string padded to 4
        let knockout = 0;
        while (inner + 12 <= end) {
          if (tag(inner) !== '8BIM' && tag(inner) !== '8B64') { inner += 1; continue; }
          const key = tag(inner + 4);
          const long = large && LONG_KEYS.has(key);
          const body = inner + 8 + (long ? 8 : 4);
          if (key === 'knko') knockout = view[body];
          inner = body + length(inner + 8, long);
        }
        out.push({ knockout, channels });
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
export function convertedNotice(mode) {
  if (mode === 'Duotone') return 'This Photoshop file is in Duotone colour: it comes in grey, without its inks\' colours.';
  return `This Photoshop file is in ${mode} colour: its colours are made RGB plainly, without the file's colour profile, so they can differ a little from Photoshop's own conversion; adjustment layers act on the RGB colours.`;
}

/** A Photoshop CMYK value pair as stored (255 no ink) to RGB, as a plain conversion does it. */
const cmyk8 = (c, m, y, k) => [(c * k) / 255, (m * k) / 255, (y * k) / 255];
/** Photoshop's 8-bit Lab (L 0..255 for 0..100, a and b offset by 128) to sRGB. */
const lab8 = (l, a, b) => labToRgb((l * 100) / 255, a - 128, b - 128);

/**
 * A file in a colour mode ag-psd does not read, read through it as one it does: its header said to be
 * RGB (Lab, CMYK) or Grayscale (Duotone), so ag-psd reads its layers, groups, masks, styles and text as
 * ever, and their colours worked out here. CMYK's black is a fourth channel: read once more on its own,
 * its id given to the first colour, the others' set aside. `{ psd, mode }` or null.
 */
function readConverted(view, mode, composite) {
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
    const psd = parse((id) => (id === 3 ? aside(3) : id), 3);
    const black = parse((id) => (id === 3 ? 0 : id >= 0 && id <= 2 ? aside(id) : id), 3);
    const inks = [];
    walkPictures(black.children, (data) => inks.push(data));
    let n = 0;
    walkPictures(psd.children, (data) => {
      const k = inks[n++];
      for (let i = 0; i < data.length; i += 4) data.set(cmyk8(data[i], data[i + 1], data[i + 2], k ? k[i] : 255).map(Math.round), i);
    });
    return finishConverted(psd, view, composite, 4, (p) => cmyk8(p[0], p[1], p[2], p[3]));
  }
  return null;
}

/** Each layer's own picture's pixels (8-bit), in order, groups' layers too. */
function walkPictures(layers, visit) {
  for (const layer of layers ?? []) {
    if (layer.imageData?.data instanceof Uint8ClampedArray || layer.imageData?.data instanceof Uint8Array) visit(layer.imageData.data);
    walkPictures(layer.children, visit);
  }
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
  // Each knockout's level, where the records and ag-psd's layers line up one for one.
  const records = layerRecords(view);
  const order = recordOrder(psd.children);
  if (records && records.length === order.length) {
    order.forEach((layer, i) => { if (layer && records[i].knockout) layer.knockoutLevel = records[i].knockout; });
  }
  if (psd.bitsPerChannel && psd.bitsPerChannel !== 8 && !converted) {
    eightBitLayers(psd.children);
    if (psd.imageData) psd.imageData = eightBit(psd.imageData);
  }
  return { ok: true, psd, ...(converted ? { converted } : {}) };
}
