import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadWebFonts, resetWebFontsForTest, webFontCssUrl } from '../src/CE_Application/utils/webFonts.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** A document just real enough to see what was appended to <head>. */
function fakeDocument() {
  const head = { children: [], appendChild(node) { this.children.push(node); } };
  globalThis.document = {
    head,
    createElement: () => ({
      listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      dispatch(type) { this.listeners[type]?.(); },
    }),
  };
  return head;
}

test.beforeEach(() => { resetWebFontsForTest(); });
test.afterEach(() => { delete globalThis.document; });

test('the font sheet is appended as print media, so it cannot block painting', () => {
  // THE WHOLE POINT. A render-blocking stylesheet stops the first paint until it resolves, and
  // resolving includes failing — 12.5 s of blank window on a machine that cannot reach the CDN.
  // `media="print"` is fetched but never considered relevant to the screen, so it is off the
  // critical path.
  const head = fakeDocument();
  const link = loadWebFonts();
  assert.equal(head.children.length, 1);
  assert.equal(link.rel, 'stylesheet');
  assert.equal(link.media, 'print');
  assert.equal(link.href, webFontCssUrl);
});

test('once it loads, the media switches so the faces actually apply', () => {
  fakeDocument();
  const link = loadWebFonts();
  assert.equal(link.media, 'print');
  link.dispatch('load');
  assert.equal(link.media, 'all');
});

test('a sheet that never loads leaves the media alone and nothing else happens', () => {
  // Offline is not an error path here: the fallback faces are already in use, so failing to load
  // means the editor looks slightly different and works.
  fakeDocument();
  const link = loadWebFonts();
  assert.equal(link.media, 'print');
  assert.doesNotThrow(() => link.dispatch('error'));
  assert.equal(link.media, 'print');
});

test('calling it twice does not request twice', () => {
  const head = fakeDocument();
  loadWebFonts();
  loadWebFonts();
  loadWebFonts();
  assert.equal(head.children.length, 1);
});

test('it does nothing without a document', () => {
  assert.equal(loadWebFonts(), null);
});

test('no stylesheet in the source tree imports a remote font', () => {
  // The regression that matters is someone adding `@import url(https://…)` back to a stylesheet:
  // Vite hoists it to the top of whatever bundle it lands in, so a sheet needed by ONE screen
  // silently becomes render-blocking for the entire application.
  const REMOTE_IMPORT = /@import\s+(?:url\()?\s*['"]?(?:https?:)?\/\/[^'")\s;]+/g;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(css|svelte)$/.test(entry.name)) continue;
      for (const m of readFileSync(full, 'utf8').matchAll(REMOTE_IMPORT)) {
        offenders.push(`${path.relative(SRC, full)}: ${m[0].slice(0, 80)}`);
      }
    }
  };
  walk(SRC);
  assert.deepEqual(offenders, [], `remote @import found — it will block first paint:\n${offenders.join('\n')}`);
});
