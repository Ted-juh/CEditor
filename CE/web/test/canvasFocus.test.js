// canvasFocus.test.js — Ctrl+\ hides the tree, the properties panel and the dock at once, and brings
// back exactly the ones it hid (item 3 of the editor-space list).
//
// Each had a chord of its own (Ctrl+Shift+E, Ctrl+Shift+D, Ctrl+J): clearing the canvas took three
// and putting it back three more, and the author had to remember which had been open.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';

import {
  showTreePanel, showPropertiesPanel, showDisplayPanel, showDisplayPanelInScript, displayPanelWorkspace,
  toggleCanvasFocus,
} from '../src/CE_Application/stores/panelVisibility.js';
import { GLOBAL_SHORTCUTS } from '../src/CE_Application/utils/globalShortcuts.js';

const src = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const shown = () => ({ tree: get(showTreePanel), properties: get(showPropertiesPanel), display: get(showDisplayPanel) });
function layout({ tree, properties, display }) {
  displayPanelWorkspace.set('panel');
  showTreePanel.set(tree); showPropertiesPanel.set(properties); showDisplayPanel.set(display);
}

test('it hides all three, and the second press brings back exactly the ones it hid', () => {
  layout({ tree: true, properties: false, display: true });
  assert.deepEqual(toggleCanvasFocus(), { hidden: ['tree', 'display'], shown: [] });
  assert.deepEqual(shown(), { tree: false, properties: false, display: false });
  assert.deepEqual(toggleCanvasFocus(), { hidden: [], shown: ['tree', 'display'] });
  assert.deepEqual(shown(), { tree: true, properties: false, display: true }, 'the properties panel was closed and stays closed');
});

test('with one open, it hides that one; with none it hid, it brings back what a new install shows', () => {
  layout({ tree: false, properties: true, display: false });
  toggleCanvasFocus();
  assert.deepEqual(shown(), { tree: false, properties: false, display: false });
  // Opened and closed by hand in between: what it hid is still what comes back.
  showDisplayPanel.set(true); showDisplayPanel.set(false);
  toggleCanvasFocus();
  assert.deepEqual(shown(), { tree: false, properties: true, display: false });
  // Everything closed one by one: nothing it hid, so the tree and the properties panel.
  layout({ tree: false, properties: false, display: false });
  toggleCanvasFocus();
  assert.deepEqual(shown(), { tree: true, properties: true, display: false });
});

test('in the script workspace the dock it hides and brings back is the script dock', () => {
  layout({ tree: false, properties: false, display: true });
  displayPanelWorkspace.set('script');
  showDisplayPanelInScript.set(true);
  toggleCanvasFocus();
  assert.equal(get(showDisplayPanelInScript), false);
  assert.equal(get(showDisplayPanel), true, 'the panel editor keeps its own switch');
  toggleCanvasFocus();
  assert.equal(get(showDisplayPanelInScript), true);
  displayPanelWorkspace.set('panel');
});

test('Ctrl+\\ is the chord, not while typing, listed with the other panel keys', () => {
  const binding = GLOBAL_SHORTCUTS.find((entry) => entry.id === 'toggle-canvas-focus');
  assert.equal(binding.keys, 'Ctrl+\\');
  assert.equal(binding.scope, 'document');
  assert.equal(binding.section, 'Panels');
  const key = (over) => ({ ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: '\\', code: 'Backslash', ...over });
  assert.ok(binding.match(key()));
  assert.ok(binding.match(key({ key: '<' })), 'a layout that types something else on that key');
  assert.ok(!binding.match(key({ ctrlKey: false })));
  assert.ok(!binding.match(key({ shiftKey: true })));
  // Nothing else answers it.
  assert.deepEqual(GLOBAL_SHORTCUTS.filter((entry) => entry.match(key())).map((entry) => entry.id), ['toggle-canvas-focus']);
});

test('App runs it and the Window menu offers it, ticked while all three are hidden', () => {
  assert.match(src('App.svelte'), /case 'toggle-canvas-focus': toggleCanvasFocus\(\); break;/);
  const menu = src('CE_Application/layout/MenuBar.svelte');
  assert.match(menu, /label: 'Canvas Only', shortcut: GLOBAL_SHORTCUTS\.find\(\(b\) => b\.id === 'toggle-canvas-focus'\)\?\.keys,/);
  assert.match(menu, /checked: \(\) => !visibilityFlags\.tree && !visibilityFlags\.properties && !visibilityFlags\.display,\s*action: \(\) => toggleCanvasFocus\(\)/);
});
