import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { expandControl, expandControls, shrinkControl } from '../src/CE_Application/stores/documentShape.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { repairGaiaNoteChoices } from '../src/CE_Application/utils/gaiaNoteChoiceMigration.js';
import { resolveDrawings } from '../src/CE_Application/stores/documentDrawings.js';

test('opening a legacy GAIA panel repairs all six note tables and preserves the rest of every control', () => {
  const source = readFileSync(new URL('../../panels/Roland GAIA SH-01.cepanel', import.meta.url), 'utf8');
  // Read raw, so the drawings the file writes once go back into their controls first, as opening does.
  const before = flatControls(resolveDrawings(JSON.parse(source)).doc.controls.map(expandControl));
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
    if (/^tone[123]_(lfo|modLfo)_tempoSyncNote$/.test(expected._children.Core.name)) {
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

test('repair copies the tables it changes: two controls with one legacy table share it, frozen', () => {
  // The GAIA panel in the tree is already repaired, so this is the case the repair exists for: an
  // old file, where the six note tables are equal and so one frozen array once loaded.
  const legacy = (name, parameterId) => {
    const control = createControl('Combobox');
    control._children.Core.name = name;
    control._children.DeviceBindings.bindings = [{ deviceRole: 'Roland GAIA SH-01', parameterId }];
    control._children.Value.rows = [
      { id: '12', internalValue: '12', displayText: '1/2', sendValue: 8 },
      { id: '16', internalValue: '16', displayText: '1/6', sendValue: 13 },
    ];
    return shrinkControl(control);
  };
  const controls = expandControls([legacy('a', 'tone1.lfo.tempoSyncNote'), legacy('b', 'tone2.lfo.tempoSyncNote')]);
  assert.equal(controls[0]._children.Value.rows, controls[1]._children.Value.rows);
  assert.ok(Object.isFrozen(controls[0]._children.Value.rows[0]));
  repairGaiaNoteChoices(controls);
  for (const control of controls) {
    assert.deepEqual(control._children.Value.rows.map(row => row.internalValue), ['12_8', '16_13']);
  }
});
