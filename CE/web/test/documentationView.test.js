// documentationView.test.js — the documentation viewer, its two places, and its links.
//
// The viewer lives in a browser-mounted component, so this reads its source the way
// menuBarSemantics.test.js reads the menu bar's, and drives the stores and the renderer directly.
// What it pins:
//
//   - the rendered HTML comes from the escaping renderer and nowhere else;
//   - every link inside the shipped documents is followed inside the viewer, never handed to a
//     new window. That is the bug this replaced: every anchor carried target="_blank", the
//     WebView asked for a window on the app's own origin, the native side opened the user's
//     browser on it, and every link in the manual showed "not found";
//   - the manual is an editor tab and a native window, not a fixed overlay: the overlay could be
//     neither moved nor resized.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { get } from 'svelte/store';
import { compile } from 'svelte/compiler';

import { renderMarkdown } from '../src/CE_Application/utils/markdown.js';
import { helpLinkResolver, parseDocumentLink } from '../src/CE_Application/utils/helpLinks.js';
import { HELP_DOCS } from '../src/CE_Application/generated/helpDocs.js';
import {
  activeEditorTab,
  closeActiveEditorTab,
  documentationTabOpen,
  editorTabs,
} from '../src/CE_Application/stores/panels.js';
import {
  documentationPlace,
  documentationRequest,
  moveDocumentationToTab,
  moveDocumentationToWindow,
  noteDocumentShown,
  openDocumentation,
} from '../src/CE_Application/stores/documentation.js';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(WEB, 'src');
const REPO = join(WEB, '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const VIEW = read('CE_Application/layout/DocumentationView.svelte');
const WINDOW_PAGE = read('CE_Application/layout/HelpWindow.svelte');
const MENU = read('CE_Application/layout/MenuBar.svelte');
const APP = read('App.svelte');
const CANVAS = read('CE_Application/editor/EditorCanvas.svelte');

// --- the component ----------------------------------------------------------------------------

test('both components compile with no warnings, a11y ones included', () => {
  for (const [name, source] of [['DocumentationView.svelte', VIEW], ['HelpWindow.svelte', WINDOW_PAGE]]) {
    const { warnings } = compile(source, { filename: name });
    assert.deepEqual(warnings.map((w) => w.code), [], `${name}: ${warnings.map((w) => w.message).join('\n')}`);
  }
});

test('the only {@html} in it is the renderer output', () => {
  // The one decision in this component that could be a hole. If someone later interpolates a
  // document field directly, this fails.
  const injections = [...VIEW.matchAll(/\{@html\s+([^}]+)\}/g)].map((m) => m[1].trim());
  assert.deepEqual(injections, ['html'], 'unexpected {@html} expression');
  assert.match(VIEW, /let html = \$derived\(doc \? renderMarkdown\(doc\.text, \{ resolveLink \}\)/);
});

test('it renders the baked bundle rather than reaching for a file', () => {
  // There is no filesystem behind the bundle in WebView2, so a runtime read would be a viewer
  // that works in dev and is empty in the product.
  assert.match(VIEW, /import\('\.\.\/generated\/helpDocs\.js'\)/);
  assert.ok(!VIEW.includes('requestFileData'), 'the viewer should not read files at runtime');
  assert.ok(!VIEW.includes('fetch('), 'nor fetch them');
});

test('the bundle is imported dynamically, so it is not parsed at startup', () => {
  assert.ok(!/^\s*import \{[^}]*\} from '\.\.\/generated\/helpDocs\.js';/m.test(VIEW),
    'the help bundle went back to a static import');
  assert.match(VIEW, /loadFailed/, 'a dynamic import that fails must land somewhere visible');
});

test('the index states its gap instead of listing only what exists', () => {
  assert.match(VIEW, /HELP_GAPS/);
  assert.match(VIEW, /class="gap"/);
});

test('search results say when a document has more hits than are shown', () => {
  assert.match(VIEW, /group\.hidden/);
});

test('a click on a link inside the manual is followed in the viewer', () => {
  // The handler is what keeps an internal link from ever reaching the WebView's new-window path.
  assert.match(VIEW, /onclick=\{handleContentClick\}/);
  assert.match(VIEW, /link\.dataset\.helpDoc/);
  assert.match(VIEW, /link\.dataset\.helpAnchor/);
  assert.match(VIEW, /e\.preventDefault\(\);\s*followLink/);
  // A middle-click asks for a window too.
  assert.match(VIEW, /onauxclick=\{handleContentAuxClick\}/);
});

test('a followed link can be gone back from', () => {
  assert.match(VIEW, /backStack/);
  assert.match(VIEW, /e\.altKey && e\.key === 'ArrowLeft'/);
});

