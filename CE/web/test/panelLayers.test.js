// panelLayers.test.js — layers as objects with an order, instead of strings with an accident.
//
// `Core.layer` and layer-by-layer painting already existed. What did not was the layer itself: no
// list, no properties, and no stored ORDER. getLayerOrder numbered layers by where their first
// member happened to sit in the controls array, which meant this:
//
//     [A(Main), B(Background), C(Main)]  ->  Background paints in FRONT
//     delete A                           ->  Background paints BEHIND
//
// Deleting an unrelated control restacked the panel. That is the bug most of this file is about,
// and the reason order is now data.
//
// The other half is migration. A document written before any of this has no `layers`, and it must
// render IDENTICALLY on the first load after upgrading — otherwise every panel anyone has made
// shifts the moment they open it. The rule that buys that: build the list from first-appearance
// order, which is precisely what the old inference computed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { createPanel, deserializePanel, serializePanel } from '../src/CE_Application/stores/panelModel.js';
import { sortControlsForRender } from '../src/CE_Application/utils/controlOrder.js';
import {
  createLayer, layerNames, layerPopulation, normalizePanelLayers, reorderLayers, uniqueLayerName,
} from '../src/CE_Application/utils/panelLayers.js';
import { panels, addPanel, setActivePanel, selectedComponentIds } from '../src/CE_Application/stores/panels.js';
import {
  addLayer, assignSelectionToLayer, moveLayer, removeLayer, renameLayer, setLayerVisible,
} from '../src/CE_Application/stores/panelLayerActions.js';

const on = (id, layer) => createControl('Label', { Core: { id, layer } });
const order = (controls, names) => sortControlsForRender(controls, names).map((c) => c._children.Core.id).join('');

/* ------------------------------------------------------------------ the bug */

test('deleting an unrelated control no longer restacks the panel', () => {
  // The exact reproduction. With inferred order, removing A promotes Background to index 0 and it
  // drops behind Main; with a stored order it cannot.
  const controls = [on('A', 'Main'), on('B', 'Background'), on('C', 'Main')];
  const names = ['Background', 'Main'];

  assert.equal(order(controls, names), 'BAC');
  assert.equal(order(controls.slice(1), names), 'BC', 'B must stay behind, whatever else is deleted');

  // And the legacy path still behaves the old way, so nothing that relies on it changes silently.
  assert.equal(order(controls, null), 'ACB');
  assert.equal(order(controls.slice(1), null), 'BC');
});

test('a layer the order does not mention falls in behind, rather than vanishing', () => {
  // Hand-edited file, a paste from another panel, a script. The control must still render.
  const controls = [on('A', 'Main'), on('B', 'Ghost')];
  assert.equal(order(controls, ['Main']), 'AB');
});

/* ------------------------------------------------------------------ migration */

test('a document with no layers renders exactly as it did before', () => {
  // The promise that makes this safe to ship: open an old panel, see the same picture.
  const controls = [on('A', 'Main'), on('B', 'Background'), on('C', 'Main')];
  const migrated = normalizePanelLayers(undefined, controls);

  assert.deepEqual(layerNames(migrated), ['Main', 'Background']);
  assert.equal(order(controls, layerNames(migrated)), order(controls, null),
    'the migrated order must reproduce the inferred one, control for control');
});

test('migration survives a real save and load', () => {
  const panel = createPanel('migrate');
  panel.controls = [on('A', 'Main'), on('B', 'Scenery')];
  const document = JSON.parse(serializePanel(panel));
  delete document.layers;                                  // as an older build would have written it

  const loaded = deserializePanel(JSON.stringify(document), null, 'migrate');
  assert.deepEqual(layerNames(loaded.layers), ['Main', 'Scenery']);
});

test('a fresh panel has one layer, and it survives the round trip', () => {
  const panel = createPanel('fresh');
  assert.deepEqual(layerNames(panel.layers), ['Main']);
  const loaded = deserializePanel(serializePanel(panel), null, 'fresh');
  assert.deepEqual(layerNames(loaded.layers), ['Main']);
});

/* ------------------------------------------------------------------ the pure model */

test('normalize is total: garbage in, a renderable list out', () => {
  assert.deepEqual(layerNames(normalizePanelLayers(null, [])), ['Main']);
  assert.deepEqual(layerNames(normalizePanelLayers([], [])), ['Main']);
  assert.deepEqual(layerNames(normalizePanelLayers(['A', { name: 'B' }], [])), ['A', 'B']);
  assert.deepEqual(layerNames(normalizePanelLayers([{ name: 'A' }, { name: 'A' }], [])), ['A'],
    'a duplicate name is not a second layer');
  assert.deepEqual(layerNames(normalizePanelLayers([{ name: '  ' }], [])), ['Main'],
    'a blank name is the default layer, not a nameless one');
});

test('reorder moves one layer and clamps rather than throwing', () => {
  const layers = ['a', 'b', 'c'].map((n) => createLayer(n));
  assert.deepEqual(layerNames(reorderLayers(layers, 0, 2)), ['b', 'c', 'a']);
  assert.deepEqual(layerNames(reorderLayers(layers, 2, 0)), ['c', 'a', 'b']);
  assert.deepEqual(layerNames(reorderLayers(layers, 0, 99)), ['b', 'c', 'a'], 'past the end clamps');
  assert.deepEqual(layerNames(reorderLayers(layers, 9, 0)), ['a', 'b', 'c'], 'a bad source is a no-op');
});

