// What the exported Player and the editor do with the synth at startup — the pure rules behind
// Player.svelte's connect and the editor's read offer. See utils/playerStartup.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { playerDeviceTarget, hasStartupRead, startupReadPlan, createHostSeedTracker, LEGACY_PROFILE_ID }
  from '../src/CE_Application/utils/playerStartup.js';
import { readOfferCandidates, readOfferKey } from '../src/CE_Application/stores/deviceReadOffer.js';

const repo = new URL('../../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, repo), 'utf8'));
const GAIA_PANEL = read('panels/Roland GAIA SH-01.cepanel');
const SH01 = read('profiles/test/roland-gaia-sh01.ceditor-device.json');
const SLIM = read('profiles/test/roland-gaia.ceditor-device.json');

const bound = (role) => ({ _children: { Core: { id: role, name: role },
  DeviceBindings: { bindings: [{ kind: 'deviceParameter', deviceRole: role, parameterId: 'x' }] } } });

test('the GAIA panel connects under the role and profile its controls are bound to', () => {
  assert.deepEqual(playerDeviceTarget(GAIA_PANEL), { deviceRole: 'Roland GAIA SH-01', profileId: 'roland-gaia-sh01' });
});

test('a panel naming no requirement uses the role most of its bindings use, then the legacy default', () => {
  const panel = { controls: [bound('Lead'), bound('Lead'), bound('Bass')], deviceSession: { Lead: { profileId: 'lead-synth' } } };
  assert.deepEqual(playerDeviceTarget(panel), { deviceRole: 'Lead', profileId: 'lead-synth' });
  assert.deepEqual(playerDeviceTarget({ controls: [] }), { deviceRole: 'mainSynth', profileId: LEGACY_PROFILE_ID });
  assert.deepEqual(playerDeviceTarget({ controls: [], deviceSession: { mainSynth: { profileId: 'p' } } }),
    { deviceRole: 'mainSynth', profileId: 'p' }, 'the old deviceSession field still counts');
});

test('only a startup chain that reads past the identity counts as a read', () => {
  assert.equal(hasStartupRead(SH01), true);
  assert.equal(hasStartupRead(SLIM), false, 'the slim profile only identifies');
  assert.equal(hasStartupRead({}), false);
  assert.equal(hasStartupRead({ startup: { sync: ['requestCommon'] } }), true, 'bare request names count');
});

test('a new instance reads the synth; a reopened project only identifies it', () => {
  assert.equal(startupReadPlan({ restored: false, profile: SH01 }), 'pull');
  assert.equal(startupReadPlan({ restored: false, profile: SLIM }), 'legacy', 'no chain to run: the per-parameter read');
  assert.equal(startupReadPlan({ restored: false, profile: null }), null, 'wait for the profile before choosing');
  assert.equal(startupReadPlan({ restored: true, profile: SH01 }), 'identity', 'the saved sound is never read over');
  assert.equal(startupReadPlan({ restored: true, profile: null }), 'identity', 'and needs no profile to say so');
});

test('the first host value per parameter is a seed; the rest are automation', () => {
  const seeds = createHostSeedTracker();
  assert.equal(seeds.isSeed('cutoff'), true);
  assert.equal(seeds.isSeed('cutoff'), false);
  assert.equal(seeds.isSeed('resonance'), true);
  seeds.reset();
  assert.equal(seeds.isSeed('cutoff'), true, 'a new panel load seeds again');
});

test('the editor offers a read once per role and port, only on hardware that can be read', () => {
  const hw = (id, profileId) => ({ profileId, midiDestination: { type: 'hardwareOutput', id, name: `Port ${id}` } });
  const sources = { 'roland-gaia-sh01': { source: JSON.stringify(SH01) }, 'roland-gaia': { source: JSON.stringify(SLIM) } };
  const mappings = {
    'Roland GAIA SH-01': hw('usb1', 'roland-gaia-sh01'),
    mainSynth: hw('usb2', 'roland-gaia'),                                    // cannot be read
    preview: { profileId: 'roland-gaia-sh01', midiDestination: { type: 'previewOnly', id: 'previewOnly' } },
    pending: hw('usb3', 'not-loaded-yet'),
  };
  const offered = new Set();
  const { ready, waiting } = readOfferCandidates(mappings, sources, offered);
  assert.deepEqual(ready.map((r) => r.role), ['Roland GAIA SH-01']);
  assert.equal(ready[0].name, 'Port usb1');
  assert.deepEqual(waiting, [{ role: 'pending', profileId: 'not-loaded-yet' }], 'fetched, then offered when it lands');
  offered.add(readOfferKey('Roland GAIA SH-01', mappings['Roland GAIA SH-01']));
  assert.deepEqual(readOfferCandidates(mappings, sources, offered).ready, [], 'asked once');
  mappings['Roland GAIA SH-01'] = hw('usb9', 'roland-gaia-sh01');
  assert.equal(readOfferCandidates(mappings, sources, offered).ready.length, 1, 'a different port is a new connection');
});
