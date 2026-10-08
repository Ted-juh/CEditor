// hostageDataFolders.test.js — one data folder per product (docs/design/hostage-creator-editor-player.md, step 2).
//
// The host picks the folder and keeps the claim on the keyboard shared (HostageManifest.h,
// tested natively in testHostageManifest, testHardwareClaimShared and testLegacyDataOffer); the
// build script writes the identity that names it (hostProductBuild.test.js). This file holds the
// page to what the host reports: where the data is, and the one question about a rig an earlier
// build kept in the folder every product shared.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeProductData, normalizeHostState, applyMockCommand } from '../src/CE_Application/stores/instrumentHost.js';

const source = (file) => readFileSync(new URL(`../src/CE_Application/${file}`, import.meta.url), 'utf8');

test('the state says where the data is and what became of the earlier rig', () => {
  assert.deepEqual(normalizeProductData(undefined), { folder: '', legacy: 'none', legacyFolder: '', legacyFailed: [] });
  assert.deepEqual(normalizeProductData({
    folder: '/u/CEditorInstrumentHost/products/8F3A', legacy: 'adopted',
    legacyFolder: '/u/CEditorInstrumentHost', legacyFailed: ['library.db'],
  }), {
    folder: '/u/CEditorInstrumentHost/products/8F3A', legacy: 'adopted',
    legacyFolder: '/u/CEditorInstrumentHost', legacyFailed: ['library.db'],
  });
  assert.equal(normalizeProductData({ legacy: 'something-new' }).legacy, 'none',
    'a state this page does not know offers nothing rather than guessing');
  assert.equal(normalizeHostState({}).product.data.legacy, 'none');
});

test('in the preview, the offer is answered once, as the host answers it', () => {
  const offered = normalizeHostState({ product: { data: { legacy: 'offered' } } });
  const pending = applyMockCommand(offered, { cmd: 'adoptLegacyData' });
  assert.equal(pending.product.data.legacy, 'pending', 'bringing it over waits for the next start');
  assert.equal(applyMockCommand(pending, { cmd: 'declineLegacyData' }).product.data.legacy, 'declined',
    'and can still be called off before then');
  assert.equal(applyMockCommand(offered, { cmd: 'declineLegacyData' }).product.data.legacy, 'declined');

  const nothing = normalizeHostState({});
  assert.equal(applyMockCommand(nothing, { cmd: 'adoptLegacyData' }).product.data.legacy, 'none',
    'with nothing on offer there is nothing to accept');
  assert.equal(applyMockCommand(normalizeHostState({ product: { data: { legacy: 'declined' } } }),
    { cmd: 'adoptLegacyData' }).product.data.legacy, 'declined', 'a decision stays made');
});

test('the workspace asks, and the Product utility says where the data is', () => {
  const view = source('sections/InstrumentHostView.svelte');
  const prompt = view.match(/data-testid="host-legacy-prompt"[\s\S]*?\{\/if\}\s*<\/div>/)?.[0] ?? '';
  assert.match(view, /\{#if legacyData\.legacy === 'offered' \|\| legacyData\.legacy === 'pending'\}/);
  assert.match(prompt, /data-testid="host-legacy-adopt" onclick=\{\(\) => adoptLegacyData\(\)\}/);
  assert.match(prompt, /data-testid="host-legacy-decline" onclick=\{\(\) => declineLegacyData\(\)\}/);
  assert.match(prompt, /replace what this product has, the next time it starts/,
    'it says plainly that this product\'s own rig is replaced, and when');
  assert.match(prompt, /Restart it to finish/);

  const panel = source('sections/ProductPanel.svelte');
  assert.match(panel, /data-testid="product-data-folder"[^>]*>\{product\.data\.folder \|\| '—'\}/);
  assert.match(panel, /product\.data\.legacy === 'adopted'/);
});
