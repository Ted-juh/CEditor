// deviceParameterTable.test.js — a profile's parameters, whole, and what is said of an id it lacks.
//
// The readers that asked "is this id in the profile?" asked the Device Profile Designer's page:
// 160 parameters by default, or what the Designer's search matched. On a profile longer than a page,
// or one searched in the Designer, a parameter that was there was refused as "not in profile",
// ce.device.parameter() answered nothing for it and bind() called it unknown; and the script
// runtime asked the host for the list with one object where the request takes the id and the role,
// so a profile the Designer had not listed was never loaded at all. ce.device.write of an id the
// profile does lack was logged as sent and answered true in the editor, and answered false without
// a word in the plug-in.

import test from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';
import { fileURLToPath } from 'node:url';
import { readText } from './support/readText.mjs';

import {
  profileParameterTables, parameterTable, requestParameterTable, acceptParameterTablePage,
  isParameterTablePage, forgetParameterTable, setParameterTableRequesterForTest,
} from '../src/CE_Application/stores/deviceParameterTable.js';
import {
  deviceProfiles, deviceRoleMappings, profileParameters, profileParameterPages, latestMidiPreview,
} from '../src/CE_Application/stores/deviceProfileStores.js';
import { commitDeviceParameter } from '../src/CE_Application/stores/deviceMidiOps.js';
import { deviceWriteUnknownWords, deviceWriteNoProfileWords, deviceBindUnknownWords } from '../src/CE_Application/scripting/deviceWords.js';
import {
  resetScriptStateForTesting, scriptApiForTesting, setRuntimeHost, clearDeviceRuntimeDefinitions,
} from '../src/CE_Application/scripting/panelRuntime.js';
import { scriptTrace, clearScriptTrace } from '../src/CE_Application/stores/scriptConsole.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { valueAtPath, setNestedValue } from '../src/CE_Application/stores/controlTreeUtils.js';
import { readStatement } from '../src/CE_Application/scripting/scriptValues.js';
import { meaningLine } from '../src/CE_Application/editor/valueRows.js';
import { deviceValueContext, declaredDeviceParameters } from '../src/CE_Application/editor/valuesContext.js';
import { valueCompletions } from '../src/CE_Application/scripting/valueCompletions.js';

const ids = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `p${from + i}`, name: `Param ${from + i}` }));

/** The table's requests, as the bridge would get them; each page answered by `answer`. */
function capture() {
  const requests = [];
  setParameterTableRequesterForTest((payload) => requests.push(payload));
  return requests;
}

function reset() {
  profileParameterTables.set({});
  profileParameters.set({});
  profileParameterPages.set({});
  deviceProfiles.set([]);
  deviceRoleMappings.set({});
  latestMidiPreview.set(null);
}

test.after(() => { setParameterTableRequesterForTest(null); reset(); resetScriptStateForTesting(); });

test('a profile\'s table is loaded whole, page after page, under its own requests', () => {
  reset();
  const requests = capture();
  requestParameterTable('gaia', 'mainSynth');
  assert.deepEqual(requests, [{ requestId: 'parameter-table:gaia:0', profileId: 'gaia', deviceRole: 'mainSynth', offset: 0, limit: 500 }]);
  assert.equal(parameterTable('gaia'), null, 'nothing before the last page');
  requestParameterTable('gaia', 'mainSynth');
  assert.equal(requests.length, 1, 'asked once while it loads');
  assert.equal(isParameterTablePage({ requestId: requests[0].requestId }), true);
  assert.equal(isParameterTablePage({ requestId: 'profile_parameters_x' }), false, 'the Designer\'s pages are not the table\'s');

  acceptParameterTablePage({ ok: true, requestId: requests[0].requestId, parameters: ids(500), hasMore: true, total: 620 });
  assert.equal(parameterTable('gaia'), null, 'still not whole');
  assert.deepEqual(requests[1], { requestId: 'parameter-table:gaia:500', profileId: 'gaia', deviceRole: 'mainSynth', offset: 500, limit: 500 });
  acceptParameterTablePage({ ok: true, requestId: requests[1].requestId, parameters: ids(120, 500), hasMore: false, total: 620 });
  assert.equal(parameterTable('gaia').length, 620);
  assert.equal(parameterTable('gaia')[619].id, 'p619');
  requestParameterTable('gaia', 'mainSynth');
  assert.equal(requests.length, 2, 'a whole table is not asked for again');
  // The Designer's own page is never touched.
  assert.deepEqual(get(profileParameters), {});

  forgetParameterTable('gaia');
  assert.equal(parameterTable('gaia'), null, 'a changed source drops it');
  requestParameterTable('gaia', 'mainSynth');
  assert.equal(requests.length, 3, 'and the next reader asks again');
});

