// gaiaProfile.test.js — the Roland GAIA SH-01 profile, checked against the manufacturer's manual.
//
// The profile that shipped as `roland-gaia` has fifteen parameters, every one of them Tone 1's
// filter section, with ids (`filter.cutoff`) that carry no tone at all. It is a demo of the
// profile format. Nothing said so, and nothing could: a profile with fifteen correct parameters
// looks exactly like a complete one until you go looking for the ninety-fifth. That is the same
// shape of defect as a missing verb — no symptom, so no failure.
//
// So the full profile is generated from a transcribed address map, and this file checks the
// generated result against things that are true independently of it:
//
//   - Roland's OWN worked example. "SH-01 MIDI Implementation" v1.01 §Example 1 prints the exact
//     bytes for setting Tone 1 OSC Wave to SUPER-SAW. If our address arithmetic and 7-bit
//     checksum are right, we emit that string character for character. If either is wrong, we
//     do not — and no amount of internal consistency would have caught it.
//   - The 0x0100 tone stride, on every parameter rather than on a sample.
//   - The old demo profile's addresses, which must all survive at the same address.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertSameText, readText } from './support/readText.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { addressFor, buildProfile } from '../../../tools/scripts/qa/roland-gaia/make-gaia-profile.mjs';
import {
  localCompileParameter, localCompilePresetRecall, localParseDumpMessage,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import {
  BLOCK_SIZES, BLOCKS, PATCH_ARPEGGIO_COMMON, PATCH_COMMON, PATCH_DELAY, PATCH_DISTORTION,
  PATCH_FLANGER, PATCH_REVERB, PATCH_TONE,
} from '../../../tools/scripts/qa/roland-gaia/address-map.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const profile = buildProfile();
const byId = new Map(profile.parameters.map((p) => [p.id, p]));

/**
 * Verbatim from "SH-01 MIDI Implementation", Roland Corporation, version 1.01 (2010-09-01),
 * §4 "Examples of Actual MIDI Messages", Example 1 — Setting OSC Wave of Temporary Patch to
 * SUPER-SAW. This is the one assertion in the suite that does not depend on any of our own code
 * being right.
 */
const MANUAL_EXAMPLE_1 = 'F0 41 10 00 00 41 12 10 00 01 00 06 69 F7';

/**
 * §4 Example 2 — Getting the data (RQ1) of REVERB in USER PATCH:A-2. The second independent check,
 * and a different one: it exercises the user-patch base (20 nn 00 00) rather than the edit buffer,
 * the RQ1 command rather than DT1, and a block SIZE rather than a value.
 */
const MANUAL_EXAMPLE_2 = 'F0 41 10 00 00 41 11 20 01 0A 00 00 00 00 51 04 F7';

test('the profile reproduces the manual\'s DT1 example, byte for byte', () => {
  const vector = profile.tests.find((t) => t.parameter === 'tone1.osc.wave' && t.value === 6);
  assert.ok(vector, 'the golden vector for Tone 1 OSC Wave = SUPER-SAW is missing');
  assert.equal(vector.expectedHex, MANUAL_EXAMPLE_1);
});

test('the profile reproduces the manual\'s RQ1 example, byte for byte', () => {
  const vector = profile.tests.find((t) => t.kind === 'rq1');
  assert.ok(vector, 'the golden vector for the manual\'s RQ1 example is missing');
  assert.equal(vector.expectedHex, MANUAL_EXAMPLE_2);
});

test('block sizes are the manual\'s, not ones we computed', () => {
  // Distortion is the one that caught this: computing its size from the last offset gives 01 11,
  // and the manual's table foot says 01 01. A size that is too large is not a rounding error —
  // the synth answers a different question, or does not answer.
  assert.equal(BLOCK_SIZES.distortion, '00 00 01 01');
  assert.equal(BLOCK_SIZES.reverb, '00 00 00 51');
  assert.equal(BLOCK_SIZES.common, '00 00 00 3D');
  assert.equal(BLOCK_SIZES.tone, '00 00 00 3E');

  for (const request of profile.requests) {
    if (!request.size) continue;
    assert.ok(Object.values(BLOCK_SIZES).includes(request.size),
      `${request.id} asks for ${request.size}, which is not a size the manual states`);
  }
});

test('every transcribed block reaches the profile, whole', () => {
  const count = (prefix) => profile.parameters.filter((p) => p.id.startsWith(`${prefix}.`)).length;
  assert.equal(count('distortion'), PATCH_DISTORTION.length);
  assert.equal(count('flanger'), PATCH_FLANGER.length);
  assert.equal(count('delay'), PATCH_DELAY.length);
  assert.equal(count('reverb'), PATCH_REVERB.length);
  assert.equal(count('arp'), PATCH_ARPEGGIO_COMMON.length);
});

test('the effect parameter banks are 4-nibble, over Roland\'s offset container', () => {
  // 16 bits split across four bytes of four bits each. The MIDI implementation declares every slot
  // as 12768..52768 shown -20000..+20000, which is exactly 32768 ± 20000 — so the container's
  // centre is 32768 and `displayed = stored - 32768`. Getting either half wrong sends a plausible
  // number to the wrong place.
  for (const parameter of profile.parameters) {
    if (!/^(distortion|flanger|delay|reverb)\.parameter\d+$/.test(parameter.id)) continue;
    // `nibbled` with a `nibbles` count is the vocabulary BOTH engines read. This said
    // {type: 'nibbles', count: N} — the DPD authoring schema's words — which matched no branch in
    // either: C++ refused with "Unsupported numeric encoder" and JS emitted one u7 byte.
    assert.equal(parameter.encoding.type, 'nibbled', `${parameter.id}: effect parameters are nibble-encoded`);
    assert.equal(parameter.encoding.nibbles, 4, `${parameter.id}: four nibbles, not ${parameter.encoding.nibbles}`);
    // The offset, on every slot whether narrowed or not: what is displayed is what is stored, less
    // the container's centre.
    assert.equal(parameter.range.min - parameter.display.min, 32768, `${parameter.id}: wrong offset`);
    assert.equal(parameter.range.max - parameter.display.max, 32768, `${parameter.id}: wrong offset`);
  }
});

test('the four slots the panel shows carry the owner\'s manual\'s range, not the container\'s', () => {
  // THE fix this pins. Every effect slot used to be declared over the container's full 40000, so a
  // knob bound to DIST Drive — a 0..127 parameter — swept forty thousand steps and a third of one
  // percent of its travel did anything. The MIDI implementation could not have said otherwise: it
  // prints the container. The OWNER'S MANUAL prints the parameter.
  const shown = (id) => profile.parameters.find((p) => p.id === id);

  for (const [id, min, max, unit] of [
    ['distortion.parameter1', 0, 127, ''],      // DIST Drive / BIT CRASH Sample Rate
    ['distortion.parameter4', 0, 127, ''],      // Level, on every type
    ['delay.parameter3', -36, 0, 'dB'],         // High Damp, in dB on both delay types
    ['reverb.parameter2', 0, 2, ''],            // Type: ROOM, PLATE, HALL
    ['reverb.parameter3', 1, 100, '%'],         // High Damp, as a percentage
  ]) {
    const parameter = shown(id);
    assert.equal(parameter.display.min, min, `${id}: displayed minimum`);
    assert.equal(parameter.display.max, max, `${id}: displayed maximum`);
    assert.equal(parameter.display.unit, unit, `${id}: unit`);
    assert.equal(parameter.range.min, 32768 + min, `${id}: wire minimum`);
    assert.equal(parameter.range.max, 32768 + max, `${id}: wire maximum`);
  }

  // A slot whose meaning CHANGES with the type takes the union, because one address carries one
  // range and the union is the widest that can never refuse a legal value. distortion.parameter2 is
  // the distortion Type (1-6) under DIST and Bit Down (0-127) under BIT CRASH.
  assert.equal(shown('distortion.parameter2').display.min, 0);
  assert.equal(shown('distortion.parameter2').display.max, 127);
  // And where the units disagree, none is printed rather than one that is wrong two thirds of the
  // time: flanger.parameter1 is Feedback, Resonance, or a pitch shift in semitones.
  assert.equal(shown('flanger.parameter1').display.unit, '');
  assert.equal(shown('flanger.parameter1').display.min, -12, 'the union reaches below zero');

  // Slots 5 and up keep the container. The manual documents four per type because the instrument
  // reaches four; narrowing an address on no evidence would invent a limit rather than record one.
  for (const fx of ['distortion', 'flanger', 'delay', 'reverb']) {
    const parameter = shown(`${fx}.parameter5`);
    assert.equal(parameter.display.min, -20000, `${fx}.parameter5 should still be the container`);
    assert.equal(parameter.display.max, 20000);
    assert.equal(parameter.default, 32768, 'the centre of 12768..52768, which displays as 0');
  }
});

test('every tone parameter exists on all three tones, at a 0x0100 stride', () => {
  // Checked on every parameter rather than a sample: the stride is applied per parameter, so a
  // sample proves the sample. Address byte 2 is the tone; bytes 0, 1 and 3 must be identical.
  for (const entry of PATCH_TONE) {
    const ids = [1, 2, 3].map((tone) => [...byId.keys()].find((id) => id.startsWith(`tone${tone}.`) && byId.get(id).name === entry.name));
    assert.ok(ids.every(Boolean), `"${entry.name}" is missing from at least one tone: ${ids}`);

    const addresses = ids.map((id) => byId.get(id).address.split(' '));
    for (const index of [0, 1, 3]) {
      const column = new Set(addresses.map((a) => a[index]));
      assert.equal(column.size, 1, `"${entry.name}" differs in address byte ${index} across tones: ${addresses.map((a) => a.join(' ')).join(' / ')}`);
    }
    assert.deepEqual(addresses.map((a) => a[2]), ['01', '02', '03'], `"${entry.name}" has the wrong tone bytes`);
  }
});

test('the three tones carry the same parameter count, and it matches the address map', () => {
  for (const tone of [1, 2, 3]) {
    const count = profile.parameters.filter((p) => p.id.startsWith(`tone${tone}.`)).length;
    assert.equal(count, PATCH_TONE.length, `tone ${tone} has ${count} parameters, address map has ${PATCH_TONE.length}`);
  }
});

test('every address the demo profile used still resolves, at the same address', () => {
  // The demo is a fixture with golden vectors of its own. Renaming its parameters is fine; moving
  // one of its addresses would mean the transcription disagrees with something already verified.
  const demo = JSON.parse(readFileSync(path.join(REPO, 'CE/profiles/test/roland-gaia.ceditor-device.json'), 'utf8'));
  const generated = new Set(profile.parameters.map((p) => p.address).filter(Boolean));

  for (const parameter of demo.parameters) {
    if (!parameter.address) continue;
    assert.ok(generated.has(parameter.address), `demo parameter "${parameter.id}" is at ${parameter.address}, which the full profile does not cover`);
  }
});

test('addresses are 7-bit clean, and unique', () => {
  const seen = new Map();
  for (const parameter of profile.parameters) {
    if (!parameter.address) continue;
    const bytes = parameter.address.split(' ').map((b) => parseInt(b, 16));
    assert.equal(bytes.length, 4, `${parameter.id}: a Roland address is four bytes, got "${parameter.address}"`);
    for (const byte of bytes) assert.ok(byte >= 0 && byte <= 0x7f, `${parameter.id}: ${parameter.address} has a byte above 0x7F, which cannot go on the wire`);

    // The patch-name bytes are one 12-byte parameter, so only its start address is claimed.
    const previous = seen.get(parameter.address);
    assert.equal(previous, undefined, `${parameter.id} and ${previous} share address ${parameter.address}`);
    seen.set(parameter.address, parameter.id);
  }
});

test('every choice parameter has choices, and every range parameter has a range', () => {
  for (const parameter of profile.parameters) {
    if (parameter.type === 'choice') {
      assert.ok(parameter.choices?.length >= 2, `${parameter.id}: a choice with fewer than two options is not a choice`);
      const values = parameter.choices.map((c) => c.value);
      assert.equal(new Set(values).size, values.length, `${parameter.id}: duplicate choice values`);
      assert.ok(parameter.choices.some((c) => c.id === parameter.default), `${parameter.id}: default "${parameter.default}" is not one of its choices`);
    } else if (parameter.type === 'integer' || parameter.type === 'bipolar') {
      assert.ok(parameter.range, `${parameter.id}: no range`);
      assert.ok(parameter.range.max > parameter.range.min, `${parameter.id}: empty range`);
      assert.ok(parameter.default >= parameter.range.min && parameter.default <= parameter.range.max, `${parameter.id}: default ${parameter.default} is outside ${parameter.range.min}..${parameter.range.max}`);
    }
  }
});

test('bipolar parameters carry the display range as well as the wire range', () => {
  // A bipolar parameter whose display range is missing shows its wire value, which is wrong by a
  // constant on every one of them — the failure that looks like "the knob reads 64 at centre".
  for (const parameter of profile.parameters) {
    if (parameter.type !== 'bipolar') continue;
    assert.ok(Number.isFinite(parameter.display?.min) && Number.isFinite(parameter.display?.max),
      `${parameter.id}: bipolar with no display range — it would show wire values`);
    assert.ok(parameter.display.min < 0, `${parameter.id}: bipolar whose display range does not go negative`);
  }
});

test('coverage is stated honestly, and every block in the map has parameters', () => {
  // The demo profile's real failing was not being wrong — it was being silent. This used to check
  // that `notTranscribed` NAMED the arpeggio pattern blocks; they are transcribed now, so the
  // check that keeps its teeth is the stronger one: every block the address map declares must
  // have parameters addressed inside it. A block added to BLOCKS and never emitted fails here,
  // which is the failure the old assertion was standing in for.
  const addresses = profile.parameters.map((p) => p.address).filter(Boolean);
  for (const [name, offset] of Object.entries(BLOCKS)) {
    // The block's base address, which every parameter inside it shares as a prefix.
    const base = addressFor(offset, '00 00').slice(0, 8);
    assert.ok(addresses.some((address) => address.startsWith(base)),
      `block "${name}" (${offset}) is in the address map and has no parameters — either emit it or take it out`);
  }

  assert.ok(Array.isArray(profile.coverage.notTranscribed),
    'coverage must carry a notTranscribed list, even when it is empty');
  assert.equal(profile.coverage.notTranscribed.length, 0,
    `every block is transcribed now — if that changed, say which: ${profile.coverage.notTranscribed.join(', ')}`);

  // The honest gap that remains: what an effect parameter actually controls is type-dependent and
  // is not in this manual, so the profile says that rather than inventing names for them.
  assert.match(profile.coverage.effectParameterMeanings, /not documented/i);
  assert.ok(profile.sources?.[0]?.title?.includes('MIDI Implementation'), 'the profile should say where its map came from');
});

test('the arpeggio pattern is sixteen lanes of thirty-two steps, at the manual\'s addresses', () => {
  // 528 addresses is the kind of number that is easy to get nearly right. The manual prints the
  // ends of both dimensions — Note 1 at 00 0D 00, Note 16 at 00 1C 00, Step 1 at offset 00 02 and
  // Step 32 at 00 40 — so the corners are checkable against something other than our own loop.
  const pattern = profile.parameters.filter((p) => p.id.startsWith('arpPattern.'));
  assert.equal(pattern.length, 16 * 33, `expected 16 lanes x (1 note + 32 steps), got ${pattern.length}`);

  const byId = new Map(pattern.map((p) => [p.id, p]));
  for (const [id, address] of [
    ['arpPattern.note1.originalNote', '10 00 0D 00'],
    ['arpPattern.note1.step1Data', '10 00 0D 02'],
    ['arpPattern.note1.step32Data', '10 00 0D 40'],
    ['arpPattern.note16.originalNote', '10 00 1C 00'],
    ['arpPattern.note16.step32Data', '10 00 1C 40'],
  ]) {
    assert.equal(byId.get(id)?.address, address, `${id} is at the wrong address`);
  }

  // Every value in the block is two nibbles wide — a step holds 0..128, which does not fit in the
  // 0..127 a single 7-bit byte carries. Encoding one as u7 would truncate a tie to a rest.
  for (const parameter of pattern) {
    assert.equal(parameter.encoding.type, 'nibbled', `${parameter.id}: not nibble-encoded`);
    assert.equal(parameter.encoding.nibbles, 2, `${parameter.id}: wrong nibble count`);
    assert.equal(parameter.range.max, 128, `${parameter.id}: a step tops out at 128 (tie), not ${parameter.range.max}`);
  }
});

/* ------------------------------------------------ reading a patch back, and naming one */

/**
 * A DT1 as the synth would send it: header, address, data, Roland checksum, F7.
 *
 * Built here rather than pasted, so the assertions below are about the profile and not about
 * whether somebody typed a 61-byte hex string correctly.
 */
function dt1Message(addressBytes, data) {
  const body = [...addressBytes, ...data];
  const sum = body.reduce((total, byte) => total + byte, 0);
  const bytes = [0xf0, 0x41, 0x10, 0x00, 0x00, 0x41, 0x12, ...body, (128 - (sum % 128)) % 128, 0xf7];
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

test('a Patch Common reply is parsed rather than dropped', () => {
  // WHAT THIS REPLACES. The block requests declared `response: {kind: 'dt1', address}` — which says
  // only "a reply will arrive at this address" and does nothing with it — and the profile had no
  // dumpDefinitions at all. The request went out, the synth answered with the whole block, and
  // every byte was discarded. That is an editor that can only write: you could change the synth but
  // never open it on the patch already loaded.
  const data = new Array(61).fill(0);
  const name = 'BASS MONSTER';
  for (let i = 0; i < name.length; i += 1) data[i] = name.charCodeAt(i);
  data[12] = 100; // common.patchLevel

  const parsed = localParseDumpMessage(profile, dt1Message([0x10, 0x00, 0x00, 0x00], data));
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.dumpId, 'common');
  assert.equal(parsed.checksumStatus, 'ok');
  assert.equal(parsed.values['common.patchLevel'], 100, 'a mapping offset is wrong');
  // The name — the assertion `type: "patchName"` could never have passed, because no branch of
  // either engine knows that word. It read back as the ASCII code of the first letter.
  assert.equal(parsed.values['common.patchName'], name);
});

test('a Tone 2 reply is not applied as Tone 1\'s', () => {
  // The three tone blocks are the same 62-byte table at a 0x0100 stride, so the only thing telling
  // them apart is the address — which is why it is in the MATCHER rather than a field read
  // afterwards.
  const parsed = localParseDumpMessage(profile, dt1Message([0x10, 0x00, 0x02, 0x00], new Array(62).fill(0)));
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.dumpId, 'tone2');
});

