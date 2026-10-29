// sh201Profile.test.js — two things the SH-201 profile now says, and why.
//
// LFO Tempo Sync. The MIDI Implementation lists the Tempo Sync Switch as "ON, OFF", where every
// other switch is "OFF, ON": raw 0 is ON. The profile had it the other way round (falseValue 0,
// trueValue 1), and the handoff held the change until a hardware test. The owner chose to make it
// and test later; the message the handoff gives for that test, Upper LFO1 Tempo Sync at raw 0, is
// what switching sync ON now sends.
//
// Names. A tone parameter's name leaves out Upper or Lower ("Filter Env Depth", not "Upper Filter
// Env Env Depth"): its group says which tone, and so do its id, its address and its section.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  encodeParameterValue, decodeParameterValue, localCompileParameter,
} from '../src/CE_Application/stores/deviceProfileLocalEngine.js';
import { buildInboundIndex, decodeInbound } from '../src/CE_Application/utils/inboundParameterIndex.js';
import { hasStartupRead, startupReadPlan } from '../src/CE_Application/utils/playerStartup.js';

const profile = JSON.parse(readFileSync(new URL('../../profiles/test/roland-sh-201.ceditor-device.json', import.meta.url), 'utf8'));
const byId = new Map(profile.parameters.map((p) => [p.id, p]));
const hex = (bytes) => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const wire = (parameter, value) => { const encoded = encodeParameterValue(parameter, value); return hex(encoded.bytes ?? encoded); };

const TEMPO_SYNC = ['upper.lfo1.tempoSync', 'upper.lfo2.tempoSync', 'lower.lfo1.tempoSync', 'lower.lfo2.tempoSync'];

test('Tempo Sync ON is raw 0 and OFF raw 1, on all four LFOs', () => {
  for (const id of TEMPO_SYNC) {
    const parameter = byId.get(id);
    assert.deepEqual([wire(parameter, true), wire(parameter, false)], ['00', '01'], id);
    assert.equal(decodeParameterValue(parameter, [0]), 1, `${id}: 00 read back is ON`);
    assert.equal(decodeParameterValue(parameter, [1]), 0, `${id}: 01 read back is OFF`);
    assert.equal(parameter.default, false, `${id}: a new patch has sync off`);
  }
  // The handoff's test message: sending ON is exactly it.
  assert.equal(localCompileParameter(profile, { parameterId: 'upper.lfo1.tempoSync', value: true, deviceRole: 'sh201' }).transaction.hex,
    'F0 41 10 00 00 16 12 10 00 01 29 00 46 F7');
  // Every other switch is still OFF, ON.
  for (const parameter of profile.parameters.filter((p) => p.type === 'boolean' && !TEMPO_SYNC.includes(p.id))) {
    assert.deepEqual([parameter.falseValue ?? 0, parameter.trueValue ?? 1], [0, 1], parameter.id);
  }
});

test('a switch goes out as the values it names, in the editor\'s own engine and the player\'s decoder', () => {
  // The native engine always sent falseValue / trueValue. The editor's JS engine sent 127 for every
  // ON, so OSC1 Wide went out as 7F where the SH-201 takes 01, and read anything non-zero as ON, so
  // a Tempo Sync arriving at raw 0 read OFF in the exported player.
  assert.equal(localCompileParameter(profile, { parameterId: 'upper.osc1.pitchWide', value: true, deviceRole: 'sh201' }).transaction.hex,
    'F0 41 10 00 00 16 12 10 00 01 01 01 6D F7');
  const index = buildInboundIndex(profile);
  assert.deepEqual(decodeInbound(index, 'F0 41 10 00 00 16 12 10 00 01 29 00 46 F7'), { parameterId: 'upper.lfo1.tempoSync', value: 1 });
  assert.deepEqual(decodeInbound(index, 'F0 41 10 00 00 16 12 10 00 01 29 01 45 F7'), { parameterId: 'upper.lfo1.tempoSync', value: 0 });
});

test('a tone parameter is named without its tone, and is told apart by its group', () => {
  const tones = profile.parameters.filter((p) => /^(upper|lower)\./.test(p.id));
  assert.equal(tones.length, 128);
  for (const parameter of tones) {
    assert.doesNotMatch(parameter.name, /\b(Upper|Lower)\b/, parameter.id);
    assert.doesNotMatch(parameter.name, /\b(\w+) \1\b/i, `${parameter.id}: no doubled word`);
    const tone = parameter.id.startsWith('upper.') ? 'Upper' : 'Lower';
    assert.ok(parameter.group.startsWith(`${tone} `), `${parameter.id}: the group says ${tone}`);
  }
  assert.equal(byId.get('upper.filterEnv.depth').name, 'Filter Env Depth');
  // Within a tone, names are unique: the Upper and Lower parameters of one name are two groups.
  for (const tone of ['upper.', 'lower.']) {
    const names = tones.filter((p) => p.id.startsWith(tone)).map((p) => p.name);
    assert.equal(new Set(names).size, names.length, `${tone} names are unique`);
  }
});

test('the startup read is the whole patch, then the system settings', () => {
  // The panel has the system settings on it, so a read that left them out would show defaults
  // for an instrument set otherwise. Before the chain the startup pull was the first request alone.
  assert.deepEqual(profile.startup.sync.map((step) => step.request), ['requestTemporaryPatchBulk', 'requestSystemDump']);
  const requests = new Map(profile.requests.map((r) => [r.id, r]));
  assert.equal(requests.get('requestTemporaryPatchBulk').response.collectionId, 'temporaryPatch');
  assert.equal(requests.get('requestSystemDump').response.dump, 'systemDump');
  const system = profile.dumpDefinitions.find((d) => d.id === 'systemDump');
  const read = new Set(system.mappings.map((m) => m.parameter));
  for (const parameter of profile.parameters.filter((p) => p.group === 'System Common')) assert.ok(read.has(parameter.id), `${parameter.id} is read`);
  // So the editor offers to read the synth when the panel connects, and the exported player pulls.
  assert.equal(hasStartupRead(profile), true);
  assert.equal(startupReadPlan({ restored: false, profile }), 'pull');
});
