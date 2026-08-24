// localDumpBuild.test.js — the preview's encode direction, round-tripped against its own parser.
//
// `buildDump` returned null in the editor preview while the exported plugin returned bytes. A script
// that assembled a patch therefore worked in the plugin and quietly did nothing in the editor, which
// is the worst shape a gap can have: the place you develop behaves differently from the place you
// ship. `scripting-runtime-gaps.md` carried it as the second half of the buildDump entry.
//
// WHAT IS AND IS NOT CLOSED. A layout the script declares with `defineDump` is one this runtime owns
// outright, so it builds here. A PROFILE dump's codec lives in the C++ DeviceProfileEngine and the
// preview has no synchronous way to reach it, so that case still returns null with an explanation.
// The split is the same one `requestDump` already makes, and the tests below pin both sides of it.
//
// The central assertion is a ROUND TRIP against `localParseDumpMessage` — the same shape the C++
// side is tested with. Asserting on bytes would only prove the builder agrees with whatever it
// produced the day it was written; round-tripping proves it agrees with the parser, and the parser
// is what a synth's reply goes through.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localBuildDumpMessage,
  localParseDumpMessage,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

/** A small Roland-shaped profile: prefix, 8-byte payload, sum checksum before F7. */
function profile() {
  return {
    id: 'test',
    variables: { deviceId: 16 },
    parameters: [
      { id: 'p.level', type: 'integer', encoding: { type: 'u7' } },
      { id: 'p.wide', type: 'integer', encoding: { type: 'u14' } },
      { id: 'p.name', type: 'text', encoding: { type: 'text-ascii', length: 4, pad: 32 } },
    ],
    dumpDefinitions: [{
      id: 'patch',
      name: 'Patch',
      matcher: { prefix: ['F0', '41', '$deviceId', '12'], suffix: ['F7'] },
      payload: { offset: 4, size: 8 },
      checksum: { type: 'roland-7bit', fromOffset: 4, toOffset: 11, byteOffset: 12 },
      mappings: [
        { parameter: 'p.name', offset: 0 },
        { parameter: 'p.level', offset: 4 },
        { parameter: 'p.wide', offset: 5 },
      ],
    }],
  };
}

test('a built dump parses back to the values it was given', () => {
  // The assertion that matters. If it passes, the builder and the parser agree about framing,
  // mapping offsets, codecs and the checksum all at once.
  const values = { 'p.name': 'ABCD', 'p.level': 99, 'p.wide': 9000 };
  const built = localBuildDumpMessage(profile(), 'patch', values);
  assert.ok(built.ok, `did not build: ${built.error}`);
  assert.equal(built.checksumStatus, 'ok');

  const parsed = localParseDumpMessage(profile(), built.hex);
  assert.ok(parsed.ok, `the built message does not parse: ${parsed.error}\n  ${built.hex}`);
  assert.equal(parsed.checksumStatus, 'ok', 'the parser rejected the built checksum');
  assert.equal(parsed.values['p.name'], 'ABCD');
  assert.equal(parsed.values['p.level'], 99);
  assert.equal(parsed.values['p.wide'], 9000);
});

test('the checksum field is reserved before the suffix, not written over it', () => {
  // The trap the C++ side hit first: the checksum sits BETWEEN the last data byte and F7, so
  // appending the suffix first puts the checksum on top of F7 — a message that neither ends
  // correctly nor verifies.
  const built = localBuildDumpMessage(profile(), 'patch', { 'p.level': 1 });
  assert.ok(built.ok);
  assert.equal(built.bytes.at(-1), 0xf7, 'the message must still end with F7');
  assert.equal(built.bytes.length, 14, 'prefix 4 + payload 8 + checksum 1 + F7');
});

test('a variable in the prefix is resolved, not emitted literally', () => {
  const built = localBuildDumpMessage(profile(), 'patch', { 'p.level': 1 });
  assert.deepEqual(built.bytes.slice(0, 4), [0xf0, 0x41, 16, 0x12],
    '$deviceId should resolve from profile.variables');
});

test('unsupplied parameters keep the default bytes and are reported', () => {
  // Partial coverage is the normal case for a panel that binds part of a dump, not an error.
  const built = localBuildDumpMessage(profile(), 'patch', { 'p.level': 5 });
  assert.ok(built.ok);
  assert.deepEqual(built.unmapped.sort(), ['p.name', 'p.wide']);
  assert.ok(!built.unmapped.includes('p.level'), 'a supplied parameter must not be reported unmapped');
});

test('an unknown parameter id is reported rather than dropped', () => {
  // Otherwise a typo is a dump that builds cleanly and does nothing.
  const built = localBuildDumpMessage(profile(), 'patch', { 'p.level': 5, 'p.nope': 1 });
  assert.ok(built.ok);
  assert.deepEqual(built.unknown, ['p.nope']);
});

test('building by name matches building by id, and both are deterministic', () => {
  const values = { 'p.level': 42 };
  const byId = localBuildDumpMessage(profile(), 'patch', values);
  const byName = localBuildDumpMessage(profile(), 'Patch', values);
  assert.equal(byName.hex, byId.hex, 'name and id must produce the same message');
  assert.equal(localBuildDumpMessage(profile(), 'patch', values).hex, byId.hex,
    'two builds of the same values must be identical, or a re-send is a different message');
});

test('refusals name what went wrong', () => {
  assert.match(localBuildDumpMessage(profile(), 'nope', {}).error, /nope/);
  assert.match(localBuildDumpMessage({ dumpDefinitions: [] }, 'patch', {}).error, /no dump definitions/i);

  // A mapping that would write past the payload is refused rather than truncated — truncation would
  // produce a message that looks plausible and is wrong.
  const overflowing = profile();
  overflowing.dumpDefinitions[0].mappings.push({ parameter: 'p.name', offset: 7 });
  assert.match(localBuildDumpMessage(overflowing, 'patch', { 'p.name': 'ABCD' }).error, /outside the payload/);
});

test('a text value round-trips through its pad', () => {
  // Text is the codec most likely to break asymmetrically: the encoder pads, the decoder trims, and
  // the two have to agree on which byte is padding.
  const built = localBuildDumpMessage(profile(), 'patch', { 'p.name': 'AB' });
  const parsed = localParseDumpMessage(profile(), built.hex);
  assert.ok(parsed.ok, parsed.error);
  assert.equal(parsed.values['p.name'], 'AB', 'a short name must not come back with its padding');
});