test('every request that names a dump names one that exists', () => {
  // A request for a dump the profile does not define makes the engine reject the WHOLE profile,
  // silently, taking all 793 parameters with it — the GAIA has been one regeneration away from
  // vanishing from the device list before.
  const declared = new Set(profile.dumpDefinitions.map((d) => d.id));
  const wired = profile.requests.filter((r) => r.response?.kind === 'bulkDump');
  assert.equal(wired.length, 25, 'a block request stopped parsing its reply');
  for (const request of wired) {
    assert.ok(declared.has(request.response.dump), `${request.id} asks for an undefined dump`);
  }
  // And the other direction: a dump nothing can ask for is a parser for a message that never comes.
  const requested = new Set(wired.map((r) => r.response.dump));
  for (const dump of profile.dumpDefinitions) {
    assert.ok(requested.has(dump.id), `dump ${dump.id} has no request`);
  }
});

test('every addressed parameter is in exactly one dump, at its address delta', () => {
  // A dump is the block's bytes in address order, so a parameter's payload offset IS its distance
  // from the block base. Checked over all 792 rather than a sample, because the failure mode of a
  // wrong offset is a dump that parses, reports success, and fills the panel with the neighbour's
  // value.
  const seen = new Map();
  for (const dump of profile.dumpDefinitions) {
    const base = dump.matcher.prefix.slice(7).map((b) => parseInt(b, 16));
    const flat = (bytes) => bytes.reduce((total, byte) => total * 128 + byte, 0);
    for (const mapping of dump.mappings) {
      assert.ok(!seen.has(mapping.parameter), `${mapping.parameter} is in two dumps`);
      seen.set(mapping.parameter, dump.id);
      const parameter = byId.get(mapping.parameter);
      assert.ok(parameter, `${mapping.parameter} is not a parameter`);
      const delta = flat(parameter.address.split(' ').map((b) => parseInt(b, 16))) - flat(base);
      assert.equal(mapping.offset, delta, `${mapping.parameter} is mapped away from its address`);
      assert.ok(mapping.offset < dump.payload.size, `${mapping.parameter} falls past the end of ${dump.id}`);
    }
  }

  const addressed = profile.parameters.filter((p) => p.address).map((p) => p.id);
  assert.equal(seen.size, addressed.length, 'a parameter with an address is in no dump');
  // Master Volume is CC 7 and has no address, so it is correctly in none.
  assert.equal(profile.parameters.length - addressed.length, 1);
  assert.ok(!seen.has('master.volume'));
});

