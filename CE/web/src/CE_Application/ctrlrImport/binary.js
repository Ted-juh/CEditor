// binary.js — the two forms a Ctrlr panel takes that are not XML.
//
// A `.bpanelz` is not compressed XML. It is JUCE's binary ValueTree (ValueTree::writeToStream),
// zlib-compressed: of 482 public panels surveyed (docs/design/ctrlr-import-plan.md, "What real
// panels showed"), 187 are in this form, and the reader that only knew XML refused every one. A
// `.bpanel` is the same tree uncompressed. And the panels of Ctrlr's best-known editors are not
// published as panel files at all, only as the programs and plug-ins Ctrlr exports — which carry
// the panel inside, as the same compressed tree. `findEmbeddedPanel` finds it there.
//
// The tree comes back in xml.js's node shape — `{ name, attributes, children, text }` with every
// attribute a string, as the XML form writes it — so nothing downstream knows which form it read.
// A binary value (a picture's bytes, in a few panels) stays bytes, in `node.blobs[name]`.
//
// THE FORMAT, from JUCE's ValueTree::readFromStream and var::readFromStream:
//
//   tree     := name\0  compressedInt(numProperties)  property*  compressedInt(numChildren)  tree*
//   property := name\0  var
//   var      := compressedInt(size)  marker  payload[size - 1]       (size 0: void)
//   marker   := 1 int32 · 2 true · 3 false · 4 double · 5 string\0 · 6 int64 · 7 array · 8 bytes
//   compressedInt := one byte n (bit 7 = negative), then n (at most 4) little-endian bytes
//
// Every length is checked against what is left, so a damaged file is refused by name rather than
// read past its end; a panel of somebody's forum attachment is exactly that kind of file.

import { Inflate, inflateSync } from 'fflate';

const MARKER = { int: 1, true: 2, false: 3, double: 4, string: 5, int64: 6, array: 7, binary: 8 };
const MAX_DEPTH = 256;

class TreeReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.at = 0;
    this.utf8 = new TextDecoder('utf-8');
  }

  fail(message) {
    return new Error(`${message} (byte ${this.at})`);
  }

  need(count) {
    if (count < 0 || this.at + count > this.bytes.length) throw this.fail('The panel ends early');
  }

  byte() {
    this.need(1);
    return this.bytes[this.at++];
  }

  compressedInt() {
    const head = this.byte();
    const count = head & 0x7f;
    if (count > 4) throw this.fail('A length is malformed');
    this.need(count);
    let value = 0;
    for (let i = 0; i < count; i += 1) value += this.bytes[this.at + i] * 2 ** (8 * i);
    this.at += count;
    return head & 0x80 ? -value : value;
  }

  string() {
    const end = this.bytes.indexOf(0, this.at);
    if (end < 0) throw this.fail('A name is not terminated');
    const text = this.utf8.decode(this.bytes.subarray(this.at, end));
    this.at = end + 1;
    return text;
  }

  value() {
    const size = this.compressedInt();
    if (size <= 0) return { text: '' };
    this.need(size);
    const start = this.at;
    const marker = this.bytes[start];
    const body = start + 1;
    const length = size - 1;
    this.at = start + size;
    switch (marker) {
      case MARKER.int: return { text: length >= 4 ? String(this.view.getInt32(body, true)) : '0' };
      case MARKER.true: return { text: '1' };
      case MARKER.false: return { text: '0' };
      case MARKER.double: return { text: length >= 8 ? String(this.view.getFloat64(body, true)) : '0' };
      case MARKER.int64: return { text: length >= 8 ? String(this.view.getBigInt64(body, true)) : '0' };
      case MARKER.string: {
        let end = body + length;
        while (end > body && this.bytes[end - 1] === 0) end -= 1;
        return { text: this.utf8.decode(this.bytes.subarray(body, end)) };
      }
      case MARKER.binary: return { text: '', blob: this.bytes.slice(body, body + length) };
      case MARKER.array: return { text: '' };
      default: return { text: '' };
    }
  }

  tree(depth = 0) {
    if (depth > MAX_DEPTH) throw this.fail('The panel nests too deeply');
    const name = this.string();
    if (!name) throw this.fail('An element has no name');
    const node = { name, attributes: {}, children: [], text: '' };
    const properties = this.compressedInt();
    if (properties < 0) throw this.fail('A property count is negative');
    for (let i = 0; i < properties; i += 1) {
      const key = this.string();
      const { text, blob } = this.value();
      if (!key) continue;
      node.attributes[key] = text;
      if (blob) (node.blobs ??= {})[key] = blob;
    }
    const children = this.compressedInt();
    if (children < 0) throw this.fail('A child count is negative');
    for (let i = 0; i < children; i += 1) node.children.push(this.tree(depth + 1));
    return node;
  }
}