test('an error, a page out of turn or a promise of more with nothing in it leaves no table', () => {
  for (const page of [
    (id) => ({ ok: false, requestId: id, error: 'Unknown profileId: gaia' }),
    () => ({ ok: true, requestId: 'parameter-table:gaia:500', parameters: ids(3), hasMore: false }),
    (id) => ({ ok: true, requestId: id, parameters: [], hasMore: true }),
  ]) {
    reset();
    const requests = capture();
    requestParameterTable('gaia');
    acceptParameterTablePage(page(requests[0].requestId));
    assert.equal(parameterTable('gaia'), null);
    assert.equal(get(profileParameterTables).gaia, undefined, 'forgotten, so the next reader asks again');
    requestParameterTable('gaia');
    assert.equal(requests.length, 2);
  }
});

/** What the send check said of a commit: the MIDI preview's refusal, or null. */
function refusalOf(parameterId) {
  latestMidiPreview.set(null);
  commitDeviceParameter({ deviceRole: 'mainSynth', parameterId, value: 1, dryRun: true });
  return get(latestMidiPreview)?.error ?? null;
}

test('a send is checked against the whole table, and never against a page the Designer searched', () => {
  reset();
  capture();
  deviceProfiles.set([{ id: 'gaia', name: 'Roland GAIA SH-01' }]);
  deviceRoleMappings.set({ mainSynth: { profileId: 'gaia' } });
  // The Designer searched "cut": its page is the one match, and nothing more is to load.
  profileParameters.set({ gaia: [{ id: 'cutoff' }] });
  profileParameterPages.set({ gaia: { loaded: 1, total: 1, hasMore: false, query: 'cut' } });
  assert.equal(refusalOf('resonance'), null, 'a parameter the search left out is not refused');
  // An unfiltered page with nothing more is the whole profile, as before the table.
  profileParameterPages.set({ gaia: { loaded: 1, total: 1, hasMore: false, query: '' } });
  assert.equal(refusalOf('resonance'), 'Not sent: resonance is not in profile gaia.');
  // The whole table, once it is in, is what is asked.
  profileParameterTables.set({ gaia: { parameters: [{ id: 'cutoff' }, { id: 'resonance' }], complete: true } });
  assert.equal(refusalOf('resonance'), null);
  assert.equal(refusalOf('resonanse'), 'Not sent: resonanse is not in profile gaia.');
});

/* ======================================================================== the runtime */

function runtimeLines(fn) {
  clearScriptTrace();
  const result = fn();
  return { result, lines: get(scriptTrace).filter((t) => t.kind !== 'midi').map((t) => t.message) };
}

function withDevice(parameters, fn) {
  reset();
  capture();
  deviceProfiles.set([{ id: 'gaia', name: 'Roland GAIA SH-01' }]);
  deviceRoleMappings.set({ mainSynth: { profileId: 'gaia' } });
  if (parameters) profileParameterTables.set({ gaia: { parameters, complete: true } });
  const knob = createControl('Knob', { name: 'Cutoff' });
  const panel = { id: 'p', name: 'P', width: 800, height: 400, controls: [knob], scripting: { modules: ['ce.core', 'ce.device'] } };
  setRuntimeHost({
    panel, scripts: [],
    readValue: (control, p) => valueAtPath(control, p),
    writeValue: (control, p, value) => (setNestedValue(control, p, value), true),
  });
  clearDeviceRuntimeDefinitions();
  try { return fn(scriptApiForTesting('', 'device-probe')); } finally { setRuntimeHost(null); }
}

