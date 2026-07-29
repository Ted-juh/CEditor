// deviceStructure.test.js — ce.device writes structure (design doc §29).
//
// Everything ce.device could reach until now READ a device profile the app was shipped with. That
// is a hard ceiling: a panel can only address a synth somebody already wrote a profile for. These
// six verbs write the structure instead, and the case they exist for is a synth with NO profile —
// so most of what follows is asserted with no profile mapped at all.
//
// deviceDefinitions.test.js pins the codec; this file pins the verbs, the bindings they write and
// the two inbound paths. CE/tests/ScriptRuntimeTests.cpp §34 pins the same behaviour window-closed.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import {
  scriptApiForTesting, setRuntimeHost, clearDeviceRuntimeDefinitions,
  onDumpParsedForTesting, deliverSysexForTesting,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import {
  midiInputs, midiDestinations, deviceRoleMappings,
} from '../src/CE_Application/stores/deviceProfileStores.js';
import {
  MEMBER_BY_ID, memberPath, memberRuntime, RUNTIME_ANY, RUNTIME_WEBVIEW,
} from '../src/CE_Application/scripting/panelApi.js';

function panelWith(controls = []) {
  return {
    id: 'p', name: 'Dev', width: 800, height: 400, controls,
    scripting: { modules: ['ce.core', 'ce.device', 'ce.time', 'ce.panel'] },
  };
}

// A stand-in for the exported player's script host. Panel-view-only verbs still have a host there
// — the plugin runs this same runtime in its OPEN window — so `writeValue` is the door a structure
// write goes through, exactly as it is in playerScriptHost.js.
function hostFor(panel) {
  return {
    panel,
    scripts: [],
    readValue: (control, path) => valueAtPath(control, path),
    writeValue: (control, path, value) => setNestedValue(control, path, value),
  };
}

function withPanel(panel, fn) {
  setRuntimeHost(hostFor(panel));
  clearScriptTrace();
  clearDeviceRuntimeDefinitions();
  try { return fn(scriptApiForTesting('', 'dev-script'), panel); } finally { setRuntimeHost(null); }
}

const traced = () => get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
const midiLines = () => get(scriptTrace).filter((t) => t.kind === 'midi').map((t) => String(t.message ?? ''));

test.afterEach(() => clearDeviceRuntimeDefinitions());

/* -------------------------------------------------------------------------- the contract */

test('the six verbs are declared, and each says where it runs', () => {
  for (const [id, path] of [
    ['deviceDefineParameter', 'ce.device.defineParameter'],
    ['deviceDefineDump', 'ce.device.defineDump'],
    ['deviceBind', 'ce.device.bind'],
    ['deviceUnbind', 'ce.device.unbind'],
    ['devicePorts', 'ce.device.ports'],
  ]) {
    assert.ok(MEMBER_BY_ID[id], `${id} is not declared`);
    assert.equal(memberPath(id), path);
  }
  const runtimeOf = (id) => memberRuntime(MEMBER_BY_ID[id]);
  // Declaring is data plus a codec and works window-closed — a synth with no profile is driven
  // from a DAW with the window shut at least as often as from the editor.
  assert.equal(runtimeOf('deviceDefineParameter'), RUNTIME_ANY);
  assert.equal(runtimeOf('deviceDefineDump'), RUNTIME_ANY);
  assert.equal(runtimeOf('devicePorts'), RUNTIME_ANY);
  // Binding needs a control model, and there is none with the window shut — the same boundary
  // ce.panel.create sits behind.
  assert.equal(runtimeOf('deviceBind'), RUNTIME_WEBVIEW);
  assert.equal(runtimeOf('deviceUnbind'), RUNTIME_WEBVIEW);
});

/* ------------------------------------------------------------------ declaring a parameter */

