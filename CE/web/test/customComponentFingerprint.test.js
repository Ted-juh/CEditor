// customComponentFingerprint.test.js — the drift indicator has to be able to say "unchanged".
//
// `CustomPackageLibrary.svelte` decides whether a custom component has been edited since it was
// loaded by comparing the fingerprint stored in its provenance against one computed live:
//
//     currentPackageMatchesSource = currentSourcePackage.fingerprint === packageFingerprint
//
// The stored one is computed on the AUTHOR'S control at export. The live one is computed on the
// INSTANCE — which `instantiateCustomComponentPackageControl` has by then stamped with eight fields
// the author's copy never had. The hash covered them, so the two could never agree: every packaged
// component read as "edited since package load" from the moment it was inserted, and a genuine edit
// was indistinguishable from that permanent false baseline. `packageImportedAt` is a timestamp, so
// the hash was not even stable between two inserts of one package.
//
// Measured on all fourteen custom components in CE/qa/QA-07-packages.cepanel, which is why this
// test reads that sheet rather than a fixture of its own.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { deserializePanel } from '../src/CE_Application/stores/panelModel.js';
import {
  createCustomComponentExportEnvelope, instantiateCustomComponentPackageControl,
  fingerprintCustomComponent, summarizeCustomComponentPublicApi,
} from '../src/CE_Application/utils/customComponentPackage.js';

const here = dirname(fileURLToPath(import.meta.url));
const sheet = resolve(here, '..', '..', 'qa', 'QA-07-packages.cepanel');
const customs = deserializePanel(readFileSync(sheet, 'utf8'), '', 'qa')
  .controls.filter((c) => c._children?.Core?.controlType === 'CustomComponent');

test('the sheet still has custom components to check', () => {
  assert.equal(customs.length, 14, 'QA-07 is the packages sheet; if this changes, so does the evidence');
});

test('a freshly inserted instance reads as unchanged, for every component in the sheet', () => {
  const drifting = [];
  for (const control of customs) {
    const envelope = createCustomComponentExportEnvelope(control, {});
    const instance = instantiateCustomComponentPackageControl(envelope);
    const stored = instance._children.Designer.sourcePackage?.fingerprint;
    const live = fingerprintCustomComponent(instance);
    if (stored !== live) drifting.push(`${control._children.Core.name}: ${stored} != ${live}`);
  }
  assert.deepEqual(drifting, [], 'untouched instances must not report as edited');
});

test('the fingerprint does not depend on when the component was imported', () => {
  const envelope = createCustomComponentExportEnvelope(customs[0], {});
  const a = instantiateCustomComponentPackageControl(envelope, { importedAt: '2020-01-01T00:00:00.000Z' });
  const b = instantiateCustomComponentPackageControl(envelope, { importedAt: '2031-12-31T23:59:59.000Z' });
  assert.notEqual(a._children.Designer.packageImportedAt, b._children.Designer.packageImportedAt);
  assert.equal(fingerprintCustomComponent(a), fingerprintCustomComponent(b));
});

test('an actual authored edit still moves the fingerprint', () => {
  // The fix must not be a blanket "ignore the Designer section": the indicator has to keep working.
  const instance = instantiateCustomComponentPackageControl(createCustomComponentExportEnvelope(customs[0], {}));
  const before = fingerprintCustomComponent(instance);

  const edited = structuredCloneLike(instance);
  edited._children.Transform.width = Number(edited._children.Transform.width ?? 0) + 37;
  assert.notEqual(fingerprintCustomComponent(edited), before, 'a resize is an edit');

  const renamed = structuredCloneLike(instance);
  renamed._children.Core.name = 'Renamed By Author';
  assert.notEqual(fingerprintCustomComponent(renamed), before, 'a rename is an edit');

  // ...while the id, which is per-instance, is not.
  const recopied = structuredCloneLike(instance);
  recopied._children.Core.id = 'ctrl_some_other_instance';
  assert.equal(fingerprintCustomComponent(recopied), before, 'two copies are the same component');
});

test('re-export and re-import settle rather than drifting further each round', () => {
  for (const control of customs) {
    let current = control;
    const seen = [];
    for (let round = 0; round < 3; round += 1) {
      const envelope = createCustomComponentExportEnvelope(current, {});
      current = instantiateCustomComponentPackageControl(envelope);
      seen.push(fingerprintCustomComponent(current));
    }
    assert.equal(new Set(seen).size, 1,
      `${control._children.Core.name} keeps moving across rounds: ${seen.join(' -> ')}`);
    assert.equal(seen[0], fingerprintCustomComponent(control),
      `${control._children.Core.name} differs from its own author-side fingerprint`);
  }
});

test('the public surface survives the package round trip', () => {
  for (const control of customs) {
    const instance = instantiateCustomComponentPackageControl(createCustomComponentExportEnvelope(control, {}));
    const before = summarizeCustomComponentPublicApi(control);
    const after = summarizeCustomComponentPublicApi(instance);
    for (const key of ['inputs', 'outputs', 'editableProperties']) {
      assert.equal((after?.[key] ?? []).length, (before?.[key] ?? []).length,
        `${control._children.Core.name}: ${key} changed across the round trip`);
    }
  }
});

// structuredClone is banned in src/; the tests follow the same rule so a copied helper cannot drift
// back into production.
function structuredCloneLike(value) { return JSON.parse(JSON.stringify(value)); }
