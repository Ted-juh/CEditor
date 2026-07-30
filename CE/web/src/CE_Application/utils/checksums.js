// checksums.js — every checksum this application knows how to compute, in one place (design doc §48).
//
// There were two implementations before this, and they already disagreed. ce.midi.checksum understood
// roland / yamaha / sum / xor; the device profile engine understood roland-7bit / sum-7bit and
// hard-rejected everything else — so a script could compute an XOR checksum that no device profile
// could express, and the two used different names for the same arithmetic. Adding algorithms to one
// side would have widened that, so both read this table now. It is the same fix §44 applied to the
// component enums: the vocabulary lives where the code that consumes it can see it.
//
// A NOTE ON WIDTH. A SysEx data byte is seven bits, so the classic MIDI checksums all return 0..127
// and drop into one byte. A CRC does not: crc16 returns 0..65535 and crc32 returns a 32-bit value.
// Those are real and useful — firmware transfers, the Sample Dump Standard, MIDI-CI — but they have
// to be SPLIT before they can travel, which is what `width` is for and what ce.midi.to7bit() does.
// Pretending a CRC-32 fits in a checksum byte would be worse than not offering it.

/** Byte-at-a-time CRC, MSB-first (no input/output reflection). */
function crcMsbFirst(bytes, { poly, init, xorOut, bits }) {
  const top = 1 << (bits - 1);
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  let crc = init;
  for (const byte of bytes) {
    crc ^= (byte & 0xff) << (bits - 8);
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & top) ? ((crc << 1) ^ poly) : (crc << 1);
      // JavaScript's bitwise operators work on 32-bit signed integers, so a 32-bit CRC has to be
      // brought back to unsigned every step or the sign bit turns the value negative.
      crc = bits === 32 ? (crc >>> 0) : (crc & mask);
    }
    crc = bits === 32 ? ((crc & mask) >>> 0) : (crc & mask);
  }
  return bits === 32 ? ((crc ^ xorOut) >>> 0) : ((crc ^ xorOut) & mask);
}

/** Byte-at-a-time CRC with input and output reflected — the "reversed" family. */
function crcReflected(bytes, { poly, init, xorOut, bits }) {
  const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
  let crc = init;
  for (const byte of bytes) {
    crc ^= (byte & 0xff);
    for (let i = 0; i < 8; i += 1) {
      crc = (crc & 1) ? ((crc >>> 1) ^ poly) : (crc >>> 1);
      crc = bits === 32 ? (crc >>> 0) : (crc & mask);
    }
  }
  return bits === 32 ? ((crc ^ xorOut) >>> 0) : ((crc ^ xorOut) & mask);
}

const sum7 = (bytes) => bytes.reduce((acc, b) => (acc + (b & 0xff)) & 0x7f, 0);
const sum8 = (bytes) => bytes.reduce((acc, b) => (acc + (b & 0xff)) & 0xff, 0);

/**
 * The table. `id` is canonical, `aliases` are the spellings already in use that must keep working —
 * existing device profiles say "roland-7bit" and existing scripts say "roland", and neither may
 * break. `width` is how many 7-bit bytes the result needs, which is what tells a caller whether the
 * answer fits in a checksum slot.
 */