test('a declared parameter turns up in parameters() with no profile mapped at all', () => {
  // No profile on the role: the case the verb exists for, and the app's default mapping has one.
  const mappings = get(deviceRoleMappings);
  deviceRoleMappings.set({});
  withPanel(panelWith(), (api) => {
    assert.equal(api.deviceDefineParameter('cutoff', { name: 'Cutoff', group: 'Filter', min: 0, max: 127, cc: 74 }), true);

    const list = api.deviceParameters();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'cutoff');
    assert.equal(list[0].defined, true);
    assert.equal(api.deviceParameter('cutoff').name, 'Cutoff');
    // …and with no declarations and no profile, the read still says so rather than answering [].
    clearDeviceRuntimeDefinitions();
    clearScriptTrace();
    assert.deepEqual(api.deviceParameters(), []);
    assert.match(traced(), /no device profile is mapped .* declared no parameters/s);
  });
  deviceRoleMappings.set(mappings);
});

test('writing a declared parameter sends its own bytes, with no profile involved', () => {
  withPanel(panelWith(), (api) => {
    api.deviceDefineParameter('cutoff', { min: 0, max: 127, cc: 74, channel: 3 });
    assert.equal(api.deviceWrite('cutoff', 64), true);
    assert.ok(midiLines().some((l) => l.includes('B2 4A 40')), `expected B2 4A 40 in:\n${traced()}`);
  });
});

test('a parameter with no wire format is refused, and the panel does not look built', () => {
  withPanel(panelWith(), (api) => {
    assert.equal(api.deviceDefineParameter('cutoff', { name: 'Cutoff', max: 127 }), false);
    assert.match(traced(), /no wire format/);
    assert.deepEqual(api.deviceParameters(), []);
  });
});

/* ------------------------------------------------------------------------------- binding */

test('bind writes a real DeviceBindings entry, and the control then sends on set()', () => {
  const knob = createControl('Knob', { name: 'cutoffKnob' });
  withPanel(panelWith([knob]), (api, panel) => {
    api.deviceDefineParameter('cutoff', { min: 0, max: 127, cc: 74 });
    assert.equal(api.deviceBind('cutoffKnob', 'cutoff'), true);

    const bindings = panel.controls[0]._children.DeviceBindings.bindings;
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].kind, 'deviceParameter');
    assert.equal(bindings[0].parameterId, 'cutoff');
    assert.equal(bindings[0].port, 'value');

    // The half that would have been easy to leave out: a bound control has to actually SEND.
    // A binding that moves the picture and nothing else is the dead control this pair exists
    // to fix, and half-fixed would look done.
    clearScriptTrace();
    api.set('cutoffKnob.value', 100);
    assert.ok(midiLines().some((l) => l.includes('B0 4A 64')), `expected B0 4A 64 in:\n${traced()}`);
  });
});

test('binding twice on one port replaces rather than stacking', () => {
  const knob = createControl('Knob', { name: 'k' });
  withPanel(panelWith([knob]), (api, panel) => {
    api.deviceDefineParameter('a', { cc: 1 });
    api.deviceDefineParameter('b', { cc: 2 });
    api.deviceBind('k', 'a');
    api.deviceBind('k', 'b');
    const bindings = panel.controls[0]._children.DeviceBindings.bindings;
    // Two bindings on one port is a control that sends two parameters from one gesture, which is
    // never what bind() was asked for.
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].parameterId, 'b');
  });
});

test('bind switches DeviceBindings back on when the control had it off', () => {
  const knob = createControl('Knob', { name: 'k' });
  knob._children.DeviceBindings.enabled = false;
  withPanel(panelWith([knob]), (api, panel) => {
    api.deviceDefineParameter('a', { cc: 1 });
    api.deviceBind('k', 'a');
    assert.equal(panel.controls[0]._children.DeviceBindings.enabled, true);
  });
});

test('binding an unknown parameter still binds, and says to check the id', () => {
  const knob = createControl('Knob', { name: 'k' });
  withPanel(panelWith([knob]), (api, panel) => {
    // A script may bind before it declares, and a profile table can still be loading — so this
    // works if the parameter arrives, and the notice is what buys back the silence if it never does.
    assert.equal(api.deviceBind('k', 'later'), true);
    assert.match(traced(), /check the id if the control stays dead/);
    assert.equal(panel.controls[0]._children.DeviceBindings.bindings.length, 1);
  });
});

