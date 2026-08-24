// exportPipeline.test.js — plugin identity, the build log, and export history.
//
// The export plan's D1 second half and E1–E5. What this pins is the one thing the whole registry
// exists for and that no amount of careful GUID generation would have caught:
//
//   TWO PANELS DO NOT COLLIDE BY PICKING THE SAME RANDOM GUID. They collide because a .cepanel was
//   COPIED. Duplicate a panel file to start a variant, edit it, export it, and it exports the
//   ORIGINAL plugin's identity — the DAW sees one plugin, the new build silently replaces the old
//   one in every project that loaded it, and nothing at any point looks wrong.
//
// So `identityDecision` returns `ask` for exactly that case and for nothing else. An export that
// asks a question every time is an export people click through without reading, which would put
// the collision straight back.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  forgetIdentity, identityDecision, newCopyIdentity, nextCopyName, openPanelCollisions,
  ownerOf, recordExport, registryEntry,
} from '../src/CE_Application/utils/guidRegistry.js';
import {
  DEFAULT_GENERAL_SETTINGS, normalizeManufacturerCode,
} from '../src/CE_Application/stores/runtimePreferences.js';
import { normalizeGeneralSettings } from '../src/CE_Application/stores/appSettingsSchema.js';

const GUID = 'aaaa-bbbb';

function panel(overrides = {}) {
  return { id: 'p1', name: 'Bass Station', panelGuid: GUID, filePath: '/panels/bass.cepanel', ...overrides };
}

const REGISTRY = [registryEntry({ guid: GUID, panelId: 'p1', panelPath: '/panels/bass.cepanel', productName: 'Bass Station' })];

// --- the identity fork ---------------------------------------------------------------------------

test('a panel with no identity yet just mints one — nothing to ask', () => {
  const decision = identityDecision({ panel: panel({ panelGuid: '' }), registry: REGISTRY });
  assert.equal(decision.action, 'mint');
});

test('re-exporting a panel\'s own plugin does not ask', () => {
  // The normal case, and it must stay silent: an export that asks every time is an export people
  // click through without reading, which puts the collision straight back.
  assert.equal(identityDecision({ panel: panel(), registry: REGISTRY }).action, 'update');
});

test('a panel matched by file path is still its own plugin, even with a new session id', () => {
  // Reopening a panel gives it a fresh in-session id; the file is what persists.
  const reopened = panel({ id: 'p9' });
  assert.equal(identityDecision({ panel: reopened, registry: REGISTRY }).action, 'update');
});

test('A COPIED PANEL IS ASKED ABOUT — the whole point of the registry', () => {
  const copy = panel({ id: 'p2', name: 'Bass Station variant', filePath: '/panels/bass-variant.cepanel' });
  const decision = identityDecision({ panel: copy, registry: REGISTRY });
  assert.equal(decision.action, 'ask');
  assert.equal(decision.owner.productName, 'Bass Station');
  // Named, because "there is a conflict" sends somebody through every panel they have open and the
  // answer is nearly always "the file you copied this from".
  assert.match(decision.reason, /Bass Station/);
  assert.match(decision.reason, /copied from/);
});

test('and it says which of the three shapes it is looking at, not always "copied"', () => {
  // `panelId` is a session counter — a reopened panel gets a fresh one — so after a restart the
  // only evidence is the file path. Three situations reach `ask` and the registry cannot tell a
  // MOVED original from a COPY, so it asks in all three. What it can do is stop asserting the
  // wrong one: "almost certainly copied", told to somebody who renamed their file, is a wrong
  // explanation of a right question and sends them hunting for a duplicate that does not exist.
  const copied = identityDecision({
    panel: panel({ id: 'p2', filePath: '/panels/bass-variant.cepanel' }), registry: REGISTRY,
  });
  assert.match(copied.reason, /copied from/);
  assert.match(copied.reason, /moved or renamed/);

  // Claimed before the panel had ever been saved: there is no path on the claim to compare.
  const pathless = identityDecision({
    panel: panel({ id: 'p2' }),
    registry: [registryEntry({ guid: GUID, panelId: 'p1', panelPath: '', productName: 'Bass Station' })],
  });
  assert.equal(pathless.action, 'ask');
  assert.match(pathless.reason, /before the panel had been saved/);
  assert.doesNotMatch(pathless.reason, /copied from/);

  // This panel is the unsaved one.
  const unsaved = identityDecision({ panel: panel({ id: 'p2', filePath: '' }), registry: REGISTRY });
  assert.equal(unsaved.action, 'ask');
  assert.match(unsaved.reason, /has not been saved yet/);
});

test('an identity the registry has never seen is adopted, not questioned', () => {
  // A panel from somebody else, or a cleared registry. There is no local plugin to collide with,
  // so there is nothing to decide.
  assert.equal(identityDecision({ panel: panel(), registry: [] }).action, 'adopt');
});

