// brushedMetal.mjs — a brushed-metal texture for a transparent metallic overlay, made rather than
// photographed, so it is ours to ship.
//
// The SH-201's silver sections are brushed aluminium: fine horizontal streaks, a little lighter and
// darker from line to line. A flat silver fill reads as grey plastic. The fix is the Background
// tab's Overlay layer: this texture tiled over the fill, blended with Overlay at partial opacity,
// so it lightens and darkens the silver without changing its colour — mid-grey (128) is no change
// at all under the Overlay blend.
//
// A 256 x 64 greyscale PNG that tiles both ways: the streaks along x are a circular blur of noise
// and sines with whole periods, and the rows are smoothed with wraparound. Seeded, so the file only
// changes when this does. No image library: a PNG is three chunks and a deflate, and node has zlib.

import { deflateSync } from 'node:zlib';

export const WIDTH = 256;
export const HEIGHT = 64;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A circular box blur, so the row still tiles after it. */
function circularBlur(values, radius) {
  const n = values.length;
  return values.map((_, i) => {
    let sum = 0;
    for (let d = -radius; d <= radius; d++) sum += values[(i + d + n) % n];
    return sum / (2 * radius + 1);
  });
}

/** The texture's grey levels, row by row. */
export function brushedMetalPixels(seed = 201) {
  const random = mulberry32(seed);
  const centred = () => random() * 2 - 1;

  // Line to line: every row a little lighter or darker, softened against its neighbours.
  const rows = circularBlur(Array.from({ length: HEIGHT }, () => centred() * 22), 1);

  const pixels = [];
  for (let y = 0; y < HEIGHT; y++) {
    // Along the line: grain stretched into streaks, and a slow swell of whole periods.
    const grain = circularBlur(circularBlur(Array.from({ length: WIDTH }, () => centred() * 34), 6), 6);
    const phase = random() * Math.PI * 2;
    const swell = (x) => 6 * Math.sin((2 * Math.PI * 2 * x) / WIDTH + phase) + 3 * Math.sin((2 * Math.PI * 5 * x) / WIDTH + phase * 1.7);
    const row = [];
    for (let x = 0; x < WIDTH; x++) {
      row.push(Math.max(0, Math.min(255, Math.round(128 + rows[y] + grain[x] + swell(x)))));
    }
    pixels.push(row);
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The texture as PNG bytes: 8-bit greyscale, each row Sub-filtered (the streaks run along it). */
export function brushedMetalPng(seed = 201) {
  const pixels = brushedMetalPixels(seed);
  const raw = Buffer.alloc(HEIGHT * (WIDTH + 1));
  pixels.forEach((row, y) => {
    const at = y * (WIDTH + 1);
    raw[at] = 1;   // Sub
    row.forEach((value, x) => { raw[at + 1 + x] = (value - (x ? row[x - 1] : 0) + 256) & 0xFF; });
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;    // bit depth
  header[9] = 0;    // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const brushedMetalDataUrl = (seed = 201) => `data:image/png;base64,${brushedMetalPng(seed).toString('base64')}`;
