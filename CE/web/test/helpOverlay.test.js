// helpOverlay.test.js — the viewer, checked the way the other component tests here are.
//
// The behaviour lives in a browser-mounted component, so this reads its source the way
// menuBarSemantics.test.js reads the menu bar's. What it pins is the small number of decisions
// that would be silently wrong: that the rendered HTML comes from the escaping renderer rather
// than from the document, that the index states the gap it has, and that the menu can reach it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from 'svelte/compiler';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const OVERLAY = read('CE_Application/layout/HelpOverlay.svelte');
const MENU = read('CE_Application/layout/MenuBar.svelte');
const APP = read('App.svelte');

test('the component compiles with no warnings, a11y ones included', () => {
  const { warnings } = compile(OVERLAY, { filename: 'HelpOverlay.svelte' });
  assert.deepEqual(warnings.map((w) => w.code), [], warnings.map((w) => w.message).join('\n'));
});

test('the only {@html} in it is the renderer output', () => {
  // The one decision in this component that could be a hole. If someone later interpolates a
  // document field directly, this fails.
  const injections = [...OVERLAY.matchAll(/\{@html\s+([^}]+)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(injections, ['html'], 'unexpected {@html} expression');
  assert.match(OVERLAY, /let html = \$derived\(doc \? renderMarkdown\(doc\.text\)/);
});

test('it renders the baked bundle rather than reaching for a file', () => {
  // There is no filesystem behind a file:// bundle in WebView2, so a runtime read would be a
  // viewer that works in dev and is empty in the product.
  assert.match(OVERLAY, /import\('\.\.\/generated\/helpDocs\.js'\)/);
  assert.ok(!OVERLAY.includes('requestFileData'), 'the viewer should not read files at runtime');
  assert.ok(!OVERLAY.includes('fetch('), 'nor fetch them');
});

test('the bundle is imported dynamically, so it is not parsed at startup', () => {
  // 124 KB of documentation in the eager entry chunk is a parse cost on every launch of a feature
  // most sessions never open, and `main` is already the largest chunk in the build.
  assert.ok(!/^\s*import \{[^}]*\} from '\.\.\/generated\/helpDocs\.js';/m.test(OVERLAY),
    'the help bundle went back to a static import');
  assert.match(OVERLAY, /loadFailed/, 'a dynamic import that fails must land somewhere visible');
});

test('the index states its gap instead of listing only what exists', () => {
  assert.match(OVERLAY, /HELP_GAPS/);
  assert.match(OVERLAY, /class="gap"/);
});

test('search results say when a document has more hits than are shown', () => {
  assert.match(OVERLAY, /group\.hidden/);
});

test('Escape closes it, like every other overlay in the app', () => {
  assert.match(OVERLAY, /e\.key === 'Escape'/);
});

test('Help → Documentation reaches it, and is the first row', () => {
  const help = MENU.slice(MENU.indexOf('Help: ['));
  const documentation = help.indexOf("label: 'Documentation'");
  const shortcuts = help.indexOf("label: 'Keyboard Shortcuts'");
  assert.ok(documentation > -1, 'there is no Documentation row in the Help menu');
  assert.ok(documentation < shortcuts, 'the manual should come before the shortcut list');
  assert.match(MENU, /requestDocumentation\(\)/);
});

test('App mounts it off the signal the menu raises', () => {
  assert.match(APP, /import HelpOverlay from/);
  assert.match(APP, /documentationSignal/);
  assert.match(APP, /<HelpOverlay show=\{showDocumentation\}/);
});
