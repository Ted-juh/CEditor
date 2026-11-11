/**
 * The Gamechanger Audio Motor Synth profiles (MKII and MKI): generated from their NRPN maps and MIDI
 * SysEx pages by tools/profiles/gamechanger/, and checked here that what is committed is what the
 * generator makes, that the app's validator finds nothing wrong, that every parameter is the NRPN
 * its row prints at both ends of its MIDI data range, and that Pull reads each dump by NRPN order
 * and refuses one of another length.
 *
 * The reader is checked on lines made by hand, in the MKII map's shape: a type over two lines around
 * its row's number, a value range wrapped the same way, and the next row straight after.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { readText } from './support/readText.mjs';
import { readNrpnMap, readSysex } from '../../../tools/profiles/gamechanger/read-motor-maps.mjs';
import { templateOf } from '../../../tools/profiles/gamechanger/build-gamechanger-profile.mjs';
import { SYNTHS, build } from '../../../tools/profiles/gamechanger/make-profiles.mjs';
import { localCompileDeviceRequest, localCompileParameter, localParseDumpMessage, validateLocalProfileSource } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const line = (page, y, ...words) => ({ page, y, words: words.map(([x, t]) => ({ x0: x, x1: x + t.length * 5, text: t })) });

test('the NRPN map: cells set around their row\'s number, a wrapped value range, the header\'s columns', () => {
  const rows = readNrpnMap([
    line(1, 86, [40, 'NRPN'], [302, 'PARAMETER']),
    line(1, 92, [74, 'PARAMETER'], [245, 'TYPE'], [374, 'MIDI'], [395, 'DATA'], [420, 'RANGE'], [453, '(NRPN)'], [500, 'RETAINS']),
    line(1, 97, [40, 'ADDR'], [302, 'VALUE'], [333, 'RANGE']),
    line(1, 116, [245, 'UNIPOLAR']),
    line(1, 121, [50, '0'], [74, 'V1'], [86, 'VOL'], [302, '0'], [310, '...'], [317, '1'], [374, '0'], [381, '...'], [389, '16383'], [500, 'No']),
    line(1, 126, [245, 'FLOAT']),
    line(1, 145, [245, 'BIPOLAR'], [302, '-1200'], [330, '...'], [340, '0'], [348, '...']),
    line(1, 150, [51, '29'], [74, 'ALL'], [94, 'FREQ'], [374, '0'], [381, '...'], [389, '8192'], [410, '...'], [418, '16383'], [500, 'No']),
    line(1, 156, [245, 'FLOAT'], [302, '1200']),
    line(1, 175, [43, '8193'], [74, 'IN'], [86, 'ROUTE'], [245, 'UNIPOLAR'], [290, 'INTEGER'], [302, '0'], [310, '...'], [317, '3'], [374, '0'], [381, '...'], [389, '3'], [500, 'Yes']),
    line(1, 200, [28, 'MIDI'], [68, 'SYSEX']),
    line(1, 220, [50, '7'], [74, 'NOT'], [94, 'A'], [104, 'ROW']),
  ]);
  assert.deepEqual(rows, [
    { page: 1, nrpn: 0, name: 'V1 VOL', type: 'UNIPOLAR FLOAT', value: '0 ... 1', midi: '0 ... 16383', retains: 'No' },
    { page: 1, nrpn: 29, name: 'ALL FREQ', type: 'BIPOLAR FLOAT', value: '-1200 ... 0 ... 1200', midi: '0 ... 8192 ... 16383', retains: 'No' },
    { page: 1, nrpn: 8193, name: 'IN ROUTE', type: 'UNIPOLAR INTEGER', value: '0 ... 3', midi: '0 ... 3', retains: 'Yes' },
  ]);
});

test('the SysEx pages: a field a line, a name that wraps, a run of data bytes after one space', () => {
  const text = [
    'SOUND PARAMETER DUMP',
    'Sysex status byte [1 byte]                             0xF0',
    'Manufacturers System Exclusive id code [3 bytes]       0x00 0x21 0x6D',
    'Software revision level. Format device speciﬁc [2 bytes   0x00 0x01',
    'now]',
    'All Sound parameter value data in 14b format (MSB, LSB) 0xhh 0xhh 0xhh …. 0xhh',
    'ordered by NRPN ID',
    'End of sysex [1 byte]                                  F7',
  ].join('\n');
  const read = readSysex(text, ['SOUND PARAMETER DUMP']);
  assert.deepEqual(read['SOUND PARAMETER DUMP'].map((f) => f.bytes), ['0xF0', '0x00 0x21 0x6D', '0x00 0x01', '0xhh 0xhh 0xhh …. 0xhh', 'F7']);
  assert.equal(read['SOUND PARAMETER DUMP'][3].field, 'All Sound parameter value data in 14b format (MSB, LSB) ordered by NRPN ID');
  assert.deepEqual(templateOf(read['SOUND PARAMETER DUMP']), ['F0', '00', '21', '6D', '00', '01', 'F7']);
  assert.deepEqual(templateOf([{ field: 'Ping', bytes: '0xhh (if 0x7F responds if any channel)' }]), ['7F']);
});

const BUILT = await Promise.all(SYNTHS.map((name) => build(name)));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const lines = (compiled) => compiled.transaction.messages.flatMap((m) => Array.from({ length: m.bytes.length / 3 }, (u, i) => hex(m.bytes.slice(i * 3, i * 3 + 3)))).join('\n');
const numbers = (range) => range.split(' ... ').map(Number);

// The pedals' CC tables are checked in gamechangerPedals.test.js.
for (const { name, profile, text, out, data } of BUILT.filter((b) => !b.layout.form)) {
  test(`${profile.id}: the committed profile is what the generator makes`, () => {
    assert.equal(readText(out), text, `stale — run: node tools/profiles/gamechanger/make-profiles.mjs ${name}`);
  });

  test(`${profile.id}: the app's own validator finds nothing wrong`, () => {
    const errors = (validateLocalProfileSource(profile.id, text).validation ?? []).filter((v) => v.level === 'error');
    assert.deepEqual(errors, []);
  });

  test(`${profile.id}: every row is its NRPN at both ends of its MIDI data range, each once, or named`, () => {
    const byRecipe = new Map(profile.parameters.map((p) => [p.messageRecipe, p]));
    const notes = profile.authoringNotes.join('\n');
    let laidOut = 0;
    for (const row of data.nrpn) {
      const recipeId = `nrpn${hex([row.nrpn >> 7, row.nrpn & 127]).replace(' ', '')}`;
      const p = byRecipe.get(recipeId);
      if (!p) { assert.match(notes, new RegExp(`\\b${row.nrpn} ${row.name}\\b`), `NRPN ${row.nrpn} is neither laid out nor named`); continue; }
      laidOut++;
      const midi = numbers(row.midi);
      assert.deepEqual([p.range.min, p.range.max], [midi[0], midi.at(-1)], p.id);
      for (const v of [p.range.min, p.range.max]) {
        assert.equal(lines(localCompileParameter(profile, { parameterId: p.id, value: v })), [[0x63, row.nrpn >> 7], [0x62, row.nrpn & 127], [0x06, v >> 7], [0x26, v & 127]].map(([c, x]) => hex([0xb0, c, x])).join('\n'), `${p.id} = ${v}`);
      }
    }
    assert.equal(laidOut, profile.parameters.length);
    for (const t of profile.tests.filter((x) => !x.kind)) assert.equal(lines(localCompileParameter(profile, { parameterId: t.parameter, value: t.value })), t.expectedHex, t.name);
  });

  test(`${profile.id}: Pull asks for each dump and reads it by NRPN order; a dump of another length is refused`, () => {
    for (const request of profile.tests.filter((t) => t.kind === 'request')) {
      const compiled = localCompileDeviceRequest(profile, { request: request.request });
      assert.ok(compiled.ok, compiled.error);
      assert.equal(compiled.transaction?.encodedValueHex ?? compiled.hex, request.expectedHex, request.name);
    }
    for (const vector of profile.tests.filter((t) => t.kind === 'dumpParse')) {
      const parsed = localParseDumpMessage(profile, vector.inputHex);
      assert.ok(parsed.ok, parsed.error);
      for (const [id, value] of Object.entries(vector.expectedValues)) assert.equal(parsed.values[id], value, `${vector.name}: ${id}`);
      // Two bytes more or fewer than the map's rows make: not this map's dump.
      const bytes = vector.inputHex.split(' ');
      for (const other of [[...bytes.slice(0, -1), '00', '00', 'F7'], [...bytes.slice(0, -3), 'F7']]) {
        const wrong = localParseDumpMessage(profile, other.join(' '));
        assert.ok(!wrong.ok || Object.keys(wrong.values ?? {}).length === 0, `${vector.name}: ${other.length} bytes read`);
      }
    }
    // The k-th row in NRPN order at bytes 2k, 2k + 1: the sound dump's mappings, by the map.
    const sound = profile.dumpDefinitions.find((d) => d.id === 'soundParameterDump');
    const order = [...data.nrpn].filter((r) => r.nrpn < 8192).sort((a, b) => a.nrpn - b.nrpn);
    for (const m of sound.mappings) {
      const row = order[m.offset / 2];
      assert.equal(profile.parameters.find((p) => p.id === m.parameter).description.split(' (')[0], `NRPN ${row.nrpn}`);
    }
  });

  test(`${profile.id}: the source is Gamechanger's own, and nobody has tried it on an instrument`, () => {
    assert.equal(profile.manufacturer, 'Gamechanger Audio');
    assert.equal(profile.coverage.verifiedOnHardware, false);
    for (const source of data.sources) assert.ok(profile.sources.some((s) => s.notes.includes(`sha256 ${source.sha256}`)));
    assert.deepEqual([profile.identity.manufacturerId, profile.identity.familyCode, profile.identity.modelNumber], [['00', '21', '6D'], ['00', '01'], ['00', '01']]);
  });
}

test('the MKII: a bipolar integer shown as its value range, a float shown as its own, the misprinted rows named', () => {
  const mk2 = BUILT.find((b) => b.name === 'motor-synth-mkii').profile;
  const from = mk2.parameters.find((p) => p.name === 'V1 ACCEL FROM');
  assert.deepEqual([from.range, from.display.min, from.display.max, from.default], [{ min: 8180, max: 8204 }, -12, 12, 8192]);
  const freq = mk2.parameters.find((p) => p.name === 'ALL FREQ');
  assert.deepEqual([freq.range, freq.display.min, freq.display.max], [{ min: 0, max: 16383 }, -1200, 1200]);
  const cutoff = mk2.parameters.find((p) => p.name === 'VCF FC V1');
  assert.deepEqual([cutoff.range, cutoff.display.min], [{ min: 0, max: 12000 }, undefined]);
  const notes = mk2.authoringNotes.join('\n');
  for (const row of ['25 DETUNE MIN', '283 PWH R LOW', '8270 INIT PRESET REF']) assert.ok(notes.includes(row), row);
  assert.equal(mk2.dumpDefinitions.find((d) => d.id === 'soundParameterDump').payload.size, 381 * 2);
});