test('it is a page, not a fixed overlay', () => {
  assert.ok(!VIEW.includes('overlay-backdrop'), 'the viewer went back to being a modal box');
  assert.ok(!/position:\s*fixed/.test(VIEW), 'nothing in the viewer should be pinned over the editor');
});

// --- links, against every shipped document -------------------------------------------------------

test('no link to the manual itself opens a window; every one is followed in the viewer', () => {
  const resolveLink = helpLinkResolver(HELP_DOCS);
  let internal = 0;
  for (const doc of HELP_DOCS) {
    const html = renderMarkdown(doc.text, { resolveLink });
    for (const [tag] of html.matchAll(/<a [^>]*>/g)) {
      const href = tag.match(/href="([^"]*)"/)?.[1] ?? '';
      if (/^https?:/.test(href)) {
        assert.match(tag, /target="_blank"/, `${doc.id}: an outside page should leave the app`);
        continue;
      }
      internal += 1;
      assert.ok(href.startsWith('#'), `${doc.id}: an internal link must stay in the page: ${tag}`);
      assert.ok(!tag.includes('target='), `${doc.id}: an internal link asks for a new window: ${tag}`);
      assert.match(tag, /data-help-anchor="/, `${doc.id}: the viewer cannot follow ${tag}`);
    }
  }
  // The manuals link within themselves over a hundred times; a count near zero means the
  // renderer stopped making them links, which would "pass" the checks above by having none.
  assert.ok(internal > 100, `only ${internal} internal links were rendered`);
});

test('every in-page anchor lands on a heading of its own document', () => {
  const resolveLink = helpLinkResolver(HELP_DOCS);
  const idsOf = (html) => new Set([...html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((m) => m[1]));
  const rendered = new Map(HELP_DOCS.map((doc) => [doc.id, renderMarkdown(doc.text, { resolveLink })]));
  const missing = [];
  for (const doc of HELP_DOCS) {
    const html = rendered.get(doc.id);
    for (const [tag] of html.matchAll(/<a [^>]*data-help-anchor="[^"]*"[^>]*>/g)) {
      const anchor = tag.match(/data-help-anchor="([^"]*)"/)[1];
      const target = tag.match(/data-help-doc="([^"]*)"/)?.[1] ?? doc.id;
      if (!rendered.has(target)) { missing.push(`${doc.id} → unknown document ${target}`); continue; }
      if (anchor && !idsOf(rendered.get(target)).has(anchor)) missing.push(`${doc.id} → ${target}#${anchor}`);
    }
  }
  assert.deepEqual(missing, [], 'links that would land nowhere');
});

test('a link to another shipped document opens it here; anything else stays text', () => {
  const resolveLink = helpLinkResolver(HELP_DOCS);
  const html = renderMarkdown('see [the manual](scripting-manual.md#3-when-a-script-runs) and [a plan](design/plan.md)', { resolveLink });
  assert.match(html, /<a href="#3-when-a-script-runs" data-help-doc="scripting-manual" data-help-anchor="3-when-a-script-runs">the manual<\/a>/);
  assert.ok(html.includes('and a plan'), 'a document the app does not ship stays plain text');
});

test('document links are read the way the repository writes them', () => {
  assert.deepEqual(parseDocumentLink('./editor-manual.md'), { file: 'editor-manual.md', anchor: '' });
  assert.deepEqual(parseDocumentLink('../RELEASE-NOTES.md#known'), { file: 'release-notes.md', anchor: 'known' });
  for (const notADocument of ['#anchor', 'https://example.com/a.md', 'javascript:x.md', 'image.png', '']) {
    assert.equal(parseDocumentLink(notADocument), null, notADocument);
  }
});

// --- where it lives ------------------------------------------------------------------------------

test('Help → Documentation reaches it, and is the first row', () => {
  const help = MENU.slice(MENU.indexOf('Help: ['));
  const documentation = help.indexOf("label: 'Documentation'");
  const shortcuts = help.indexOf("label: 'Keyboard Shortcuts'");
  assert.ok(documentation > -1, 'there is no Documentation row in the Help menu');
  assert.ok(documentation < shortcuts, 'the manual should come before the shortcut list');
  assert.match(MENU, /requestDocumentation\(\)/);
});

test('App opens it off the signal the menu raises, and no longer mounts an overlay', () => {
  assert.match(APP, /documentationSignal/);
  assert.match(APP, /openDocumentation\(\)/);
  assert.match(APP, /installDocumentationWindowEvents\(\)/);
  assert.ok(!APP.includes('HelpOverlay'), 'the fixed overlay came back');
});

test('the editor area shows it for the documentation tab', () => {
  assert.match(CANVAS, /\$activeEditorTab\?\.type === 'documentation'\}\s*<DocumentationView/);
  assert.match(CANVAS, /request=\{\$documentationRequest\}/);
});

