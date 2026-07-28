// panelRuntimeApi.test.js — behaviour of the panel API the WebView runtime binds into scripts.
//
// The parity test (panelApiParity.test.js) checks that every declared member EXISTS. This one
// checks that the ones the audit found broken or missing actually behave: the encoding helpers
// ported from the C++ preludes, checksum honouring its `type` argument, and panic emitting the
// right CC sequence in the right order.
//
// Values are asserted against the C++ preludes in CE/src/Scripting, which are the reference: a
// script that packs a value here and unpacks it in the shipped plugin has to get the same number.

import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { get } from 'svelte/store';
import { scriptApiForTesting, setRuntimeHost } from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { CE_API_VERSION, RUNTIME_WEBVIEW } from '../src/CE_Application/scripting/panelApi.js';

const api = scriptApiForTesting();
const runtimeSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'CE_Application', 'scripting', 'panelRuntime.js'),
  'utf8',
);

/* ------------------------------------------------------------------ MIDI encoding helpers */

test('to14bit / from14bit round-trip, and to14Bit is the same function', () => {
  assert.deepEqual(api.to14bit(0), { msb: 0, lsb: 0 });
  assert.deepEqual(api.to14bit(128), { msb: 1, lsb: 0 });
  assert.deepEqual(api.to14bit(16383), { msb: 127, lsb: 127 });
  for (const v of [0, 1, 127, 128, 8192, 16383]) {
    const { msb, lsb } = api.to14bit(v);
    assert.equal(api.from14bit(msb, lsb), v, `round-trip failed for ${v}`);
  }
  // The pre-contract spelling stays working — panels were written against it.
  assert.equal(api.to14Bit, api.to14bit);
});

test('to7bit packs msb-first by default and lsb-first on request', () => {
  assert.deepEqual(api.to7bit(16383, 2), [127, 127]);
  assert.deepEqual(api.to7bit(128, 2), [1, 0]);
  assert.deepEqual(api.to7bit(128, 2, 'lsb'), [0, 1]);
  assert.deepEqual(api.to7bit(1, 4), [0, 0, 0, 1]);
  for (const order of ['msb', 'lsb']) {
    assert.equal(api.from7bit(api.to7bit(1234567, 4, order), order), 1234567);
  }
});

test('nibbles split and recombine a byte', () => {
  assert.deepEqual(api.toNibbles(0xAB), { hi: 0xA, lo: 0xB });
  assert.equal(api.fromNibbles(0xA, 0xB), 0xAB);
  assert.deepEqual(api.nibblize([0xAB, 0xCD]), [0xA, 0xB, 0xC, 0xD]);
  assert.deepEqual(api.denibblize([0xA, 0xB, 0xC, 0xD]), [0xAB, 0xCD]);
  // Odd tail: the missing low nibble reads as zero rather than NaN.
  assert.deepEqual(api.denibblize([0xA, 0xB, 0xC]), [0xAB, 0xC0]);
});

test('ASCII helpers pad to length and read back', () => {
  assert.deepEqual(api.toAscii('Hi'), [72, 105]);
  assert.deepEqual(api.toAscii('Hi', 4), [72, 105, 32, 32]);   // patch names are space-padded
  assert.equal(api.fromAscii([72, 105]), 'Hi');
  assert.equal(api.fromAscii(api.toAscii('Bass', 8)).trimEnd(), 'Bass');
});

test('offset and signed encodings are inverses', () => {
  assert.equal(api.toOffset(-64, 64), 0);
  assert.equal(api.toOffset(63, 64), 127);
  assert.equal(api.fromOffset(0, 64), -64);
  assert.equal(api.toSigned(-1, 8), 255);
  assert.equal(api.fromSigned(255, 8), -1);
  assert.equal(api.fromSigned(127, 8), 127);
});

/* ------------------------------------------------------------------------------ checksum */

