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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProfile } from '../../../tools/scripts/qa/roland-gaia/make-gaia-profile.mjs';
import { PATCH_COMMON, PATCH_TONE } from '../../../tools/scripts/qa/roland-gaia/address-map.mjs';

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

test('the profile reproduces the manual\'s own worked example, byte for byte', () => {
  const vector = profile.tests.find((t) => t.parameter === 'tone1.osc.wave' && t.value === 6);
  assert.ok(vector, 'the golden vector for Tone 1 OSC Wave = SUPER-SAW is missing');
  assert.equal(vector.expectedHex, MANUAL_EXAMPLE_1);
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

test('coverage is stated honestly, and names what is not transcribed', () => {
  // The demo profile's real failing was not being wrong — it was being silent. Whatever this
  // profile does not do has to be written down where a user of it will read it.
  assert.ok(Array.isArray(profile.coverage.notTranscribed) && profile.coverage.notTranscribed.length > 0,
    'coverage must name the blocks that are not transcribed');
  for (const block of ['Patch Distortion', 'Patch Flanger', 'Patch Delay', 'Patch Reverb']) {
    assert.ok(profile.coverage.notTranscribed.includes(block), `coverage does not mention ${block}`);
  }
  assert.ok(profile.sources?.[0]?.title?.includes('MIDI Implementation'), 'the profile should say where its map came from');
});

test('the committed profile matches the generator', () => {
  const committed = readFileSync(path.join(REPO, 'CE/profiles/test/roland-gaia-sh01.ceditor-device.json'), 'utf8');
  assert.equal(committed, `${JSON.stringify(profile, null, 2)}\n`,
    'CE/profiles/test/roland-gaia-sh01.ceditor-device.json is stale — run: node tools/scripts/qa/roland-gaia/make-gaia-profile.mjs');
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