test('the registry answers who owns an identity, and that has exactly one answer', () => {
  // Replaced rather than appended: a growing list of stale claims makes the question unanswerable.
  let registry = recordExport([], { guid: GUID, panelId: 'p1', productName: 'First' });
  registry = recordExport(registry, { guid: GUID, panelId: 'p2', productName: 'Second' });
  assert.equal(registry.length, 1);
  assert.equal(ownerOf(registry, GUID).productName, 'Second');
  assert.equal(ownerOf(registry, 'nope'), null);
  assert.equal(ownerOf(registry, ''), null);
});

test('an entry with no guid is not recorded', () => {
  assert.deepEqual(recordExport([], { panelId: 'p1' }), []);
});

test('an identity can be forgotten', () => {
  assert.deepEqual(forgetIdentity(REGISTRY, GUID), []);
  assert.equal(forgetIdentity(REGISTRY, 'other').length, 1);
});

test('a new copy gets a fresh guid AND a different name', () => {
  // Two independent plugins arriving in a DAW's list under one name defeats the point of the fresh
  // GUID — the user still cannot tell them apart.
  const patch = newCopyIdentity(panel(), () => 'fresh-guid');
  assert.equal(patch.panelGuid, 'fresh-guid');
  assert.equal(patch.exportSettings.pluginName, 'Bass Station 2');
});

test('copy names count up rather than stacking suffixes', () => {
  assert.equal(nextCopyName('Bass Station'), 'Bass Station 2');
  assert.equal(nextCopyName('Bass Station 2'), 'Bass Station 3');
  assert.equal(nextCopyName('Bass Station 9'), 'Bass Station 10');
  assert.equal(nextCopyName(''), 'CEditor Panel 2');
});

test('a new copy keeps the rest of the export settings', () => {
  const patch = newCopyIdentity(panel({ exportSettings: { vendor: 'Acme', version: '2.1' } }), () => 'g');
  assert.equal(patch.exportSettings.vendor, 'Acme');
  assert.equal(patch.exportSettings.version, '2.1');
});

test('open panels sharing an identity are found before anybody exports', () => {
  // A copied panel can be spotted at open time rather than at the confirm modal, which is the
  // difference between a warning and an interruption.
  const collisions = openPanelCollisions([
    panel(),
    panel({ id: 'p2', name: 'Copy', filePath: '/panels/copy.cepanel' }),
    { id: 'p3', name: 'Other', panelGuid: 'other' },
    { id: 'p4', name: 'Never exported' },
  ]);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].guid, GUID);
  assert.deepEqual(collisions[0].panels.map((p) => p.name), ['Bass Station', 'Copy']);
});

test('a panel that has never been exported cannot collide', () => {
  assert.deepEqual(openPanelCollisions([{ id: 'a' }, { id: 'b' }]), []);
});

// --- export defaults ------------------------------------------------------------------------------

test('the export defaults start empty rather than invented', () => {
  // A plausible-looking vendor name baked into somebody's plugin is worse than a blank field,
  // because they never notice the first one.
  assert.equal(DEFAULT_GENERAL_SETTINGS.exportVendor, '');
  assert.equal(DEFAULT_GENERAL_SETTINGS.exportManufacturerCode, '');
  assert.equal(DEFAULT_GENERAL_SETTINGS.exportOutputDir, '');
  assert.equal(DEFAULT_GENERAL_SETTINGS.exportDefaultFormat, 'vst3');
  assert.equal(DEFAULT_GENERAL_SETTINGS.exportBackend, 'auto');
});

test('a manufacturer code is four characters, padded visibly rather than refused', () => {
  // A partially typed code is the normal state of a text field, so it is padded — but the padded
  // form is what gets stored and shown back, or a three-character code becomes a plugin that
  // identifies as something else without anybody seeing it happen.
  assert.equal(normalizeManufacturerCode('Abcd'), 'Abcd');
  assert.equal(normalizeManufacturerCode('abc'), 'Abc ');
  assert.equal(normalizeManufacturerCode('abcdefgh'), 'Abcd');
  assert.equal(normalizeManufacturerCode(''), '', 'empty stays empty rather than becoming four spaces');
  assert.equal(normalizeManufacturerCode('  '), '    ', 'all-whitespace pads to four, which is odd but stable');
});

test('a non-ascii manufacturer code is stripped, not smuggled into a plugin id', () => {
  assert.equal(normalizeManufacturerCode('Ab→d'), 'Abd ');
});

test('the settings normaliser carries the export defaults through', () => {
  const settings = normalizeGeneralSettings({ exportVendor: 'Acme', exportManufacturerCode: 'acm', exportDefaultFormat: 'both' });
  assert.equal(settings.exportVendor, 'Acme');
  assert.equal(settings.exportManufacturerCode, 'Acm ');
  assert.equal(settings.exportDefaultFormat, 'both');
  assert.equal(settings.exportBackend, 'auto', 'an absent one falls back');
});

test('an unknown format or backend falls back rather than reaching the exporter', () => {
  const settings = normalizeGeneralSettings({ exportDefaultFormat: 'aax', exportBackend: 'magic' });
  assert.equal(settings.exportDefaultFormat, 'vst3');
  assert.equal(settings.exportBackend, 'auto');
});
