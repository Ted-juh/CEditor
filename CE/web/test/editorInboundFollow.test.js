// editorInboundFollow.test.js — the editor's panel following the instrument.
//
// Found on hardware, and the shape of it is worth keeping: the reverse index was built, unit-tested
// hard, browser-checked against a real panel — and wired into Player.svelte only. So the exported
// plugin followed the synth and the EDITOR, where every panel is actually built and tried, did not.
// Turning the GAIA's cutoff knob put the CC in the monitor and moved nothing on screen, which reads
// exactly like a broken binding and is not one.
//
// Every other thing that moves a control in the editor arrives from C++ — a parsed dump, a runtime
// state push, the echo of our own send. None of those fire for a live CC or a single-parameter
// SysEx, because the engine has no notion of a profile's `inbound` declaration at all; grep the C++
// for it and there are no hits. That mapping exists only on this side, so this is the only path
// from "the instrument sent something" to "the panel shows it".
//
// The tests below drive the real stores rather than mocks, because the bug was never in the decode
// — decodeInbound was right the whole time — it was in what happened to the answer.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { followInboundMessage } from '../src/CE_Application/stores/deviceProfileSession.js';
import { deviceRoleMappings, deviceRuntimeState, profileSources } from '../src/CE_Application/stores/deviceProfileStores.js';
import { clearInboundIndexCache } from '../src/CE_Application/stores/inboundIndexCache.js';
import { rememberOutboundEcho } from '../src/CE_Application/stores/deviceMidiRuntime.js';

// Small, but shaped like the real thing: one parameter reachable by a declared CC and one reachable
// only by the Roland DT1 SysEx the instrument answers dumps with.
const PROFILE = {
  schemaVersion: 1,
  id: 'test-follow',
  identity: { manufacturerId: ['41'] },
  messageRecipes: [
    { id: 'cutoffSysex', kind: 'sysex', template: ['F0', '41', '$deviceId', '00', '00', '41', '12', '10', '00', '01', '0C', '$encodedValue', '$checksum', 'F7'] },
  ],
  parameters: [
    {
      id: 'tone1.filter.cutoff',
      name: 'FILTER Cutoff',
      type: 'integer',
      range: { min: 0, max: 127 },
      encoding: { type: 'u7' },
      messageRecipe: 'cutoffSysex',
      inbound: [{ kind: 'cc', controller: 102 }],
    },
  ],
};

function setUp({ role = 'primary', profileId = 'test-follow' } = {}) {
  clearInboundIndexCache();
  deviceRuntimeState.set({});
  deviceRoleMappings.set({ [role]: { role, profileId } });
  profileSources.set({ [profileId]: { profileId, source: JSON.stringify(PROFILE) } });
}

const valueFor = (role, parameterId) => get(deviceRuntimeState)?.[role]?.[parameterId];

test('a CC the profile declares moves the parameter it names', () => {
  // The exact message the user turned the knob for: the GAIA's FILTER Cutoff sends CC 102, and the
  // profile says so. Nothing in C++ can make that connection.
  setUp();
  followInboundMessage({ deviceRole: 'primary', hex: 'B0 66 5A' });
  assert.equal(valueFor('primary', 'tone1.filter.cutoff'), 90);
});

test('the same knob on another channel is the same knob', () => {
  setUp();
  followInboundMessage({ deviceRole: 'primary', hex: 'B7 66 20' });
  assert.equal(valueFor('primary', 'tone1.filter.cutoff'), 32);
});

test('a SysEx parameter message moves its parameter too', () => {
  // The other half, and the one that matters for the 622 parameters with no CC at all: a DT1 write
  // at the parameter's own address.
  setUp();
  followInboundMessage({ deviceRole: 'primary', hex: 'F0 41 10 00 00 41 12 10 00 01 0C 40 3D F7' });
  assert.equal(valueFor('primary', 'tone1.filter.cutoff'), 64);
});

test('a message for a role moves only that role', () => {
  // Two synths can be mapped at once. A CC arriving from one must not move the other's controls,
  // and both mappings can legitimately name the same profile.
  clearInboundIndexCache();
  deviceRuntimeState.set({});
  deviceRoleMappings.set({
    primary: { role: 'primary', profileId: 'test-follow' },
    second: { role: 'second', profileId: 'test-follow' },
  });
  profileSources.set({ 'test-follow': { profileId: 'test-follow', source: JSON.stringify(PROFILE) } });

  followInboundMessage({ deviceRole: 'primary', hex: 'B0 66 5A' });
  assert.equal(valueFor('primary', 'tone1.filter.cutoff'), 90);
  assert.equal(valueFor('second', 'tone1.filter.cutoff'), undefined);
});

test('our own send coming back does not fight the hand on the knob', () => {
  // Send a value, the synth echoes it a few milliseconds later. Without this the control jumps back
  // to where it was told to go while it is still being dragged somewhere else.
  setUp();
  rememberOutboundEcho('primary', 'tone1.filter.cutoff', 90, { echoWindowMs: 5000 });
  followInboundMessage({ deviceRole: 'primary', hex: 'B0 66 5A' });
  assert.equal(valueFor('primary', 'tone1.filter.cutoff'), undefined, 'the echo was ours');
});

test('a message the profile does not describe moves nothing', () => {
  setUp();
  followInboundMessage({ deviceRole: 'primary', hex: 'B0 4A 5A' });                       // CC 74
  followInboundMessage({ deviceRole: 'primary', hex: 'F0 43 10 00 00 41 12 10 00 01 0C 40 3D F7' });  // Yamaha
  assert.deepEqual(get(deviceRuntimeState), {});
});

test('an unmapped role is quiet, not broken', () => {
  // The state the app is in for the first second after launch, and whenever a panel names a device
  // nobody has configured. It must not throw inside a bridge callback.
  clearInboundIndexCache();
  deviceRuntimeState.set({});
  deviceRoleMappings.set({});
  profileSources.set({});
  followInboundMessage({ deviceRole: 'primary', hex: 'B0 66 5A' });
  assert.deepEqual(get(deviceRuntimeState), {});
});

test('a profile whose source has not arrived yet is quiet too', () => {
  // The source comes over the bridge asynchronously, so "mapped but not loaded" is an ordinary
  // state that lasts a moment on every launch — not an error, and not a crash.
  clearInboundIndexCache();
  deviceRuntimeState.set({});
  deviceRoleMappings.set({ primary: { role: 'primary', profileId: 'test-follow' } });
  profileSources.set({});
  followInboundMessage({ deviceRole: 'primary', hex: 'B0 66 5A' });
  assert.deepEqual(get(deviceRuntimeState), {});
});

test('an empty payload is ignored', () => {
  setUp();
  followInboundMessage(null);
  followInboundMessage({});
  followInboundMessage({ deviceRole: 'primary', hex: '' });
  assert.deepEqual(get(deviceRuntimeState), {});
});