const GAIA = [{ id: 'cutoff', name: 'Cutoff', group: 'Filter', type: 'int', range: { min: 0, max: 127 } }, { id: 'resonance', name: 'Resonance' }];

test('ce.device.write refuses an id the whole table lacks, and says so as the plug-in does', () => {
  withDevice(GAIA, (api) => {
    const { result, lines } = runtimeLines(() => api.ce.device.write('cutof', 64));
    assert.equal(result, false);
    assert.deepEqual(lines, [deviceWriteUnknownWords('cutof', 'mainSynth')]);
    assert.equal(lines[0], 'ce.device.write: "cutof" is not a parameter of the mainSynth profile, so nothing was sent.');
    // A role of its own is named.
    deviceRoleMappings.update((m) => ({ ...m, drums: { profileId: 'gaia' } }));
    assert.equal(runtimeLines(() => api.ce.device.write('cutof', 64, 'drums')).lines[0],
      'ce.device.write: "cutof" is not a parameter of the drums profile, so nothing was sent.');
    // An id the table has goes on to the host, which this test has not: that refusal is the old one.
    assert.match(runtimeLines(() => api.ce.device.write('cutoff', 64)).lines[0] ?? '', /needs the device host/);
  });
  // A declared parameter is the script's, whatever the profile has.
  withDevice(GAIA, (api) => {
    api.ce.device.defineParameter('mine', { cc: 20 });
    const { lines } = runtimeLines(() => api.ce.device.write('mine', 1));
    assert.ok(!lines.some((l) => l.includes('is not a parameter')), lines.join('\n'));
  });
  // Until the table is in, nothing is said, and it is asked for.
  withDevice(null, (api) => {
    const { lines } = runtimeLines(() => api.ce.device.write('cutof', 64));
    assert.ok(!lines.some((l) => l.includes('is not a parameter')), lines.join('\n'));
    assert.equal(get(profileParameterTables).gaia?.loading, true);
  });
});

test('ce.device.write with no profile chosen refuses, and says so as the plug-in does', () => {
  withDevice(GAIA, (api) => {
    deviceRoleMappings.set({});
    const { result, lines } = runtimeLines(() => api.ce.device.write('cutoff', 64));
    assert.equal(result, false);
    assert.deepEqual(lines, [deviceWriteNoProfileWords('cutoff', 'mainSynth')]);
    assert.equal(lines[0], 'ce.device.write: no device profile is chosen for mainSynth, so "cutoff" was not sent. '
      + 'A parameter declared with ce.device.defineParameter is sent without one.');
    assert.equal(get(latestMidiPreview), null, 'nothing went to the host to be refused there');
  });
  // A role nothing is mapped to: the send would take its own mapping and no other, so it is refused
  // too, though a read of that role takes the main synth's profile.
  withDevice(GAIA, (api) => {
    const { result, lines } = runtimeLines(() => api.ce.device.write('cutoff', 64, 'drums'));
    assert.equal(result, false);
    assert.deepEqual(lines, [deviceWriteNoProfileWords('cutoff', 'drums')]);
    assert.equal(api.ce.device.parameter('cutoff', 'drums')?.name, 'Cutoff');
  });
  // A declared parameter needs no profile.
  withDevice(GAIA, (api) => {
    deviceRoleMappings.set({});
    api.ce.device.defineParameter('mine', { cc: 20 });
    const { result, lines } = runtimeLines(() => api.ce.device.write('mine', 1));
    assert.equal(result, true);
    assert.deepEqual(lines, []);
  });
});