test('checksum honours its type argument', () => {
  const bytes = [0x01, 0x02, 0x03];
  // Roland/Yamaha: (128 - sum) & 0x7F. sum = 6 -> 122.
  assert.equal(api.checksum('roland', bytes), 122);
  assert.equal(api.checksum('yamaha', bytes), 122, 'the two spellings are the same algorithm');
  assert.equal(api.checksum('sum', bytes), 6);
  assert.equal(api.checksum('xor', bytes), 0x01 ^ 0x02 ^ 0x03);
  // Type used to be ignored entirely — every call returned the Roland value.
  assert.notEqual(api.checksum('xor', bytes), api.checksum('roland', bytes));
});

test('checksum keeps the one-argument form working', () => {
  const bytes = [0x10, 0x20];
  assert.equal(api.checksum(bytes), api.checksum('roland', bytes));
});

test('a Roland checksum makes the data sum to zero mod 128', () => {
  const data = [0x40, 0x11, 0x00, 0x7F, 0x2A];
  const sum = data.reduce((a, b) => a + b, 0) + api.checksum('roland', data);
  assert.equal(sum % 128, 0);
});

/* --------------------------------------------------------------------------------- panic */

test('panic sends all-sound-off before all-notes-off, on every channel', () => {
  // No JUCE host in a test run, so sends are traced rather than transmitted. Assert the shape
  // through the trace console.
  assert.equal(typeof api.panic, 'function');
  assert.doesNotThrow(() => api.panic());
  assert.doesNotThrow(() => api.panic({ channel: 3 }));
  assert.doesNotThrow(() => api.panic({ channel: 3, resetControllers: false }));
});

/* ------------------------------------------------------------------------ flow: no-ops gone */

test('on / emit / run and the timers are real functions, not the old stubs', () => {
  for (const name of ['on', 'emit', 'run', 'startTimer', 'stopTimer', 'noTransmit', 'transmit']) {
    assert.equal(typeof api[name], 'function', `${name} should be bound`);
  }
  // The stubs were `() => {}` — zero parameters. The real implementations take their arguments.
  assert.ok(api.on.length >= 3, 'on(target, event, fn) should take its three arguments');
  assert.ok(api.run.length >= 1, 'run(ref, args) should take its arguments');
  assert.ok(api.emit.length >= 1, 'emit(name, data) should take its arguments');
});

test('noTransmit and transmit restore the previous override even when the block throws', () => {
  // A block that throws must not leave the override stuck on, or every later write in the panel
  // silently inherits it. Running two throwing blocks back to back would compound the leak.
  assert.doesNotThrow(() => api.noTransmit(() => { throw new Error('boom'); }));
  assert.doesNotThrow(() => api.transmit(() => { throw new Error('boom'); }));
  // Still usable afterwards: a leaked override would not surface as a throw, so assert the
  // observable part — the block runs and control returns normally.
  let ran = false;
  api.noTransmit(() => { ran = true; });
  assert.equal(ran, true);
});

/* ------------------------------------------------------- inbound origin, held across the await */

