// inboundParameterIndex.test.js — reading the arrow backwards.
//
// Everything in this app compiles a parameter into MIDI and sends it. Nothing goes the other way,
// so an incoming CC or DT1 sysex is just bytes: the monitor prints hex, and MIDI learn can say a CC
// moved but not what it means. This is the half that names it, and the thing learn needs before it
// can bind anything.
//
// Two decisions carry the weight, and both are here as tests rather than as claims:
//
//   The index is DERIVED FROM THE COMPILER, by compiling each parameter at several values and
//   keeping the bytes that do not move. Reading messageRecipes independently would be a second
//   implementation of the message format, and deviceProfileLocalEngine.js carries a comment listing
//   four ways the last one drifted from the C++.
//
//   It matches on the PREFIX, not the whole message. What identifies a message comes first — a CC's
//   status and controller, a DT1's header and address — and what varies comes after. So matching
//   needs nothing to be true about the value encoding, and that independence has already paid: this
//   was written while the two engines disagreed about the tail of 622 of the GAIA's messages (the
//   nibbled encoder, since fixed — see nibbledEncoding.test.js) and the index was right throughout.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import {
  buildInboundIndex,
  bytesFromHex,
  decodeInbound,
  fingerprintParameter,
  inboundLookupMaps,
  inboundReadTargets,
  inboundValueBytes,
  matchInbound,
} from '../src/CE_Application/utils/inboundParameterIndex.js';
import { localCompileParameter } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { readText } from './support/readText.mjs';

const profile = (name) =>
  JSON.parse(readText(fileURLToPath(new URL(`../../profiles/test/${name}.ceditor-device.json`, import.meta.url))));

const CC = profile('test-cc-synth');
const GAIA = profile('roland-gaia-sh01');

test('a CC parameter is identified by its status and controller', () => {
  const print = fingerprintParameter(CC, 'filter.cutoff');
  assert.deepEqual(print.prefix, [0xb0, 74], 'the value byte must not be part of the fingerprint');
});

