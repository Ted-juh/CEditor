// Verifies the editor's merge-on-drop enrichment for DPD-backed profiles against the REAL
// generated artifacts (roland.gaia.runtime.json + dpdMerge.js). Proves a dropped parameter gains
// the doc-required source stamp and a self-contained MIDI slice (address/CC + enum + packing).
// Run: node --test  (from CE/web)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  mergeParamForId,
  runtimeMatchesProfile,
  enrichBindingWithDpd,
} from '../src/CE_Application/utils/dpdMergeOnDrop.js';

const gen = (name) => JSON.parse(readFileSync(
  fileURLToPath(new URL(`../src/CE_Application/generated/${name}`, import.meta.url)), 'utf8'));
const runtime = gen('roland.gaia.runtime.json');
const dpdProfileMap = gen('dpdProfileMap.json');
const dpdProfile = { id: 'roland-gaia-dpd' }; // a bare summary — backing comes from the generated map
const baseBinding = { kind: 'deviceParameter', port: 'value', deviceRole: 'mainSynth', parameterId: 'filter.cutoff' };

test('runtime carries mergeParams and matches the DPD-backed profile via the map', () => {
  assert.ok(runtime.mergeParams && Object.keys(runtime.mergeParams).length >= 13);
  assert.equal(dpdProfileMap['roland-gaia-dpd'].dpdSource, 'roland.gaia');
  assert.equal(runtimeMatchesProfile(runtime, dpdProfile, dpdProfileMap), true);
  assert.equal(runtimeMatchesProfile(runtime, { id: 'other' }, dpdProfileMap), false);
});

test('flat id resolves to the instance-0 slice', () => {
  const slice = mergeParamForId(runtime, 'filter.cutoff');
  assert.equal(slice.resolvedId, 'tone1.filter.cutoff');
  assert.equal(slice.wires.rxLive.cc, 102, 'instance 0, not tone2 (CC 103)');
});

test('cutoff drop becomes self-contained: source stamp + DT1 write + CC rxLive', () => {
  const out = enrichBindingWithDpd(baseBinding, {
    parameter: { id: 'filter.cutoff' }, profile: dpdProfile, runtime, dpdProfileMap, port: 'value',
  });
  assert.equal(out.source, 'roland.gaia@1.0.0', 'stamped with DPD id@version');
  assert.deepEqual(out.wires.write, { msg: 'dt1', address: '10 00 01 0C', size: 1 });
  assert.deepEqual(out.wires.rxLive, { msg: 'cc', cc: 102 });
  assert.equal(out.valueType, 'continuous');
  assert.ok(out.wires.write.address, 'carries its own address — no profile needed at runtime');
});

test('osc.wave drop carries enum entries WITH wire values', () => {
  const out = enrichBindingWithDpd(
    { ...baseBinding, port: 'selectedChoice', parameterId: 'osc.wave' },
    { parameter: { id: 'osc.wave' }, profile: dpdProfile, runtime, dpdProfileMap, port: 'selectedChoice' });
  assert.equal(out.wires.write.address, '10 00 01 00');
  assert.equal(out.enum.length, 7);
  assert.deepEqual(out.enum[2], { id: 'pulse', label: 'Pulse', wire: 2 });
});

test('non-DPD profile passes through with just a source stamp (graceful, additive)', () => {
  const legacyOnly = { id: 'roland-gaia', profileVersion: '2.1.0' }; // no dpdSource
  const out = enrichBindingWithDpd(baseBinding, {
    parameter: { id: 'filter.cutoff' }, profile: legacyOnly, runtime, dpdProfileMap,
  });
  assert.equal(out.source, 'roland-gaia@2.1.0');
  assert.equal(out.wires, undefined, 'no self-contained wires grafted for non-DPD profile');
});

test('unknown parameter id still stamps source but grafts nothing', () => {
  const out = enrichBindingWithDpd(
    { ...baseBinding, parameterId: 'does.not.exist' },
    { parameter: { id: 'does.not.exist' }, profile: dpdProfile, runtime, dpdProfileMap });
  assert.equal(out.source, 'roland-gaia-dpd@1.0.0');
  assert.equal(out.wires, undefined);
});