test('its own window is a page of the build, and the native side serves it', () => {
  const vite = readFileSync(join(WEB, 'vite.config.js'), 'utf8');
  assert.match(vite, /help: fileURLToPath\(new URL\('\.\/help\.html'/);
  assert.match(readFileSync(join(WEB, 'help.html'), 'utf8'), /src\/helpWindow\.js/);
  const host = readFileSync(join(REPO, 'CE/src/WebViewHost.cpp'), 'utf8');
  assert.match(host, /withEventListener \("openDocumentationWindow"/);
  assert.match(host, /withEventListener \("dockDocumentation"/);
  assert.match(host, /"documentationDocked"/);
  const window = readFileSync(join(REPO, 'CE/src/DocumentationWindow.h'), 'utf8');
  assert.match(window, /origin \+ "help\.html"/);
  assert.match(window, /setResizable \(true, false\)/);
});

test('the native side refuses a window on the app\'s own origin', () => {
  // The other half of the link fix: whatever still asks for one gets nothing, not a dead browser tab.
  const trusted = readFileSync(join(REPO, 'CE/src/TrustedWebBrowser.h'), 'utf8');
  const handler = trusted.slice(trusted.indexOf('newWindowAttemptingToLoad'));
  assert.ok(handler.indexOf('isOwnOrigin (url)') < handler.indexOf('launchInDefaultBrowser'),
    'the own-origin check must come before the browser is launched');
});

// --- the stores ----------------------------------------------------------------------------------

function withJuce(fn) {
  const events = [];
  const previous = globalThis.window;
  globalThis.window = { __JUCE__: { backend: {
    emitEvent: (name, payload) => events.push({ name, payload }),
    addEventListener: () => 0,
    removeEventListener: () => {},
  } } };
  try { fn(events); } finally { globalThis.window = previous; }
}

test('opening it puts a Documentation tab in the strip and in front', () => {
  documentationPlace.set('tab');
  openDocumentation();
  assert.equal(get(documentationTabOpen), true);
  assert.deepEqual(get(activeEditorTab), { type: 'documentation', id: 'documentation' });
  assert.ok(get(editorTabs).some((tab) => tab.tabType === 'documentation' && tab.name === 'Documentation'));
  closeActiveEditorTab();
  assert.equal(get(documentationTabOpen), false);
  assert.notEqual(get(activeEditorTab)?.type, 'documentation');
});

test('a named section is a request the viewer follows; a bare reopen of an open tab is not', () => {
  documentationPlace.set('tab');
  openDocumentation({ doc: 'scripting-manual', anchor: '3-when-a-script-runs' });
  const asked = get(documentationRequest);
  assert.equal(asked.doc, 'scripting-manual');
  assert.equal(asked.anchor, '3-when-a-script-runs');
  openDocumentation();
  assert.equal(get(documentationRequest).n, asked.n, 'Help → Documentation on an open tab moved the reader');
  // The viewer saying where it is does not count as a request either.
  noteDocumentShown('editor-manual');
  assert.equal(get(documentationRequest).n, asked.n);
  assert.equal(get(documentationRequest).doc, 'editor-manual');
  closeActiveEditorTab();
});

test('Own window moves the same section into the native window and closes the tab', () => {
  withJuce((events) => {
    documentationPlace.set('tab');
    openDocumentation();
    assert.equal(moveDocumentationToWindow({ doc: 'hostage-manual', anchor: 'racks' }), true);
    assert.deepEqual(events.at(-1), { name: 'openDocumentationWindow', payload: { doc: 'hostage-manual', anchor: 'racks' } });
    assert.equal(get(documentationTabOpen), false);
    assert.equal(get(documentationPlace), 'window');

    // Remembered: the next Help → Documentation goes to the window, not to a tab.
    openDocumentation();
    assert.equal(events.at(-1).name, 'openDocumentationWindow');
    assert.equal(get(documentationTabOpen), false);
  });
});

test('Back to the editor puts it in a tab again, on the document the window showed', () => {
  documentationPlace.set('window');
  const before = get(documentationRequest).n;
  moveDocumentationToTab({ doc: 'known-issues', anchor: '' });
  assert.equal(get(documentationPlace), 'tab');
  assert.equal(get(documentationTabOpen), true);
  assert.equal(get(documentationRequest).doc, 'known-issues');
  assert.equal(get(documentationRequest).n, before + 1);
  closeActiveEditorTab();
});

test('without a native side it never tries for a window', () => {
  documentationPlace.set('window');
  assert.equal(moveDocumentationToWindow({ doc: 'editor-manual' }), false);
  assert.equal(openDocumentation(), 'tab', 'a remembered window choice must fall back to the tab');
  closeActiveEditorTab();
  documentationPlace.set('tab');
});
