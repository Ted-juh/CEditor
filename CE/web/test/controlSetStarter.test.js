import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTER_CONTROL_SETS } from '../src/CE_Application/models/controlSetCoverage.js';
import { createControlSetStarter } from '../src/CE_Application/models/controlSetStarter.js';
import { getControlSet } from '../src/CE_Application/models/controlSets.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { resolveControlForSet, readControlPath } from '../src/CE_Application/models/controlSetFamilies.js';
import { shrinkControl, expandControl } from '../src/CE_Application/stores/documentShape.js';
import { serializePanel, deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { sceneryMarkupKey } from '../src/CE_Application/utils/sceneryMarkupCache.js';

test('twelve editable starters round-trip with portable design pins and finite bounds', () => {
  assert.equal(STARTER_CONTROL_SETS.length, 12);
  for (const { id } of STARTER_CONTROL_SETS) {
    const panel = createControlSetStarter(id);
    const restored = deserializePanel(serializePanel(panel));
    assert.equal(restored.controls.length, panel.controls.length);
    for (const c of restored.controls) {
      assert.equal(c._children.Core.controlSetId, id);
      const t = c._children.Transform;
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.width <= panel.width && t.y + t.height <= panel.height);
    }
    const slider = restored.controls.find(c => c._children.Core.controlType === 'Slider');
    assert.deepEqual(slider._children.Parts, panel.controls.find(c => c._children.Core.controlType === 'Slider')._children.Parts);
  }
});

test('mixed controls retain shapes after copy/save, and edits override the pinned design', () => {
  for (const [id, shape] of [['console', 'console'], ['machined', 'block'], ['blueprint', 'ring']]) {
    const source = createControl('Slider', { Core: { controlSetId: id } });
    const copied = expandControl(shrinkControl(source));
    const drawn = resolveControlForSet(copied, getControlSet('pop'));
    assert.equal(drawn._children.Parts._children.pointerCurrent.kind, shape);
    copied._children.Parts._children.pointerCurrent._children.Layout.width = 61;
    assert.equal(resolveControlForSet(copied, getControlSet('pop'))._children.Parts._children.pointerCurrent._children.Layout.width, 61);
    assert.equal(copied._children.Behavior.defaultCurrentValue, source._children.Behavior.defaultCurrentValue);
  }
});

test('extended design paths target existing editable fields without changing musical configuration', () => {
  const structural = new Set();
  for (const { id } of STARTER_CONTROL_SETS.filter(s => s.id !== 'graphite')) {
    const set = getControlSet(id);
    for (const type of ['CyclicButton', 'TimedButton', 'OneShotButton', 'RadioButtonGroup', 'TextInput', 'Listbox', 'Group', 'Container', 'TabContainer', 'ScrollArea', 'Meter', 'ProgressBar', 'Ribbon', 'PitchWheel', 'ModWheel', 'Crossfader', 'DrumPads', 'Numpad', 'Matrix', 'Envelope', 'VectorJoystick']) {
      const raw = createControl(type);
      for (const path of Object.keys(set.families[type].component)) {
        if (/^(Background|Effects|Text|ContentLayout|States)\./.test(path)) continue;
        assert.notEqual(readControlPath(raw, path), undefined, `${id} ${type}: ${path} exists in the editor model`);
        assert.ok(!/\.(value|mix|channel|editable|returnMode|rows|cols|points|amounts)$/.test(path), `${path} must not change behavior`);
      }
      const resolved = resolveControlForSet(raw, set);
      if (type === 'DrumPads') structural.add(resolved._children.DrumPads.padAppearance);
    }
  }
  assert.equal(structural.size, 5);
});

test('cached scenery changes when the design or its palette changes', () => {
  const label = createControl('Label');
  const a = sceneryMarkupKey(label, { controlSet: getControlSet('blueprint') });
  const b = sceneryMarkupKey(label, { controlSet: getControlSet('machined') });
  assert.notEqual(a, b);
  const edited = structuredClone(getControlSet('blueprint'));
  edited.tokens['text.primary'] = 'FFFF0000';
  assert.notEqual(a, sceneryMarkupKey(label, { controlSet: edited }));
});
