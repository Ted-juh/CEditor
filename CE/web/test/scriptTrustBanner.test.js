// scriptTrustBanner.test.js — "Scripts are paused" is a row of the window, not a layer over it.
//
// Typed code pauses a panel's scripts until someone trusts it. The banner that says so was fixed to
// the bottom of the window, over whatever was there: the Behavior Designer's footer, with its Save
// file button and Live switch, so code could not be saved until it was trusted. It is a row of
// App.svelte's grid now, above the status bar, empty unless scripts are paused.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (...parts) => readFileSync(join(here, '..', 'src', ...parts), 'utf8');

test('the banner is laid out, not floated', () => {
  const banner = read('CE_Application', 'components', 'ScriptTrustBanner.svelte');
  const rule = /\.script-trust\s*\{([^}]*)\}/.exec(banner)?.[1] ?? '';
  assert.ok(rule, 'the banner has its rule');
  assert.doesNotMatch(rule, /position\s*:\s*fixed/);
  assert.doesNotMatch(rule, /z-index/);
});

test('the window gives it a row of its own above the status bar', () => {
  const app = read('App.svelte');
  assert.match(app, /grid-template-rows:\s*28px 1fr auto 24px;/);
  assert.match(app, /"trust\s+trust\s+trust\s+trust"\s*\n\s*"status\s+status\s+status\s+status"/);
  assert.match(app, /<div class="trust-area">\s*<ScriptTrustBanner \/>\s*<\/div>/);
  assert.equal(app.match(/<ScriptTrustBanner \/>/g).length, 1, 'mounted once, in the row');
});
