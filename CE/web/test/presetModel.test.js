// presetModel.test.js — the structured preset model (profile.presets): what a slot IS (bank,
// factory vs user, writable, catalog name), how to RECALL it (pc / bankPc / sysex), and how the
// model flows DPD schema -> legacy engine profile -> local engine scan/recall. This is the data-model
// half of the librarian; presetLibrarian.test.js covers the persisted-library half.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  localBuildPresetListScan,
  localCompilePresetRecall,
  presetBankForSlot,
  presetModelSlots,
  presetSlotInfo,
  validateLocalProfileSource,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { validateProfile } from '../src/CE_Application/generated/dpd/validate.mjs';
import { buildLegacyProfile } from '../src/CE_Application/generated/dpd/emit-legacy-core.mjs';

const PRESETS = {
  banks: [
    { id: 'factory-a', label: 'Preset A', role: 'factory', startSlot: 0, slotCount: 64, programBase: 0, bankMsb: 87, bankLsb: 0, names: ['Grand Piano', 'Whirly'] },
    { id: 'user', label: 'User', role: 'user', startSlot: 64, slotCount: 64, programBase: 0, bankMsb: 87, bankLsb: 1 },
  ],
  recall: { kind: 'bankPc' },
  nameRequest: { request: 'requestPresetName', slotVariable: 'slot' },
  initPatch: { bank: 'factory-a', slot: 0 },
};

function profileWith(presets, extra = {}) {
  return {
    id: 'probe',
    variables: { deviceId: 0x10, channel: 3 },
    parameters: [{ id: 'p', type: 'integer', encoding: { type: 'u7' }, messageRecipe: 'sx' }],
    messageRecipes: [{ id: 'sx', kind: 'sysex', template: ['F0', '7D', '$deviceId', '$address', '$encodedValue', 'F7'] }],
    requests: [{ id: 'requestPresetName', kind: 'sysex', template: ['F0', '7D', '$deviceId', '02', '$slot', 'F7'] }],
    presets,
    ...extra,
  };
}

// ── slot map: what a slot IS ──

test('presetSlotInfo resolves bank, role, writability, program and catalog name', () => {
  const profile = profileWith(PRESETS);

  const factory = presetSlotInfo(profile, 1);
  assert.equal(factory.bankId, 'factory-a');
  assert.equal(factory.role, 'factory');
  assert.equal(factory.writable, false); // role=factory defaults to read-only ROM
  assert.equal(factory.program, 1);
  assert.equal(factory.catalogName, 'Whirly');

  const user = presetSlotInfo(profile, 70);
  assert.equal(user.bankId, 'user');
  assert.equal(user.writable, true);
  assert.equal(user.program, 6); // programBase 0 + (70 - 64)
  assert.equal(user.catalogName, '');
});

test('an explicit writable flag overrides the role default', () => {
  const presets = { banks: [{ id: 'rom-but-writable', role: 'factory', writable: true, startSlot: 0, slotCount: 4 }] };
  assert.equal(presetSlotInfo({ presets }, 2).writable, true);
});

test('a slot outside every bank reports inBank false; helpers enumerate the map', () => {
  const profile = profileWith(PRESETS);
  assert.equal(presetSlotInfo(profile, 999).inBank, false);
  assert.equal(presetBankForSlot(PRESETS, 63).id, 'factory-a');
  assert.equal(presetBankForSlot(PRESETS, 64).id, 'user');
  const slots = presetModelSlots(PRESETS);
  assert.equal(slots.length, 128);
  assert.equal(slots[0], 0);
  assert.equal(slots.at(-1), 127);
});

// ── recall: pc / bankPc / sysex ──

