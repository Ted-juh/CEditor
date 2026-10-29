// panelComponentSharing.test.js — a shared panel brings the library components its copies came from.
//
// Before, File → Share Panel carried a panel's images, fonts and icons and not its library
// packages: the copies arrived with their whole design but unlinked, their Source card saying "Not
// in this library" until the author also sent the library file and the recipient imported it. The
// SH-201 panels are the case in point — 49 linked copies of three packages — so they are what is
// shared here, from a library holding their packages to one that does not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';

import { activePanel, addPanel, panels } from '../src/CE_Application/stores/panels.js';
import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import { customComponentLibrary } from '../src/CE_Application/stores/customComponentLibrary.js';
import { openPackageText, sharePanelToFile } from '../src/CE_Application/stores/panelSharingActions.js';
import { panelPackageFile } from '../src/CE_Application/stores/panelSharing.js';
import { validatePanelPackage } from '../src/CE_Application/utils/panelPackage.js';
import { componentPackagesToAdd, panelComponentPackages } from '../src/CE_Application/utils/panelComponentPackages.js';
import { diffCustomComponentAgainstSource } from '../src/CE_Application/utils/customComponentSourceLink.js';
import { normalizeCustomComponentLibraryEnvelope } from '../src/CE_Application/utils/customComponentPackage.js';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { scriptNotifications } from '../src/CE_Application/stores/scriptUi.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(path.join(REPO, rel), 'utf8');
const sh201 = () => deserializePanel(read('CE/panels/Roland SH-201.cepanel'), 'Roland SH-201.cepanel', null);
const sh201Library = () => normalizeCustomComponentLibraryEnvelope(JSON.parse(read('CE/panels/Roland SH-201 components.json'))).packages;
const copiesOf = (panel) => flatControls(panel.controls).filter((c) => c._children.Core.controlType === 'CustomComponent');

test.beforeEach(() => {
  panels.set([]);
  scriptNotifications.set([]);
  customComponentLibrary.clear();
});

async function shareSh201() {
  for (const envelope of sh201Library()) customComponentLibrary.importEnvelope(envelope);
  addPanel(sh201());
  const result = await sharePanelToFile();
  assert.equal(result.ok, true);
  return result;
}

test('sharing the SH-201 panel carries the three packages its copies were placed from, once each', async () => {
  const result = await shareSh201();
  assert.equal(result.componentCount, 3);
  assert.deepEqual(result.componentsNotInLibrary, []);
  const carried = result.envelope.components.map((envelope) => `${envelope.metadata.name} ${envelope.metadata.version}`).sort();
  assert.deepEqual(carried, ['SH-201 Fader 1.0.0', 'SH-201 Knob 1.0.0', 'SH-201 LED Switch 1.0.0']);
  assert.ok(validatePanelPackage(result.envelope).ok);
});

test('opened on a computer whose library lacks them, the packages are added and every copy is linked', async () => {
  const { envelope } = await shareSh201();
  const text = panelPackageFile(envelope).text;

  customComponentLibrary.clear();
  panels.set([]);
  const opened = await openPackageText(text);
  assert.ok(opened, 'the shared panel opened');
  const library = customComponentLibrary.snapshot();
  assert.deepEqual(library.map((entry) => `${entry.name} ${entry.version}`).sort(),
    ['SH-201 Fader 1.0.0', 'SH-201 Knob 1.0.0', 'SH-201 LED Switch 1.0.0']);
  const copies = copiesOf(get(activePanel));
  assert.equal(copies.length, 49);
  for (const copy of copies) {
    const report = diffCustomComponentAgainstSource(copy, library);
    assert.equal(report.status, 'current', `${copy._children.Core.name}: ${report.status}`);
  }
  assert.ok(get(scriptNotifications).some((n) => /Added 3 components to your library/.test(n.message ?? n.text ?? '')),
    'the recipient is told what was added');
});

test('a library that already holds the same packages is left as it is', async () => {
  const { envelope } = await shareSh201();
  const before = customComponentLibrary.snapshot().map((entry) => [entry.id, entry.fingerprint]);
  await openPackageText(panelPackageFile(envelope).text);
  assert.deepEqual(customComponentLibrary.snapshot().map((entry) => [entry.id, entry.fingerprint]), before);
  assert.ok(!get(scriptNotifications).some((n) => /Added/.test(n.message ?? n.text ?? '')));
});

test('a package of the same name and version with another design is the recipient\'s, and is kept', async () => {
  const { envelope } = await shareSh201();
  const theirs = structuredClone(sh201Library().find((p) => p.metadata.name === 'SH-201 Knob'));
  theirs.component._children.Core.tooltip = 'my own knob';
  customComponentLibrary.clear();
  const kept = customComponentLibrary.importEnvelope(theirs);

  const plan = componentPackagesToAdd(envelope.components, customComponentLibrary.snapshot());
  assert.deepEqual(plan.conflicting, ['SH-201 Knob 1.0.0']);
  await openPackageText(panelPackageFile(envelope).text);
  const knob = customComponentLibrary.snapshot().find((entry) => entry.name === 'SH-201 Knob');
  assert.equal(knob.fingerprint, kept.fingerprint, 'their knob is still theirs');
  assert.equal(customComponentLibrary.snapshot().length, 3, 'the fader and the switch were added');
  assert.ok(get(scriptNotifications).some((n) => /already has SH-201 Knob 1\.0\.0 with a different design/.test(n.message ?? n.text ?? '')));
});

test('a copy whose package this library does not hold is named, and the panel still shares', async () => {
  // Only the knob's package is in the library: the faders and switches cannot take theirs along.
  customComponentLibrary.importEnvelope(sh201Library().find((p) => p.metadata.name === 'SH-201 Knob'));
  const { envelopes, notInLibrary } = panelComponentPackages(sh201(), customComponentLibrary.snapshot());
  assert.deepEqual(envelopes.map((e) => e.metadata.name), ['SH-201 Knob']);
  assert.deepEqual([...notInLibrary].sort(), ['SH-201 Fader 1.0.0', 'SH-201 LED Switch 1.0.0']);
});

test('a package from before components travelled opens as it did, and a malformed list is refused', async () => {
  const { envelope } = await shareSh201();
  const older = structuredClone(envelope);
  delete older.components;
  customComponentLibrary.clear();
  assert.ok(await openPackageText(panelPackageFile(older).text));
  assert.equal(customComponentLibrary.snapshot().length, 0);

  assert.equal(validatePanelPackage({ ...envelope, components: 'SH-201 Knob' }).ok, false);
  assert.equal(validatePanelPackage({ ...envelope, components: [null] }).ok, false);
});
