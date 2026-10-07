// The editor manual is a hand-written template with tables filled in from the app's own data —
// this test fails the build when the committed page is stale, so a new component or shortcut
// can't ship with a manual that does not mention it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateEditorManual, OUT } from '../scripts/generate-editor-manual.mjs';

test('docs/editor-manual.md matches what the generator produces', () => {
  let committed = '';
  try {
    // Normalize CRLF from Windows checkouts (core.autocrlf) — the generator emits LF.
    committed = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    assert.fail('docs/editor-manual.md is missing — run `npm run docs:editor`');
  }
  assert.equal(
    committed,
    generateEditorManual(),
    'docs/editor-manual.md is stale — edit scripts/editor-manual.template.md (not the page), '
      + 'then run `npm run docs:editor` and commit the result',
  );
});
