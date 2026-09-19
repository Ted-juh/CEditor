import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { repairGaiaNoteChoices } from '../src/CE_Application/utils/gaiaNoteChoiceMigration.js';

test('opening a legacy GAIA panel repairs all six note tables and preserves the rest of every control', () => {
  const source = readFileSync(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8');
  const before = flatControls(JSON.parse(source).controls.map(expandControl));
  const panel = deserializePanel(source, 'gaia.cepanel', 'gaia');
  const after = flatControls(panel.controls);
  assert.equal(after.length, before.length);
  let repaired = 0;
  for (let i = 0; i < before.length; i++) {
    const expected = structuredClone(before[i]);
    // Compare each control independently, including every layout/style/binding field.
    delete expected._children.Children;
    const actual = structuredClone(after[i]);
    delete actual._children.Children;
    if (/^tone[123]\.(lfo|modLfo)\.tempoSyncNote$/.test(expected._children.Core.name)) {
      repaired++;
      for (const [label, id] of [['1/2', '12_8'], ['1/6', '16_13']]) {
        const row = expected._children.Value.rows.find(row => row.displayText === label);
        row.id = row.internalValue = id;
        row.selectedByDefault = String(expected._children.Behavior.defaultValue) === id;
      }
      assert.equal(new Set(actual._children.Value.rows.map(row => row.internalValue)).size, 20);
    }
    assert.deepEqual(actual, expected, expected._children.Core.name);
  }
  assert.equal(repaired, 6);
  const once = structuredClone(panel.controls);
  repairGaiaNoteChoices(panel.controls);
  assert.deepEqual(panel.controls, once, 'repair is idempotent');
});

test('repair leaves other devices, custom labels and custom IDs alone', () => {
  for (const change of [
    c => c._children.DeviceBindings.bindings[0].deviceRole = 'Other synth',
    c => c._children.Value.rows[0].displayText = 'Custom note',
    c => c._children.Value.rows[0].id = 'custom',
  ]) {
    const control = { _children: { Core: { id: 'test' },
      DeviceBindings: { bindings: [{ deviceRole: 'Roland GAIA SH-01', parameterId: 'tone1.lfo.tempoSyncNote' }] },
      Value: { rows: [{ id: '12', internalValue: '12', displayText: '1/2', sendValue: 8 }] },
    } };
    change(control);
    const before = structuredClone(control);
    repairGaiaNoteChoices([control]);
    assert.deepEqual(control, before);
  }
});
