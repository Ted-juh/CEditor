// presetRecallApi.test.js — ce.device.recallPreset / preset / onPresetChange.
//
// WHAT WAS MISSING. Recall existed only in the editor: presetLibrarian.recallPreset, driven by the
// Presets screen. The C++ engine knew nothing about presets at all — it passed `presetBrowser`
// through and stopped — so the exported plugin could not recall one window-closed, and no script
// could ask for one in any runtime. A panel with a preset selector on it worked while you watched
// it and did nothing once exported, which is the same shape of gap the raw-MIDI automation bug had.
//
// THE SLOT IS NOT A PROGRAM NUMBER, and that is the thing most likely to be got wrong by a caller.
// A slot is the device-global index the profile's banks partition; the program number is what the
// slot maps to inside its bank. On a machine whose second bank starts at slot 64 with programBase
// 0, slot 64 is program 0. Returning the name and category with the recall is partly so a caller
// can check it recalled what it meant.
//
// WHAT "CURRENT" MEANS. A synth does not announce its patch on connect and almost none can be
// asked, so preset() reports what has been OBSERVED — a recall going out, or a Program Change
// coming in — and says -1 until one of those happens. Inventing slot 0 would have every panel
// confidently displaying the wrong preset name until somebody turned the dial.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_MEMBERS, DEVICE_EVENTS, memberPath } from '../src/CE_Application/scripting/panelApi.js';
import { localCompilePresetRecall, presetSlotInfo } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const an1x = JSON.parse(readFileSync(
  path.join(REPO, 'CE/profiles/test/yamaha-an1x-dpd.ceditor-device.json'), 'utf8'));

const hexOf = (result) => (result.messages ?? []).map((m) => m.hex).join(' | ');

/* ------------------------------------------------- the API surface, in every runtime */

test('recallPreset and preset are declared, and not panel-view-only', () => {
  // The whole point is the exported plugin. A RUNTIME_WEBVIEW member would be stubbed with a notice
  // in the C++ engines — which is the state this change exists to leave behind.
  for (const id of ['recallPreset', 'preset']) {
    const member = ALL_MEMBERS.find((m) => m.id === id);
    assert.ok(member, `${id} is not declared in panelApi.js`);
    assert.notEqual(member.runtime, 'webview', `${id} must reach the C++ engines, not just the panel view`);
    assert.match(memberPath(id), /^ce\.device\./, `${id} belongs to ce.device`);
  }
});

test('onPresetChange is one event for both directions', () => {
  // A script repainting a name display does not care which end pressed the button; two events would
  // mean wiring both and getting it wrong once. `source` is there for the scripts that do care.
  const event = DEVICE_EVENTS.find((e) => e.id === 'presetChange');
  assert.ok(event, 'onPresetChange is not declared');
  assert.equal(event.fn, 'onPresetChange');
  assert.match(event.summary, /source/, 'the payload must say which end changed it');
  assert.match(event.summary, /device/);
  assert.match(event.summary, /panel/);
});

/* --------------------------------------------------- what a recall actually compiles to */

test('the AN1x recalls with a bare Program Change', () => {
  // recall.kind "pc", one factory bank, programBase 0 — so slot 47 is C0 2F on channel 1. The same
  // bytes DeviceProfileEngineTests asserts from the C++ side, which is the point of checking both.
  const result = localCompilePresetRecall(an1x, { slot: 47, deviceRole: 'Yamaha AN1x' });
  assert.ok(result.ok, result.error);
  assert.equal(hexOf(result), 'C0 2F');
});

test('a slot outside every bank is refused rather than clamped', () => {
  // Clamping would recall a preset nobody asked for and report success.
  const result = localCompilePresetRecall(an1x, { slot: 512, deviceRole: 'Yamaha AN1x' });
  assert.equal(result.ok, false);
  assert.match(result.error, /not inside any preset bank/);
});

test('a negative slot is refused', () => {
  assert.equal(localCompilePresetRecall(an1x, { slot: -1 }).ok, false);
});

test('bankPc sends the bank halves the bank declares, then the program', () => {
  const profile = {
    id: 'probe',
    variables: { channel: 1 },
    presets: {
      recall: { kind: 'bankPc', channel: 1 },
      banks: [
        { id: 'a', role: 'factory', startSlot: 0, slotCount: 4, programBase: 0, bankMsb: 0, bankLsb: 0 },
        { id: 'b', role: 'factory', startSlot: 4, slotCount: 4, programBase: 0, bankMsb: 0, bankLsb: 1 },
      ],
    },
  };
  // Slot 5 is the second bank's second slot: LSB 1, program 1.
  const result = localCompilePresetRecall(profile, { slot: 5 });
  assert.ok(result.ok, result.error);
  assert.equal(hexOf(result), 'B0 00 00 | B0 20 01 | C0 01');
});

test('a bank that declares no Bank Select sends none', () => {
  // Sending CC 0 = 0 anyway would select bank 0 on a machine that numbers its banks from 1.
  const profile = {
    id: 'probe',
    variables: { channel: 1 },
    presets: {
      recall: { kind: 'bankPc', channel: 1 },
      banks: [{ id: 'a', role: 'factory', startSlot: 0, slotCount: 4, programBase: 0 }],
    },
  };
  assert.equal(hexOf(localCompilePresetRecall(profile, { slot: 2 })), 'C0 02');
});

/* ----------------------------------------------------------- the slot / program split */

test('a slot is not a program number, and the profile says which is which', () => {
  const profile = {
    id: 'probe',
    presets: {
      recall: { kind: 'pc' },
      banks: [
        { id: 'a', role: 'factory', startSlot: 0, slotCount: 64, programBase: 0 },
        { id: 'b', role: 'user', startSlot: 64, slotCount: 64, programBase: 0 },
      ],
    },
  };
  assert.equal(presetSlotInfo(profile, 64).program, 0, 'the second bank restarts at program 0');
  assert.equal(presetSlotInfo(profile, 64).bankId, 'b');
  assert.equal(presetSlotInfo(profile, 64).writable, true, 'a user bank is writable');
  assert.equal(presetSlotInfo(profile, 0).writable, false, 'a factory bank is not');
});

test('the recall carries the slot\'s name and category, so a caller can check what it recalled', () => {
  const info = presetSlotInfo(an1x, 0);
  assert.equal(info.catalogName, 'Relaxx');
  assert.equal(info.category, 'Co');
});

/* ------------------------------------------------------------------ the refusals */

test('a profile with no preset model says so rather than sending something', () => {
  assert.match(localCompilePresetRecall({ id: 'x' }, { slot: 0 }).error, /no preset model/i);
  assert.match(localCompilePresetRecall({ id: 'x', presets: {} }, { slot: 0 }).error, /no recall action/i);
});
