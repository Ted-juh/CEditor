// animatedGif.mjs — read Chromium's PNG screenshots, write one animated GIF.
//
// WHY THIS EXISTS RATHER THAN A DEPENDENCY OR FFMPEG.
//
// The capture side of a demo recording is already solved: Playwright hands back a PNG per frame.
// Turning those into a GIF is the part with no answer in the tree — the ffmpeg that ships beside
// the Playwright browsers is built for WebM screencasts and has exactly one image encoder in it:
//
//     $ ffmpeg-linux -encoders | grep -i gif      → nothing
//     $ ffmpeg-linux -filters  | grep palettegen  → nothing
//
// so the usual `palettegen,paletteuse` recipe is not available here, and neither is `convert`.
// Adding `gifenc` to CE/web/package.json to make four documentation pictures would put a build
// dependency in the app's manifest for something the app never runs, so this is ~300 lines of
// GIF89a instead. It has no dependencies beyond node:zlib and nothing else imports it, which is
// the trade: a self-contained file to read rather than a package to install.
//
// WHAT IT DOES NOT DO. Bit depths other than 8, interlaced PNGs, palette PNGs, and 16-bit
// channels are all rejected rather than half-handled — Chromium emits 8-bit RGBA and that is the
// only input this ever sees. If you point it at a PNG from somewhere else and it throws, the
// throw is honest: this is a screenshot reader, not an image library.

import { inflateSync } from 'node:zlib';

/* ------------------------------------------------------------------ PNG in ------------------- */

/**
 * Decode one 8-bit non-interlaced truecolour PNG to { width, height, rgba }.
 *
 * The five filter types are the whole of the work. PNG filters each scanline against the one above
 * it, so decoding is inherently sequential — this is why it reads as a loop with a `prev` row
 * rather than anything vectorised.
 */
export function decodePng(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('not a PNG');
  }

  let width = 0;
  let height = 0;
  let colourType = -1;
  const idat = [];

  for (let pos = 8; pos + 8 <= buf.length;) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const bitDepth = body[8];
      colourType = body[9];
      const interlace = body[12];
      if (bitDepth !== 8) throw new Error(`PNG bit depth ${bitDepth} unsupported (need 8)`);
      if (interlace !== 0) throw new Error('interlaced PNG unsupported');
      if (colourType !== 2 && colourType !== 6) throw new Error(`PNG colour type ${colourType} unsupported`);
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + length; // length + type + body + CRC
  }

  const channels = colourType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const row = new Uint8Array(stride);

    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? row[i - channels] : 0; // left
      const b = prev[i];                               // up
      const c = i >= channels ? prev[i - channels] : 0; // up-left
      let value = src[i];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth: whichever of left/up/up-left the linear estimate a+b-c lands nearest.
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) {
        throw new Error(`PNG filter ${filter} unknown`);
      }
      row[i] = value & 0xff;
    }

    for (let x = 0; x < width; x += 1) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = row[s];
      rgba[d + 1] = row[s + 1];
      rgba[d + 2] = row[s + 2];
      rgba[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }

  return { width, height, rgba };
}

/* ------------------------------------------------------- colour quantisation ----------------- */

/**
 * Median-cut a histogram down to `max` colours.
 *
 * Median cut, not k-means: an LCD is a handful of flat colours plus two smooth gradients (the
 * backlight wash and the glass sheen), and the failure mode that matters is banding across those
 * gradients. Median cut spends its palette where the pixels are, which is exactly there. The boxes
 * are split on the channel with the widest spread, at the weighted median, so a box holding a lot
 * of near-identical pixels keeps splitting until it is flat.
 */
