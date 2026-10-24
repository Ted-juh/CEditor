// scriptBytes.test.js — the byte-list helpers in ce.midi (docs/design/script-bytes.md).
//
// What JUCE's MemoryBlock does, over the plain lists scripts already pass bytes in. These pin the
// rules that make them safe to reach for: offsets count from 0, the list passed in is never
// changed, a mistake answers nothing and says why, the bit order is MemoryBlock's, and a byte is a
// byte by the one rule every send uses.
// scriptPreludeAgreement.test.js holds the Lua, JavaScript and Python preludes to the same answers
// and the same words; this file is about what those answers should be.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { scriptApiForTesting } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { memberPath } from '../src/CE_Application/scripting/panelApi.js';

const api = scriptApiForTesting('', 'bytes-script');

function run(call) {
  clearScriptTrace();
  const value = call();
  return { value, errors: get(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message) };
}

test('the helpers live in ce.midi under short names, with flat names that say "bytes"', () => {
  assert.equal(memberPath('getBits'), 'ce.midi.getBits');
  assert.equal(memberPath('bytesRead'), 'ce.midi.read');
  assert.equal(memberPath('bytesFind'), 'ce.midi.find');
  assert.equal(memberPath('bytesToBase64'), 'ce.midi.toBase64');
});

test('bits are counted as MemoryBlock counts them: lowest first, running on into the next byte', () => {
  assert.equal(api.getBits(0b10110100, 4, 3), 0b011);
  // Bit 8 is the lowest bit of the SECOND byte, so a field can straddle two bytes.
  assert.equal(api.getBits([0b10000000, 0b00000001], 7, 2), 0b11);
  assert.equal(api.getBits([0x34, 0x12], 0, 16), 0x1234, 'two bytes read lowest first');
  assert.deepEqual(api.setBits([0, 0], 7, 2, 0b11), [0b10000000, 0b00000001]);
  // A number is read as a 32-bit field; a negative one as its two's complement.
  assert.equal(api.getBits(-1, 0, 8), 255);
  assert.equal(api.setBits(0xB4, 4, 3, 5), 0xD4);
});

test('offsets count from 0, and reads and writes default to SysEx 7-bit bytes, most significant first', () => {
  const msg = [0xF0, 0x01, 0x10, 0xF7];
  assert.equal(api.bytesRead(msg, 1, 2), 0x01 * 128 + 0x10);
  assert.deepEqual(api.bytesWrite(msg, 1, 2, 0x01 * 128 + 0x10), msg, 'write is read reversed');
  assert.deepEqual(api.bytesWrite([0, 0], 0, 2, 200), api.to7bit(200, 2), 'the same bytes to7bit makes');
  assert.equal(api.bytesRead('34 12', 0, 2, { bits: 8, order: 'lsb' }), 0x1234);
  assert.equal(api.bytesRead([0x81], 0, 1), 1, 'a 7-bit read keeps the low seven bits');
  assert.deepEqual(api.bytesSlice('F0 41 10 42 F7', 1, 3), [0x41, 0x10, 0x42]);
  assert.equal(api.bytesFind('F0 41 10 42 12 F7', '42 12'), 3);
});

test('the list passed in is never changed: every list that comes back is a new one', () => {
  const dump = [1, 2, 3, 4];
  const before = dump.slice();
  for (const out of [
    api.setBits(dump, 0, 4, 9), api.bytesWrite(dump, 1, 1, 7), api.bytesPut(dump, 2, [9, 9]),
    api.bytesSlice(dump, 0), api.bytesFromHex(api.bytesToHex(dump)),
  ]) {
    assert.notEqual(out, dump);
  }
  assert.deepEqual(dump, before);
});

test('a write may run past the end and grow the list, but may not start beyond it', () => {
  assert.deepEqual(api.bytesPut([1, 2], 2, [3, 4]), [1, 2, 3, 4], 'starting exactly at the end appends');
  assert.deepEqual(api.bytesWrite([1], 0, 2, 0x0102, { bits: 8 }), [1, 2]);
  assert.deepEqual(run(() => api.bytesPut([1, 2], 3, [9])), {
    value: undefined,
    errors: ['ce.midi.put: offset 3 is past the end of 2 bytes, so there is no answer. '
      + 'Writing can run past the end, but not start beyond it.'],
  });
});

test('nothing is cut down or padded to make an answer: a mistake answers nothing and says why', () => {
  assert.deepEqual(run(() => api.setBits(0, 0, 3, 9)), {
    value: undefined, errors: ['ce.midi.setBits: 9 does not fit in 3 bits, so there is no answer.'],
  });
  assert.deepEqual(run(() => api.bytesRead([1], 0, 2)), {
    value: undefined, errors: ['ce.midi.read: bytes 0 to 1 run past the end of 1 byte, so there is no answer.'],
  });
  assert.deepEqual(run(() => api.getBits([1], 8, 1)), {
    value: undefined, errors: ['ce.midi.getBits: bit 8 is past the end of 1 byte, so there is no answer.'],
  });
  assert.deepEqual(run(() => api.bytesWrite([0], 0, 1, 128)), {
    value: undefined, errors: ['ce.midi.write: 128 does not fit in 7 bits, so there is no answer.'],
  });
  // Hex text is read by the rule every send uses, and refused the same way.
  assert.deepEqual(run(() => api.bytesFromHex('F04110')).errors, ['ce.midi.fromHex: "F04110" is not one byte, so '
    + 'there is no answer. Put a space between the bytes: "F0 41 10".']);
});

