// fileDataPayload.test.js — reading a file the backend sent, in either shape.
//
// requestFileData used to answer one way: base64 in a data: URL. Right for a PNG, pure waste for
// text — and the two biggest things this app loads are text. A 43.6 MB panel became a 58 MB base64
// string, concatenated again for the data: prefix, escaped again into the JSON that carries it, and
// then undone on this side with an atob and a per-byte loop over 43.6 million bytes. All of it on
// threads that had a window to keep painting.
//
// So text now arrives as text. Both shapes have to stay readable, because the C++ and the frontend
// ship separately: an installer with a new frontend and an old backend is an ordinary thing to have
// on a machine, and the panel that will not open is not an acceptable way to find out.

import test from 'node:test';
import assert from 'node:assert/strict';

import { dataUrlToText, fileDataByteSize, fileDataText } from '../src/CE_Application/utils/fileDataPayload.js';

const base64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const asDataUrl = (text) => `data:application/json;base64,${base64(text)}`;

test('text sent as text is read straight back', () => {
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
