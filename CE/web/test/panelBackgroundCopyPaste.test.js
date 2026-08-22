// panelBackgroundCopyPaste.test.js — the panel background editor has copy/paste at all
// (finding E3, first clause, on the UI side).
//
// backgroundLayerClipboard.test.js covers the translation. This covers the thing the finding
// actually said: PanelCardContent — 1,141 lines of panel background editor — had no copy or paste
// of any kind, and the R/C/P buttons its Image and Texture sections already drew were wired to
// nothing, because LayerEffectsSection renders them whether or not a handler was passed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { render } from 'svelte/server';
import { panels, activePanelId, activeEditorTab } from '../src/CE_Application/stores/panels.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { copyBackgroundLayer } from '../src/CE_Application/stores/backgroundLayerClipboard.js';
import PanelCardContent from '../src/CE_Application/panels/PanelCardContent.svelte';

function openPanel(overrides = {}) {
  const panel = { ...createPanel('Bg'), ...overrides };
  panels.set([panel]);
  activePanelId.set(panel.id);
  activeEditorTab.set({ type: 'panel', id: panel.id });
  return panel;
}

const backgroundTab = () => render(PanelCardContent, { props: { tabId: 'background' } }).body;

test('every panel background layer offers copy and paste', () => {
  copyBackgroundLayer(null);
  openPanel({ bgSolid: true, bgGradientEnabled: true, bgImageEnabled: true, bgTextureEnabled: true });

  const html = backgroundTab();
  const copies = [...html.matchAll(/title="Copy layer settings"/g)].length;
  const pastes = [...html.matchAll(/title="Paste layer settings"/g)].length;

  assert.equal(copies, 4, `solid, gradient, image and texture should each offer copy — found ${copies}`);
  assert.equal(pastes, 4, `and each should offer paste — found ${pastes}`);
});

test('paste is disabled until the clipboard holds that kind of layer', () => {
  copyBackgroundLayer(null);
  openPanel({ bgSolid: true, bgGradientEnabled: false, bgImageEnabled: false, bgTextureEnabled: false });

  const empty = backgroundTab();
  assert.match(empty, /disabled[^>]*title="Paste layer settings"|title="Paste layer settings"[^>]*disabled/,
    'paste must be dead while the clipboard is empty');

  // A layer copied from a CONTROL's background editor — the whole point of the shared clipboard.
  copyBackgroundLayer({ layerId: 'solid', data: { colour: 'FF445566' } });
  const armed = backgroundTab();
  const solidPaste = armed.slice(armed.indexOf('title="Paste layer settings"') - 120,
                                armed.indexOf('title="Paste layer settings"') + 40);
  assert.ok(!/disabled/.test(solidPaste),
    'a solid layer on the clipboard must be pasteable onto the panel: ' + solidPaste);
});

test('a gradient copied from a control is offered to the panel gradient layer, not the image one', () => {
  copyBackgroundLayer({ layerId: 'gradient', data: { gradient: { type: 'linear', stops: [] } } });
  openPanel({ bgSolid: true, bgGradientEnabled: true, bgImageEnabled: true, bgTextureEnabled: true });

  const html = backgroundTab();
  const pasteButtons = [...html.matchAll(/<button[^>]*title="Paste layer settings"[^>]*>/g)].map((m) => m[0]);
  const enabled = pasteButtons.filter((b) => !/disabled/.test(b));
  assert.equal(enabled.length, 1, `only the gradient layer should accept a gradient — ${enabled.length} accepted it`);
});

test('the panel still holds a background after all that', () => {
  const panel = openPanel();
  assert.equal(get(panels)[0].id, panel.id);
  assert.equal(get(panels)[0].bgColour, 'FF333333');
});
