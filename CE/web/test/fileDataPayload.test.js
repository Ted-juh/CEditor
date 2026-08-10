// fileDataPayload.test.js — reading a file the backend sent, in either shape.
//
// Everything crosses base64-encoded, and it is worth knowing why before deciding that is silly for
// text. Sending text as text was tried — no encode, no decode, a third fewer bytes — and the 790 KB
// GAIA profile then took 55,298 ms to cross, with the window unresponsive for two minutes at a time.
// JUCE's emitEvent escapes the payload with String::replace, which is O(occurrences x length), and
// JSON::toString had turned each of that profile's 77,554 quotes into \". Base64 has no backslash
// and no apostrophe, so the same escape finds nothing and returns after one scan.
//
// Both shapes still have to READ here, because the C++ and the frontend ship separately: an install
// with a new frontend and an old backend is an ordinary thing to have on a machine, and a panel that
// will not open is not an acceptable way to find out.

import test from 'node:test';
import assert from 'node:assert/strict';

import { dataUrlToText, fileDataByteSize, fileDataText, profileSourceText } from '../src/CE_Application/utils/fileDataPayload.js';

const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const asDataUrl = (text) => `data:application/json;base64,${base64(text)}`;

test('a text field is read straight back, if a backend ever sends one', () => {
  const panel = JSON.stringify({ name: 'Pad', controls: [] });
  assert.equal(fileDataText({ text: panel }), panel);
});

test('the old base64 shape still reads', () => {
  // The compatibility case that matters: a new frontend against a backend that has not been
  // rebuilt. Without this the app would look broken in exactly the situation where nothing is.
  const panel = JSON.stringify({ name: 'Pad', controls: [] });
  assert.equal(fileDataText({ data: asDataUrl(panel) }), panel);
});

test('an empty file is empty, not missing', () => {
  // `text` is checked for being a string, not for being truthy. A zero-byte file answering as ''
  // must not fall through to the data: URL and come back as '' for a different reason — the two
  // look the same here and do not mean the same thing.
  assert.equal(fileDataText({ text: '' }), '');
  assert.equal(fileDataText({ text: '', data: asDataUrl('not this') }), '',
    'text wins when present, even empty');
});

test('nothing at all does not throw', () => {
  // This runs inside a bridge callback. Throwing here loses the panel with no message.
  assert.equal(fileDataText({}), '');
  assert.equal(fileDataText(null), '');
  assert.equal(fileDataText(undefined), '');
});

test('UTF-8 survives both routes', () => {
  // Panel names carry whatever the user typed. Decoding base64 as Latin-1 — the shape of the loop
  // this replaced — turns "Ströng Präset ♭" into mojibake, and it is saved back that way.
  const text = 'Ströng Präset ♭ 日本語';
  assert.equal(fileDataText({ text }), text);
  assert.equal(fileDataText({ data: asDataUrl(text) }), text);
});

test('a data URL that is not base64 is percent-decoded', () => {
  assert.equal(dataUrlToText('data:application/json,%7B%22a%22%3A1%7D'), '{"a":1}');
});

test('a malformed data URL degrades rather than throwing', () => {
  assert.equal(dataUrlToText('not a data url'), '', 'no comma, no payload');
  assert.equal(dataUrlToText('data:application/json,%E0%A4%A'), '%E0%A4%A',
    'invalid escapes come back raw rather than as an exception');
});

test('the byte size C++ measured beats anything inferred here', () => {
  // C++ knows the file size. Everything else is arithmetic on an encoding.
  assert.equal(fileDataByteSize({ byteSize: 43600000, text: 'tiny' }), 43600000);
});

test('a size is still produced when C++ did not send one', () => {
  const text = 'Ströng';                       // 7 bytes in UTF-8, 6 characters
  assert.equal(fileDataByteSize({ text }), 7, 'bytes, not characters');
  assert.equal(fileDataByteSize({ data: asDataUrl('12345') }), 5);
  assert.equal(fileDataByteSize({ data: asDataUrl('1234') }), 4, 'padded base64');
});

test('a profile source arrives base64-encoded, and that is not an optimisation to undo', () => {
  // The 790 KB GAIA profile crossed this bridge as plain text once. JUCE's emitEvent escapes the
  // payload with String::replace, which is O(occurrences x length), and JSON::toString had turned
  // each of the profile's 77,554 quotes into \" — 61.3 billion character operations, measured at
  // 55,298 ms with the window frozen throughout. Base64 has no backslash and no apostrophe, so the
  // same escape finds nothing. The encoding is the transport's constraint, not its naivety.
  const profile = JSON.stringify({ id: 'roland-gaia-sh01', parameters: [{ id: 'tone1.filter.cutoff' }] });
  assert.equal(profileSourceText({ sourceBase64: base64(profile) }), profile);
});

test('a plain-text source still reads, for a half-updated install', () => {
  const profile = '{"id":"test-cc-synth"}';
  assert.equal(profileSourceText({ source: profile }), profile);
});

test('the encoded source wins over the plain one', () => {
  assert.equal(profileSourceText({ sourceBase64: base64('encoded'), source: 'plain' }), 'encoded');
});

test('no source at all is empty, not undefined', () => {
  // This feeds JSON.parse in a try/catch and a store the whole preset UI reads. undefined would
  // stringify into the session file as the literal "undefined".
  assert.equal(profileSourceText({}), '');
  assert.equal(profileSourceText(null), '');
});

test('a profile name with an accent survives the round trip', () => {
  const profile = JSON.stringify({ name: 'Röland GAIA · SH-01' });
  assert.equal(profileSourceText({ sourceBase64: base64(profile) }), profile);
});