test('the patch name is written as twelve ASCII bytes, and an over-long one is refused', () => {
  // THE BUG. `encodeParameterValue` had no text branch, so a text parameter fell through to
  // clampInt(value, 0, 127): "BASS MONSTER" is not a number, so the result was 0, and the engine
  // reported success and sent one byte of NUL over the first character of the patch's name. The
  // C++ engine has always encoded text; this was a straight divergence between the two.
  const written = localCompileParameter(profile, { parameterId: 'common.patchName', value: 'GAIA TEST' });
  assert.ok(written.ok, written.error);
  // The same bytes DeviceProfileEngineTests builds from the C++ side: 9 characters, padded to 12
  // with spaces, over a Roland checksum.
  assert.equal(written.hex, 'F0 41 10 00 00 41 12 10 00 00 00 47 41 49 41 20 54 45 53 54 20 20 20 1E F7');

  // Refused, not truncated. Cutting a name down to fit would rename the patch on the instrument to
  // something nobody typed.
  const tooLong = localCompileParameter(profile, { parameterId: 'common.patchName', value: 'THIRTEEN CHARS' });
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.error, /longer than 12/);
});

test('a name survives the encoder and the dump reader unchanged', () => {
  // The round trip is the point: what is written is what must come back, or the field on screen and
  // the field in the synth drift apart by one save.
  const name = 'ROUND TRIP';
  const written = localCompileParameter(profile, { parameterId: 'common.patchName', value: name });
  const encoded = written.transaction.encodedValueHex.split(' ').map((b) => parseInt(b, 16));
  const data = [...encoded, ...new Array(61 - encoded.length).fill(0)];
  const parsed = localParseDumpMessage(profile, dt1Message([0x10, 0x00, 0x00, 0x00], data));
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.values['common.patchName'], name, 'the trailing pad must be trimmed, not kept');
});