function medianCut(histogram, max) {
  const entries = [...histogram.entries()].map(([key, count]) => ({
    r: (key >> 16) & 0xff, g: (key >> 8) & 0xff, b: key & 0xff, count,
  }));
  if (entries.length <= max) {
    return entries.map((e) => [e.r, e.g, e.b]);
  }

  const boxOf = (items) => {
    let rMin = 255; let rMax = 0; let gMin = 255; let gMax = 0; let bMin = 255; let bMax = 0;
    let total = 0;
    for (const it of items) {
      if (it.r < rMin) rMin = it.r; if (it.r > rMax) rMax = it.r;
      if (it.g < gMin) gMin = it.g; if (it.g > gMax) gMax = it.g;
      if (it.b < bMin) bMin = it.b; if (it.b > bMax) bMax = it.b;
      total += it.count;
    }
    // Weighted by the eye's rough channel sensitivity, so a box that varies in green splits before
    // an equally wide box that only varies in blue.
    const spread = Math.max((rMax - rMin) * 0.30, (gMax - gMin) * 0.59, (bMax - bMin) * 0.11);
    return { items, total, spread, rMax, rMin, gMax, gMin, bMax, bMin };
  };

  let boxes = [boxOf(entries)];
  while (boxes.length < max) {
    // Split the box with the most to gain: widest colour spread, pixel count breaking ties.
    let pick = -1;
    let best = -1;
    for (let i = 0; i < boxes.length; i += 1) {
      const box = boxes[i];
      if (box.items.length < 2) continue;
      const score = box.spread * Math.log2(box.total + 1);
      if (score > best) { best = score; pick = i; }
    }
    if (pick < 0) break;

    const box = boxes[pick];
    const rSpan = (box.rMax - box.rMin) * 0.30;
    const gSpan = (box.gMax - box.gMin) * 0.59;
    const bSpan = (box.bMax - box.bMin) * 0.11;
    const channel = gSpan >= rSpan && gSpan >= bSpan ? 'g' : (rSpan >= bSpan ? 'r' : 'b');
    const sorted = box.items.slice().sort((a, b) => a[channel] - b[channel]);

    // Split at the weighted median so both halves carry a similar share of the pixels.
    const half = box.total / 2;
    let running = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i += 1) {
      running += sorted[i].count;
      if (running >= half) { cut = i + 1; break; }
      cut = i + 2;
    }
    boxes.splice(pick, 1, boxOf(sorted.slice(0, cut)), boxOf(sorted.slice(cut)));
  }

  // Each box becomes its pixel-weighted mean colour.
  return boxes.map((box) => {
    let r = 0; let g = 0; let b = 0; let n = 0;
    for (const it of box.items) { r += it.r * it.count; g += it.g * it.count; b += it.b * it.count; n += it.count; }
    return n === 0 ? [0, 0, 0] : [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
}

/* ---------------------------------------------------------------------- LZW ------------------ */

/** GIF's variable-width LZW, emitted as the 255-byte sub-blocks the format packs it into. */
function lzwCompress(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  const out = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code, width) => {
    bitBuffer |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = minCodeSize + 1;
  let next = endCode + 1;
  let dict = new Map();
  emit(clearCode, codeSize);

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = prefix * 4096 + k; // prefix < 4096 always, so this is a unique integer key
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next);
      next += 1;
      if (next - 1 === (1 << codeSize) && codeSize < 12) codeSize += 1;
    } else {
      // Table full: reset, which is what keeps long animations from degrading.
      emit(clearCode, codeSize);
      dict = new Map();
      next = endCode + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix, codeSize);
  emit(endCode, codeSize);
  if (bitCount > 0) out.push(bitBuffer & 0xff);

  const blocks = [];
  for (let i = 0; i < out.length; i += 255) {
    const chunk = out.slice(i, i + 255);
    blocks.push(Buffer.from([chunk.length, ...chunk]));
  }
  blocks.push(Buffer.from([0]));
  return Buffer.concat(blocks);
}

/* ------------------------------------------------------------------ GIF out ----------------- */

/**
 * Encode RGBA frames as one looping animated GIF.
 *
 * @param {{width:number,height:number,rgba:Uint8Array}[]} frames  same dimensions throughout
 * @param {{delayCs?:number, loop?:number}} options  delay per frame in centiseconds (GIF's unit)
 *
 * TWO THINGS EARN MOST OF THE FILE SIZE BACK, and both matter here because a display is mostly
 * still — the bezel, the glass and the unlit cells do not change between frames:
 *
 *   * ONE GLOBAL PALETTE built from every frame, so a colour cannot shift between frames the way
 *     it does with per-frame palettes (which on a gradient reads as the whole screen shimmering).
 *   * INTER-FRAME TRANSPARENCY. Palette slot 255 is reserved as transparent, every pixel equal to
 *     the previous frame's is written as that slot, and frames are left in place (disposal 1) so
 *     what shows through is the pixel already on screen. Flat unchanged regions then collapse into
 *     LZW runs. On these four captures it is the difference between ~9 MB and well under 1 MB.
 */
