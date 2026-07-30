// checksumCases.js — the cross-language pin for the checksum table (design doc §48).
//
// There are two implementations of this arithmetic and there always will be: checksums.js for the
// editor and ProfileChecksums.h for the player. They MUST agree — a checksum that differs between
// the editor and the export means the synth accepts a dump from one and rejects it from the other,
// silently, and the panel author has no way to tell which is wrong.
//
// So both sides answer this fixture. The web suite asserts it directly; DeviceProfileEngineTests.cpp
// asserts the same numbers from the C++ side. The values below were produced by RUNNING both — the
// JS table, and the real ProfileChecksums.h compiled against minimal JUCE shims — and diffing them,
// rather than by anybody computing them by hand.
//
// The four CRCs additionally match the published check values for "123456789" from the CRC
// catalogue, which is what makes them right rather than merely consistent:
//
//   crc8 = 0xF4, crc16-ccitt = 0x29B1, crc16-modbus = 0x4B37, crc32 = 0xCBF43926

/** "123456789" — the CRC catalogue's standard check string. */
export const ASCII_CHECK = [49, 50, 51, 52, 53, 54, 55, 56, 57];

/** A Roland-shaped address + data block, which is the shape a real profile covers. */
export const ADDRESS_BLOCK = [0x40, 0x00, 0x7f, 0x03, 0x0a];

/** algorithm id -> { ascii, block, width, bytes } where `bytes` is the block's packed form. */
export const CHECKSUM_CASES = {
  'sum-7bit': { ascii: 93, block: 76, width: 1, bytes: [76] },
  'roland-7bit': { ascii: 35, block: 52, width: 1, bytes: [52] },
  'ones-complement-7bit': { ascii: 34, block: 51, width: 1, bytes: [51] },
  'xor-7bit': { ascii: 49, block: 54, width: 1, bytes: [54] },
  // The default constant, 0xA5. A device with a different one passes it as opts.offset.
  'offset-7bit': { ascii: 2, block: 113, width: 1, bytes: [113] },
  'sum-8bit': { ascii: 221, block: 204, width: 2, bytes: [1, 76] },
  'twos-complement-8bit': { ascii: 35, block: 52, width: 2, bytes: [0, 52] },
  'crc8': { ascii: 0xf4, block: 225, width: 2, bytes: [1, 97] },
  'crc16-ccitt': { ascii: 0x29b1, block: 68, width: 3, bytes: [0, 0, 68] },
  'crc16-modbus': { ascii: 0x4b37, block: 57492, width: 3, bytes: [3, 65, 20] },
  'crc32': { ascii: 0xcbf43926, block: 176437988, width: 5, bytes: [0, 84, 16, 117, 100] },
};

/** The published CRC check values, kept separate so it is obvious which claims are external facts
 *  and which are merely "what our two implementations both say". */
export const PUBLISHED_CRC_CHECKS = {
  'crc8': 0xf4,
  'crc16-ccitt': 0x29b1,
  'crc16-modbus': 0x4b37,
  'crc32': 0xcbf43926,
};

/** Spellings that must keep resolving, because profiles and scripts in the wild use them. */
export const ALIASES = {
  sum: 'sum-7bit',
  roland: 'roland-7bit',
  yamaha: 'roland-7bit',
  'twos-complement-7bit': 'roland-7bit',
  ones: 'ones-complement-7bit',
  'ones-complement': 'ones-complement-7bit',
  xor: 'xor-7bit',
  offset: 'offset-7bit',
  kawai: 'offset-7bit',
  'twos-complement': 'twos-complement-8bit',
  crc16: 'crc16-ccitt',
};
