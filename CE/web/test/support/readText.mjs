// readText.mjs — read a committed file for comparison against a generator, line endings normalized.
//
// WHY THIS EXISTS. Several gates assert that a file on disk is byte-identical to what its generator
// produces: the GAIA panel, the GAIA profile, the three QA sheets, the visual goldens. Generators
// write "\n". Git on Windows checks the committed file out as "\r\n". So on a Windows clone every
// one of those gates failed with a diff in which actual and expected were otherwise identical — a
// wall of JSON saying nothing, five times over, none of it a real defect.
//
// The repo already had this exact one-liner inlined in panelApiParity.test.js and in
// tools/scripts/gen-script-modules.mjs. Sharing it is the point: a normalization that exists in two
// places and is needed in seven is a normalization somebody will forget.
//
// NOT a substitute for .gitattributes, which keeps the files themselves LF. This makes the gates
// tell the truth on a clone that was checked out before that existed, or with a local core.autocrlf.

import { readFileSync } from 'node:fs';

/** A file's contents with CRLF folded to LF, so a comparison is about content and not checkout. */
export const readText = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** The same fold, for a string that has already been read. */
export const normalizeEol = (text) => String(text ?? '').replace(/\r\n/g, '\n');
