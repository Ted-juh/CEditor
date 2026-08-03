// presetChoiceSync.test.js — the store side of preset-sourced selectors: syncing
// Listbox._presetRows on the active panel, materializing rows into Value.rows (the Combobox
// path), and the recall-on-commit hook, all against the real panels/profile stores.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { panels, activePanelId } from '../src/CE_Application/stores/panels.js';
import { deviceRoleMappings, profileSources, latestPresetListScan } from '../src/CE_Application/stores/deviceProfileStores.js';
import {
  syncPresetChoiceRows,
  materializePresetRows,
  recallRowSlot,
  presetProfileForRole,
} from '../src/CE_Application/stores/presetChoiceSync.js';

const PROFILE = {
  id: 'probe',
  variables: { deviceId: 0x10, channel: 1 },
  presets: {
    banks: [
      { id: 'factory', label: 'Factory', role: 'factory', startSlot: 0, slotCount: 2, names: ['Grand', 'Whirly'] },
      { id: 'user', label: 'User', role: 'user', startSlot: 2, slotCount: 2 },
    ],
    recall: { kind: 'pc' },
  },
};

function listboxControl(id, choiceSource) {
  return {
    _children: {
      Core: { id, controlType: 'Listbox' },
      Behavior: { buttonType: 'listbox' },
      Listbox: { choiceSource },
      Value: { rows: [{ id: 'option_1', displayText: 'Authored', internalValue: 'option_1', sendValue: 0 }] },
    },
  };
}

function seed() {
  deviceRoleMappings.set({ mainSynth: { profileId: 'probe' } });
  profileSources.set({ probe: { source: JSON.stringify(PROFILE) } });
  latestPresetListScan.set({ deviceRole: 'mainSynth', running: false, entries: [{ slot: 2, name: 'My Pad' }] });
  panels.set([{ id: 7, name: 'P', controls: [listboxControl('lb1', 'devicePresets'), listboxControl('lb2', 'rows')] }]);
  activePanelId.set(7);
}

test('syncPresetChoiceRows writes _presetRows for preset-sourced listboxes on the active panel', () => {
  seed();
  const first = syncPresetChoiceRows({});
  assert.deepEqual(first, { updated: 1, targets: 1 });
  const controls = get(panels)[0].controls;
  const rows = controls[0]._children.Listbox._presetRows;
  assert.equal(rows.filter((r) => !r.isHeader).length, 4);
  assert.equal(rows.find((r) => r.id === 'slot_2').displayText, 'My Pad'); // scan name won
  assert.equal(controls[1]._children.Listbox._presetRows, undefined);      // 'rows' source untouched
  // unchanged rows -> no patch churn
  assert.deepEqual(syncPresetChoiceRows({}), { updated: 0, targets: 1 });
});

test('materializePresetRows replaces Value.rows (the Combobox snapshot path)', () => {
  seed();
  const result = materializePresetRows('lb2', 'factoryCatalog', {});
  assert.deepEqual(result, { ok: true, error: '', rows: 2 });
  const rows = get(panels)[0].controls[1]._children.Value.rows;
  assert.deepEqual(rows.map((r) => r.displayText), ['Grand', 'Whirly']);

  profileSources.set({ probe: { source: JSON.stringify({ id: 'probe' }) } });
  assert.match(materializePresetRows('lb2', 'devicePresets', {}).error, /no preset model/);
});

test('recallRowSlot compiles the recall for preset rows and skips authored rows', () => {
  seed();
  const sent = recallRowSlot({ id: 'slot_3', sendValue: 3, isHeader: false });
  assert.equal(sent.ok, true);
  // slot 3 = user bank (startSlot 2, programBase 0) -> program 1, channel 1
  assert.deepEqual(sent.messages.map((m) => m.hex), ['C0 01']);
  assert.equal(recallRowSlot({ id: 'option_1', sendValue: 1 }).skipped, true);
});

test('presetProfileForRole parses the mapped source and tolerates absence', () => {
  seed();
  assert.equal(presetProfileForRole('mainSynth').id, 'probe');
  deviceRoleMappings.set({});
  assert.equal(presetProfileForRole('mainSynth'), null);
});
