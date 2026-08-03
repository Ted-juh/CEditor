// The scripting manual is generated from panelApi.js — this test fails the build when the
// committed page is stale, so an API change can't silently ship with outdated docs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateManual, OUT } from '../scripts/generate-scripting-manual.mjs';

test('docs/scripting-manual.md matches what the generator produces', () => {
  let committed = '';
  try {
    committed = readFileSync(OUT, 'utf8');
  } catch {
    assert.fail(`docs/scripting-manual.md is missing — run \`npm run docs:manual\``);
  }
  assert.equal(
    committed,
    generateManual(),
    'docs/scripting-manual.md is stale — run `npm run docs:manual` and commit the result',
  );
});