test('pc recall compiles a single Program Change on the recall channel', () => {
  const profile = profileWith({ ...PRESETS, recall: { kind: 'pc', channel: 5 } });
  const result = localCompilePresetRecall(profile, { slot: 65 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages.map((m) => m.hex), ['C4 01']);
  assert.equal(result.program, 1);
});

test('bankPc recall emits CC0 + CC32 + PC as SEPARATE messages (one MIDI message per send)', () => {
  const profile = profileWith(PRESETS); // channel 3 from profile variables
  const result = localCompilePresetRecall(profile, { slot: 70 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages.map((m) => m.hex), ['B2 00 57', 'B2 20 01', 'C2 06']);
});

test('bankPc without bank-select values degrades to a plain Program Change', () => {
  const presets = { banks: [{ id: 'only', role: 'user', startSlot: 0, slotCount: 8 }], recall: { kind: 'bankPc' } };
  const result = localCompilePresetRecall(profileWith(presets), { slot: 3 });
  assert.deepEqual(result.messages.map((m) => m.hex), ['C2 03']);
});

test('sysex recall resolves $slot/$deviceId and computes the declared checksum over from/to markers', () => {
  const presets = {
    banks: [{ id: 'user', role: 'user', startSlot: 0, slotCount: 128 }],
    recall: {
      kind: 'sysex',
      template: ['F0', '7D', '$deviceId', '0C', '$slot', '$checksum', 'F7'],
      checksum: { type: 'sum-7bit', from: '$slot', to: '$slot' },
    },
  };
  const result = localCompilePresetRecall(profileWith(presets), { slot: 5 });
  assert.equal(result.ok, true);
  // sum-7bit (plain additive) over the single $slot byte: 0x05
  assert.equal(result.messages[0].hex, 'F0 7D 10 0C 05 05 F7');
});

test('sysex recall default checksum span covers everything after $deviceId', () => {
  const presets = {
    banks: [{ id: 'user', role: 'user', startSlot: 0, slotCount: 128 }],
    recall: {
      kind: 'sysex',
      template: ['F0', '7D', '$deviceId', '0C', '$slot', '$checksum', 'F7'],
      checksum: { type: 'sum-7bit' },
    },
  };
  const result = localCompilePresetRecall(profileWith(presets), { slot: 5 });
  // covers 0C + 05 -> plain 7-bit sum = 0x11
  assert.equal(result.messages[0].hex, 'F0 7D 10 0C 05 11 F7');
});

test('recall fails cleanly without a model, outside the map, or with a bad kind', () => {
  assert.match(localCompilePresetRecall({ id: 'p' }, { slot: 0 }).error, /no preset model/);
  assert.match(localCompilePresetRecall(profileWith(PRESETS), { slot: 500 }).error, /not inside any preset bank/);
  const bad = profileWith({ ...PRESETS, recall: { kind: 'osc' } });
  assert.match(localCompilePresetRecall(bad, { slot: 0 }).error, /Unsupported preset recall kind/);
});

// ── scan integration: the structured model backs up the informal presetBrowser ──

test('localBuildPresetListScan falls back to presets.nameRequest + bank slots', () => {
  const profile = profileWith({
    banks: [{ id: 'user', role: 'user', startSlot: 1, slotCount: 3 }],
    nameRequest: { request: 'requestPresetName', slotVariable: 'slot' },
  });
  delete profile.presetBrowser;
  const scan = localBuildPresetListScan(profile, {});
  assert.equal(scan.ok, true);
  assert.deepEqual(scan.entries.map((e) => e.slot), [1, 2, 3]);
  assert.equal(scan.entries[0].requestHex, 'F0 7D 10 02 01 F7');
});

// ── validation: legacy profile source ──

test('validateLocalProfileSource accepts a well-formed preset model', () => {
  const result = validateLocalProfileSource('probe', JSON.stringify(profileWith(PRESETS)));
  assert.equal(result.ok, true, JSON.stringify(result.validation));
});

test('validateLocalProfileSource rejects overlapping banks, bad roles, oversized catalogs and unknown name requests', () => {
  const bad = profileWith({
    banks: [
      { id: 'a', role: 'factory', startSlot: 0, slotCount: 10, names: Array(11).fill('x') },
      { id: 'a', role: 'shelf', startSlot: 5, slotCount: 10 },
    ],
    recall: { kind: 'sysex' },
    nameRequest: { request: 'missingRequest' },
  });
  const result = validateLocalProfileSource('probe', JSON.stringify(bad));
  assert.equal(result.ok, false);
  const messages = result.validation.map((v) => v.message).join('\n');
  assert.match(messages, /Duplicate preset bank id/);
  assert.match(messages, /overlapping slot ranges/);
  assert.match(messages, /role must be/);
  assert.match(messages, /exceeds slotCount/);
  assert.match(messages, /SysEx preset recall requires a template/);
  assert.match(messages, /Unknown preset name request/);
});

// ── validation: DPD schema-side structural validator ──

const DPD_MODEL = {
  schemaVersion: 1,
  id: 'probe.synth',
  version: '1.0.0',
  kind: 'model',
  manufacturerId: '7D',
  deviceId: '10',
  scopes: { patch: { kind: 'patch', parameters: [{ id: 'cutoff', valueType: 'continuous', address: '20' }] } },
  messageShapes: [{ id: 'requestPresetName', kind: 'sysex', template: ['F0', '7D', '$deviceId', '02', '$slot', 'F7'] }],
};

test('validateProfile accepts and rejects preset models structurally', () => {
  const good = { ...DPD_MODEL, presets: PRESETS };
  assert.deepEqual(validateProfile(good).errors, []);

  const bad = {
    ...DPD_MODEL,
    presets: {
      banks: [{ id: 'a', role: 'factory', startSlot: 0, slotCount: 0, bankMsb: 200 }],
      recall: { kind: 'pc', channel: 20 },
      initPatch: { slot: 5 },
    },
  };
  const errors = validateProfile(bad).errors.join('\n');
  assert.match(errors, /slotCount/);
  assert.match(errors, /bankMsb must be 0-127/);
  assert.match(errors, /channel must be 1-16/);
  assert.match(errors, /not inside any bank/);
});

// ── emit: DPD model -> legacy engine profile ──

test('buildLegacyProfile carries the preset model and synthesizes the scan plumbing', () => {
  const legacy = buildLegacyProfile({ ...DPD_MODEL, presets: PRESETS });
  assert.deepEqual(legacy.presets, PRESETS);
  // synthesized request from the referenced messageShape
  const request = legacy.requests.find((r) => r.id === 'requestPresetName');
  assert.ok(request, 'nameRequest messageShape becomes a legacy request');
  assert.deepEqual(request.template, ['F0', '7D', '$deviceId', '02', '$slot', 'F7']);
  // presetBrowser derived from the bank slot map
  assert.equal(legacy.presetBrowser.request, 'requestPresetName');
  assert.equal(legacy.presetBrowser.slots.length, 128);
  // the emitted profile passes the legacy validator's preset checks
  const validated = validateLocalProfileSource('probe', JSON.stringify({
    ...legacy,
    parameters: legacy.parameters.length ? legacy.parameters : [{ id: 'p' }],
    tests: [{ kind: 'request', request: 'requestPresetName', expectedHex: 'F0' }],
  }));
  const presetErrors = validated.validation.filter((v) => String(v.path).startsWith('preset'));
  assert.deepEqual(presetErrors, []);
});
