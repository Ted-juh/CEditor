/**
 * pngEncode.js — RGBA pixels to a PNG file, without a canvas.
 *
 * The Photoshop importer (utils/psdPanelImport.js) composites layers into plain RGBA arrays and needs
 * them as an image the panel can carry. A canvas would do it in the browser, but not in node, where
 * the importer is tested, and a canvas premultiplies alpha on the way through, which rounds the
 * colour of every semi-transparent pixel. This writes the file itself: one IHDR, one IDAT, one IEND,
 * 8-bit RGBA, filter 0 on every row, deflated by fflate (MIT). Deterministic: the same pixels always
 * give the same bytes, so a test can compare them.
 */
import { zlibSync } from 'fflate';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes, start, end) {
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** PNG bytes for `width` × `height` RGBA pixels (`rgba.length` = width × height × 4). */
export function encodePng(width, height, rgba) {
  if (!(width > 0 && height > 0) || rgba.length !== width * height * 4) {
    throw new Error(`encodePng: ${width}×${height} needs ${width * height * 4} bytes, got ${rgba.length}`);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);   // 8 bits per channel, RGBA, deflate, adaptive filtering, no interlace

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;   // filter: none
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const parts = [
    Uint8Array.of(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(raw, { level: 6 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** The same, as a data: URL. */
export function pngDataUrl(width, height, rgba) {
  const bytes = encodePng(width, height, rgba);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:image/png;base64,${btoa(binary)}`;
}
