/**
 * The DPD models of the device profiles generated from the makers' documents, which the Device
 * Profile Designer converts from a profile when it opens one (CE/dpd/from-legacy-core.mjs).
 *
 * For every generated profile, the conversion must hold: emitting the model gives the profile back,
 * every field equal and every parameter sending the same message at the ends and middle of its range
 * and at every choice, and the model passes the DPD validator the Designer shows. A profile the
 * converter cannot carry, or one regenerated into a shape it does not know, fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { legacyToDpd, compareEmission, emitModel, dpdIdOf } from '../../dpd/from-legacy-core.mjs';
import { checkProfile, generatedProfiles, handMadeIds } from '../../dpd/tools/from-legacy.mjs';
import { localCompileParameter } from '../src/CE_Application/stores/deviceProfileLocalEngine.js';

const legacyOf = (id) => JSON.parse(readFileSync(new URL(`../../profiles/test/${id}.ceditor-device.json`, import.meta.url), 'utf8'));
const handMade = handMadeIds();

test('every generated profile converts to a DPD model that validates and emits it back', async () => {
  const profiles = generatedProfiles();
  assert.ok(profiles.length >= 360, `${profiles.length} generated profiles`);
  const failed = [];
  for (const legacy of profiles) {
    const problems = await checkProfile(legacy, handMade);
    if (problems.length) failed.push(`${legacy.id}: ${problems.slice(0, 3).join('; ')}`);
  }
  assert.deepEqual(failed, []);
});

test('a converted model emits under its profile\'s own id and name, linked back to the model', () => {
  const legacy = legacyOf('arturia-microfreak');
  const emitted = emitModel(legacyToDpd(legacy, { handMade }).model);
  assert.equal(emitted.id, 'arturia-microfreak');
  assert.equal(emitted.name, legacy.name);
  assert.equal(emitted.dpdSource, 'arturia.microfreak');
  assert.equal(dpdIdOf({ id: 'black-corporation-deckards-dream-mk2', manufacturer: 'Black Corporation' }), 'black-corporation.deckards-dream-mk2');
});

test('a converted id never takes a hand-made model\'s', () => {
  // The older hand-written roland-gaia profile would convert to roland.gaia, the GAIA's own model.
  assert.ok(handMade.has('roland.gaia'));
  assert.equal(legacyToDpd(legacyOf('roland-gaia'), { handMade }).model.id, 'roland.gaia-converted');
});

test('the gate notices a model that sends something else', () => {
  const legacy = legacyOf('arturia-microfreak');
  const { model } = legacyToDpd(legacy, { handMade });
  const p = model.scopes.global.parameters.find((x) => x.wires[0]?.msg === 'cc');
  p.wires[0].cc = (p.wires[0].cc + 1) % 128;
  const problems = compareEmission(legacy, model, localCompileParameter);
  assert.ok(problems.some((m) => m.startsWith(`${p.id} = `)), problems.join('\n'));
});

test('SysEx written out per parameter becomes one shape and an address each, and a wrong address is caught', () => {
  // The Andromeda's profile has a recipe per parameter (F0 00 00 0E 1D 0E <page> <param> <value> F7).
  const legacy = legacyOf('alesis-a6-andromeda');
  const { model } = legacyToDpd(legacy, { handMade });
  const edit = model.messageShapes.find((s) => s.id === 'edit');
  assert.deepEqual(edit.template, ['F0', '00', '00', '0E', '1D', '0E', '$address', '$encodedValue', 'F7']);
  const tempo = model.scopes.global.parameters.find((p) => p.id === 'clock.tempo');
  assert.equal(tempo.address, '05 00');
  assert.deepEqual(tempo.wires, [{ dir: 'write', msg: 'dt1', shape: 'edit' }]);
  tempo.address = '05 01';
  const problems = compareEmission(legacy, model, localCompileParameter);
  assert.ok(problems.some((m) => m.startsWith('clock.tempo = ')), problems.slice(0, 3).join('\n'));
});

test('a dump is a DPD dump: framing, checksum, layout; and a changed dump is caught', () => {
  const legacy = legacyOf('waldorf-blofeld');
  const { model } = legacyToDpd(legacy, { handMade });
  const [dump] = model.dumps;
  assert.equal(dump.id, 'soundEditBuffer');
  assert.deepEqual(dump.message.matcher.prefix, ['F0', '3E', '13', '$deviceId', '10', '7F', '00']);
  assert.equal(dump.message.checksum.type, 'sum-7bit');
  assert.ok(dump.layout.some((e) => e.param === 'oscillator1.osc1Octave' && e.offset === 1));
  dump.layout.find((e) => e.param === 'oscillator1.osc1Octave').offset = 2;
  const problems = compareEmission(legacy, model, localCompileParameter);
  assert.ok(problems.includes('profile field dumpDefinitions differs'), problems.join('\n'));
});

test('repeated blocks fold into scopes: one block, its instances, its step, its names', () => {
  // The JD-Xi's drum kit: 37 keys of 145 parameters, each key 00 00 01 00 on from the last.
  const jdxi = legacyToDpd(legacyOf('roland-jd-xi'), { handMade }).model;
  const keys = Object.values(jdxi.scopes).find((s) => s.idTemplate === 'drums.key{n}.{id}');
  assert.ok(keys, Object.values(jdxi.scopes).map((s) => s.idTemplate).join(', '));
  assert.equal(keys.instances, 37);
  assert.equal(keys.parameters.length, 145);
  // The Digitakt's two LFOs: CC 102 and 112, the same eight parameters ten controllers apart.
  const digitakt = legacyToDpd(legacyOf('elektron-digitakt'), { handMade }).model;
  const lfo = Object.values(digitakt.scopes).find((s) => s.idTemplate === 'lfo{n}.{id}');
  assert.equal(lfo.instances, 2);
  assert.equal(lfo.parameters.find((p) => p.id === 'speed').wires[0].ccStride, 10);
  // Folded or not, the model emits the profile it came from (the first test proves it for all).
  assert.ok(Object.values(legacyToDpd(legacyOf('korg-kronos-drum-kit'), { handMade }).model.scopes).reduce((n, s) => n + s.parameters.length, 0) < 20352 / 2);
});

test('a parameter names its own send policy only when its model\'s default for its type is not it', () => {
  const { model } = legacyToDpd(legacyOf('arturia-microfreak'), { handMade });
  // Its knobs are sent as they move: the model says so once.
  assert.deepEqual(model.defaults.sendPolicy, { continuous: { mode: 'continuous', coalesce: true, minIntervalMs: 0, sendFinalOnRelease: true } });
  assert.ok(Object.values(model.scopes).flatMap((s) => s.parameters).every((p) => p.sendPolicy === undefined && !p.engine?.sendPolicy));
});

test('the device\'s conversation is the model\'s own: requests, startup, identity, variables, timing', () => {
  const legacy = legacyOf('roland-jd-xi');
  const { model } = legacyToDpd(legacy, { handMade });
  // A Roland request is its RQ1 shape and the address and size it asks for, not 18 bytes written out.
  const setup = model.requests.find((r) => r.id === 'requestSetup');
  assert.deepEqual(setup, { id: 'requestSetup', name: 'Request Setup', shape: 'rq1', address: '01 00 00 00', size: '00 00 00 3B', response: { kind: 'bulkDump', dump: 'setup' } });
  assert.deepEqual(model.defaults.request, { timeoutMs: 1000, retries: 1 });
  // The identity request is written out; it answers with an identity, once.
  assert.deepEqual(model.requests[0], { id: 'identityRequest', name: 'Identity Request', template: ['F0', '7E', '7F', '06', '01', 'F7'], response: { kind: 'identity' }, retries: 0 });
  assert.equal(model.startup.policy, 'pull');
  assert.deepEqual(model.startup.sync.slice(0, 2), ['identityRequest', 'requestProgram']);
  assert.equal(model.dumps.find((d) => d.id === 'setup').request, 'requestSetup');
  assert.deepEqual(model.identity, { manufacturerId: '41', family: '0E 03', member: '00 00' });
  assert.equal(model.deviceId, '10');
  assert.deepEqual(model.timing, { minDelayBetweenMessagesMs: legacy.timing.minDelayBetweenMessagesMs });
  for (const key of ['requests', 'startup', 'identity', 'timing', 'variables']) assert.equal(model.engine?.[key], undefined, `engine.${key}`);
  // The shape fills to the profile's own bytes, Roland's checksum (44) included.
  const emitted = emitModel(model).requests.find((r) => r.id === 'requestSetup');
  assert.deepEqual(emitted.template, legacy.requests.find((r) => r.id === 'requestSetup').template);
  // And a request that asks for the wrong address is caught.
  setup.address = '01 00 00 01';
  const problems = compareEmission(legacy, model, localCompileParameter);
  assert.ok(problems.includes('profile field requests differs'), problems.join('\n'));
});