/** Does this decoded payload start like a binary Ctrlr panel? */
export function isBinaryPanel(bytes) {
  return bytes?.length > 6 && bytes[0] === 0x70 && bytes[1] === 0x61 && bytes[2] === 0x6e
    && bytes[3] === 0x65 && bytes[4] === 0x6c && bytes[5] === 0;   // "panel\0"
}

/** A binary ValueTree as xml.js nodes. Throws, with where, on anything malformed. */
export function parseValueTree(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (!data.length) throw new Error('The panel is empty');
  return new TreeReader(data).tree();
}

// --- Inside an exported program ------------------------------------------------------------------

const PROGRAM_SIGNATURES = [
  [0x4d, 0x5a],                // MZ: a Windows program or plug-in
  [0x7f, 0x45, 0x4c, 0x46],    // ELF: Linux
  [0xcf, 0xfa, 0xed, 0xfe],    // Mach-O 64-bit
  [0xce, 0xfa, 0xed, 0xfe],    // Mach-O 32-bit
  [0xca, 0xfe, 0xba, 0xbe],    // Mach-O universal
];

/** Is this a program or plug-in binary rather than a panel file? */
export function looksLikeProgram(bytes) {
  return PROGRAM_SIGNATURES.some((signature) => signature.every((byte, i) => bytes?.[i] === byte));
}

const PROBE_BYTES = 2048;

/** The first few bytes a zlib stream at `start` inflates to, or null if it is not one. */
function probeZlib(bytes, start) {
  const cmf = bytes[start];
  const flg = bytes[start + 1];
  if ((cmf & 0x0f) !== 8 || (cmf >> 4) > 7 || ((cmf << 8) | flg) % 31 !== 0 || (flg & 0x20)) return null;
  let head = null;
  try {
    const inflater = new Inflate((chunk) => { if (!head) head = chunk; });
    inflater.push(bytes.subarray(start + 2, Math.min(bytes.length, start + 2 + PROBE_BYTES)), false);
  } catch {
    return null;
  }
  return head;
}

/**
 * The Ctrlr panel inside an exported Ctrlr program or plug-in: `{ ok, bytes, offset }`, the panel's
 * decompressed bytes (binary or XML), or `{ ok: false, error }`.
 *
 * Ctrlr writes the panel into the program it exports as a zlib stream of the binary tree. Rather
 * than parse four executable formats to find the resource, this looks for a zlib header whose
 * stream starts "panel\0" (or "<panel"): the panel is the one thing in the file that does. It was
 * found this way in all ten exported editors tried — the JD-990 Super Editor, JV-1010, V50,
 * PLG150-AN, MPX100, KWaveS, Zoom RFX-2000 and the three JV PatchEd programs — on Windows and Linux.
 */