test('a sysex parameter is identified by its header and address', () => {
  const print = fingerprintParameter(GAIA, 'tone1.filter.cutoff');
  // F0 41 <deviceId> 00 00 41 12 then the four address bytes; the value and checksum come after.
  // The device id byte is masked to 0x80 — any 7-bit value matches — because it says which
  // instrument, not which parameter, and a GAIA set to 17 sends the same edit as one set to 16.
  assert.deepEqual(print.prefix, [0xf0, 0x41, 0x00, 0x00, 0x00, 0x41, 0x12, 0x10, 0x00, 0x01, 0x0c]);
  assert.deepEqual(print.mask, [0xff, 0xff, 0x80, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
});

test('the device id does not have to match', () => {
  // The parser this replaces skipped byte 2 of a DT1 outright. Same tolerance, derived rather than
  // hardcoded — and it has to hold, or the panel silently stops following any instrument whose
  // device id is not the profile's default.
  const index = buildInboundIndex(GAIA);
  for (const id of ['00', '10', '11', '7F']) {
    assert.equal(matchInbound(index, `F0 41 ${id} 00 00 41 12 10 00 01 0C 05 34 F7`)?.parameterId,
      'tone1.filter.cutoff', `device id ${id} did not resolve`);
  }
});

test('a CC matches on any channel, but only as a CC', () => {
  // Derived from the same masking: compiling under channel 1 and channel 16 leaves the status byte
  // agreeing only in its high nibble. A whole-byte wildcard would have been easier and wrong — it
  // would let a note-on with the same second byte resolve to a CC parameter.
  const index = buildInboundIndex(CC);
  assert.equal(matchInbound(index, 'B0 4A 5A')?.parameterId, 'filter.cutoff');
  assert.equal(matchInbound(index, 'BF 4A 5A')?.parameterId, 'filter.cutoff', 'channel 16 is the same knob');
  assert.equal(matchInbound(index, '9A 4A 5A'), null, 'a note-on is not a CC');
});

test('every parameter of both profiles round-trips to itself', () => {
  // The blunt correctness check: compile it, then ask the index what it was. A wrong answer here
  // would bind a control to another parameter, which is worse than not resolving at all.
  for (const [name, source] of [['cc-synth', CC], ['GAIA', GAIA]]) {
    const index = buildInboundIndex(source);
    assert.equal(index.unresolved.length, 0, `${name} left parameters unfingerprinted`);
    assert.deepEqual(index.collisions, [], `${name} puts two parameters on one message`);

    for (const parameter of source.parameters) {
      const compiled = localCompileParameter(source, { parameterId: parameter.id, value: 64 });
      if (!compiled?.ok) continue;
      assert.deepEqual(matchInbound(index, compiled.hex), {
        parameterId: parameter.id,
        prefixLength: matchInbound(index, compiled.hex).prefixLength,
      }, `${name}: ${parameter.id} did not resolve to itself`);
    }
  }
});

test('the GAIA indexes all 793 of its parameters, not the 39 the hand map covers', () => {
  const index = buildInboundIndex(GAIA);
  // 793 compiled, plus the three CCs the tone cutoffs declare as inbound — a knob can arrive on
  // more than one message, so entries outnumber parameters.
  assert.equal(index.size, 796);
  assert.equal(index.unresolved.length, 0);
  assert.deepEqual(index.collisions, []);
});

test('a message whose value is encoded differently still resolves', () => {
  // THE test for prefix matching. This parameter is u7, so the engine writes its value as one byte;
  // the message below carries two and a checksum, so it is a different length with a different tail.
  // Same head. Resolving one and not the other would make the index useless against any device whose
  // real value width differs from what its profile claims — which is exactly the bug that produced
  // nibbledEncoding.test.js — while still passing every round-trip above.
  const index = buildInboundIndex(GAIA);
  const fromEngine = localCompileParameter(GAIA, { parameterId: 'tone1.filter.cutoff', value: 90 }).hex;
  const fromDevice = 'F0 41 10 00 00 41 12 10 00 01 0C 05 0A 34 F7';

  assert.notEqual(bytesFromHex(fromEngine).length, bytesFromHex(fromDevice).length,
    'guard: these are supposed to differ in length, or this test proves nothing');
  assert.equal(matchInbound(index, fromEngine)?.parameterId, 'tone1.filter.cutoff');
  assert.equal(matchInbound(index, fromDevice)?.parameterId, 'tone1.filter.cutoff');
});

test('the value bytes stop where the value stops', () => {
  // Exactly as many bytes as this parameter's encoder occupies, so the checksum and the F7 that
  // trail a DT1 are not mistaken for part of the value.
  const index = buildInboundIndex(GAIA);
  assert.deepEqual(inboundValueBytes(index, 'F0 41 10 00 00 41 12 10 00 01 0C 05 34 F7'), [5],
    'tone1.filter.cutoff is a u7: one byte, not the checksum and terminator too');
  assert.deepEqual(inboundValueBytes(index, 'B0 4A 5A'), [], 'a message that matches nothing has no value');
});

test('a value is decoded with the encoder its parameter declares', () => {
  // The reason the width matters. A nibbled parameter read as one byte gives its top nibble — a
  // plausible number, and the wrong one, from a message that matched. 4095 is 0x0FFF: four nibbles
  // 0, 15, 15, 15. Reading one byte would say 0.
  const index = buildInboundIndex(GAIA);
  assert.deepEqual(decodeInbound(index, 'F0 41 10 00 00 41 12 10 00 04 01 00 0F 0F 0F 3E F7'),
    { parameterId: 'distortion.parameter1', value: 4095 });
  assert.deepEqual(decodeInbound(index, 'F0 41 10 00 00 41 12 10 00 01 0C 05 34 F7'),
    { parameterId: 'tone1.filter.cutoff', value: 5 });
  assert.equal(decodeInbound(index, 'F0 41 10 00 00 41 12 10 00 04 01 00 0F'), null,
    'a message too short to hold its own value decodes to nothing');
});

test('every parameter decodes back to the value it was compiled from', () => {
  // The round trip that matters for a bidirectional panel: encode a value, hand the bytes back, get
  // the same value. Run across all 793 rather than a sample, because the encodings differ per
  // parameter and a width bug shows up in one family at a time.
  //
  // A TEXT parameter is probed with text, not with a number. Probing the patch name with 1 used to
  // "pass" for the wrong reason — the encoder had no text branch, so it wrote a single byte, and
  // the index read a single byte back. Both were wrong and they agreed.
  const index = buildInboundIndex(GAIA);
  const failures = [];
  let text = 0;
  for (const parameter of GAIA.parameters) {
    const isText = String(parameter?.type ?? '') === 'text';
    const value = isText ? 'ROUND TRIP' : Math.min(Number(parameter?.range?.max ?? 1), 100);
    if (!isText && !Number.isFinite(value)) continue;
    if (isText) text += 1;
    const compiled = localCompileParameter(GAIA, { parameterId: parameter.id, value });
    if (!compiled?.ok) continue;
    const back = decodeInbound(index, compiled.hex);
    if (back?.parameterId !== parameter.id || back?.value !== value) {
      failures.push(`${parameter.id}: sent ${JSON.stringify(value)}, read ${JSON.stringify(back)}`);
    }
  }
  assert.deepEqual(failures.slice(0, 5), []);
  assert.equal(text, 1, 'guard: the patch name is the text case and it must be covered, not skipped');
});

test('a four-nibble value is not swallowed by the address', () => {
  // A bug this file caught while being written. Probing values 0..127 on a four-nibble parameter
  // leaves its top two bytes at zero every time, so they looked as fixed as the address, the prefix
  // absorbed them, and the value was then read two bytes late. Probes now span the declared range.
  const print = fingerprintParameter(GAIA, 'distortion.parameter1');
  assert.equal(print.valueLength, 4);
  assert.equal(print.prefix.length, 11, 'the prefix is the header and the four address bytes, nothing more');
  assert.equal(print.valueStart, 11);
});

test('the read-back asks for the right number of bytes', () => {
  // An RQ1 names a size. The Player hardcoded one byte for everything, which is right for a u7 and
  // short for all 622 nibbled parameters and every 14-bit one.
  const targets = Object.fromEntries(inboundReadTargets(buildInboundIndex(GAIA)).map((t) => [t.parameterId, t]));
  assert.equal(targets['tone1.filter.cutoff'].valueLength, 1);
  assert.equal(targets['distortion.parameter1'].valueLength, 4);
  assert.equal(targets['tone1.filter.cutoff'].address, '10 00 01 0C');
  assert.ok(!targets['master.volume'], 'a CC is not something an RQ1 can request');
});

test('an unknown message resolves to nothing rather than to something', () => {
  const index = buildInboundIndex(CC);
  assert.equal(matchInbound(index, 'B0 63 40'), null, 'CC 99 is not in this profile');
  assert.equal(matchInbound(index, ''), null);
  assert.equal(matchInbound(index, 'F0 7E 7F 06 02 F7'), null, 'an identity reply is not a parameter');
});

test('two parameters on one message are reported, not guessed between', () => {
  // A profile can put two parameters on the same CC. Picking one would bind a control to a coin
  // toss, and the collision is a profile bug worth surfacing.
  const clashing = {
    ...CC,
    parameters: [CC.parameters[0], { ...CC.parameters[1], id: 'filter.cutoffAgain', messageRecipe: 'cutoffCc' }],
  };
  const index = buildInboundIndex(clashing);
  assert.equal(index.collisions.length, 1);
  assert.deepEqual(matchInbound(index, 'B0 4A 5A'), { ambiguous: ['filter.cutoff', 'filter.cutoffAgain'] });
});

test('a longer message wins over a shorter one that is its head', () => {
  // Entries are searched longest-first, so a specific address is not shadowed by a general prefix.
  const index = buildInboundIndex(GAIA);
  const specific = matchInbound(index, 'F0 41 10 00 00 41 12 10 00 01 0C 05 0A 34 F7');
  assert.equal(specific.parameterId, 'tone1.filter.cutoff');
  assert.equal(specific.prefixLength, 11);
});

test('the lookup maps come out in the shape the Player already reads', () => {
  // Player.svelte carries ccIn and sysexIn from a hand-emitted map, with a comment saying "first
  // pass — later sourced from the device profile". This is that shape, from the profile.
  const maps = inboundLookupMaps(buildInboundIndex(GAIA));
  assert.equal(maps.sysexIn['10 00 01 0C'], 'tone1.filter.cutoff');
  assert.equal(maps.sysexIn['10 00 00 0C'], 'common.patchLevel');
  assert.equal(Object.keys(maps.sysexIn).length, 792);
  assert.deepEqual(maps.ccIn, {
    7: 'master.volume',                 // the one CC the profile writes
    102: 'tone1.filter.cutoff',         // and the three its knobs transmit, declared as inbound
    103: 'tone2.filter.cutoff',
    104: 'tone3.filter.cutoff',
  });
});

test('the derived map covers the hand-written one it replaces', () => {
  // Two independent derivations of the same thing, which is the strongest check available without
  // hardware. The hand map is what the Player used to read; this asserts the index says the same
  // about every entry of it that is still real, INCLUDING the three CCs — those come from the
  // profile's inbound declaration, and before it existed they were the one thing the hand map knew
  // that the profile could not be asked.
  //
  // Where the two disagree it is the hand map that is stale: it names twelve parameters no longer
  // in the profile — tone1.filter.envAttack, since renamed envAttackTime — so those twelve
  // addresses resolved to nothing the panel binds, which is part of why it is being replaced.
  const runtime = JSON.parse(readText(fileURLToPath(
    new URL('../src/CE_Application/generated/roland.gaia.runtime.json', import.meta.url))));
  const derived = inboundLookupMaps(buildInboundIndex(GAIA));
  const known = new Set(GAIA.parameters.map((p) => p.id));

  const stale = [];
  for (const [address, id] of Object.entries(runtime.sysexIn ?? {})) {
    if (!known.has(id)) { stale.push(id); continue; }
    assert.equal(derived.sysexIn[address], id, `the two maps disagree about ${address}`);
  }
  assert.equal(stale.length, 12, 'the hand map names parameters the profile no longer has');

  for (const [cc, id] of Object.entries(runtime.ccIn ?? {})) {
    assert.equal(derived.ccIn[cc], id, `the derived map lost CC ${cc}, which the hand map had`);
  }
});
