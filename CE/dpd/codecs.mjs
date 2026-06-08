// Browser-safe DPD codecs: hex, 7-bit address math, checksums, value encode/decode, and
// Korg 8->7 block packing. No node: imports, so both the Node tools (via dpd.mjs) and the
// browser UI surfaces (Packing Studio, Designer) use the SAME verified logic.

export const hexToBytes = (s) => (s ?? '').trim().length ? s.trim().split(/\s+/).map((h) => parseInt(h, 16)) : [];
export const bytesToHex = (a) => a.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

// 7-bit add of two address byte arrays (Roland addresses carry at 0x80).
export function add7(a, b) {
  const n = Math.max(a.length, b.length);
  const out = new Array(n).fill(0);
  let carry = 0;
  for (let i = n - 1; i >= 0; i--) {
    const sum = (a[a.length - n + i] ?? 0) + (b[b.length - n + i] ?? 0) + carry;
    out[i] = sum & 0x7f;
    carry = sum >> 7;
  }
  return out;
}

export function resolveAddress(base, stride, idx, offset) {
  let addr = base.slice();
  for (let k = 0; k < idx; k++) addr = add7(addr, stride);
  return add7(addr, offset);
}

export function roland7bit(bytes) {
  const sum = bytes.reduce((s, b) => (s + b) & 0x7f, 0);
  return (128 - sum) & 0x7f;
}
export function checksumOf(type, bytes) {
  switch (type) {
    case 'roland-7bit': return roland7bit(bytes);
    case 'sum-7bit': return bytes.reduce((s, b) => (s + b) & 0x7f, 0);
    case 'xor': return bytes.reduce((s, b) => s ^ b, 0) & 0x7f;
    case 'none': return null;
    default: throw new Error(`unknown checksum type: ${type}`);
  }
}

export function encodeValue(encoding, value) {
  const t = encoding?.type ?? 'u7';
  if (t === 'u7') return [value & 0x7f];
  if (t === 'u8') return [value & 0xff];
  // u14 = a 14-bit value across two 7-bit bytes. Yamaha/MIDI's common 2-byte field. byteOrder picks
  // which byte leads: u14 = MSB first (Yamaha/Roland default), u14-lsb = LSB first. Mirrors the dump
  // field codec in dumps.mjs so a 2-byte parameter packs identically whether sent live or in a dump.
  if (t === 'u14') return [(value >> 7) & 0x7f, value & 0x7f];
  if (t === 'u14-lsb') return [value & 0x7f, (value >> 7) & 0x7f];
  if (t === 's7') return [(value + (encoding.signedOffset ?? 64)) & 0x7f];
  if (t === 'nibbles') {
    const n = encoding.bytes ?? 2; const out = [];
    for (let i = 0; i < n; i++) out.push((value >> (4 * (n - 1 - i))) & 0x0f);
    return out;
  }
  if (t === 'bitslice') return bitsliceEncode(encoding, value);
  if (t === 'packed8to7') {
    const n = encoding.bytes ?? 1;
    const raw = [];
    for (let i = 0; i < n; i++) raw.push((value >> (8 * (n - 1 - i))) & 0xff); // value -> n big-endian 8-bit bytes
    return pack8to7(raw, encoding.packOrder ?? 'msb-high-first', 7);
  }
  throw new Error(`encodeValue: unsupported type ${t}`);
}
export function decodeValue(encoding, bytes) {
  const t = encoding?.type ?? 'u7';
  if (t === 'u7' || t === 'u8') return bytes[0];
  if (t === 'u14') return ((bytes[0] & 0x7f) << 7) | (bytes[1] & 0x7f);
  if (t === 'u14-lsb') return ((bytes[1] & 0x7f) << 7) | (bytes[0] & 0x7f);
  if (t === 's7') return (bytes[0] & 0x7f) - (encoding.signedOffset ?? 64);
  if (t === 'nibbles') {
    const n = encoding.bytes ?? 2; let v = 0;
    for (let i = 0; i < n; i++) v = (v << 4) | (bytes[i] & 0x0f);
    return v;
  }
  if (t === 'bitslice') return bitsliceDecode(encoding, bytes);
  if (t === 'packed8to7') {
    const n = encoding.bytes ?? 1;
    const raw = unpack8to7(bytes, encoding.packOrder ?? 'msb-high-first', 7);
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 8) | (raw[i] & 0xff);
    return v;
  }
  throw new Error(`decodeValue: unsupported type ${t}`);
}

export function bitsliceEncode(encoding, value) {
  const maxByte = Math.max(...encoding.slices.map((s) => s.byte));
  const out = new Array(maxByte + 1).fill(0);
  for (const s of encoding.slices) {
    const width = s.toBit - s.fromBit + 1;
    const mask = (1 << width) - 1;
    out[s.byte] |= ((value >> s.valueShift) & mask) << s.fromBit;
  }
  return out;
}
export function bitsliceDecode(encoding, bytes) {
  let v = 0;
  for (const s of encoding.slices) {
    const width = s.toBit - s.fromBit + 1;
    const mask = (1 << width) - 1;
    v |= ((bytes[s.byte] >> s.fromBit) & mask) << s.valueShift;
  }
  return v;
}

// Korg 8->7 block packing. 7 internal 8-bit bytes -> 8 transmitted 7-bit bytes.
export function pack8to7(internal, order = 'msb-high-first', groupSize = 7) {
  const out = [];
  for (let g = 0; g < internal.length; g += groupSize) {
    const group = internal.slice(g, g + groupSize);
    let msb = 0;
    group.forEach((b, i) => { msb |= ((b >> 7) & 1) << (order === 'msb-high-first' ? (groupSize - 1 - i) : i); });
    out.push(msb & 0x7f);
    for (const b of group) out.push(b & 0x7f);
  }
  return out;
}
export function unpack8to7(wire, order = 'msb-high-first', groupSize = 7) {
  const out = [];
  for (let g = 0; g < wire.length; g += groupSize + 1) {
    const msb = wire[g];
    const lows = wire.slice(g + 1, g + 1 + groupSize);
    lows.forEach((lo, i) => { out.push((lo & 0x7f) | (((msb >> (order === 'msb-high-first' ? (groupSize - 1 - i) : i)) & 1) << 7)); });
  }
  return out;
}
