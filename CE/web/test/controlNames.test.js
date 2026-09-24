// controlNames.test.js — a control name never contains a dot.
//
// A script path is `name.property` and both runtimes end the name at the first dot, so a control
// named `tone1.lfo.rate` was unreachable by name — and once the GAIA was sectioned, the path
// `tone1.lfo.rate.value` found the `tone1` GROUP instead. Names lose their dots wherever they are
// made, and a document saved before that is converted, with everything that refers to a control
// by name, when it is opened.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { migrateDottedControlNames, sanitizeControlName } from '../src/CE_Application/utils/controlNames.js';
import { uniqueControlName } from '../src/CE_Application/stores/controls.js';
import { uniqueCopyName } from '../src/CE_Application/utils/containment.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';

function knob(id, name, extra = {}) {
  const control = createControl('Knob', { Core: { id, name } });
  Object.assign(control._children, extra);
  return control;
}

function group(id, name, children) {
  const control = createControl('Container', { Core: { id, name } });
  control._children.Children = { _children: Object.fromEntries(children.map((c) => [c._children.Core.id, c])) };
  return control;
}

test('a name loses its dots and nothing else', () => {
  assert.equal(sanitizeControlName('tone1.lfo.rate'), 'tone1_lfo_rate');
  assert.equal(sanitizeControlName('Filter Cutoff'), 'Filter Cutoff');
  assert.equal(sanitizeControlName(''), '');
});

test('every gate that makes a name applies the rule', () => {
  assert.equal(uniqueControlName(new Set(), 'tone1.lfo.rate'), 'tone1_lfo_rate', 'rename');
  assert.equal(uniqueControlName(new Set(['a_b']), 'a.b'), 'a_b_2', 'rename still uniquifies');
  assert.equal(uniqueCopyName(new Set(), 'tone1.lfo.rate'), 'tone1_lfo_rate_copy', 'duplicate / paste');
});

test('a panel with no dotted name comes back untouched', () => {
  const panel = { controls: [knob('k', 'cutoff')] };
  assert.equal(migrateDottedControlNames(panel), panel);
});

test('names and every reference by name are converted together; device addresses are not', () => {
  const rate = knob('k1', 'tone1.lfo.rate', {
    DeviceBindings: { enabled: true, bindings: [{ kind: 'deviceParameter', port: 'value', parameterId: 'tone1.lfo.rate' }] },
    Scripts: { enabled: true, scripts: [{ id: 's1', target: 'tone1.lfo.rate', source: "get('tone1.lfo.rate.value')" }] },
  });
  // A group whose name is the first segment of the knob's: the path must go to the knob.
  const tone = group('g1', 'tone1', [rate]);
  const lcd = createControl('LcdDisplay', { Core: { id: 'lcd', name: 'screen' } });
  lcd._children.Display = { ...lcd._children.Display, layouts: [{ id: 'L', zones: [{ id: 'z', press: { set: 'tone1.lfo.rate', to: 3 } }] }] };
  const setlist = createControl('Setlist', { Core: { id: 'set', name: 'songs' } });
  setlist._children.Setlist = { ...setlist._children.Setlist, capturePaths: ['tone1.lfo.rate.Value.value', 'tone1.Core.visible'], scenes: [{ id: 'a', values: { 'tone1.lfo.rate.Value.value': 64 } }] };

  const panel = {
    controls: [tone, lcd, setlist],
    scripts: [{ id: 'p1', target: 'tone1.lfo.rate', source: 'x' }],
    exportParameters: [{ id: 'tone1.lfo.rate.value', path: 'tone1.lfo.rate.value', controlName: 'tone1.lfo.rate', label: 'tone1.lfo.rate', deviceParameterId: 'tone1.lfo.rate' }],
    snapshots: [{ id: 'snap', values: { 'tone1.lfo.rate.value': 10 } }],
  };
  const next = migrateDottedControlNames(panel);
  const nextRate = next.controls[0]._children.Children._children.k1;

  assert.equal(nextRate._children.Core.name, 'tone1_lfo_rate');
  assert.equal(next.controls[0]._children.Core.name, 'tone1', 'a dot-free name is left alone');
  assert.equal(nextRate._children.DeviceBindings.bindings[0].parameterId, 'tone1.lfo.rate', 'a device address was rewritten');
  assert.equal(nextRate._children.Scripts.scripts[0].target, 'tone1_lfo_rate');
  assert.equal(nextRate._children.Scripts.scripts[0].source, "get('tone1.lfo.rate.value')", 'script source is never rewritten');
  assert.equal(next.scripts[0].target, 'tone1_lfo_rate');
  assert.equal(next.controls[1]._children.Display.layouts[0].zones[0].press.set, 'tone1_lfo_rate');
  assert.deepEqual(next.controls[2]._children.Setlist.capturePaths, ['tone1_lfo_rate.Value.value', 'tone1.Core.visible'],
    'the longest name that fits wins, and a path to the group itself is left alone');
  assert.deepEqual(next.controls[2]._children.Setlist.scenes[0].values, { 'tone1_lfo_rate.Value.value': 64 });
  assert.deepEqual(next.exportParameters[0], {
    id: 'tone1_lfo_rate.value', path: 'tone1_lfo_rate.value', controlName: 'tone1_lfo_rate', label: 'tone1_lfo_rate', deviceParameterId: 'tone1.lfo.rate',
  });
  assert.deepEqual(next.snapshots[0].values, { 'tone1_lfo_rate.value': 10 });
  assert.equal(panel.controls[0]._children.Children._children.k1._children.Core.name, 'tone1.lfo.rate', 'the input was mutated');
});

test('a converted name may be its own id, never another control\'s name or id', () => {
  const next = migrateDottedControlNames({ controls: [
    knob('env_view', 'env.view'),                 // becomes its own id: fine
    knob('a_b', 'something'),                     // holds a_b as an id
    knob('k2', 'a.b'),                            // cannot take a_b
    knob('k3', 'c_d'), knob('k4', 'c.d'),         // cannot take another control's name
  ] });
  assert.deepEqual(next.controls.map((c) => c._children.Core.name), ['env_view', 'something', 'a_b_2', 'c_d', 'c_d_2']);
});

test('opening a document with dotted names converts it and marks it modified', () => {
  const json = JSON.stringify({ name: 'Old', controls: [knob('k', 'osc.pitch')] });
  const panel = deserializePanel(json, null, 'Old');
  assert.equal(panel.controls[0]._children.Core.name, 'osc_pitch');
  assert.equal(panel.modified, true, 'what is open is no longer what is on disk');

  const clean = deserializePanel(JSON.stringify({ name: 'New', controls: [knob('k', 'osc_pitch')] }), null, 'New');
  assert.equal(clean.modified, false);
});
