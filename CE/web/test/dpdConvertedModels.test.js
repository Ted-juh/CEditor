/**
 * The DPD models converted from the generated device profiles (CE/dpd/converted, written by
 * CE/dpd/tools/from-legacy.mjs), which the Device Profile Designer opens for those profiles.
 *
 * Each must be what conversion gives today, and emitting it must give its engine profile back: every
 * field equal, and every parameter sending the same bytes at the ends and middle of its range and at
 * every choice. A profile regenerated from its manual without reconverting fails here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { legacyToDpd, compareEmission, emitModel, dpdIdOf } from '../../dpd/tools/from-legacy.mjs';

const at = (rel) => new URL(rel, import.meta.url);
const index = JSON.parse(readFileSync(at('../src/CE_Application/generated/dpdConvertedIndex.json'), 'utf8'));
const convertedFiles = readdirSync(at('../../dpd/converted/')).filter((f) => f.endsWith('.json'));
const handMade = readdirSync(at('../../dpd/library/')).map((f) => f.replace(/\.json$/, ''));
const legacyOf = (id) => JSON.parse(readFileSync(at(`../../profiles/test/${id}.ceditor-device.json`), 'utf8'));

test('every converted model is what conversion gives, and emits its profile back', async () => {
  assert.ok(Object.keys(index).length >= 239, `${Object.keys(index).length} profiles have a converted model`);
  for (const [legacyId, dpdId] of Object.entries(index)) {
    const legacy = legacyOf(legacyId);
    const { model, why } = legacyToDpd(legacy);
    assert.ok(model, `${legacyId}: ${why}`);
    assert.equal(model.id, dpdId);
    const file = readFileSync(at(`../../dpd/converted/${dpdId}.json`), 'utf8');
    assert.equal(file, `${JSON.stringify(model, null, 2)}\n`, `${dpdId} is stale: run node CE/dpd/tools/from-legacy.mjs --all`);
    assert.deepEqual(await compareEmission(legacy, model), [], legacyId);
  }
});

test('the index and the folder agree, and no converted id is a hand-made one', () => {
  assert.deepEqual(convertedFiles.map((f) => f.replace(/\.json$/, '')).sort(), Object.values(index).sort());
  for (const id of Object.values(index)) assert.ok(!handMade.includes(id), `${id} is also in CE/dpd/library`);
  assert.equal(new Set(Object.values(index)).size, Object.values(index).length, 'two profiles convert to one id');
});

test('a converted model emits under its profile\'s own id and name, linked back to the model', () => {
  const legacy = legacyOf('arturia-microfreak');
  const emitted = emitModel(legacyToDpd(legacy).model);
  assert.equal(emitted.id, 'arturia-microfreak');
  assert.equal(emitted.name, legacy.name);
  assert.equal(emitted.dpdSource, 'arturia.microfreak');
  assert.equal(dpdIdOf({ id: 'black-corporation-deckards-dream-mk2', manufacturer: 'Black Corporation' }), 'black-corporation.deckards-dream-mk2');
});

test('the gate notices a model that sends something else', async () => {
  const legacy = legacyOf('arturia-microfreak');
  const { model } = legacyToDpd(legacy);
  const p = model.scopes.global.parameters.find((x) => x.wires[0].msg === 'cc');
  p.wires[0].cc = (p.wires[0].cc + 1) % 128;
  const problems = await compareEmission(legacy, model);
  assert.ok(problems.some((m) => m.startsWith(`${p.id} = `)), problems.join('\n'));
});
