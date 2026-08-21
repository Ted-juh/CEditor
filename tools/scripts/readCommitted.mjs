// readCommitted.mjs — read a generated artefact back off disk, to compare against the generator.
//
// Every `--check` in tools/scripts asks the same question: is the committed file still what this
// generator produces? All three answered it with a bare readFileSync and `===`, and all three were
// wrong on a Windows clone for the same reason — the generator writes "\n", git checks the file out
// as "\r\n", and the comparison reports a stale artefact where nothing is stale. Worse than a false
// alarm: the advice each one prints is "run the generator", which on that clone rewrites the file
// and changes every line.
//
// The test-side twin of this is CE/web/test/support/readText.mjs, which the five freshness GATES go
// through. The gates and the commands they tell you to run have to agree about what "stale" means;
// they did not, so a Windows checkout had passing tests and a generator insisting the panel needed
// regenerating.
//
// Not a substitute for .gitattributes, which keeps the files LF in the first place. This is what
// makes an existing clone — checked out before that landed, or with a local core.autocrlf — tell
// the truth without needing a re-checkout.

import { readFileSync } from 'node:fs';

/** A committed artefact's contents with CRLF folded to LF, or null if it is not there. */
export function readCommitted(target) {
  try {
    return readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;                                   // missing counts as stale, at every call site
  }
}
