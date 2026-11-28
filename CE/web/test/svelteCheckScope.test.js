// svelteCheckScope.test.js — `npm run check` checks the whole project, or says so.
//
// svelte-check, like TypeScript's editor service, stops type-checking a project whose JavaScript and
// Svelte files add up to more than 20 MB: it disables the project and checks the handful of files it
// opened directly, and then reports success. This project crossed that line on 2026-11-24, at the
// Animation Designer's step 3 — 20.1 MB of .js and .svelte, the help bundle alone 1.2 MB — and the
// check went from "1921 FILES 0 ERRORS" to "73 FILES 0 ERRORS" with no other sign. The first full run
// after the fix found a bug the short one had passed (a value the Patterns section updates that was
// not reactive state). `disableSizeLimit` is the compiler option that turns the guard off; a check
// is not an editor, and the size it guards against is the size of the program it has to check.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the type check is not limited by project size, which the project is past', () => {
  const config = JSON.parse(readFileSync(new URL('../jsconfig.json', import.meta.url), 'utf8'));
  assert.equal(config.compilerOptions?.disableSizeLimit, true,
    'without it svelte-check checks some 73 files of 1,900 and reports 0 errors');
});
