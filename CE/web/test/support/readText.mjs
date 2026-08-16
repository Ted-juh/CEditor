// readText.mjs — the support a "does this committed file still match its generator" gate needs.
//
// Two halves of one job, which is why they share a file.
//
// READING (readText / normalizeEol). Generators write "\n". Git on Windows checks the committed
// file out as "\r\n". So on a Windows clone every one of those gates failed with a diff in which
// actual and expected were otherwise identical — a wall of JSON saying nothing, five times over,
// none of it a real defect. The repo already had this exact one-liner inlined in
// panelApiParity.test.js and in tools/scripts/gen-script-modules.mjs. Sharing it is the point: a
// normalization that exists in two places and is needed in seven is one somebody will forget.
//
// NOT a substitute for .gitattributes, which keeps the files themselves LF. This makes the gates
// tell the truth on a clone that was checked out before that existed, or with a local core.autocrlf.
//
// COMPARING (assertSameText). assert.equal on two five-megabyte strings prints five megabytes.
// The GAIA panel gate did exactly that: a person reading the failure got 5 MB of JSON scrolled past
// them and no way to see which of 413 controls had moved. The reader does not need both documents.
// They need the first line that differs, and they need to be told when the difference is nothing but
// line endings — which is the case that cost a real afternoon and reads, in a raw dump, exactly like
// a stale file. A gate that cannot be read is a gate that gets ignored.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A file's contents with CRLF folded to LF, so a comparison is about content and not checkout. */
export const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** The same fold, for a string that has already been read. */
export const normalizeEol = (text) => String(text ?? '').replace(/\r\n/g, '\n');

// Long enough to see a JSON property and its value; short enough that a notepad blob holding a
// thousand-character string does not become the failure message.
const MAX_SHOWN = 160;

const clip = (line) => (line.length <= MAX_SHOWN
  ? line
  : `${line.slice(0, MAX_SHOWN)}… (+${line.length - MAX_SHOWN} more chars)`);

/** Two lines either side of the first difference — enough to recognise where in the file you are. */
function window(lines, at, label) {
  const from = Math.max(0, at - 2);
  const to = Math.min(lines.length, at + 3);
  const body = lines.slice(from, to)
    .map((line, i) => `  ${from + i === at ? '>' : ' '} ${String(from + i + 1).padStart(6)} | ${clip(line)}`)
    .join('\n');
  return `${label}:\n${body || '  (nothing — the file ends here)'}`;
}

function describeDifference(actual, expected, actualLabel, expectedLabel) {
  if (normalizeEol(actual) === normalizeEol(expected)) {
    // The whole reason readText exists. If this fires, a gate is reading a file without it.
    return 'The two are IDENTICAL apart from line endings — this is a checkout artefact, not a stale\n'
      + 'file. Nothing needs regenerating. The gate is reading the file without normalizing:\n'
      + 'read it with readText() from test/support/readText.mjs.';
  }

  const a = actual.split('\n');
  const b = expected.split('\n');

  let first = 0;
  while (first < a.length && first < b.length && a[first] === b[first]) first += 1;

  // How far the two agree again from the far end, so "one line changed" reads as one line changed
  // rather than as "everything from here down".
  let tail = 0;
  while (tail < a.length - first && tail < b.length - first
    && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;

  const changedA = a.length - tail - first;
  const changedB = b.length - tail - first;
  const scale = changedA === changedB
    ? (changedA === 1 ? '1 line differs' : `${changedA} lines differ`)
    : `${changedA} line${changedA === 1 ? '' : 's'} where the other has ${changedB}`;

  return `First difference at line ${first + 1} of ${a.length} — ${scale}.\n\n`
    + `${window(a, first, actualLabel)}\n\n${window(b, first, expectedLabel)}`;
}

/**
 * Assert two texts are identical, and if they are not, say how in a paragraph rather than a dump.
 *
 * `message` is the actionable half — which file, and what to run. This adds the diagnostic half.
 */
export function assertSameText(actual, expected, message, labels = {}) {
  if (actual === expected) return;
  assert.fail(`${message}\n\n${describeDifference(
    String(actual), String(expected),
    labels.actual ?? 'actual', labels.expected ?? 'expected',
  )}`);
}