test('unbind reports whether there was anything to remove', () => {
  const knob = createControl('Knob', { name: 'k' });
  withPanel(panelWith([knob]), (api, panel) => {
    api.deviceDefineParameter('a', { cc: 1 });
    api.deviceBind('k', 'a');
    assert.equal(api.deviceUnbind('k'), true);
    assert.equal(panel.controls[0]._children.DeviceBindings.bindings.length, 0);
    // "already clean" reads differently from "cleaned up".
    assert.equal(api.deviceUnbind('k'), false);
  });
});

test('bind and unbind name the control when it is not there', () => {
  withPanel(panelWith(), (api) => {
    assert.equal(api.deviceBind('ghost', 'a'), false);
    assert.equal(api.deviceUnbind('ghost'), false);
    assert.match(traced(), /control "ghost" not found/);
  });
});

/* --------------------------------------------------------------------------------- ports */

test('ports lists both directions, flags real hardware, and says which role uses one', () => {
  midiInputs.set([
    { id: 'none', type: 'none', name: 'No MIDI Input' },
    { id: 'in-1', type: 'hardwareInput', name: 'Juno In' },
  ]);
  midiDestinations.set([
    { id: 'previewOnly', type: 'previewOnly', name: 'Preview Only' },
    { id: 'out-1', type: 'hardwareOutput', name: 'Juno Out' },
  ]);
  deviceRoleMappings.set({ mainSynth: { profileId: 'x', midiDestination: { id: 'out-1' }, midiInput: { id: 'in-1' } } });

  withPanel(panelWith(), (api) => {
    const all = api.devicePorts();
    assert.equal(all.length, 4);

    const juno = all.find((p) => p.id === 'out-1');
    assert.equal(juno.direction, 'out');
    assert.equal(juno.hardware, true);
    assert.equal(juno.role, 'mainSynth');

    // The placeholder rows are choices, not hardware — a script asking "did a device show up"
    // needs the flag, not a list of magic type strings to compare against.
    assert.equal(all.find((p) => p.id === 'previewOnly').hardware, false);
    assert.equal(all.find((p) => p.id === 'none').hardware, false);

    assert.deepEqual(api.devicePorts({ direction: 'out' }).map((p) => p.id), ['previewOnly', 'out-1']);
    assert.deepEqual(api.devicePorts({ direction: 'in' }).map((p) => p.id), ['none', 'in-1']);
  });

  midiInputs.set([]);
  midiDestinations.set([]);
  deviceRoleMappings.set({});
});

/* ------------------------------------------------------------------------ declaring a dump */

test('a declared layout is asked for with its own request bytes', () => {
  withPanel(panelWith(), (api) => {
    api.deviceDefineParameter('cutoff', { cc: 74, min: 0, max: 127 });
    assert.equal(api.deviceDefineDump('patch', {
      request: 'f0 7d 00 f7',
      match: { prefix: ['f0', '7d', '01'], suffix: ['f7'] },
      offset: 3,
      fields: [{ parameter: 'cutoff', offset: 0 }],
    }), true);

    clearScriptTrace();
    api.requestDump('patch');
    assert.ok(midiLines().some((l) => l.includes('F0 7D 00 F7')), `expected the request bytes in:\n${traced()}`);
  });
});

test('a layout with no request says there is nothing to send, rather than sending nothing', () => {
  withPanel(panelWith(), (api) => {
    api.deviceDefineParameter('cutoff', { cc: 74 });
    api.deviceDefineDump('patch', { fields: [{ parameter: 'cutoff', offset: 0 }] });
    clearScriptTrace();
    assert.equal(api.requestDump('patch'), false);
    assert.match(traced(), /has no request bytes/);
  });
});

/* ------------------------------------------------------------- requestDump's callback */