test('population counts what is actually on each layer', () => {
  const layers = normalizePanelLayers(['Main', 'Scenery'], []);
  const counts = layerPopulation(layers, [on('A', 'Main'), on('B', 'Scenery'), on('C', 'Scenery')]);
  assert.equal(counts.get('Main'), 1);
  assert.equal(counts.get('Scenery'), 2);
});

test('a new layer never takes a name already in use', () => {
  const layers = [createLayer('Layer'), createLayer('Layer 2')];
  assert.equal(uniqueLayerName(layers), 'Layer 3');
  assert.equal(uniqueLayerName([]), 'Layer');
});

/* ------------------------------------------------------------------ the store actions */

function livePanel(tag, controls, layers = undefined) {
  const panel = createPanel(`layers-${tag}`);
  panel.controls = controls;
  if (layers) panel.layers = layers;
  addPanel(panel);
  const live = get(panels).find((p) => p.name === `layers-${tag}`);
  setActivePanel(live.id);
  return live.id;
}

const readPanel = (id) => get(panels).find((p) => p.id === id);
const layerOf = (id, controlId) =>
  readPanel(id).controls.find((c) => c._children.Core.id === controlId)._children.Core.layer;

test('deleting a layer moves its controls, it never deletes them', () => {
  // The failure this guards against loses work silently: the layer disappears from the list and
  // so does everything on it, with no error and nothing obviously wrong until you look.
  const id = livePanel('del', [on('A', 'Main'), on('B', 'Scenery')], [createLayer('Main'), createLayer('Scenery')]);
  removeLayer('Scenery');

  const panel = readPanel(id);
  assert.equal(panel.controls.length, 2, 'a control was deleted along with its layer');
  assert.deepEqual(layerNames(panel.layers), ['Main']);
  assert.equal(layerOf(id, 'B'), 'Main', 'the orphaned control should land on a layer that exists');
});

test('the last layer cannot be deleted', () => {
  const id = livePanel('last', [on('A', 'Main')]);
  removeLayer('Main');
  assert.deepEqual(layerNames(readPanel(id).layers), ['Main']);
});

test('renaming a layer takes its controls with it', () => {
  // `Core.layer` holds the name, so a rename that forgets the controls orphans every one of them.
  const id = livePanel('ren', [on('A', 'Scenery'), on('B', 'Main')], [createLayer('Main'), createLayer('Scenery')]);
  renameLayer('Scenery', 'Backdrop');

  assert.deepEqual(layerNames(readPanel(id).layers), ['Main', 'Backdrop']);
  assert.equal(layerOf(id, 'A'), 'Backdrop', 'the control was left pointing at a layer that no longer exists');
  assert.equal(layerOf(id, 'B'), 'Main', 'an unrelated control should not move');
});

test('renaming onto an existing name is refused rather than merging', () => {
  const id = livePanel('merge', [on('A', 'Scenery')], [createLayer('Main'), createLayer('Scenery')]);
  renameLayer('Scenery', 'Main');
  assert.deepEqual(layerNames(readPanel(id).layers), ['Main', 'Scenery'], 'a rename quietly merged two layers');
});

test('reordering a layer changes what paints in front', () => {
  const id = livePanel('order', [on('A', 'Main'), on('B', 'Scenery')], [createLayer('Main'), createLayer('Scenery')]);
  assert.equal(order(readPanel(id).controls, layerNames(readPanel(id).layers)), 'AB');

  moveLayer('Scenery', 0);
  assert.equal(order(readPanel(id).controls, layerNames(readPanel(id).layers)), 'BA');
});

test('adding a layer, and moving the selection onto it', () => {
  const id = livePanel('assign', [on('A', 'Main'), on('B', 'Main')]);
  addLayer('Scenery');
  selectedComponentIds.set(new Set(['A']));
  assignSelectionToLayer('Scenery');

  assert.equal(layerOf(id, 'A'), 'Scenery');
  assert.equal(layerOf(id, 'B'), 'Main', 'an unselected control moved too');
  selectedComponentIds.set(new Set());
});

test('an action leaves untouched controls as the same objects', () => {
  // The history store shares control objects with the panel, so an action that rebuilds the whole
  // tree turns a one-control edit into a full-panel undo snapshot. Cheap to preserve, easy to lose.
  const id = livePanel('share', [on('A', 'Main'), on('B', 'Main')]);
  const before = readPanel(id).controls;
  addLayer('Scenery');
  selectedComponentIds.set(new Set(['A']));
  assignSelectionToLayer('Scenery');

  const after = readPanel(id).controls;
  assert.notEqual(after[0], before[0], 'the reassigned control should be a new object');
  assert.equal(after[1], before[1], 'an untouched control should be the same object');
  selectedComponentIds.set(new Set());
});

test('hiding a layer is a flag, not a deletion', () => {
  const id = livePanel('hide', [on('A', 'Main')]);
  setLayerVisible('Main', false);
  assert.equal(readPanel(id).layers[0].visible, false);
  assert.equal(readPanel(id).controls.length, 1, 'hiding a layer removed its controls');
});
