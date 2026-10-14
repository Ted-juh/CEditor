// playerNameIndex.test.js — the player finds a control by name from an index, and the index is honest.
//
// With the window open, the exported plug-in runs the panel's scripts through its host, whose
// document is written in place. Every lookup by name used to scan the whole panel, and on GAIA that
// was most of what its preset-name script cost (1,070 lookups across 818 controls, 160 to 220 ms of
// the 250 ms one call may take). The player now looks names up in an index, checked as it is used.
// These pin that it answers exactly as the scan did, whatever happens to the document under it.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { createPlayerHost } from '../src/CE_Application/scripting/playerScriptHost.js';
import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { panelPreviewSessions, syncPanelPreviewSessions } from '../src/CE_Application/stores/interactionPreview.js';
import { clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { MODULES } from '../src/CE_Application/scripting/panelApi.js';

function knob(name, value) {
  const control = createControl('Knob', { name });
  control._children.Behavior.min = 0;
  control._children.Behavior.max = 127;
  control._children.Behavior.defaultCurrentValue = value;
  return control;
}

/** A player over a panel of two knobs and a container holding a third; returns the panel and an API. */
function player() {
  const box = createControl('Container', { name: 'Box' });
  box._children.Children._children = { inner: knob('Inner', 30) };
  const panel = { id: 'p', name: 'P', controls: [knob('Cutoff', 10), knob('Resonance', 20), box], scripting: { modules: MODULES.map((m) => m.id) } };
  panels.set([panel]);
  activePanelId.set('p');
  panelPreviewSessions.set({});
  syncPanelPreviewSessions(panel.controls);
  clearScriptTrace();
  setRuntimeHost(createPlayerHost(() => panel));
  return { panel, api: scriptApiForTesting('', 'player-names') };
}

function done() {
  setRuntimeHost(null);
  panels.set([]);
  panelPreviewSessions.set({});
}

const nameOf = (api, name) => api.get(`${name}.core.name`);

test('the player finds controls by name and by id, inside containers too', () => {
  const { panel, api } = player();
  try {
    assert.equal(nameOf(api, 'Cutoff'), 'Cutoff');
    assert.equal(nameOf(api, 'inner'), 'Inner', 'a nested control, by name, case aside');
    assert.equal(nameOf(api, panel.controls[1]._children.Core.id), 'Resonance', 'and by id');
  } finally { done(); }
});

test('a control a script renames answers to its new name, and no longer to its old one', () => {
  const { api } = player();
  try {
    assert.equal(nameOf(api, 'Cutoff'), 'Cutoff', 'looked up once, so the index exists');
    api.set('Cutoff.core.name', 'Brightness');
    assert.equal(nameOf(api, 'Brightness'), 'Brightness');
    assert.equal(nameOf(api, 'Cutoff'), undefined);
  } finally { done(); }
});

test('a name one control gives up and another takes is found on the one that has it now', () => {
  const { api } = player();
  try {
    assert.equal(nameOf(api, 'Resonance'), 'Resonance');
    api.set('Cutoff.core.name', 'Old');
    api.set('Resonance.core.name', 'Cutoff');
    assert.equal(api.get('Cutoff.value'), 20, 'the second knob, which is called Cutoff now');
    assert.equal(api.get('Old.value'), 10);
  } finally { done(); }
});

test('two controls with one name: the first in the panel answers, as a scan finds it', () => {
  const { api } = player();
  try {
    assert.equal(api.get('Resonance.value'), 20, 'the index has Resonance on the second knob');
    // The first knob takes the same name. The second still answers to it, so only the rename itself
    // can tell the index that a control before it now does too.
    api.set('Cutoff.core.name', 'Resonance');
    assert.equal(api.get('Resonance.value'), 10, 'the first knob, as a scan of the panel would say');
  } finally { done(); }
});

test('a document changed by something other than a script is still read as it is', () => {
  const { panel, api } = player();
  try {
    assert.equal(nameOf(api, 'Cutoff'), 'Cutoff');
    // Renamed in place, not through the runtime: the index's entry no longer answers to the name.
    panel.controls[0]._children.Core.name = 'Elsewhere';
    assert.equal(nameOf(api, 'Cutoff'), undefined);
    assert.equal(nameOf(api, 'Elsewhere'), 'Elsewhere');
    // And a control added in place after the index was made, as ce.panel.create does.
    panel.controls.push(knob('Added', 40));
    assert.equal(api.get('Added.value'), 40);
  } finally { done(); }
});
