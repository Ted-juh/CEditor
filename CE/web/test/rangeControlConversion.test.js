// Change to Slider / Change to Knob: a Knob and a Slider are one engine with one set of parts, and
// the type is what the control set reads to draw them, so changing between them is changing the type.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { anatomyOptions } from '../src/CE_Application/models/controlAnatomy.js';
import { createPanel } from '../src/CE_Application/stores/panelModel.js';
import { panels, activePanelId, setActiveEditorTab } from '../src/CE_Application/stores/panels.js';
import { addControl, convertRangeControlType } from '../src/CE_Application/stores/controls.js';
import { convertRangeControl, rangeConversionTarget } from '../src/CE_Application/utils/rangeControlConversion.js';

function knob() {
  const control = createControl('Knob', { name: 'Cutoff' });
  Object.assign(control._children.Transform, { x: 100, y: 50, width: 100, height: 100 });
  Object.assign(control._children.Behavior, { min: -64, max: 63, defaultCurrentValue: 12, direction: 'ccw' });
  control._children.DeviceBindings.bindings = [{ kind: 'deviceParameter', parameterId: 'filter.cutoff', port: 'value' }];
  control._children.Core.controlForm = anatomyOptions('Knob')[1]?.[0] ?? '';
  return control;
}

test('a knob becomes a slider: the type, a line, a slider\'s size centred where it was, and the rest kept', () => {
  const before = knob();
  const after = convertRangeControl(before);
  const { Core, Behavior, Transform, DeviceBindings } = after._children;
  assert.equal(Core.controlType, 'Slider');
  assert.equal(Core.name, 'Cutoff');
  assert.equal(Core.id, before._children.Core.id);
  assert.deepEqual([Behavior.geometry, Behavior.orientation, Behavior.direction], ['linear', 'horizontal', 'rtl'], 'anticlockwise becomes right to left');
  assert.deepEqual([Behavior.min, Behavior.max, Behavior.defaultCurrentValue], [-64, 63, 12]);
  assert.deepEqual(DeviceBindings.bindings, before._children.DeviceBindings.bindings);
  assert.deepEqual([Transform.width, Transform.height], [220, 48]);
  assert.deepEqual([Transform.x + Transform.width / 2, Transform.y + Transform.height / 2], [150, 100], 'centred where it was');
  assert.equal(Core.controlForm, anatomyOptions('Slider')[1]?.[0] ?? '', 'the same form of a slider');
  assert.equal(before._children.Core.controlType, 'Knob', 'the original is not touched');
});

test('and back: a slider becomes a knob, circular and square', () => {
  const after = convertRangeControl(convertRangeControl(knob()));
  const { Core, Behavior, Transform } = after._children;
  assert.equal(Core.controlType, 'Knob');
  assert.deepEqual([Behavior.geometry, Behavior.direction], ['circular', 'ccw']);
  assert.deepEqual([Transform.width, Transform.height, Transform.x, Transform.y], [100, 100, 100, 50], 'back where it started');
  assert.equal(rangeConversionTarget(after), 'Slider');
  assert.equal(convertRangeControl(createControl('Button')), null, 'only a knob or a slider');
});

test('on a panel it is one change, in place', () => {
  const panel = createPanel('P');
  panels.set([panel]);
  activePanelId.set(panel.id);
  setActiveEditorTab({ type: 'panel', id: panel.id });
  const made = addControl('Knob');
  const id = made._children.Core.id;
  convertRangeControlType(id);
  const list = get(panels)[0].controls;
  assert.equal(list.length, 1);
  assert.equal(list[0]._children.Core.id, id);
  assert.equal(list[0]._children.Core.controlType, 'Slider');
});
