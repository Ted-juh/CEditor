// globalShortcutTabs.test.js — review finding D9: "no Ctrl+Tab / Ctrl+1-9 tab switching, no
// preview shortcut."
//
// These are application chords: they fire while the user is typing (Ctrl+Tab in a script editor
// means "next document", not "indent"), and they must work whichever workspace is in front — a
// script or a device profile being open is exactly when you want to get back to a panel.
//
// The resolver carries these three out itself and returns null rather than a command name; see the
// note on `run` in globalShortcuts.js for why. So the test presses the key and looks at what
// happened to the tab store, not at a returned string.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { GLOBAL_SHORTCUTS, resolveGlobalShortcut, cycleEditorTab, selectEditorTabByIndex } from '../src/CE_Application/utils/globalShortcuts.js';
import { activeEditorTab, activePanelId, editorTabs, panels, settingsTabOpen } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';

function threePanels() {
  const list = ['One', 'Two', 'Three'].map((name) => createPanel(name));
  panels.set(list);
  settingsTabOpen.set(false);
  activePanelId.set(list[0].id);
  activeEditorTab.set({ type: 'panel', id: list[0].id });
  return list;
}

function reset() {
  panels.set([]);
  settingsTabOpen.set(false);
  activePanelId.set(null);
  activeEditorTab.set({ type: 'panel', id: null });
}

function key(k, { ctrl = false, shift = false } = {}) {
  let prevented = false;
  return {
    event: { key: k, ctrlKey: ctrl, metaKey: false, shiftKey: shift, altKey: false, preventDefault: () => { prevented = true; } },
    get prevented() { return prevented; },
  };
}

test('Ctrl+Tab walks the tab strip and wraps at the end', () => {
  const list = threePanels();

  const first = key('Tab', { ctrl: true });
  assert.equal(resolveGlobalShortcut(first.event, { editableTarget: false }), null, 'the resolver runs it rather than handing back a command');
  assert.equal(first.prevented, true, 'the key is consumed, which is also how App.svelte knows not to re-dispatch it');
  assert.equal(get(activeEditorTab).id, list[1].id);

  resolveGlobalShortcut(key('Tab', { ctrl: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[2].id);

  resolveGlobalShortcut(key('Tab', { ctrl: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[0].id, 'wraps');

  reset();
});

test('Ctrl+Shift+Tab walks the other way', () => {
  const list = threePanels();
  resolveGlobalShortcut(key('Tab', { ctrl: true, shift: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[2].id, 'backwards from the first tab wraps to the last');
  reset();
});

test('tab switching fires while the user is typing', () => {
  const list = threePanels();
  resolveGlobalShortcut(key('Tab', { ctrl: true }).event, { editableTarget: true });
  assert.equal(get(activeEditorTab).id, list[1].id);
  reset();
});

test('tab switching works from a non-panel tab — the settings tab is in the strip too', () => {
  const list = threePanels();
  settingsTabOpen.set(true);
  activeEditorTab.set({ type: 'settings', id: 'settings' });

  const strip = get(editorTabs);
  assert.equal(strip[strip.length - 1].id, 'settings', 'settings is the last tab');

  resolveGlobalShortcut(key('Tab', { ctrl: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[0].id, 'from the last tab, forward wraps to the first panel');

  reset();
});

test('Ctrl+1-9 jumps straight to a tab, and out of range does nothing', () => {
  const list = threePanels();

  resolveGlobalShortcut(key('3', { ctrl: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[2].id);

  resolveGlobalShortcut(key('1', { ctrl: true }).event, {});
  assert.equal(get(activeEditorTab).id, list[0].id);

  const missing = key('9', { ctrl: true });
  resolveGlobalShortcut(missing.event, {});
  assert.equal(get(activeEditorTab).id, list[0].id, 'no ninth tab, no move');
  assert.equal(missing.prevented, true, 'still swallowed — Ctrl+9 must not reach the host');

  reset();
});

test('Ctrl+0 is not a tab chord — it is still fit-to-window on the canvas', () => {
  const list = threePanels();
  const zero = key('0', { ctrl: true });
  assert.equal(resolveGlobalShortcut(zero.event, {}), null);
  assert.equal(zero.prevented, false, 'left for the editor dispatcher');
  assert.equal(get(activeEditorTab).id, list[0].id);
  reset();
});

test('a single tab has nothing to cycle to', () => {
  const list = [createPanel('Only')];
  panels.set(list);
  activeEditorTab.set({ type: 'panel', id: list[0].id });

  cycleEditorTab(1);
  assert.equal(get(activeEditorTab).id, list[0].id);
  reset();
});

test('selectEditorTabByIndex is one-based and tolerates an empty strip', () => {
  reset();
  selectEditorTabByIndex(1);
  assert.equal(get(activeEditorTab).id, null);

  const list = threePanels();
  selectEditorTabByIndex(2);
  assert.equal(get(activeEditorTab).id, list[1].id);
  reset();
});

test('F5 toggles preview, and does nothing with no panel to preview', async () => {
  const { previewModeEnabled } = await import('../src/CE_Application/stores/interactionPreview.js');

  reset();
  const idle = key('F5');
  resolveGlobalShortcut(idle.event, {});
  assert.equal(get(previewModeEnabled), false, 'nothing to preview off a panel tab');
  assert.equal(idle.prevented, true, 'F5 is swallowed all the same — it must never reload the WebView');

  threePanels();
  resolveGlobalShortcut(key('F5').event, {});
  assert.equal(get(previewModeEnabled), true);
  resolveGlobalShortcut(key('F5').event, {});
  assert.equal(get(previewModeEnabled), false);

  reset();
});

test('every global binding carries what the F1 overlay draws', () => {
  for (const binding of GLOBAL_SHORTCUTS) {
    assert.ok(binding.id, 'id');
    assert.ok(binding.section, `${binding.id} has a section`);
    assert.ok(binding.keys, `${binding.id} has a key label`);
    assert.ok(binding.description, `${binding.id} has a description`);
    assert.equal(typeof binding.match, 'function', `${binding.id} has a chord test`);
    assert.ok(['application', 'document'].includes(binding.scope), `${binding.id} declares a scope`);
  }
});

test('the chords that run themselves never also return a command id', () => {
  // Returning both would let App.svelte grow a case for one of them and run it twice — a tab
  // switch that skips two tabs, from a file that looks innocent.
  const list = threePanels();
  const actions = { cycleEditorTab() {}, selectEditorTabByIndex() {}, togglePreview() {} };
  for (const binding of GLOBAL_SHORTCUTS.filter((b) => b.run)) {
    const probe = key('Tab', { ctrl: true });
    if (!binding.match(probe.event)) continue;
    assert.equal(resolveGlobalShortcut(probe.event, { actions }), null);
  }
  assert.equal(get(activeEditorTab).id, list[0].id, 'the injected actions were used, not the live ones');
  reset();
});