test('not finding a pattern is an answer, not a mistake', () => {
  assert.deepEqual(run(() => api.bytesFind([1, 2, 3], [9])), { value: undefined, errors: [] });
  assert.deepEqual(run(() => api.bytesFind([1, 2], [1], 5)), { value: undefined, errors: [] });
  assert.match(run(() => api.bytesFind([1, 2], [])).errors[0], /^ce\.midi\.find: the pattern is empty/);
});

test('hex and base64 text round-trip, and base64 is the standard alphabet with padding', () => {
  const bytes = [0xF0, 0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7F, 0x00, 0x41, 0xF7];
  assert.equal(api.bytesToHex(bytes), 'F0 41 10 42 12 40 00 7F 00 41 F7');
  assert.deepEqual(api.bytesFromHex(api.bytesToHex(bytes)), bytes);
  assert.equal(api.bytesToBase64(bytes), Buffer.from(bytes).toString('base64'), 'node agrees on the encoding');
  assert.deepEqual(api.bytesFromBase64(api.bytesToBase64(bytes)), bytes);
  for (let n = 0; n < 6; n += 1) {
    const some = bytes.slice(0, n);
    assert.equal(api.bytesToBase64(some), Buffer.from(some).toString('base64'), `${n} bytes`);
  }
  assert.deepEqual(api.bytesFromBase64(' 8EEQ\nQg== '), [0xF0, 0x41, 0x10, 0x42], 'spaces and line breaks are ignored');
  assert.match(run(() => api.bytesFromBase64('8EEQQg=')).errors[0], /^ce\.midi\.fromBase64: that is not base64/);
});

test('a typed array is read wherever a list is', () => {
  assert.equal(api.bytesToHex(new Uint8Array([0xF0, 0x41])), 'F0 41');
  assert.equal(api.getBits(new Uint8Array([0, 0xB4]), 12, 3), 3);
});

test('a list item is a byte by the rule every send uses: 0 to 255, or one hex byte, and nothing else', () => {
  // Items used to be read modulo 256 here and clamped in a send, two rules for one thing: 300 was 2C
  // to toHex and FF (System Reset) to sendSysex. Both refuse it now, and say where it was.
  assert.equal(api.bytesToHex(['F0', '41', '0x10', 0xF7]), 'F0 41 10 F7', 'text items are hex bytes');
  for (const [item, shown] of [[300, '300'], [-1, '-1'], [1.5, '1.5'], [true, 'true'], [[1], 'a list'],
    ['F041', '"F041"'], [Number.NaN, 'NaN']]) {
    assert.deepEqual(run(() => api.bytesToHex([0xF0, item])), {
      value: undefined,
      errors: [`ce.midi.toHex: ${shown} at position 1 is not a byte, so there is no answer. `
        + 'A byte is a whole number from 0 to 255, or one or two hex digits such as "F7".'],
    });
  }
});

test('bytes are a list or hex text: a number is not, and nothing at all is said to be missing', () => {
  // put([1, 2, 3], 1, 0x7F) read the number as an empty list and gave the list back unchanged.
  assert.deepEqual(run(() => api.bytesPut([1, 2, 3], 1, 0x7F)), {
    value: undefined, errors: ['ce.midi.put: 127 is not a list of bytes, so there is no answer.'],
  });
  assert.deepEqual(run(() => api.bytesFind([1, 2], 0xF7)).errors, ['ce.midi.find: 247 is not a list of bytes, so there is no answer.']);
  assert.deepEqual(run(() => api.bytesToHex(undefined)).errors, ['ce.midi.toHex: no bytes given, so there is no answer.']);
  assert.deepEqual(run(() => api.bytesFromHex([1, 2])).errors, ['ce.midi.fromHex: a list is not hex text, so there is no answer.']);
  assert.deepEqual(run(() => api.bytesToHex([])), { value: '', errors: [] }, 'an empty list is still a list');
});

test('hex text splits on the same characters in every runtime: a form feed does, a no-break space does not', () => {
  assert.equal(api.bytesToHex('F0\f41\v10,F7'), 'F0 41 10 F7');
  assert.match(run(() => api.bytesToHex('F0\u00A041')).errors[0], /^ce\.midi\.toHex: "F0\u00A041" is not one byte/);
});

test('a value to write that is left out, or not a number, is named rather than printed', () => {
  assert.deepEqual(run(() => api.setBits(0, 0, 3)).errors, ['ce.midi.setBits: the value to write is missing, so there is no answer.']);
  assert.deepEqual(run(() => api.bytesWrite([0], 0, 1, '5')).errors, ['ce.midi.write: "5" is not a whole number, so there is no answer.']);
  assert.deepEqual(run(() => api.getBits(Number.NaN, 0, 3)).errors, ['ce.midi.getBits: NaN is not a finite number, so there is no answer.']);
});
