// presetChoiceRows.test.js — preset model/scan -> selector rows (the choiceSource feature):
// factoryCatalog vs devicePresets sources, name precedence, bank headers, ROM badges, the
// row->slot mapping recall uses, and the Player's wholesale panel injection.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPresetChoiceRows,
  presetRowSlot,
  injectPresetRowsIntoPanel,
} from '../src/CE_Application/utils/presetChoiceRows.js';
import { listboxRows } from '../src/CE_Application/utils/listboxLayout.js';

const PROFILE = {
  id: 'probe',
  presets: {
    banks: [
      { id: 'factory', label: 'Factory', role: 'factory', startSlot: 0, slotCount: 3, names: ['Grand', 'Whirly'] },
      { id: 'user', label: 'User', role: 'user', startSlot: 3, slotCount: 2 },
    ],
    recall: { kind: 'pc' },
  },
};

const SCAN = { entries: [{ slot: 3, name: 'My Pad' }, { slot: 4, name: '' }] };

test('factoryCatalog: only cataloged banks, only named slots, ROM badge on read-only banks', () => {
  const rows = buildPresetChoiceRows(PROFILE, { source: 'factoryCatalog' });
  // one eligible bank -> no header; slot 2 has no catalog name -> dropped
  assert.deepEqual(rows.map((r) => [r.id, r.displayText, r.badge]), [
    ['slot_0', 'Grand', 'ROM'],
    ['slot_1', 'Whirly', 'ROM'],
  ]);
});

test('devicePresets: every mapped slot; scan beats catalog beats "Slot N"; headers between banks', () => {
  const rows = buildPresetChoiceRows(PROFILE, { source: 'devicePresets', scan: SCAN });
  assert.deepEqual(rows.map((r) => [r.id, r.displayText, r.isHeader === true]), [
    ['bank_factory', 'Factory', true],
    ['slot_0', 'Grand', false],
    ['slot_1', 'Whirly', false],
    ['slot_2', 'Slot 2', false],
    ['bank_user', 'User', true],
    ['slot_3', 'My Pad', false],
    ['slot_4', 'Slot 4', false],
  ]);
  // sendValue carries the device slot for recall
  assert.equal(rows.find((r) => r.id === 'slot_3').sendValue, 3);
});

test('devicePresets without a slot map lists the scan entries themselves', () => {
  const rows = buildPresetChoiceRows({ id: 'p', presets: { recall: { kind: 'pc' } } }, { source: 'devicePresets', scan: SCAN });
  assert.deepEqual(rows.map((r) => [r.id, r.displayText]), [['slot_3', 'My Pad']]);
});

test('presetRowSlot: slot rows map to their slot; headers and authored rows do not', () => {
  const rows = buildPresetChoiceRows(PROFILE, { source: 'devicePresets' });
  assert.equal(presetRowSlot(rows.find((r) => r.id === 'slot_4')), 4);
  assert.equal(presetRowSlot(rows.find((r) => r.isHeader)), null);
  assert.equal(presetRowSlot({ id: 'option_1', sendValue: 2 }), null);
});

function listboxControl(choiceSource, id = 'lb1') {
  return {
    _children: {
      Core: { id, controlType: 'Listbox' },
      Listbox: { choiceSource },
      Value: { rows: [{ id: 'option_1', displayText: 'Authored', internalValue: 'option_1', sendValue: 0 }] },
    },
  };
}

test('injectPresetRowsIntoPanel fills preset-sourced listboxes (nested included) and is stable on re-run', () => {
  const nested = listboxControl('factoryCatalog', 'lb2');
  const panel = {
    controls: [
      listboxControl('devicePresets', 'lb1'),
      { _children: { Core: { id: 'group1', controlType: 'Group' }, child_lb: nested } },
      listboxControl('rows', 'lb3'),
    ],
  };

  const first = injectPresetRowsIntoPanel(panel, PROFILE, SCAN);
  assert.equal(first.updated, 2);
  assert.notEqual(first.panel, panel);
  const lb1 = first.panel.controls[0]._children.Listbox;
  assert.equal(lb1._presetRows.length, 7);
  const lb2 = first.panel.controls[1]._children.child_lb._children.Listbox;
  assert.equal(lb2._presetRows.every((r) => r.badge === 'ROM'), true);
  // choiceSource 'rows' untouched
  assert.equal(first.panel.controls[2], panel.controls[2]);
  // the input panel was not mutated
  assert.equal(panel.controls[0]._children.Listbox._presetRows, undefined);

  // deep-equal rows -> same panel object back, nothing "updated"
  const second = injectPresetRowsIntoPanel(first.panel, PROFILE, SCAN);
  assert.equal(second.updated, 0);
  assert.equal(second.panel, first.panel);

  // a new scan name -> rows really change -> a new panel
  const third = injectPresetRowsIntoPanel(first.panel, PROFILE, { entries: [{ slot: 2, name: 'Found It' }] });
  assert.equal(third.updated, 1);
  assert.notEqual(third.panel, first.panel);
});

test('listboxRows serves injected preset rows for both preset sources, authored rows otherwise', () => {
  const control = listboxControl('factoryCatalog');
  assert.equal(listboxRows(control)[0].displayText, 'Authored'); // no rows injected yet -> fallback
  control._children.Listbox._presetRows = buildPresetChoiceRows(PROFILE, { source: 'factoryCatalog' });
  assert.equal(listboxRows(control)[0].displayText, 'Grand');
  control._children.Listbox.choiceSource = 'rows';
  assert.equal(listboxRows(control)[0].displayText, 'Authored');
});