export const CHECKSUM_ALGORITHMS = [
  {
    id: 'sum-7bit',
    aliases: ['sum'],
    label: 'Sum, 7-bit',
    formula: 'Σ mod 128',
    width: 1,
    max: 0x7f,
    fn: sum7,
  },
  {
    id: 'roland-7bit',
    // Roland and Yamaha bulk dumps use the same arithmetic, which is why both spellings map here
    // rather than to two entries that could drift apart.
    aliases: ['roland', 'yamaha', 'twos-complement-7bit'],
    label: 'Two’s complement, 7-bit (Roland / Yamaha)',
    formula: '(128 − Σ) mod 128',
    width: 1,
    max: 0x7f,
    fn: (bytes) => (128 - sum7(bytes)) & 0x7f,
  },
  {
    id: 'ones-complement-7bit',
    aliases: ['ones', 'ones-complement'],
    label: 'One’s complement, 7-bit',
    formula: '(127 − Σ) mod 128',
    width: 1,
    max: 0x7f,
    // One less than the two's complement, and the reason both exist: a device expecting this and
    // given Roland's is off by exactly one, which is the hardest kind of wrong to spot by eye.
    fn: (bytes) => (127 - sum7(bytes)) & 0x7f,
  },
  {
    id: 'xor-7bit',
    aliases: ['xor'],
    label: 'XOR, 7-bit',
    formula: 'b₁ ⊕ b₂ ⊕ … mod 128',
    width: 1,
    max: 0x7f,
    fn: (bytes) => bytes.reduce((acc, b) => (acc ^ (b & 0xff)) & 0x7f, 0),
  },
  {
    id: 'offset-7bit',
    aliases: ['offset', 'kawai'],
    label: 'Sum plus a constant, 7-bit',
    formula: '(Σ + k) mod 128',
    width: 1,
    max: 0x7f,
    // The constant is a PARAMETER, not a built-in value. Several manufacturers use this shape with
    // different constants, and hard-coding one family's would be a guess dressed as a fact.
    constant: { name: 'offset', default: 0xa5 },
    fn: (bytes, opts) => (sum7(bytes) + Number(opts?.offset ?? 0xa5)) & 0x7f,
  },
  {
    id: 'sum-8bit',
    aliases: [],
    label: 'Sum, 8-bit',
    formula: 'Σ mod 256',
    width: 2,
    max: 0xff,
    fn: sum8,
  },
  {
    id: 'twos-complement-8bit',
    aliases: ['twos-complement'],
    label: 'Two’s complement, 8-bit',
    formula: '(256 − Σ) mod 256',
    width: 2,
    max: 0xff,
    fn: (bytes) => (256 - sum8(bytes)) & 0xff,
  },
  {
    id: 'crc8',
    aliases: [],
    label: 'CRC-8',
    formula: 'poly 0x07, init 0x00',
    width: 2,
    max: 0xff,
    fn: (bytes) => crcMsbFirst(bytes, { poly: 0x07, init: 0x00, xorOut: 0x00, bits: 8 }),
  },
  {
    id: 'crc16-ccitt',
    aliases: ['crc16'],
    label: 'CRC-16/CCITT-FALSE',
    formula: 'poly 0x1021, init 0xFFFF',
    width: 3,
    max: 0xffff,
    fn: (bytes) => crcMsbFirst(bytes, { poly: 0x1021, init: 0xffff, xorOut: 0x0000, bits: 16 }),
  },
  {
    id: 'crc16-modbus',
    aliases: [],
    label: 'CRC-16/MODBUS',
    formula: 'poly 0xA001 reflected, init 0xFFFF',
    width: 3,
    max: 0xffff,
    // A DIFFERENT answer from CCITT for the same bytes, which is exactly why "crc16" on its own is
    // not a specification and why this table names both.
    fn: (bytes) => crcReflected(bytes, { poly: 0xa001, init: 0xffff, xorOut: 0x0000, bits: 16 }),
  },
  {
    id: 'crc32',
    aliases: [],
    label: 'CRC-32',
    formula: 'poly 0xEDB88320 reflected, init 0xFFFFFFFF, xor 0xFFFFFFFF',
    width: 5,
    max: 0xffffffff,
    fn: (bytes) => crcReflected(bytes, { poly: 0xedb88320, init: 0xffffffff, xorOut: 0xffffffff, bits: 32 }),
  },
];

/** Canonical ids, in table order — the vocabulary to offer in a picker. */
export const CHECKSUM_IDS = CHECKSUM_ALGORITHMS.map((a) => a.id);

const BY_NAME = new Map();
for (const algorithm of CHECKSUM_ALGORITHMS) {
  BY_NAME.set(algorithm.id, algorithm);
  for (const alias of algorithm.aliases) BY_NAME.set(alias, algorithm);
}

/** The algorithm for a name, canonical or alias, case-insensitively. Nothing for a name nobody
 *  knows — the caller reports, rather than this guessing a default. */
export function checksumAlgorithm(name) {
  return BY_NAME.get(String(name ?? '').trim().toLowerCase()) ?? null;
}

/** Every spelling accepted, for an error message that tells you what you could have written. */
export function checksumNames() {
  return [...BY_NAME.keys()].sort();
}

/**
 * Compute one. Returns a NUMBER, which for the CRCs is wider than a byte — see the note at the top;
 * `checksumAlgorithm(name).width` says how many 7-bit bytes it needs, and ce.midi.to7bit() splits it.
 * Returns nothing for a name this table does not have, so a typo cannot come back as a plausible
 * number from a different algorithm.
 */
export function computeChecksum(name, bytes, opts = null) {
  const algorithm = checksumAlgorithm(name);
  if (!algorithm) return undefined;
  const list = Array.isArray(bytes) ? bytes : [];
  return algorithm.fn(list, opts);
}

/** Split a checksum into the bytes it occupies, MSB first — 7-bit safe for the wide ones. */
export function checksumBytes(name, bytes, opts = null) {
  const algorithm = checksumAlgorithm(name);
  if (!algorithm) return undefined;
  const value = algorithm.fn(Array.isArray(bytes) ? bytes : [], opts);
  if (algorithm.width === 1) return [value & 0x7f];
  const out = [];
  let left = value;
  for (let i = 0; i < algorithm.width; i += 1) { out.unshift(left & 0x7f); left = Math.floor(left / 128); }
  return out;
}
