import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyMockCommand,
  mockHostState,
  normalizeHostState,
} from '../src/CE_Application/stores/instrumentHost.js';
import {
  STAGE_SAFE_COMMANDS,
  stageCommandAllowed,
} from '../src/CE_Application/utils/stageLock.js';

test('Stage Lock is deny-by-default with an explicit performance-safe surface', () => {
  for (const command of ['hostNote', 'panic', 'setPartMixer', 'setParameter',
                         'setControlSlotValue', 'launchScene', 'setlistNext', 'transportPlay',
                         'startMidiLoop', 'startGestureRecording', 'finishGestureRecording',
                         'retryFailedProcessor', 'dismissFailoverEvent']) {
    assert.equal(STAGE_SAFE_COMMANDS.has(command), true, `${command} remains live`);
    assert.equal(stageCommandAllowed(true, command), true);
  }
  for (const command of ['addPart', 'removePart', 'loadInstrument', 'setHardwareConfig',
                         'assignControlSlot', 'scan', 'buildHostProduct']) {
    assert.equal(stageCommandAllowed(true, command), false, `${command} is structural`);
  }
  assert.equal(stageCommandAllowed(false, 'removePart'), true, 'Build mode is unrestricted');
});

test('the browser preview mirrors native Stage Lock semantics', () => {
  let state = mockHostState();
  const partId = state.rack.parts[0].partId;
  const originalCount = state.rack.parts.length;

  state = applyMockCommand(state, { cmd: 'setStageLock', enabled: true });
  assert.equal(state.stageLocked, true);
  state = applyMockCommand(state, { cmd: 'addPart' });
  assert.equal(state.rack.parts.length, originalCount, 'structural commands do nothing while locked');

  state = applyMockCommand(state, { cmd: 'setPartMixer', partId, mute: true });
  assert.equal(state.rack.parts[0].mute, true, 'live mixer commands still apply');

  state = applyMockCommand(state, { cmd: 'setStageLock', enabled: false });
  assert.equal(state.stageLocked, true, 'a plain false cannot bypass the hold');
  state = applyMockCommand(state, { cmd: 'setStageLock', enabled: false, _unlockAuthorized: true });
  assert.equal(state.stageLocked, false, 'the internally authorized hold releases the preview lock');
});

test('native lock state survives payload normalization and drives the Stage UI', () => {
  assert.equal(normalizeHostState({ stageLocked: true }).stageLocked, true);
  assert.equal(normalizeHostState({ stageLocked: 'yes' }).stageLocked, false);

  const hostView = fs.readFileSync(
    new URL('../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url), 'utf8');
  const stageView = fs.readFileSync(
    new URL('../src/CE_Application/sections/StageView.svelte', import.meta.url), 'utf8');
  assert.match(hostView, /beginStageUnlock\(\)/);
  assert.match(hostView, /setStageLock\(false\)/);
  assert.match(hostView, /Hold for one second to leave Stage Lock/);
  assert.match(stageView, /\$hostState\.stageLocked \? 'STAGE LOCKED'/);
  assert.match(stageView, /hostLastError/);
});

test('destructive Build actions require a second click', () => {
  const source = fs.readFileSync(
    new URL('../src/CE_Application/sections/InstrumentHostView.svelte', import.meta.url), 'utf8');
  assert.match(source, /function guardedAction/);
  assert.match(source, /Confirm remove/);
  assert.match(source, /slot:\$\{selectedPage\.pageId\}/);
  assert.match(source, /macro-target:/);
});
