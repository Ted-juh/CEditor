/**
 * tools/profiles/check-factory-banks.mjs: a maker's factory sounds read through a profile's dump
 * definitions. The banks are the makers' files and are not in the repository; the reading is checked
 * here on messages made by the profiles themselves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ADAPTERS, bankMessages, checkBank, smfSysex, sysexMessages, valueProblem } from '../../../tools/profiles/check-factory-banks.mjs';
import { localBuildDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const blofeld = JSON.parse(readFileSync(new URL('../../profiles/test/waldorf-blofeld.ceditor-device.json', import.meta.url), 'utf8'));
const bytesOf = (hex) => Uint8Array.from(hex.split(' ').map((h) => parseInt(h, 16)));

test('raw SysEx: each F0 … F7, what lies between ignored, a message broken by a status byte dropped', () => {
  const file = Uint8Array.from([0x00, 0xf0, 0x01, 0x02, 0xf7, 0x90, 0x3c, 0x40, 0xf0, 0x03, 0x90, 0xf0, 0x04, 0xf7]);
  assert.deepEqual(sysexMessages(file).map((m) => [...m]), [[0xf0, 1, 2, 0xf7], [0xf0, 4, 0xf7]]);
});

test('a Standard MIDI File: SysEx events in any track, a message split over F0 and F7 events joined', () => {
  const track = [
    0x00, 0xff, 0x03, 0x02, 0x41, 0x42, // a track name
    0x00, 0x90, 0x3c, 0x40, 0x10, 0x3c, 0x00, // a note, the second event in running status
    0x00, 0xf0, 0x03, 0x01, 0x02, 0xf7, // a whole message
    0x00, 0xf0, 0x02, 0x05, 0x06, 0x00, 0xf7, 0x02, 0x07, 0xf7, // one message in two events
    0x00, 0xc0, 0x05, // a program change
    0x00, 0xff, 0x2f, 0x00,
  ];
  const smf = Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
  ]);
  assert.deepEqual(smfSysex(smf).map((m) => [...m]), [[0xf0, 1, 2, 0xf7], [0xf0, 5, 6, 7, 0xf7]]);
  assert.equal(bankMessages(smf).length, 2);
});

test('a value the profile does not allow: out of range, not in the list, not text', () => {
  assert.equal(valueProblem({ type: 'integer', range: { min: 0, max: 127 } }, 64), null);
  assert.equal(valueProblem({ type: 'integer', range: { min: 0, max: 99 } }, 100), '100 outside 0 - 99');
  assert.equal(valueProblem({ type: 'choice', choices: [{}, {}] }, 'saw'), null);
  assert.equal(valueProblem({ type: 'choice', choices: [{}, {}] }, 5), '5 is not one of its 2 values');
  assert.equal(valueProblem({ type: 'text' }, 7), 'not text');
});

test('a stored Blofeld sound read as the edit buffer, its name and every value allowed', async () => {
  const values = Object.fromEntries(blofeld.parameters.map((p) => [p.id, p.default]));
  const name = blofeld.parameters.find((p) => p.type === 'text');
  values[name.id] = 'Factory Pad';
  const built = localBuildDumpMessage(blofeld, 'soundEditBuffer', values);
  assert.ok(built.ok, built.error);
  const stored = bytesOf(built.hex);
  stored[5] = 0x02; // bank C
  stored[6] = 0x11; // sound 18

  const plain = await checkBank(blofeld, [stored]);
  assert.equal(plain.matched, 0, 'a stored sound is not the edit buffer without the adapter');

  const read = await checkBank(blofeld, [stored], { adapter: ADAPTERS['blofeld-sound'] });
  assert.equal(read.matched, 1);
  assert.deepEqual(read.checksums, { ok: 1 });
  assert.deepEqual(read.problems, {});
  assert.match(read.names[0], /^Factory Pad/);

  // A byte the profile reads as a choice, set to a value it does not list, is reported.
  const choice = blofeld.parameters.find((p) => p.type === 'choice' && p.choices.length < 100);
  const mapping = blofeld.dumpDefinitions[0].mappings.find((m) => m.parameter === choice.id);
  const bad = Uint8Array.from(stored);
  bad[blofeld.dumpDefinitions[0].payload.offset + mapping.offset] = 0x7e;
  bad[390] = 0x7f; // the spec's checksum that is always accepted
  const flagged = await checkBank(blofeld, [bad], { adapter: ADAPTERS['blofeld-sound'] });
  assert.equal(flagged.matched, 1);
  assert.deepEqual(Object.keys(flagged.problems), [choice.id]);
});