export function findEmbeddedPanel(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  let panel = null;
  const resources = [];
  for (let at = 0; at < data.length - 2; at += 1) {
    if (data[at] !== 0x78) continue;
    const head = probeZlib(data, at);
    if (!head) continue;
    // The pictures an exported program carries are NOT in its panel (which names them by file): they
    // are a second stream beside it, a tree called resourceExportList, in JUCE's base64.
    const resourceList = startsWith(head, RESOURCE_LIST);
    const xml = !isBinaryPanel(head) && !resourceList && /<\s*panel[\s>]/.test(new TextDecoder().decode(head.subarray(0, 256)));
    if (!isBinaryPanel(head) && !xml && !resourceList) continue;
    let unpacked;
    try {
      unpacked = inflateSync(data.subarray(at + 2));
    } catch (error) {
      if (!resourceList && !panel) return { ok: false, error: `The panel inside the program could not be unpacked (${error.message}).` };
      continue;
    }
    if (resourceList) resources.push(unpacked);
    else if (!panel) panel = { bytes: unpacked, offset: at };
  }
  return panel ? { ok: true, ...panel, resources } : { ok: false, error: 'No Ctrlr panel was found inside this program.' };
}

const RESOURCE_LIST = new TextEncoder().encode('resourceExportList\0');
const startsWith = (bytes, prefix) => bytes.length >= prefix.length && prefix.every((byte, i) => bytes[i] === byte);

// --- Pictures ------------------------------------------------------------------------------------

const JUCE_BASE64 = '.ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+';
const JUCE_DIGIT = new Map([...JUCE_BASE64].map((c, i) => [c, i]));

/**
 * JUCE's MemoryBlock::toBase64Encoding, read back: "<size>.<digits>", where the digits are JUCE's
 * own 64-character alphabet (not RFC 4648's) packed six bits at a time, low bit first. This is how a
 * `.bpanelz` carries its pictures (`resourceData`). Returns the bytes, or null if it is not that.
 */
export function decodeJuceBase64(text) {
  const source = String(text ?? '');
  const dot = source.indexOf('.');
  if (dot <= 0) return null;
  const size = Number(source.slice(0, dot));
  if (!Number.isInteger(size) || size < 0 || size > 256 * 1024 * 1024) return null;
  const out = new Uint8Array(size);
  let bit = 0;
  for (let i = dot + 1; i < source.length && bit < size * 8; i += 1) {
    const digit = JUCE_DIGIT.get(source[i]);
    if (digit === undefined) continue;
    for (let b = 0; b < 6; b += 1, bit += 1) {
      if (bit >= size * 8) break;
      if ((digit >> b) & 1) out[bit >> 3] |= 1 << (bit & 7);
    }
  }
  return out;
}

/** What kind of picture these bytes are, by their signature, or ''. */
export function pictureType(bytes) {
  if (!bytes?.length) return '';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp';
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return '';
}

/** A picture's width and height from its header (PNG, JPEG, GIF, BMP), or null. */
export function pictureSize(bytes) {
  const b = bytes;
  if (!b?.length) return null;
  const u16be = (at) => (b[at] << 8) | b[at + 1];
  const u32be = (at) => ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
  const type = pictureType(b);
  if (type === 'image/png' && b.length >= 24) return { width: u32be(16), height: u32be(20) };
  if (type === 'image/gif' && b.length >= 10) return { width: b[6] | (b[7] << 8), height: b[8] | (b[9] << 8) };
  if (type === 'image/bmp' && b.length >= 26) {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  }
  if (type === 'image/jpeg') {
    let at = 2;
    while (at + 9 < b.length) {
      if (b[at] !== 0xff) { at += 1; continue; }
      const marker = b[at + 1];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: u16be(at + 7), height: u16be(at + 5) };
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
      at += 2 + u16be(at + 2);
    }
  }
  return null;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as a `data:` URL (standard base64), here and in node alike. */
export function dataUrlOf(bytes, mime) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)]
      + (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=')
      + (i + 2 < bytes.length ? BASE64[c & 63] : '=');
  }
  return `data:${mime};base64,${out}`;
}
