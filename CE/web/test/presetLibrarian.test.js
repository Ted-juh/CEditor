// presetLibrarian.test.js — the persisted librarian half of the preset story: capture a scan into a
// named bank, rename/organize, ROM-write blocking from the profile's slot map, recall compilation,
// and JSON / .syx export-import. The data-model half is presetModel.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  presetLibrary,
  createLibraryBank,
  renameLibraryBank,
  removeLibraryBank,
  captureScanToLibrary,
  renameLibraryEntry,
  removeLibraryEntry,
  attachEntryData,
  canWriteSlot,
  recallPreset,
  sendEntryToDevice,
  exportLibraryBankJson,
  importLibraryBankJson,
  exportLibraryBankSyx,
  displayNameForSlot,
} from '../src/CE_Application/stores/presetLibrarian.js';

const PROFILE = {
  id: 'probe',
  variables: { deviceId: 0x10, channel: 1 },
  presets: {
    banks: [
      { id: 'factory', role: 'factory', startSlot: 0, slotCount: 4, names: ['Cat A', 'Cat B'] },
      { id: 'user', role: 'user', startSlot: 4, slotCount: 4, programBase: 4 },
    ],
    recall: { kind: 'pc' },
  },
};

const SCAN = {
  entries: [
    { slot: 4, status: 'complete', name: 'Warm Pad' },
    { slot: 5, status: 'complete', name: 'Solo Lead', dumpCollection: { messages: [{ hex: 'F0 7D 10 01 40 02 43 F7' }] } },
    { slot: 6, status: 'timeout', name: '' }, // nothing resolved — not captured
  ],
};

function reset() {
  presetLibrary.set({});
}

test('capture a scan into a bank: named slots land, dump hex is kept, unnamed slots are skipped', () => {
  reset();
  const result = captureScanToLibrary('probe', SCAN, { label: 'First scan' });
  assert.equal(result.ok, true);
  assert.equal(result.captured, 2);
  const bank = get(presetLibrary).probe.banks[0];
  assert.equal(bank.label, 'First scan');
  assert.deepEqual(bank.entries.map((e) => e.slot), [4, 5]);
  assert.equal(bank.entries[0].source, 'scan');
  assert.equal(bank.entries[1].source, 'dump');
  assert.equal(bank.entries[1].hex, 'F0 7D 10 01 40 02 43 F7');
});

test('re-capturing into the same bank updates entries instead of duplicating', () => {
  reset();
  const first = captureScanToLibrary('probe', SCAN, { label: 'Scan' });
  const second = captureScanToLibrary('probe', {
    entries: [{ slot: 4, status: 'complete', name: 'Warm Pad v2' }],
  }, { bankId: first.bankId });
  assert.equal(second.bankId, first.bankId);
  const bank = get(presetLibrary).probe.banks[0];
  assert.equal(bank.entries.length, 2);
  assert.equal(bank.entries.find((e) => e.slot === 4).name, 'Warm Pad v2');
});

test('bank and entry management: create, rename, attach data, remove', () => {
  reset();
  const bankId = createLibraryBank('probe', { label: 'My sounds' });
  renameLibraryBank('probe', bankId, 'Stage sounds');
  captureScanToLibrary('probe', SCAN, { bankId });
  renameLibraryEntry('probe', bankId, 4, 'Warmest Pad');
  attachEntryData('probe', bankId, 4, 'F0 7D 10 01 00 00 00 F7');
  removeLibraryEntry('probe', bankId, 5);

  const bank = get(presetLibrary).probe.banks[0];
  assert.equal(bank.label, 'Stage sounds');
  assert.deepEqual(bank.entries.map((e) => e.slot), [4]);
  assert.equal(bank.entries[0].name, 'Warmest Pad');
  assert.equal(bank.entries[0].source, 'dump');

  removeLibraryBank('probe', bankId);
  assert.equal(get(presetLibrary).probe, undefined);
});

test('the slot map gates writes: ROM slots are blocked, user slots pass, unmapped slots are rejected', () => {
  assert.equal(canWriteSlot(PROFILE, 1).ok, false);
  assert.match(canWriteSlot(PROFILE, 1).error, /read-only/);
  assert.equal(canWriteSlot(PROFILE, 5).ok, true);
  assert.match(canWriteSlot(PROFILE, 99).error, /not inside any preset bank/);
});

test('sendEntryToDevice refuses ROM targets and entries without captured data', () => {
  reset();
  const entry = { slot: 5, name: 'Solo Lead', hex: 'F0 7D 10 01 40 02 43 F7' };
  const blocked = sendEntryToDevice(PROFILE, entry, { slot: 1 });
  assert.equal(blocked.blocked, true);

  const nameOnly = sendEntryToDevice(PROFILE, { slot: 5, name: 'No data', hex: '' });
  assert.match(nameOnly.error, /no captured patch data/);

  const ok = sendEntryToDevice(PROFILE, entry, { dryRun: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.slot, 5);
});

test('recallPreset compiles without the bridge and reports a local dry run', () => {
  const result = recallPreset(PROFILE, { slot: 5 });
  assert.equal(result.ok, true);
  assert.equal(result.local, true);
  assert.equal(result.sent, false);
  assert.deepEqual(result.messages.map((m) => m.hex), ['C0 05']);
});

test('JSON export round-trips through import with a fresh bank id', () => {
  reset();
  const { bankId } = captureScanToLibrary('probe', SCAN, { label: 'Exported' });
  const payload = exportLibraryBankJson('probe', bankId);
  assert.equal(payload.kind, 'ceditor-preset-bank');

  const imported = importLibraryBankJson('probe', structuredClone(payload));
  assert.equal(imported.ok, true);
  assert.notEqual(imported.bankId, bankId);
  const banks = get(presetLibrary).probe.banks;
  assert.equal(banks.length, 2);
  assert.deepEqual(banks[1].entries.map((e) => e.slot), [4, 5]);

  assert.equal(importLibraryBankJson('probe', { kind: 'other' }).ok, false);
});

test('.syx export concatenates captured dump bytes and rejects empty banks', () => {
  reset();
  const { bankId } = captureScanToLibrary('probe', SCAN, {});
  const syx = exportLibraryBankSyx('probe', bankId);
  assert.equal(syx.ok, true);
  assert.equal(syx.messages, 1);
  assert.equal(syx.bytes[0], 0xf0);
  assert.equal(syx.bytes.at(-1), 0xf7);

  const emptyId = createLibraryBank('probe', {});
  assert.match(exportLibraryBankSyx('probe', emptyId).error, /No captured patch data/);
});

test('displayNameForSlot precedence: library > scan > shipped catalog', () => {
  reset();
  const { bankId } = captureScanToLibrary('probe', SCAN, {});
  const bank = get(presetLibrary).probe.banks.find((b) => b.id === bankId);
  renameLibraryEntry('probe', bankId, 4, 'My Warm Pad');
  const renamed = get(presetLibrary).probe.banks.find((b) => b.id === bankId);

  assert.deepEqual(displayNameForSlot(PROFILE, 4, { scan: SCAN, bank: renamed }), { name: 'My Warm Pad', source: 'library' });
  assert.deepEqual(displayNameForSlot(PROFILE, 5, { scan: SCAN, bank: null }), { name: 'Solo Lead', source: 'scan' });
  assert.deepEqual(displayNameForSlot(PROFILE, 0, { scan: SCAN, bank }), { name: 'Cat A', source: 'catalog' });
  assert.deepEqual(displayNameForSlot(PROFILE, 3, {}), { name: '', source: 'none' });
});
