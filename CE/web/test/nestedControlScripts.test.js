// nestedControlScripts.test.js — a control's own scripts ship wherever the control sits.
//
// `panel.controls` is the top level; a container's children live in its Children section. The
// export collectors read the top level only, so a script on a knob inside a group — or on a custom
// component placed inside a section of a front panel — ran in the editor and was silently missing
// from the plug-in: not gathered for the player, not counted when the panel's modules were worked
// out, and not compiled when it was TypeScript. gatherPanelScripts (Player/PanelValueModel.h), the
// plug-in's own copy of the collector, is pinned the same way in PanelValueModelTests.cpp.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { collectPanelExportScripts } from '../src/CE_Application/scripting/scriptPanelExport.js';
import { panelModules } from '../src/CE_Application/scripting/panelApi.js';
import { preparePanelForExport } from '../src/CE_Application/stores/panelExportPreparation.js';

function withScripts(control, scripts) {
  control._children.Scripts = { ...(control._children.Scripts ?? { _type: 'Scripts', enabled: true }), scripts };
  return control;
}

function nest(container, ...children) {
  for (const child of children) container._children.Children._children[child._children.Core.id] = child;
  return container;
}

/** A top-level knob, and a section holding an arpeggiator that holds a step light: three depths. */
function panelWithNestedScripts(language = 'lua', source = '-- nested') {
  const top = withScripts(createControl('Knob', { name: 'Cutoff' }), [{ id: 'top', language: 'lua', source: '-- top' }]);
  const light = withScripts(createControl('Label', { name: 'Step Light' }), [{ id: 'deep', language: 'lua', source: '-- deep' }]);
  const arp = nest(withScripts(createControl('Group', { name: 'Arp' }), [{ id: 'arp', language, source }]), light);
  const section = nest(createControl('Group', { name: 'Arpeggio Section' }), arp);
  return {
    panel: { name: 'Nested', panelGuid: 'nested-scripts', documentForm: 'complete', scripts: [], controls: [top, section] },
    ids: { top: top._children.Core.id, arp: arp._children.Core.id, light: light._children.Core.id },
  };
}

test('the player is handed the scripts of every control in the tree, a container before its children', () => {
  const { panel, ids } = panelWithNestedScripts();
  const gathered = collectPanelExportScripts(panel);
  assert.deepEqual(gathered.map((s) => s.id), ['top', 'arp', 'deep']);
  assert.deepEqual(gathered.map((s) => s.target), [ids.top, ids.arp, ids.light],
    'each nested script targets its own control, as a top-level one does');
  assert.ok(gathered.every((s) => s.scope === 'component'));
});

test('a nested control whose Scripts section is switched off ships nothing', () => {
  const { panel } = panelWithNestedScripts();
  const arp = Object.values(panel.controls[1]._children.Children._children)[0];
  arp._children.Scripts.enabled = false;
  assert.deepEqual(collectPanelExportScripts(panel).map((s) => s.id), ['top', 'deep']);
});

test('a module a nested control uses is one the panel uses', () => {
  const { panel } = panelWithNestedScripts('lua', 'local chord = ce.music.degreeChord("C", "major", 1)');
  assert.ok(panelModules(panel).enabled.includes('ce.music'),
    'left out, the plug-in is built without the module the nested script calls');
});

test('a nested control\'s TypeScript is compiled for the plug-in', async () => {
  const { panel } = panelWithNestedScripts('typescript', 'function onValueChanged() { const steps: number = 32; set("Arp", steps); }');
  const prepared = JSON.parse(await preparePanelForExport(JSON.stringify(panel)));
  const script = collectPanelExportScripts(prepared).find((s) => s.id === 'arp');
  assert.ok(script, 'the export form keeps the nested script');
  assert.match(script.compiledJs ?? '', /steps = 32/);
  assert.doesNotMatch(script.compiledJs ?? '', /: number/);
});
