// deviceReadWrite.test.js — ce.device.read / write.
//
// The half of phase 2 that was missing. parameters() told a script WHAT the synth has, and there
// was then no way to touch one unless a control happened to be bound to it: a panel that discovered
// eight oscillators could enumerate them and not address them.
//
// CE/tests/ScriptRuntimeTests.cpp §29 pins the same behaviour window-closed.

import test from 'node:test';
import assert from 'node:assert/strict';

import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { deviceRuntimeState } from '../src/CE_Application/stores/deviceProfileStores.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { get } from 'svelte/store';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY,
} from '../src/CE_Application/scripting/panelApi.js';

const panel = {
  id: 'p', name: 'Dev', width: 400, height: 300, controls: [],
  scripting: { modules: ['ce.device'] },
};

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');

function withApi(fn) {
  setRuntimeHost({ panel, scripts: [] });
  clearScriptTrace();
  try { return fn(scriptApiForTesting('', 'dev-script')); } finally { setRuntimeHost(null); }
}

/* -------------------------------------------------------------------------- the contract */

test('read and write are declared, cross-runtime, and need the device host', () => {
  for (const [id, path] of [['deviceRead', 'ce.device.read'], ['deviceWrite', 'ce.device.write']]) {
    const m = MEMBER_BY_ID[id];
    assert.ok(m, `${id} is not declared`);
    assert.equal(memberPath(id), path);
    // A synth is driven from a DAW with the window shut at least as often as from the editor.
    assert.equal(memberRuntime(m), RUNTIME_ANY);
    // Declared, so the picker and the docs say it rather than leaving it to be discovered.
    assert.equal(m.requiresDeviceHost, true, `${id} should declare requiresDeviceHost`);
  }
});

test('the summaries say what read actually is, and what write actually promises', () => {
  // Both are easy to over-read. read is not a live query; write's true does not mean the synth
  // agreed. Saying so in the contract is cheaper than a support thread.
  assert.match(MEMBER_BY_ID.deviceRead.summary, /LAST KNOWN|Not a live query/);
  assert.match(MEMBER_BY_ID.deviceWrite.summary, /dispatched/);
});

/* ---------------------------------------------------------------------------------- read */

test('read returns the last value the synth reported', () => {
  deviceRuntimeState.set({ mainSynth: { cutoff: 64, reso: 0 } });
  withApi((api) => {
    assert.equal(api.deviceRead('cutoff'), 64);
  });
});

test('a parameter reported as ZERO is a value, not an absence', () => {
  // The distinction that matters: a script deciding whether to initialise something would get it
  // exactly backwards if 0 read the same as "never reported".
  deviceRuntimeState.set({ mainSynth: { reso: 0 } });
  withApi((api) => {
    assert.equal(api.deviceRead('reso'), 0);
    assert.notEqual(api.deviceRead('reso'), undefined);
  });
});

test('a parameter the synth has never reported comes back as nothing', () => {
  deviceRuntimeState.set({ mainSynth: { cutoff: 64 } });
  withApi((api) => {
    assert.equal(api.deviceRead('nosuch'), undefined);
    assert.equal(api.deviceRead(''), undefined);
  });
});

test('read is per role, and defaults to the main synth', () => {
  deviceRuntimeState.set({ mainSynth: { cutoff: 64 }, secondSynth: { cutoff: 9 } });
  withApi((api) => {
    assert.equal(api.deviceRead('cutoff'), 64, 'an omitted role is mainSynth');
    assert.equal(api.deviceRead('cutoff', 'secondSynth'), 9);
    assert.equal(api.deviceRead('cutoff', 'nosuchRole'), undefined);
  });
});

/* --------------------------------------------------------------------------------- write */

test('write without a device host reports itself rather than lying', () => {
  // There is no JUCE bridge in a test, which is the same situation as a plain browser. Encoding a
  // parameter is the device profile's codec and it runs in the host — so this cannot pretend.
  withApi((api) => {
    assert.equal(api.deviceWrite('cutoff', 100), false);
    assert.match(traced(), /needs the device host/);
    assert.match(traced(), /exported plugin/, 'and says where it does work');
  });
});

test('write with no parameter id is refused and says so', () => {
  withApi((api) => {
    assert.equal(api.deviceWrite('', 100), false);
    assert.match(traced(), /parameter id is required/);
  });
});

/* ------------------------------------------------------------------ read after the panel */

test('a dump landing updates what read returns', () => {
  // The point of read being the mirror rather than a query: onDumpReceived fires, the values land
  // in deviceRuntimeState, and a script that reads afterwards sees them without asking anybody.
  deviceRuntimeState.set({ mainSynth: { cutoff: 10 } });
  withApi((api) => {
    assert.equal(api.deviceRead('cutoff'), 10);
    deviceRuntimeState.set({ mainSynth: { cutoff: 120, newParam: 3 } });
    assert.equal(api.deviceRead('cutoff'), 120);
    assert.equal(api.deviceRead('newParam'), 3, 'including one that had never been reported before');
  });
});

test('a null in the runtime state reads as nothing, not as null', () => {
  // The bridge can carry an explicit null for "cleared". A script comparing against nil in Lua and
  // undefined in JS should not have to know which one it got.
  deviceRuntimeState.set({ mainSynth: { cutoff: null } });
  withApi((api) => {
    assert.equal(api.deviceRead('cutoff'), undefined);
  });
});