test('the plug-in says the refusal in the same words', () => {
  const header = readText(fileURLToPath(new URL('../../src/Player/PluginProcessor.h', import.meta.url)));
  // Its sentence, with the id and the role where the editor's has them.
  const [before, between, after] = deviceWriteUnknownWords('\u0001', '\u0002').split(/[\u0001\u0002]/);
  const cpp = (s) => s.replace(/"/g, '\\"');
  assert.ok(header.includes(`"[script] ${cpp(before)}" + parameterId + "${cpp(between)}"`), 'before the id, and between the id and the role');
  assert.ok(header.includes(`+ "${cpp(after)}");`), 'after the role');
  assert.ok(header.includes('startsWith ("Unknown parameter: ")'), 'said for the engine\'s unknown parameter, not for every failure');

  // And with no profile: the role comes before the id there.
  const [lead, middle, tail] = deviceWriteNoProfileWords('\u0001', '\u0002').split(/[\u0001\u0002]/);
  assert.ok(header.includes(`"[script] ${cpp(lead)}" + role + "${cpp(middle)}"`), 'before the role, and between the role and the id');
  assert.ok(header.includes(`+ parameterId\n                               + "${cpp(tail)}");`), 'after the id');
  assert.ok(header.includes('startsWith ("No device profile mapped for role: ")'), 'said for the service\'s missing profile');
  const service = readText(fileURLToPath(new URL('../../src/DeviceProfile/DeviceProfileServiceMessages.cpp', import.meta.url)));
  assert.ok(service.includes('"No device profile mapped for role: " + deviceRole'), 'the error the plug-in listens for is still the one the service gives');
});

test('bind and parameters() read the whole table', () => {
  // What bind says besides its own "bind Cutoff.value → …" line.
  const said = (run) => { const out = runtimeLines(run); return { ...out, lines: out.lines.filter((l) => !l.startsWith('bind Cutoff.')) }; };
  withDevice(GAIA, (api) => {
    assert.deepEqual(said(() => api.ce.device.bind('Cutoff', 'cutoff')).lines, []);
    const unknown = said(() => api.ce.device.bind('Cutoff', 'cutof'));
    assert.equal(unknown.result, true, 'bound anyway: the parameter may still arrive');
    assert.deepEqual(unknown.lines, [deviceBindUnknownWords('Cutoff', 'cutof')]);
    // A warning, where it was a plain line: the binding is made, and may never do anything.
    assert.deepEqual(get(scriptTrace).filter((t) => t.message === deviceBindUnknownWords('Cutoff', 'cutof')).map((t) => t.kind),
      ['warn']);
    assert.deepEqual(api.ce.device.parameters().map((p) => p.id), ['cutoff', 'resonance']);
    assert.equal(api.ce.device.parameter('resonance')?.name, 'Resonance');
    // A binding to a role nothing is mapped to is sent to no profile, so nothing knows its id but a
    // declaration, though a read of that role takes the main synth's profile.
    assert.deepEqual(said(() => api.ce.device.bind('Cutoff', 'cutoff', { role: 'drums' })).lines.filter((l) => !l.startsWith('bind Cutoff')),
      [deviceBindUnknownWords('Cutoff', 'cutoff')]);
    assert.equal(api.ce.device.parameter('cutoff', 'drums')?.name, 'Cutoff');
  });
  withDevice(null, (api) => {
    // Before the table: nothing knows the id yet, which is what bind says; parameters() says the
    // table is loading; and the request is the table's, with the id and the role.
    assert.deepEqual(said(() => api.ce.device.bind('Cutoff', 'cutoff')).lines, [deviceBindUnknownWords('Cutoff', 'cutoff')]);
    const listing = runtimeLines(() => api.ce.device.parameters());
    assert.deepEqual(listing.result, []);
    assert.match(listing.lines[0], /has not been loaded yet — requesting it now/);
    assert.equal(get(profileParameterTables).gaia?.role, 'mainSynth');
  });
});

/* ======================================================================== the Values rows */

const devicesWith = (parameters, declared = []) => deviceValueContext({
  mappings: { mainSynth: { profileId: 'gaia' }, drums: { profileId: 'tr8' } },
  profiles: [{ id: 'gaia', name: 'Roland GAIA SH-01' }, { id: 'tr8', name: 'TR-8' }],
  tables: { gaia: { parameters, complete: parameters !== null }, tr8: { parameters: [{ id: 'kick' }], complete: true } },
  declared,
});

function rowOf(src, lang, devices, name = null) {
  const st = readStatement(src, lang, src.indexOf('(') + 2, { devices });
  const call = st.calls[0];
  return call.args.find((a) => a.kind === 'deviceParameter' && (!name || a.name === name));
}

test('a device parameter\'s row reads it against its profile, in the words of its call', () => {
  const devices = devicesWith(GAIA);
  const ok = rowOf('ce.device.write("cutoff", 64)', 'lua', devices);
  assert.deepEqual([ok.kind, ok.problem, ok.editable, ok.meaning.found], ['deviceParameter', null, 'choice', true]);
  assert.deepEqual(ok.meaning.choices, ['cutoff', 'resonance']);
  assert.deepEqual(ok.meaning.choiceNames, { cutoff: 'Cutoff', resonance: 'Resonance' });
  assert.equal(meaningLine(ok), 'Cutoff · Filter · 0 to 127');

  const write = rowOf('ce.device.write("cutof", 64)', 'lua', devices);
  assert.deepEqual(write.problem, { severity: 'error', message: `${deviceWriteUnknownWords('cutof', 'mainSynth')} Did you mean "cutoff"?` });
  const bind = rowOf('ce.device.bind("Cutoff", "cutof")', 'lua', devices);
  assert.deepEqual(bind.problem, { severity: 'warning', message: `${deviceBindUnknownWords('Cutoff', 'cutof')} Did you mean "cutoff"?` });
  assert.equal(rowOf('ce.device.read("cutof")', 'lua', devices).problem.message,
    '"cutof" is not a parameter of the mainSynth profile, so ce.device.read answers nothing. Did you mean "cutoff"?');
  assert.equal(rowOf('ce.device.parameter("cutof")', 'lua', devices).problem.severity, 'warning');

  // The device is the call's: read's second argument, write's third, bind's opts.role.
  assert.equal(rowOf('ce.device.read("kick", "drums")', 'lua', devices).problem, null);
  assert.match(rowOf('ce.device.write("cutoff", 1, "drums")', 'lua', devices).problem.message, /of the drums profile/);
  assert.equal(rowOf('ce.device.bind("Cutoff", "kick", { role = "drums" })', 'lua', devices).problem, null);
  assert.equal(rowOf('ce.device.bind("Cutoff", "kick", { role: "drums" });', 'javascript', devices).problem, null);
  // A role nothing is mapped to reads the main synth's profile, as the runtime does; a binding to it
  // is sent to no profile, and says so as bind does.
  assert.equal(rowOf('ce.device.read("cutoff", "bass")', 'lua', devices).problem, null);
  assert.deepEqual(rowOf('ce.device.bind("Cutoff", "cutoff", { role = "bass" })', 'lua', devices).problem,
    { severity: 'warning', message: deviceBindUnknownWords('Cutoff', 'cutoff') });
});

test('nothing is said before the table is in, with no profile, or of an id the scripts declare', () => {
  const loading = rowOf('ce.device.write("cutof", 64)', 'lua', devicesWith(null));
  assert.deepEqual([loading.problem, loading.meaning.loading, loading.editable], [null, true, null]);
  assert.equal(meaningLine(loading), 'Roland GAIA SH-01: its parameters are loading');
  // With no profile, a read answers nothing and says nothing; a write is refused, as it runs.
  const none = rowOf('ce.device.read("cutof")', 'lua', deviceValueContext({}));
  assert.deepEqual([none.problem, meaningLine(none)], [null, 'no profile is chosen for mainSynth']);
  const unsent = rowOf('ce.device.write("cutof", 64)', 'lua', deviceValueContext({}));
  assert.deepEqual([unsent.problem, meaningLine(unsent)],
    [{ severity: 'error', message: deviceWriteNoProfileWords('cutof', 'mainSynth') }, 'no profile is chosen for mainSynth']);
  // A write to a role nothing is mapped to is sent to no profile; a read of it reads the main synth's.
  assert.deepEqual(rowOf('ce.device.write("cutoff", 1, "bass")', 'lua', devicesWith(GAIA)).problem,
    { severity: 'error', message: deviceWriteNoProfileWords('cutoff', 'bass') });
  assert.equal(rowOf('ce.device.write("mine", 1)', 'lua', deviceValueContext({ declared: ['mine'] })).problem, null);
  // bind says it with no profile too, as the runtime does: nothing but a declaration knows the id.
  assert.deepEqual(rowOf('ce.device.bind("Cutoff", "cutof")', 'lua', deviceValueContext({})).problem,
    { severity: 'warning', message: deviceBindUnknownWords('Cutoff', 'cutof') });
  assert.equal(rowOf('ce.device.bind("Cutoff", "mine")', 'lua', deviceValueContext({ declared: ['mine'] })).problem, null);
  const declared = rowOf('ce.device.write("mine", 1)', 'lua', devicesWith(GAIA, ['mine']));
  assert.deepEqual([declared.problem, meaningLine(declared)], [null, 'declared by this panel\'s scripts']);
  assert.deepEqual(declaredDeviceParameters([
    { source: 'ce.device.defineParameter("a", {})\nce.device.DefineParameter(\'b\', {})' },
    { source: 'deviceDefineParameter(`c`, {}); ce.device.defineParameter(name, {})' },
  ]).map((d) => d.id), ['a', 'b', 'c']);
});

test('a declaration is for its role, as the runtime keeps it, and its row reads it so', () => {
  const declared = declaredDeviceParameters([
    { language: 'lua', source: 'ce.device.defineParameter("kick", {\n  cc = 36, -- the kick\n  range = { min = 0, max = 127 },\n}, "drums")\nce.device.defineParameter("mine", { cc = 20 })' },
    { language: 'python', source: 'ce.device.defineParameter("snare", {"cc": 38}, role="drums")\nce.device.defineParameter("any", {}, which)' },
  ]);
  assert.deepEqual(declared, [{ id: 'kick', role: 'drums' }, { id: 'mine', role: 'mainSynth' },
    { id: 'snare', role: 'drums' }, { id: 'any', role: null }], 'a role left out is the main synth\'s; one built from parts is any');
  const devices = devicesWith(GAIA, declared);
  // Declared for drums, which the GAIA does not have: a write to the main synth is refused as the
  // runtime refuses it, and a write to drums is the script's.
  assert.deepEqual(rowOf('ce.device.write("kick", 1)', 'lua', devices).problem?.message, deviceWriteUnknownWords('kick', 'mainSynth'));
  assert.equal(rowOf('ce.device.write("kick", 1, "drums")', 'lua', devices).problem, null);
  assert.equal(rowOf('ce.device.write("mine", 1)', 'lua', devices).problem, null);
  assert.equal(rowOf('ce.device.write("any", 1, "drums")', 'lua', devices).problem, null);
  // The runtime agrees: drums' declaration is not the main synth's.
  withDevice(GAIA, (api) => {
    api.ce.device.defineParameter('kick', { cc: 36 }, 'drums');
    assert.deepEqual(runtimeLines(() => api.ce.device.write('kick', 1)).lines, [deviceWriteUnknownWords('kick', 'mainSynth')]);
  });
});

test('the parameters are the completion list inside the id, each with its name', () => {
  const src = 'ce.device.write("resonance", 64)';
  const choice = valueCompletions(src, 'lua', src.indexOf('reso') + 3, { devices: devicesWith(GAIA) }, { force: true });
  assert.deepEqual(choice.options.map((o) => [o.label, o.detail]), [['cutoff', 'Cutoff'], ['resonance', 'now · Resonance']]);
  assert.equal(choice.selected, 1, 'the one written');
  // Typed, the list is the parameters the text starts or holds.
  const typed = 'ce.device.write("cut", 64)';
  assert.deepEqual(valueCompletions(typed, 'lua', typed.indexOf('cut') + 3, { devices: devicesWith(GAIA) }).options.map((o) => o.label), ['cutoff']);
});