/* -------------------------------------------------------------------- the preset banks */

test('the four banks are the manual\'s Bank Select table, and they do not overlap', () => {
  // p6 lists four banks: User (MSB 87 LSB 0), USB Memory (87/32) and Preset (87/64) at 64 patches
  // each, and Preset PCM (88/64) at 8. The MSB changes for the last one, which is the detail a
  // transcription is most likely to flatten.
  const banks = profile.presets.banks;
  assert.deepEqual(banks.map((b) => [b.bankMsb, b.bankLsb, b.slotCount]),
    [[87, 0, 64], [87, 32, 64], [87, 64, 64], [88, 64, 8]]);

  let next = 0;
  for (const bank of banks) {
    assert.equal(bank.startSlot, next, `${bank.id} does not start where the previous bank ends`);
    next += bank.slotCount;
  }
  assert.equal(next, 200, 'the GAIA addresses 200 patches across its four banks');

  // Only the two memory banks are writable. Marking Preset writable would offer a Save that the
  // instrument silently ignores.
  assert.deepEqual(banks.map((b) => b.writable), [true, true, false, false]);
});

test('a recall selects the bank before the program', () => {
  // With four banks a bare Program Change recalls slot n of whichever bank the synth happens to be
  // sitting in — which is the right patch number and the wrong patch.
  assert.equal(profile.presets.recall.kind, 'bankPc');
  const result = localCompilePresetRecall(profile, { slot: 129 });
  assert.ok(result.ok, result.error);
  // Slot 129 is the Preset bank's second patch: MSB 87, LSB 64, program 1.
  assert.equal(result.messages.map((m) => m.hex).join(' | '), 'B0 00 57 | B0 20 40 | C0 01');
});