test('requestDump(kind, fn) hands the dump back to the caller, exactly once', async () => {
  const panel = panelWith();
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  try {
    const api = scriptApiForTesting('', 'dev-script');
    const seen = [];
    api.requestDump('patch', (values, info) => seen.push({ values, info }));

    onDumpParsedForTesting({ deviceRole: 'mainSynth', dumpId: 'patch', values: { cutoff: 42 } });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].values, { cutoff: 42 });
    assert.equal(seen[0].info.ok, true);
    assert.equal(seen[0].info.kind, 'patch');

    // …and is not armed for the next one. A waiter that fired twice only shows up on the SECOND
    // dump, which is exactly why it is worth a check of its own.
    onDumpParsedForTesting({ deviceRole: 'mainSynth', dumpId: 'patch', values: { cutoff: 7 } });
    assert.equal(seen.length, 1);
  } finally {
    clearDeviceRuntimeDefinitions();
    setRuntimeHost(null);
  }
});

test('a callback that never hears back is resolved rather than left hanging', async () => {
  const panel = panelWith();
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  try {
    const api = scriptApiForTesting('', 'dev-script');
    const seen = [];
    api.requestDump('patch', (values, info) => seen.push(info), { timeout: 20 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].ok, false);
    assert.match(seen[0].error, /no dump arrived/);
  } finally {
    clearDeviceRuntimeDefinitions();
    setRuntimeHost(null);
  }
});

test('a dump for another kind leaves a waiter alone', async () => {
  const panel = panelWith();
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  try {
    const api = scriptApiForTesting('', 'dev-script');
    const seen = [];
    api.requestDump('patch', (values, info) => seen.push(info), { timeout: 5000 });

    onDumpParsedForTesting({ deviceRole: 'mainSynth', dumpId: 'global', values: { a: 1 } });
    assert.equal(seen.length, 0);
  } finally {
    clearDeviceRuntimeDefinitions();   // takes the pending timeout with it
    setRuntimeHost(null);
  }
});

/* -------------------------------------------------- the declared layout, on the way in */

test('a declared layout decodes arriving sysex, fills the panel and raises onDumpReceived', () => {
  const knob = createControl('Knob', { name: 'cutoffKnob' });
  const panel = panelWith([knob]);
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'dev-script');
    api.deviceDefineParameter('cutoff', { cc: 74, min: 0, max: 127 });
    api.deviceDefineDump('patch', {
      match: { prefix: ['f0', '7d', '01'], suffix: ['f7'] },
      offset: 3,
      fields: [{ parameter: 'cutoff', offset: 0 }],
    });

    const seen = [];
    api.requestDump('patch', (values, info) => seen.push({ values, info }));

    deliverSysexForTesting({ deviceRole: 'mainSynth', hex: 'F0 7D 01 40 F7' });

    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].values, { cutoff: 0x40 });
    assert.equal(seen[0].info.kind, 'patch');
  } finally {
    clearDeviceRuntimeDefinitions();
    setRuntimeHost(null);
  }
});

test('sysex arriving with nothing declared is left exactly as it was', () => {
  const panel = panelWith();
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  clearScriptTrace();
  try {
    // The rule that keeps every panel written before this behaving identically: with no layout
    // declared, the decoder is never consulted and nothing is reported.
    deliverSysexForTesting({ deviceRole: 'mainSynth', hex: 'F0 7D 01 40 F7' });
    assert.doesNotMatch(traced(), /dump:/);
  } finally {
    setRuntimeHost(null);
  }
});

test('sysex matching none of the declared layouts is reported rather than silently dropped', () => {
  const panel = panelWith();
  setRuntimeHost(hostFor(panel));
  clearDeviceRuntimeDefinitions();
  clearScriptTrace();
  try {
    const api = scriptApiForTesting('', 'dev-script');
    api.deviceDefineParameter('cutoff', { cc: 74 });
    api.deviceDefineDump('patch', {
      match: { prefix: ['f0', '7d', '01'] },
      offset: 3,
      fields: [{ parameter: 'cutoff', offset: 0 }],
    });
    clearScriptTrace();
    // A hand-written layout that matches nothing is the single most likely thing to be wrong with
    // it, and it is invisible otherwise.
    deliverSysexForTesting({ deviceRole: 'mainSynth', hex: 'F0 7D 09 40 F7' });
    assert.match(traced(), /dump:/);
  } finally {
    clearDeviceRuntimeDefinitions();
    setRuntimeHost(null);
  }
});
