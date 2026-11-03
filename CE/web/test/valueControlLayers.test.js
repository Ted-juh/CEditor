// valueControlLayers.test.js — Create Component from Selection makes a knob or a slider into layers
// (docs/design/changeable-control-sets.md, piece D2; utils/valueControlLayers.js). What it looks like
// is browser-checks/knobLayers.mjs's to compare; this pins what the layers are and how they are wired.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { BUILT_IN_CONTROL_SETS, getControlSet } from '../src/CE_Application/models/controlSets.js';
import { resolveControlForSet } from '../src/CE_Application/models/controlSetFamilies.js';
import { planComponentFromSelection } from '../src/CE_Application/utils/customComponentFromControls.js';
import { valueLayersRefusal } from '../src/CE_Application/utils/valueControlLayers.js';

const panelWith = (controls, setId = 'graphite') => ({ id: 'p', controlSet: { id: setId }, controlSets: [], controls });
const knob = (patch = {}) => createControl('Knob', { Core: { id: 'k1', name: 'Cutoff' }, Transform: { x: 40, y: 60, width: 120, height: 140 }, ...patch });
const plan = (controls, setId = 'graphite', valueControlsAs = 'layers') => planComponentFromSelection(panelWith(controls, setId), controls.map((c) => c._children.Core.id), { set: getControlSet(setId), name: 'T', valueControlsAs });

test('a knob comes in as layers wired to its value, and as one exact part when asked', () => {
  const layered = plan([knob()]);
  assert.ok(layered.ok);
  const parts = layered.component._children.Parts._children;
  assert.ok(!Object.values(parts).some((part) => part.kind === 'slidercontrol'), 'no frozen copy');
  assert.deepEqual(Object.keys(parts), ['Cutoff_track', 'Cutoff_value', 'Cutoff_cap', 'Cutoff_pointer', 'Cutoff_readout']);
  const bindings = layered.component._children.Bindings._children;
  assert.equal(bindings.Cutoff_pointerTurn.source, 'channel.Cutoff.normalized');
  assert.equal(bindings.Cutoff_pointerTurn.target, 'Parts.Cutoff_pointer.Layout.rotation');
  assert.equal(bindings.Cutoff_pointerTurn.outputMax - bindings.Cutoff_pointerTurn.outputMin, 270, 'turns through the knob\'s sweep');
  assert.equal(bindings.Cutoff_valueSweep.target, 'Parts.Cutoff_value.meta.arcTrack.sweepAngle');
  assert.equal(bindings.Cutoff_readoutText.source, 'channel.Cutoff.display');
  const behaviour = layered.component._children.Behaviors._children.Cutoff;
  assert.equal(behaviour.geometry, 'circular');
  assert.equal(behaviour.startAngle, 225, 'the designer counts from 12 o\'clock');
  // The channel prints as the knob's readout did: no unit twice.
  assert.equal(layered.component._children.ValueChannels._children.Cutoff.format.suffix, '');
  // Its interaction states, on the layers its parts became.
  const states = layered.component._children.States._children;
  assert.ok(states.CutoffDragging.patches.parts.Cutoff_value['meta.arcTrack.colour'], 'an arc keeps its colour in meta');
  const exact = plan([knob()], 'graphite', 'part');
  assert.equal(Object.values(exact.component._children.Parts._children)[0].kind, 'slidercontrol');
});

test('colours keep the set\'s colour roles, so the component follows the panel\'s set', () => {
  const layered = plan([knob()]);
  const parts = layered.component._children.Parts._children;
  assert.match(parts.Cutoff_value.meta.arcTrack.colour, /^\{.+\}$/, 'the value arc names a role');
});

test('a knob a layer cannot draw yet comes in as one exact part, named with the reason', () => {
  // Soft's cap turns under a fixed light; Atlas is drawn in a control form, not parts.
  for (const [setId, words] of [['soft', 'turns under a fixed light'], ['atlas', 'control form']]) {
    const result = plan([knob()], setId);
    assert.ok(result.ok, setId);
    assert.equal(result.asParts.length, 1);
    assert.match(result.asParts[0].reason, new RegExp(words));
    assert.equal(Object.values(result.component._children.Parts._children)[0].kind, 'slidercontrol');
  }
});

test('every built-in set\'s knob either converts or names why not', () => {
  for (const set of BUILT_IN_CONTROL_SETS) {
    const resolved = resolveControlForSet(createControl('Knob'), set);
    const why = valueLayersRefusal(resolved);
    assert.equal(typeof why, 'string', set.id);
    if (why) assert.ok(why.length > 10, `${set.id}: ${why}`);
  }
});

test('ticks, engraved and lit, turn about the knob\'s centre', () => {
  const result = plan([knob()], 'machined');
  const ticks = Object.values(result.component._children.Parts._children).filter((part) => /_tick\d+$/.test(part.name));
  assert.ok(ticks.length > 5);
  const at = (layout, axis, size, pivot) => (layout[axis] + layout[size] * layout[pivot] / 100).toFixed(1);
  const pivots = new Set(ticks.map(({ _children: { Layout: l } }) => `${at(l, 'x', 'width', 'pivotX')},${at(l, 'y', 'height', 'pivotY')}`));
  assert.equal(pivots.size, 1, 'one centre');
  assert.ok(Object.values(result.component._children.Bindings._children).some((binding) => /_tick\d+Lit$/.test(binding.name)), 'lit up to the value');
});

test('a slider comes in as a track, a fill that grows, and a cap that moves along it', () => {
  const slider = createControl('Slider', { Core: { id: 's1', name: 'Drive' }, Transform: { x: 10, y: 10, width: 240, height: 70 } });
  const result = plan([slider]);
  assert.ok(result.ok);
  const parts = result.component._children.Parts._children;
  assert.ok(parts.Drive_track && parts.Drive_value && parts.Drive_cap);
  const bindings = result.component._children.Bindings._children;
  assert.equal(bindings.Drive_valueLength.target, 'Parts.Drive_value.Layout.width');
  assert.equal(bindings.Drive_capMove.target, 'Parts.Drive_cap.Layout.offsetX');
  assert.ok(bindings.Drive_capMove.outputMax > 100, 'the length of the track');
  const zone = result.component._children.HitZones._children.DriveZone.bounds;
  assert.ok(zone.width < 100 && zone.x > 0, 'dragged along the track, not the whole box');
  assert.equal(result.component._children.Behaviors._children.Drive.geometry, 'linear');
});

test('the window offers layers or one exact part, and names what stays one part', () => {
  const read = (path) => readFileSync(new URL(`../src/CE_Application/${path}`, import.meta.url), 'utf8');
  const dialog = read('layout/ComponentFromSelectionDialog.svelte');
  for (const words of ['Create Component from Selection', 'Knobs and sliders', 'As layers', 'As one exact part', 'comes in as one exact part:', 'data-testid="as-one-part"']) {
    assert.ok(dialog.includes(words), words);
  }
  assert.match(read('stores/componentFromSelectionActions.js'), /componentFromSelectionRequest\.set\(\{ panelId, ids, suggestion/);
  assert.match(readFileSync(new URL('../src/App.svelte', import.meta.url), 'utf8'), /<ComponentFromSelectionDialog \/>/);
});
