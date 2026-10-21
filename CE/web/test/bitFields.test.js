// bitFields.test.js — the Values tab's row for ce.midi.getBits and setBits (scripting/bitFields.js):
// the byte drawn a bit to a cell with the field marked, the bits read or written, and the runtime's
// own sentence for a call it answers nothing to. The row reasons the way panelRuntime.js's
// bytesGetBits and bytesSetBits do, so this file runs a sweep of calls through both and holds the
// answers and the sentences equal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';

const bitsOf = (source, language = 'javascript') => readStatement(source, language, 3, {}).calls[0];

/** What the runtime answers and says for the same call. */
function ran(fn) {
  setRuntimeHost({ panel: { id: 'p', name: 'P', width: 100, height: 100, scripting: { modules: ['ce.midi'] }, controls: [] } });
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'bits');
    const answer = fn(api);
    const said = get(scriptTrace).filter((e) => e.kind === 'error').map((e) => e.message);
    return { answer, said: said.at(-1) ?? null };
  } finally {
    setRuntimeHost(null);
  }
}

const js = (v) => JSON.stringify(v);
const VALUES = [0xB4, 0, 255, 0x1234, 0xDEADBEEF, 180.7, [0xB4, 0x01], [0x12, 0x34, 0x56], [], '0xB4 01', 'B4 1FF', [300, 1], ['F0', '41']];
const RANGES = [[4, 3], [0, 1], [7, 1], [0, 8], [6, 4], [12, 8], [28, 4], [30, 4], [0, 32], [-1, 3], [2, 0], [2, 33], [1.5, 2]];

test('getBits: what the row reads, and what it says of a refused call, are the runtime\'s', () => {
  for (const value of VALUES) {
    for (const [start, count] of RANGES) {
      const source = `ce.midi.getBits(${js(value)}, ${start}, ${count});`;
      const call = bitsOf(source);
      const runtime = ran((api) => api.getBits(value, start, count));
      assert.equal(call.bits.refused, runtime.said, `${source}: the sentence`);
      assert.equal(call.bits.read ?? undefined, runtime.answer, `${source}: the answer`);
      if (runtime.said) assert.deepEqual(call.problem, { severity: 'error', message: runtime.said });
    }
  }
});

test('setBits: what the row writes, and what it says of a refused call, are the runtime\'s', () => {
  for (const value of VALUES) {
    for (const [start, count] of RANGES) {
      for (const bits of [5, 0, 1, 9, -1, 2.5]) {
        const source = `ce.midi.setBits(${js(value)}, ${start}, ${count}, ${bits});`;
        const call = bitsOf(source);
        const runtime = ran((api) => api.setBits(value, start, count, bits));
        assert.equal(call.bits.refused, runtime.said, `${source}: the sentence`);
        assert.deepEqual(call.bits.result ?? undefined, runtime.answer, `${source}: the answer`);
      }
    }
  }
});

test('the byte is drawn highest bit first, the field marked', () => {
  const { bits } = bitsOf('ce.midi.getBits(0xB4, 4, 3);');
  assert.equal(bits.groups.length, 1);
  assert.equal(bits.groups[0].label, '', 'one byte needs no name');
  assert.deepEqual(bits.groups[0].cells.map((c) => c.bit), [7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(bits.groups[0].cells.map((c) => c.v).join(''), '10110100', '0xB4');
  assert.deepEqual(bits.groups[0].cells.filter((c) => c.field).map((c) => c.bit), [6, 5, 4]);
  assert.equal(bits.said, 'Bits 4 to 6 are 011, which is 3.');
  assert.equal(bitsOf('ce.midi.getBits(0xB4, 7, 1);').bits.said, 'Bit 7 is 1.');
});

test('setBits shows the bits before and after, and the value it makes', () => {
  const { bits } = bitsOf('ce.midi.setBits(0xB4, 4, 3, 5);');
  const field = bits.groups[0].cells.filter((c) => c.field);
  assert.deepEqual(field.map((c) => [c.was, c.v]), [[0, 1], [1, 0], [1, 1]]);
  assert.equal(bits.said, 'Bits 4 to 6 go from 011 to 101: 0xB4 becomes 0xD4.');
  assert.equal(bitsOf('ce.midi.setBits(0xB4, 4, 3, 3);').bits.said, 'Bits 4 to 6 are 011 already, so nothing changes.');
  const list = bitsOf('ce.midi.setBits([0xB4, 0x01], 6, 4, 15);').bits;
  assert.deepEqual(list.groups.map((g) => g.label), ['byte 0', 'byte 1'], 'a list\'s bytes in list order');
  assert.equal(list.said, 'Bits 6 to 9 go from 0110 to 1111: byte 0 becomes 0xF4, byte 1 becomes 0x03.');
});

test('a value not written out still has its field drawn where it is', () => {
  const { bits } = bitsOf('ce.midi.getBits(b, 4, 3);');
  assert.equal(bits.refused, null);
  assert.ok(bits.groups[0].cells.every((c) => c.v === null));
  assert.deepEqual(bits.groups[0].cells.filter((c) => c.field).map((c) => c.bit), [6, 5, 4]);
  assert.equal(bits.said, 'Reads bits 4 to 6.');
  const far = bitsOf('ce.midi.setBits(dump, 12, 4, 9);').bits;
  assert.deepEqual(far.groups.map((g) => g.label), ['bits 15–8'], 'the byte the field is in, by its bits');
  assert.equal(far.said, 'Writes 9 into bits 12 to 15.');
  assert.equal(bitsOf('ce.midi.getBits(b, start, 3);').bits, undefined, 'a start not written out has no place');
});

test('every language reads it', () => {
  for (const [language, source] of [
    ['lua', 'ce.midi.getBits({ 0xB4, 0x01 }, 6, 4)'],
    ['python', 'ce.midi.getBits([0xB4, 0x01], 6, 4)'],
    ['javascript', 'getBits([0xB4, 0x01], 6, 4);'],
  ]) {
    assert.equal(bitsOf(source, language).bits?.read, 6, language);
  }
});