export function encodeGif(frames, { delayCs = 5, loop = 0 } = {}) {
  if (!frames.length) throw new Error('no frames');
  const { width, height } = frames[0];
  const pixels = width * height;

  // Histogram over every frame, so the palette serves the whole animation.
  const histogram = new Map();
  for (const frame of frames) {
    const { rgba } = frame;
    for (let i = 0; i < pixels; i += 1) {
      const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
      histogram.set(key, (histogram.get(key) ?? 0) + 1);
    }
  }

  // 255, not 256: the last slot is the transparency used for "same as last frame".
  const palette = medianCut(histogram, 255);
  while (palette.length < 255) palette.push([0, 0, 0]);
  const TRANSPARENT = 255;

  // Nearest palette entry per distinct colour, memoised. The frames share very few colours between
  // them but each frame repeats its own heavily, so the cache turns a per-pixel search into a
  // per-distinct-colour one: ~4,000 searches instead of ~3,000,000.
  const nearest = new Map();
  const indexOf = (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    const hit = nearest.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i += 1) {
      const dr = r - palette[i][0];
      const dg = g - palette[i][1];
      const db = b - palette[i][2];
      // Same luminance weighting as the split, so "nearest" agrees with "worth a slot".
      const dist = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
      if (dist < bestDist) { bestDist = dist; best = i; }
    }
    nearest.set(key, best);
    return best;
  };

  const chunks = [];
  const header = Buffer.alloc(13);
  header.write('GIF89a', 0, 'ascii');
  header.writeUInt16LE(width, 6);
  header.writeUInt16LE(height, 8);
  header[10] = 0xf7; // global colour table, 8 bits per channel of resolution, 256 entries
  header[11] = 0;    // background index
  header[12] = 0;    // default pixel aspect ratio
  chunks.push(header);

  const table = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const [r, g, b] = i < palette.length ? palette[i] : [0, 0, 0];
    table[i * 3] = r; table[i * 3 + 1] = g; table[i * 3 + 2] = b;
  }
  chunks.push(table);

  // NETSCAPE2.0 is what makes an animated GIF loop; without it every viewer plays it once.
  const netscape = Buffer.alloc(19);
  netscape[0] = 0x21; netscape[1] = 0xff; netscape[2] = 0x0b;
  netscape.write('NETSCAPE2.0', 3, 'ascii');
  netscape[14] = 0x03; netscape[15] = 0x01;
  netscape.writeUInt16LE(loop, 16);
  netscape[18] = 0x00;
  chunks.push(netscape);

  let previous = null;
  for (const frame of frames) {
    const { rgba } = frame;
    const indices = new Uint8Array(pixels);
    for (let i = 0; i < pixels; i += 1) {
      const r = rgba[i * 4];
      const g = rgba[i * 4 + 1];
      const b = rgba[i * 4 + 2];
      if (previous && previous[i * 4] === r && previous[i * 4 + 1] === g && previous[i * 4 + 2] === b) {
        indices[i] = TRANSPARENT;
      } else {
        indices[i] = indexOf(r, g, b);
      }
    }

    const gce = Buffer.alloc(8);
    gce[0] = 0x21; gce[1] = 0xf9; gce[2] = 0x04;
    // Disposal 1 (leave in place) + transparency on, so transparent pixels keep what is under them.
    gce[3] = previous ? 0x05 : 0x01;
    gce.writeUInt16LE(delayCs, 4);
    gce[6] = TRANSPARENT;
    gce[7] = 0x00;
    chunks.push(gce);

    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(0, 1); // left
    descriptor.writeUInt16LE(0, 3); // top
    descriptor.writeUInt16LE(width, 5);
    descriptor.writeUInt16LE(height, 7);
    descriptor[9] = 0x00; // no local colour table, not interlaced
    chunks.push(descriptor);

    chunks.push(Buffer.from([8])); // LZW minimum code size for a 256-entry table
    chunks.push(lzwCompress(indices, 8));
    previous = rgba;
  }

  chunks.push(Buffer.from([0x3b])); // trailer
  return Buffer.concat(chunks);
}