test('no patch names are invented for the factory banks', () => {
  // The MIDI implementation lists the banks and their program ranges and never prints the factory
  // patch names. A catalogue of plausible-looking ones would display confidently wrong titles for
  // all 64 preset slots, and nothing on screen would say they were guesses.
  for (const bank of profile.presets.banks) {
    assert.ok(!('catalog' in bank), `${bank.id} carries a patch catalogue the manual does not print`);
  }
});

test('the committed profile matches the generator', () => {
  const committed = readText(path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json'));
  assertSameText(committed, `${JSON.stringify(profile, null, 2)}\n`,
    'CE/profiles/test/roland-gaia-sh01.ceditor-device.json is stale — run: node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs',
    { actual: 'committed', expected: 'the generator' });
});

test('the address map itself is well formed', () => {
  for (const [name, table] of [['PATCH_COMMON', PATCH_COMMON], ['PATCH_TONE', PATCH_TONE]]) {
    const offsets = table.map((entry) => entry.offset);
    assert.equal(new Set(offsets).size, offsets.length, `${name}: duplicate offset`);
    for (const entry of table) {
      assert.match(entry.offset, /^[0-9A-F]{2} [0-9A-F]{2}$/, `${name}: "${entry.name}" has a malformed offset "${entry.offset}"`);
      assert.ok(entry.name && entry.name !== '(reserved)', `${name}: unnamed entry at ${entry.offset}`);
      assert.ok(entry.max > entry.min, `${name}: "${entry.name}" has an empty range`);
      if (entry.labels) assert.equal(entry.labels.length, entry.max - entry.min + 1, `${name}: "${entry.name}" has ${entry.labels.length} labels for ${entry.max - entry.min + 1} values`);
    }
  }
});
