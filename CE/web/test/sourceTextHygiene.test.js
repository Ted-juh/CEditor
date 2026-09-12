// sourceTextHygiene.test.js — a source file must stay a TEXT file to git.
//
// This exists because of a defect that survived a whole feature branch unnoticed, and the way it
// hid is the point. `lcdUserGlyphs.test.js` asserts what character addresses CGRAM slot 0 — which
// is NUL — and it was written with a real 0x00 byte in the string literal rather than the four
// characters `\x00`. Everything worked: node parsed it, all seventeen tests passed, the app was
// unaffected. The only symptom was in `git diff --stat`:
//
//     CE/web/test/lcdUserGlyphs.test.js | Bin 0 -> 8674 bytes
//
// Git calls a file binary when it finds a NUL early in it, and a binary file does not diff, does
// not merge by line, and shows a reviewer nothing at all. So a test can be silently rewritten in a
// pull request nobody can read. Nothing else in the suite can catch that: the file still behaves.
//
// NUL ONLY, deliberately. Other control characters are legitimate — LcdDisplayRenderer.svelte
// joins its cache key with `\x01` and has since before this test existed — and banning them would
// fail a correct file to prevent nothing. NUL is the one byte git reacts to.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const web = resolve(here, '..');
const repo = resolve(web, '..', '..');
// Every JavaScript the repository has, including the root `tools/` scripts — the generators and
// recorders there are exactly where somebody pastes a control character into a string and does not
// look at the diff afterwards. Reaching outside CE/web has precedent: vendoredJuceHelpers.test.js
// reads the repository's .gitignore.
const ROOTS = [join(web, 'src'), join(web, 'test'), join(web, 'scripts'), join(repo, 'tools')];
const EXTENSIONS = ['.js', '.mjs', '.ts', '.svelte'];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(full);
    else if (EXTENSIONS.includes(extname(entry.name))) yield full;
  }
}

test('no source file carries a literal NUL, which would make git treat it as binary', () => {
  const binary = [];
  for (const root of ROOTS) {
    for (const file of sourceFiles(root)) {
      const bytes = readFileSync(file);
      const at = bytes.indexOf(0);
      if (at >= 0) binary.push(`${relative(repo, file)} (byte ${at})`);
    }
  }
  assert.deepEqual(binary, [],
    'these files contain a raw NUL and will not diff in a pull request:\n  '
    + `${binary.join('\n  ')}\n\nWrite the escape — '\\x00' as four characters — not the byte.`);
});
