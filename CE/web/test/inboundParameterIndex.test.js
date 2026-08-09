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
  fingerprintParameter,
  inboundLookupMaps,
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
  assert.deepEqual(print.prefix, [0xf0, 0x41, 0x10, 0x00, 0x00, 0x41, 0x12, 0x10, 0x00, 0x01, 0x0c]);
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

test('the GAIA indexes all 793 of its parameters, not the 40 the hand map covers', () => {
  const index = buildInboundIndex(GAIA);
  assert.equal(index.size, 793);
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

test('the bytes after the head are handed back undecoded', () => {
  // Decoding needs the value encoder, which is the half the two engines disagree about. Bytes are
  // the honest answer; a caller that knows the encoding can say what they mean.
  const index = buildInboundIndex(GAIA);
  assert.deepEqual(inboundValueBytes(index, 'F0 41 10 00 00 41 12 10 00 01 0C 05 0A 34 F7'), [5, 10, 0x34, 0xf7]);
  assert.deepEqual(inboundValueBytes(index, 'B0 4A 5A'), [], 'a message that matches nothing has no value');
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
  assert.deepEqual(maps.ccIn, { 7: 'master.volume' }, 'the profile declares exactly one CC recipe');
});

test('the derived map agrees with the hand-written one wherever the ids still exist', () => {
  // Two independent derivations of the same thing, which is the strongest check available without
  // hardware. Where they disagree it is the HAND map that is stale: it names twelve parameters that
  // are no longer in the profile — tone1.filter.envAttack, since renamed envAttackTime — so those
  // twelve inbound addresses currently resolve to nothing the panel binds.
  const runtime = JSON.parse(readText(fileURLToPath(
    new URL('../src/CE_Application/generated/roland.gaia.runtime.json', import.meta.url))));
  const derived = inboundLookupMaps(buildInboundIndex(GAIA)).sysexIn;
  const known = new Set(GAIA.parameters.map((p) => p.id));

  const stale = [];
  for (const [address, id] of Object.entries(runtime.sysexIn ?? {})) {
    if (!known.has(id)) { stale.push(id); continue; }
    assert.equal(derived[address], id, `the two maps disagree about ${address}`);
  }
  assert.equal(stale.length, 12, 'the hand map names parameters the profile no longer has');
});
