// readText.test.js — the support the file-freshness gates lean on.
//
// WHY THIS IS WORTH TESTING. Five gates compare a committed artefact against its generator, and
// every one of them reports through this module. A bug here is a bug in how five failures READ,
// which is the failure mode that already cost an afternoon: thirteen red tests on a Windows clone,
// twelve of them a checkout artefact, and nothing in the output saying so. So the assertions below
// are mostly about the MESSAGE — that it names the right line, that it stays short, and above all
// that it distinguishes "this file is stale" from "your git turned LF into CRLF".

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { assertSameText, normalizeEol, readText } from './support/readText.mjs';

/** Run assertSameText and hand back the message it failed with, or null if it passed. */
function failureOf(actual, expected, message = 'the file is stale', labels) {
  try {
    assertSameText(actual, expected, message, labels);
    return null;
  } catch (error) {
    return error.message;
  }
}

/* ------------------------------------------------------------------ reading */

test('normalizeEol folds CRLF and leaves a bare LF alone', () => {
  assert.equal(normalizeEol('a\r\nb\r\n'), 'a\nb\n');
  assert.equal(normalizeEol('a\nb\n'), 'a\nb\n');
  // A lone CR is not a line ending git produces, and rewriting it would be silently editing data.
  assert.equal(normalizeEol('a\rb'), 'a\rb');
  assert.equal(normalizeEol(null), '');
});

test('readText folds a CRLF file to the bytes the generator wrote', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ce-readtext-'));
  const file = path.join(dir, 'windows.txt');
  writeFileSync(file, 'one\r\ntwo\r\nthree\r\n');
  assert.equal(readText(file), 'one\ntwo\nthree\n');
});

/* ------------------------------------------------------------------ the passing case */

test('identical text asserts nothing at all', () => {
  assert.equal(failureOf('same\ntext\n', 'same\ntext\n'), null);
});

test('a CRLF difference is still a difference to assertSameText — it only REPORTS differently', () => {
  // The fold belongs at the read, not here. Swallowing it here would mean a gate that reads a file
  // unnormalized silently passes, and the day the generator's line endings genuinely change,
  // nothing notices.
  assert.notEqual(failureOf('a\r\nb', 'a\nb'), null);
});

/* ------------------------------------------------------------------ the message */

test('a line-endings-only difference says so, and says NOT to regenerate', () => {
  // This is the whole point. In a raw assert.equal dump this case is indistinguishable from a stale
  // file: the reader regenerates, gets a diff of the entire document, and commits a file that is
  // now CRLF for everybody.
  const message = failureOf('alpha\r\nbeta\r\ngamma', 'alpha\nbeta\ngamma');
  assert.match(message, /IDENTICAL apart from line endings/);
  assert.match(message, /Nothing needs regenerating/);
  assert.match(message, /readText\(\)/, 'it should name the fix, not just the symptom');
});

test('a real difference names the line it starts at', () => {
  const message = failureOf('a\nb\nWRONG\nd\ne\n', 'a\nb\nc\nd\ne\n');
  assert.match(message, /First difference at line 3 of 6/);
  assert.match(message, /1 line differs/);
  assert.ok(!message.includes('line endings'), 'a content change must not be blamed on a checkout');
});

test('the caller\'s own message survives — it is the half that says what to run', () => {
  const message = failureOf('x', 'y', 'CE/qa/QA-01.cepanel is stale — run: node tools/scripts/qa/make-qa-panels.mjs');
  assert.match(message, /run: node tools\/scripts\/qa\/make-qa-panels\.mjs/);
});

test('the labels are the caller\'s, because "actual" means nothing to a reader', () => {
  // visualGolden compares fresh render against baseline; the freshness gates compare committed file
  // against generator. Same helper, opposite sides — so the words have to come from the caller.
  const message = failureOf('a\nb', 'a\nc', 'stale', { actual: 'painted now', expected: 'the committed baseline' });
  assert.match(message, /painted now:/);
  assert.match(message, /the committed baseline:/);
});

test('one changed line in a long file reports ONE line, not everything below it', () => {
  // A naive first-difference report calls a single edit "lines 500 to 1000 differ", which reads as
  // a rewrite and sends the reader looking for a catastrophe that is not there.
  const before = Array.from({ length: 1000 }, (_, i) => `line ${i}`);
  const after = [...before];
  after[500] = 'line 500 CHANGED';
  const message = failureOf(after.join('\n'), before.join('\n'));
  assert.match(message, /First difference at line 501 of 1000/);
  assert.match(message, /1 line differs/);
});

test('an insertion reports the two lengths rather than pretending they match', () => {
  const message = failureOf('a\nb\nc\n', 'a\nc\n');
  assert.match(message, /where the other has/);
});

/* ------------------------------------------------------------------ staying readable */

test('a five-megabyte document does not become a five-megabyte failure', () => {
  // The defect this whole module exists for. The GAIA panel gate printed both copies of a 5 MB
  // JSON document, twice over (message plus the actual/expected properties), and the one line that
  // had changed was somewhere in the middle of it.
  const big = Array.from({ length: 60_000 }, (_, i) => `  "key${i}": ${i},`).join('\n');
  const message = failureOf(`${big}\nCHANGED`, `${big}\nORIGINAL`);
  assert.ok(message.length < 2000, `the failure message was ${message.length} chars`);
  assert.match(message, /First difference at line 60001/);
});

test('a single enormous line is clipped rather than printed whole', () => {
  // The GAIA panel's notepad is one JSON string several thousand characters long, and it is exactly
  // the sort of line a real edit lands on.
  const long = `"content": "${'x'.repeat(5000)}"`;
  const message = failureOf(long, `${long}!`);
  assert.match(message, /more chars\)/);
  assert.ok(message.length < 2000);
});

test('a difference in the last line still shows context above it', () => {
  // Off-by-one at the end of the file: the window must not run past the array and print nothing.
  const message = failureOf('a\nb\nc\nd', 'a\nb\nc\nZ');
  assert.match(message, /First difference at line 4 of 4/);
  assert.match(message, / {6}3 \| c/, 'the line before should be visible for orientation');
});

test('text that is entirely different is still reported from its first line', () => {
  const message = failureOf('completely\ndifferent\n', 'nothing\nalike\n');
  assert.match(message, /First difference at line 1 of 3/);
});
