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
