/**
 * tools/profiles/check-factory-banks.mjs: a maker's factory sounds read through a profile's dump
 * definitions. The banks are the makers' files and are not in the repository; the reading is checked
 * here on messages made by the profiles themselves.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ADAPTERS, bankMessages, checkBank, pack8to7, payloadMessage, smfSysex, sysexMessages, valueProblem } from '../../../tools/profiles/check-factory-banks.mjs';
import { localBuildDumpMessage } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const profileOf = (id) => JSON.parse(readFileSync(new URL(`../../profiles/test/${id}.ceditor-device.json`, import.meta.url), 'utf8'));
const blofeld = profileOf('waldorf-blofeld');
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

test('a Microwave bank dump: 64 sounds of 180 bytes, each framed as the Sound Dump with its own sum', async () => {
  const microwave = profileOf('waldorf-microwave');
  const built = localBuildDumpMessage(microwave, 'soundDump', Object.fromEntries(microwave.parameters.map((p) => [p.id, p.default])));
  assert.ok(built.ok, built.error);
  const sound = bytesOf(built.hex).subarray(5, 185);
  const data = Array.from({ length: 64 }, () => [...sound]).flat();
  const bank = Uint8Array.from([0xf0, 0x3e, 0x00, 0x00, 0x50, ...data, data.reduce((a, b) => a + b, 0) & 0x7f, 0xf7]);
  const sounds = ADAPTERS['microwave-bank'](bank);
  assert.equal(sounds.length, 64);
  assert.deepEqual([...sounds[63]], [...bytesOf(built.hex)], 'each the Sound Dump the profile builds');
  const read = await checkBank(microwave, [bank], { adapter: ADAPTERS['microwave-bank'] });
  assert.equal(read.matched, 64);
  assert.deepEqual(read.checksums, { ok: 64 });
  // A bank whose own checksum is wrong is not cut up.
  const broken = Uint8Array.from(bank);
  broken[bank.length - 2] ^= 1;
  assert.equal(ADAPTERS['microwave-bank'](broken), broken);
});

test('a Pulse Program Bulk Dump ($01) is read as the Program Dump ($00) it repeats', async () => {
  const pulse = profileOf('waldorf-pulse');
  const t = pulse.tests.find((x) => x.kind === 'dumpParse');
  const bulk = bytesOf(t.inputHex);
  bulk[4] = 0x01;
  const read = await checkBank(pulse, [bulk], { adapter: ADAPTERS['pulse-bulk'] });
  assert.equal(read.matched, 1);
  assert.deepEqual((await checkBank(pulse, [bulk])).matched, 0, 'not without the adapter');
});

test("program data as Korg's library stores it, packed and framed, is the dump the profile reads", () => {
  const monologue = profileOf('korg-monologue');
  const t = monologue.tests.find((x) => x.kind === 'dumpParse');
  const wire = bytesOf(t.inputHex);
  const head = monologue.dumpDefinitions[0].matcher.prefix.length;
  // Unpack the profile's own test dump by Korg's rule, then pack it again from the raw bytes.
  const raw = [];
  for (let g = head; g < wire.length - 1; g += 8) {
    const msb = wire[g];
    for (let i = 0; i < 7 && g + 1 + i < wire.length - 1; i += 1) raw.push(wire[g + 1 + i] | (((msb >> i) & 1) << 7));
  }
  assert.equal(raw.length, monologue.dumpDefinitions[0].payload.size);
  assert.deepEqual([...payloadMessage(monologue, Uint8Array.from(raw))], [...wire]);
  assert.deepEqual(pack8to7([0x80, 1, 2, 3, 4, 5, 0x86, 7]), [0x41, 0, 1, 2, 3, 4, 5, 6, 0, 7]);
});