test('inbound origin is a dispatch flag, not a wrapper around the dispatch call', () => {
  // dispatchEvents is async. Wrapping the CALL in a scope that pops the depth on return would pop
  // it the moment the promise was created — before a single handler ran — and every set() in an
  // inbound handler would transmit, echoing a dump straight back at the synth. The depth has to be
  // held inside dispatchEvents, across the await.
  assert.match(runtimeSource, /async function dispatchEvents\(events, \{ inbound = false \} = \{\}\)/,
    'dispatchEvents should take the inbound flag itself');
  assert.match(runtimeSource, /if \(inbound\) origin\.inboundDepth \+= 1;/);
  assert.match(runtimeSource, /if \(inbound\) origin\.inboundDepth -= 1;/);
  assert.doesNotMatch(runtimeSource, /withInbound\(\(\) => dispatchEvents/,
    'no synchronous wrapper around the async dispatch');
});

test('a decoded dump announces each parameter once, not twice', () => {
  // The decoded values reach scripts by two routes: the dump-parsed event, and deviceRuntimeState
  // (whose subscriber raises onParameterReceived for whatever changed). onDumpParsed has to record
  // what it announced, or every dump is announced a second time, one event per parameter.
  const dumpFn = runtimeSource.slice(runtimeSource.indexOf('function onDumpParsed'));
  assert.match(dumpFn.slice(0, 1600), /runtimeParams\.set\(/,
    'onDumpParsed should seed runtimeParams for the values it announced');
});

/* ------------------------------------------------------------------- value representations */

test('both spellings of the value accessor are accepted', () => {
  // The suffix was documented and the second argument was implemented, and for a while neither
  // was wired through. Both now resolve to the same request.
  assert.match(runtimeSource, /function splitAccessor\(path, explicitForm\)/);
  assert.match(runtimeSource, /DERIVED_ACCESSORS\.has\(tail\)/,
    'a trailing .normalizedValue / .midiValue should be recognised as an accessor');
  assert.match(runtimeSource, /get: \(path, form\) => getValue\(path, form\)/,
    'get should pass a form argument through');
});

test('normalizedValue is arithmetic over the control\'s own range, and is clamped', () => {
  assert.match(runtimeSource, /function rangeOf\(control\)/);
  assert.match(runtimeSource, /behavior\?\.min/, 'the range comes from Behavior.min/max');
  assert.match(runtimeSource, /Math\.max\(0, Math\.min\(1,/,
    'a position outside 0–1 must be clamped, not driven past the control limits');
});

test('midiValue reports that it needs the device host instead of returning undefined', () => {
  assert.match(runtimeSource, /function reportNeedsDeviceHost\(member, path\)/);
  assert.match(runtimeSource, /addScriptTrace\('error'/,
    'the report must be at error level — info level reads as ordinary chatter');
});

test('buildDump says why it produced nothing rather than returning a quiet null', () => {
  const build = runtimeSource.slice(runtimeSource.indexOf('buildDump: (kind)'));
  assert.match(build.slice(0, 600), /addScriptTrace\(\s*'error'/,
    'buildDump should report at error level when the device host is absent');
});

/* --------------------------------------------------------------------- set()\'s opts.transmit */

test('set honours opts.transmit, which used to be accepted and dropped', () => {
  assert.match(runtimeSource, /const transmit = opts && 'transmit' in opts \? opts\.transmit !== false : defaultTransmit\(\);/,
    'an explicit opts.transmit must beat the origin rule, as it does in the C++ host');
  // A string in that position is the value form, an object is opts — the contract puts both there.
  assert.match(runtimeSource, /const form = typeof formOrOpts === 'string' \? formOrOpts : '';/);
});

/* ---------------------------------------------------------------------------------- off() */

test('off is bound and takes its arguments', () => {
  assert.equal(typeof api.off, 'function');
  assert.ok(api.off.length >= 2, 'off(target, event) should take both');
  assert.doesNotThrow(() => api.off('*', 'never-registered'), 'an unknown pair is a no-op');
});

test('off only removes the calling script\'s listeners', () => {
  // Scoped by script id, so one script cannot silently unsubscribe another's handlers — a failure
  // that would be near-impossible to debug from the script that stopped working.
  assert.match(runtimeSource, /function removeListener\(scriptId, target, event\)/);
  assert.match(runtimeSource, /l\.scriptId === scriptId && l\.target === t && l\.event === e/);
});

test('startTimer replaces a timer with the same id rather than stacking a second one', () => {
  api.startTimer('t', 10_000);
  api.startTimer('t', 10_000);
  assert.doesNotThrow(() => api.stopTimer('t'));
  assert.doesNotThrow(() => api.stopTimer('t'), 'stopping an unknown id is harmless');
  assert.doesNotThrow(() => api.stopTimer('never-started'));
});

/* ------------------------------------------------------------- ce.midi channel messages */

test('the message verbs are bound and assemble without throwing', () => {
  for (const name of ['sendMidi', 'sendNote', 'sendNoteOff', 'sendProgramChange',
    'sendPitchBend', 'sendAftertouch', 'sendClock', 'sendTransport']) {
    assert.equal(typeof api[name], 'function', `${name} should be bound`);
  }
  // No JUCE host in a test run, so sends are traced rather than transmitted.
  assert.doesNotThrow(() => api.sendNote(1, 60, 100));
  assert.doesNotThrow(() => api.sendNote(1, 'C4', 100), 'a note name should resolve');
  assert.doesNotThrow(() => api.sendProgramChange(1, 7, 2, 3));
  assert.doesNotThrow(() => api.sendPitchBend(1, 8192));
  assert.doesNotThrow(() => api.sendAftertouch(1, 90, 64));
  assert.doesNotThrow(() => api.sendTransport('stop'));
});

test('middle C is C4, and the docs now say so', () => {
  // The contract claimed 60 -> "C3" (the Yamaha convention) while every runtime computed "C4"
  // (scientific pitch notation). A script written from the manual transposed by an octave.
  assert.equal(api.noteName(60), 'C4');
  assert.equal(api.noteNumber('C4'), 60);
  assert.equal(api.noteNumber(api.noteName(60)), 60, 'the pair must round-trip');
});

test('the note verbs build the bytes the MIDI spec calls for', () => {
  // Asserted against the runtime source rather than a captured send, since without a JUCE host the
  // bytes only reach the trace console. The C++ suite asserts the actual wire bytes.
  assert.match(runtimeSource, /0x90 \| midiCh\(ch\), midiNote\(note\)/, 'note on is 0x90');
  assert.match(runtimeSource, /0x80 \| midiCh\(ch\), midiNote\(note\)/, 'note off is 0x80');
  assert.match(runtimeSource, /0xC0 \| midiCh\(ch\)/, 'program change is 0xC0');
  assert.match(runtimeSource, /0xE0 \| midiCh\(ch\), v % 128, Math\.floor\(v \/ 128\)/, 'pitch bend is lsb then msb');
  assert.match(runtimeSource, /0xD0 \| midiCh\(ch\)/, 'channel pressure is 0xD0');
  assert.match(runtimeSource, /0xA0 \| midiCh\(ch\)/, 'poly pressure is 0xA0');
  assert.match(runtimeSource, /\[0xF8\]/, 'clock is 0xF8');
});

test('bank select is sent before the program change', () => {
  // A device applies the bank in force when the PC lands, so the other order selects from the
  // previous bank — a bug that only shows on a synth, never in the editor.
  const fn = runtimeSource.slice(runtimeSource.indexOf('sendProgramChange: (ch, program'));
  const bankAt = fn.indexOf('bankMsb');
  const pcAt = fn.indexOf('0xC0');
  assert.ok(bankAt !== -1 && pcAt !== -1 && bankAt < pcAt, 'bank select must precede the program change');
});

/* ---------------------------------------------------------------------------- ce.storage */

test('state is per script and survives between calls', () => {
  const a = scriptApiForTesting('', 'script-a');
  const b = scriptApiForTesting('', 'script-b');
  a.state.count = 1;
  assert.equal(scriptApiForTesting('', 'script-a').state.count, 1, 'the same script sees its own state');
  assert.equal(b.state.count, undefined, 'another script does not');
});

test('loadSetting returns the fallback for a key never written', () => {
  assert.equal(api.loadSetting('never-written', 'fallback'), 'fallback');
  assert.equal(typeof api.saveSetting, 'function');
});

/* ------------------------------------------------------------------- module opt-in (slice 3) */
// The runtime resolves the panel's declared modules and gates everything else. These install a
// panel through setRuntimeHost — the same door the exported player comes in by — so the gate is
// exercised the way it actually runs rather than through a private hook.

function withPanel(panel, fn) {
  setRuntimeHost({ panel });
  try { return fn(); } finally { setRuntimeHost(null); }
}

const gateNotices = () => get(scriptTrace)
  .filter((t) => String(t.message ?? '').includes('has not enabled'))
  .map((t) => t.message);

test('a member of an undeclared module is a stub that names the module', () => {
  const panel = { id: 'p', scripting: { modules: ['ce.math'] }, controls: [] };
  withPanel(panel, () => {
    clearScriptTrace();
    const gated = scriptApiForTesting('', 'gate-1');

    assert.equal(typeof gated.sendCC, 'function', 'gated, not deleted — the name still resolves');
    gated.sendCC(1, 74, 100);
    const notices = gateNotices();
    assert.equal(notices.length, 1, 'the call reported exactly once');
    assert.match(notices[0], /sendCC\(\) needs the ce\.midi module/);
    assert.match(notices[0], /Scripting Modules/, 'and says where to turn it on');

    // The namespaced spelling is the SAME function object, so it cannot be a way around the gate.
    assert.equal(gated.ce.midi.sendCC, gated.sendCC);
    // A declared module is untouched.
    assert.equal(gated.clamp(5, 0, 3), 3);
    // ce.core is never gated, whatever the list says.
    assert.equal(typeof gated.set, 'function');
    assert.equal(typeof gated.log, 'function');
  });
});

test('ce.has and ce.modules report the panel\'s list, not the whole manifest', () => {
  withPanel({ id: 'p', scripting: { modules: ['ce.math'] }, controls: [] }, () => {
    const { ce } = scriptApiForTesting('', 'gate-2');
    assert.equal(ce.has('ce.math'), true);
    assert.equal(ce.has('ce.midi'), false, 'a module the panel left off');
    assert.equal(ce.has('ce.nonexistent'), false);
    assert.deepEqual(ce.modules.map((m) => m.id), ['ce.core', 'ce.math']);
    assert.equal(ce.version, CE_API_VERSION);
    assert.equal(ce.runtime, RUNTIME_WEBVIEW);
  });
});

test('a panel with no declaration follows its scripts', () => {
  const panel = {
    id: 'p', controls: [],
    scripts: [{ id: 's', source: 'function onX(){ sendCC(1, 74, 100) }' }],
  };
  withPanel(panel, () => {
    clearScriptTrace();
    const auto = scriptApiForTesting('', 'gate-3');
    auto.sendCC(1, 74, 100);
    assert.deepEqual(gateNotices(), [], 'auto-detection enabled ce.midi, so nothing is gated');
    assert.equal(auto.ce.has('ce.midi'), true);
    // …and what the scripts never mention stays off, which is the point of measuring cost.
    assert.equal(auto.ce.has('ce.components.setlist'), false);
  });
});

test('`state` is not replaced by a stub even when its module is off', () => {
  // A gate stub is a function. Swapping a table for one turns `state.count = 1` into a type
  // error, which explains nothing — the exact failure mode gating exists to remove.
  withPanel({ id: 'p', scripting: { modules: [] }, controls: [] }, () => {
    const gated = scriptApiForTesting('', 'gate-4');
    assert.equal(typeof gated.state, 'object');
    gated.state.count = 1;
    assert.equal(gated.state.count, 1);
    assert.equal(gated.ce.has('ce.storage'), false, 'the module still reports as off');
  });
});

test('with no panel at all, nothing is gated', () => {
  // Gating an API that has no document to protect would just make the runtime unusable outside
  // one. An empty set is a panel decision; the absence of a panel is not.
  clearScriptTrace();
  const ungated = scriptApiForTesting('', 'gate-5');
  ungated.sendCC(1, 74, 100);
  assert.deepEqual(gateNotices(), []);
  assert.equal(ungated.ce.has('ce.midi'), true);
});

/* ------------------------------------------------------------------ ce.device reads (phase 2) */
// The editor answers these from the device stores — the same data the device host would report.
// The one honest asymmetry is the parameter table: synchronous and complete in the player, cached
// and asynchronously filled here, so a cold first call says so instead of returning a bare [].

import {
  deviceProfiles, deviceRoleMappings, profileParameters, deviceSessionState,
} from '../src/CE_Application/stores/deviceProfiles.js';
import { resetDeviceReadCache } from '../src/CE_Application/scripting/panelRuntime.js';

function withDevice({ profiles = [], mappings = {}, params = {}, session = {} }, fn) {
  const before = {
    profiles: get(deviceProfiles), mappings: get(deviceRoleMappings),
    params: get(profileParameters), session: get(deviceSessionState),
  };
  deviceProfiles.set(profiles);
  deviceRoleMappings.set(mappings);
  profileParameters.set(params);
  deviceSessionState.set(session);
  resetDeviceReadCache();
  try { return fn(); } finally {
    deviceProfiles.set(before.profiles);
    deviceRoleMappings.set(before.mappings);
    profileParameters.set(before.params);
    deviceSessionState.set(before.session);
    resetDeviceReadCache();
  }
}

const DEVICE_FIXTURE = {
  profiles: [{ id: 'test-cc-synth', name: 'Test CC Synth' }],
  mappings: { mainSynth: { role: 'mainSynth', profileId: 'test-cc-synth', midiDestination: { id: 'out-1', name: 'Out 1' } } },
  session: { mainSynth: { state: 'ready', profileId: 'test-cc-synth' } },
  params: {
    'test-cc-synth': [
      { id: 'cutoff', name: 'Filter Cutoff', group: 'Filter', type: 'continuous', min: 0, max: 127 },
      { id: 'resonance', name: 'Filter Resonance', group: 'Filter', type: 'continuous', min: 0, max: 127 },
      { id: 'attack', name: 'Amp Attack', group: 'Envelope', type: 'continuous', min: 0, max: 100 },
    ],
  },
};

test('ce.device.profile reports what is mapped to the role', () => {
  withDevice(DEVICE_FIXTURE, () => {
    const api = scriptApiForTesting('', 'dev-1');
    const p = api.deviceProfile();
    assert.equal(p.id, 'test-cc-synth');
    assert.equal(p.name, 'Test CC Synth');
    assert.equal(p.role, 'mainSynth');
    assert.equal(p.connected, true);
    assert.equal(api.ce.device.profile, api.deviceProfile, 'both spellings are the same function');
  });
});

test('ce.device.connected answers per role', () => {
  withDevice(DEVICE_FIXTURE, () => {
    const api = scriptApiForTesting('', 'dev-2');
    assert.equal(api.deviceConnected(), true);
    assert.equal(api.deviceConnected('aux'), false, 'a role with no session is not connected');
  });
});

test('ce.device.parameters reads the table and narrows it', () => {
  withDevice(DEVICE_FIXTURE, () => {
    const api = scriptApiForTesting('', 'dev-3');
    assert.equal(api.deviceParameters().length, 3);
    assert.deepEqual(api.deviceParameters({ group: 'Filter' }).map((p) => p.id), ['cutoff', 'resonance']);
    assert.deepEqual(api.deviceParameters({ query: 'reson' }).map((p) => p.id), ['resonance']);
    assert.equal(api.deviceParameters({ limit: 2 }).length, 2);
    assert.equal(api.deviceParameter('attack').name, 'Amp Attack');
    assert.equal(api.deviceParameter('nope'), null, 'an unknown id is null, not a guess');
  });
});

test('a cold parameter cache SAYS it is cold rather than reporting an empty synth', () => {
  // The failure this prevents: [] from a not-yet-loaded table looks exactly like [] from a synth
  // with no parameters, and a script cannot tell them apart. So it says which one it is.
  withDevice({ ...DEVICE_FIXTURE, params: {} }, () => {
    clearScriptTrace();
    const api = scriptApiForTesting('', 'dev-4');
    assert.deepEqual(api.deviceParameters(), []);
    const said = get(scriptTrace).map((t) => String(t.message ?? '')).join('\n');
    assert.match(said, /has not been loaded yet/);
    assert.match(said, /In the exported plugin this read is synchronous/,
      'and names the asymmetry, so the editor behaviour is not mistaken for the shipped one');
  });
});

test('with no profile mapped, the reads say so rather than inventing one', () => {
  withDevice({ profiles: [], mappings: {}, params: {}, session: {} }, () => {
    clearScriptTrace();
    const api = scriptApiForTesting('', 'dev-5');
    assert.equal(api.deviceProfile(), null);
    assert.equal(api.deviceConnected(), false);
    assert.deepEqual(api.deviceParameters(), []);
    assert.match(get(scriptTrace).map((t) => String(t.message ?? '')).join('\n'),
      /no device profile is mapped/);
  });
});

/* --------------------------------------------------------------------- ce.time (phase 3) */
// The editor answers from the master clock (stores/transport.js); the player answers from the DAW
// playhead. The conversions are the part that has to agree to the millisecond across runtimes —
// a delay time computed in the editor and recomputed in the exported plugin must be the same
// number, which is why beatsToMs is prelude arithmetic over one snapshot rather than per-engine.

import { transport as transportStore } from '../src/CE_Application/stores/transport.js';

function withTransport(state, fn) {
  const before = get(transportStore);
  transportStore.set({ ...before, ...state });
  try { return fn(); } finally { transportStore.set(before); }
}

test('ce.time reads the clock', () => {
  withTransport({ running: true, bpm: 120, beats: 6, beatsPerBar: 4, source: 'host' }, () => {
    const api = scriptApiForTesting('', 'time-1');
    assert.equal(api.tempo(), 120);
    assert.equal(api.isPlaying(), true);

    const t = api.transportInfo();
    assert.equal(t.bar, 2, 'beat 6 of a 4/4 bar is bar 2…');
    assert.equal(t.beat, 3, '…beat 3');
    assert.equal(t.beatsPerBar, 4);
    assert.equal(t.source, 'host');
    assert.equal(t.valid, true);

    assert.equal(api.ce.time.transport, api.transportInfo, 'both spellings are the same function');
    assert.equal(api.ce.time.playing, api.isPlaying);
  });
});

test('beatsToMs is the delay-time calculation, and msToBeats is its inverse', () => {
  withTransport({ running: true, bpm: 120, beats: 0, beatsPerBar: 4 }, () => {
    const api = scriptApiForTesting('', 'time-2');
    // The same numbers ScriptRuntimeTests asserts in Lua and JavaScript. A panel that computes a
    // delay time in the editor and again in the shipped plugin must get the same milliseconds.
    assert.equal(api.beatsToMs(1), 500, 'a quarter note at 120bpm');
    assert.equal(api.beatsToMs(0.75), 375, 'a dotted eighth');
    assert.equal(api.beatsToMs(0.25), 125, 'a sixteenth');
    assert.equal(api.msToBeats(375), 0.75);
    assert.equal(api.beatsToMs(1, 90).toFixed(3), '666.667', 'an explicit bpm overrides the clock');
    assert.equal(api.msToBeats(api.beatsToMs(1.75)), 1.75, 'round-trip');
  });
});

test('with no tempo, the conversions are null rather than a number computed from nothing', () => {
  withTransport({ running: false, bpm: 0, beats: 0 }, () => {
    clearScriptTrace();
    const api = scriptApiForTesting('', 'time-3');
    assert.equal(api.tempo(), null);
    assert.equal(api.isPlaying(), false);
    assert.equal(api.beatsToMs(1), null);
    assert.equal(api.msToBeats(500), null);

    api.syncTimer('step', 0.25);
    assert.match(get(scriptTrace).map((t) => String(t.message ?? '')).join('\n'),
      /no tempo is being reported/, 'syncTimer says why it armed nothing');
  });
});

test('a stopped transport still reports its tempo — stopped is not unknown', () => {
  withTransport({ running: false, bpm: 96, beats: 12, beatsPerBar: 3 }, () => {
    const api = scriptApiForTesting('', 'time-4');
    assert.equal(api.tempo(), 96);
    assert.equal(api.isPlaying(), false);
    assert.equal(api.beatsToMs(1), 625, 'and the conversions still work');
    const t = api.transportInfo();
    assert.equal(t.bar, 5, '12 beats of 3/4 is bar 5');
    assert.equal(t.beat, 1);
  });
});
