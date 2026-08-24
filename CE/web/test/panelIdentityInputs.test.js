// panelIdentityInputs.test.js — the fallback chain, pinned on the JS side.
//
// `identityInputsFromPanel` decides the five values a panel contributes to its plugin identity, and
// every default in it is load-bearing in a way that is invisible when it works: a different default
// is a different string into the hash, so a different pluginCode, so a different VST3 FUID. Hosts
// key plugins by FUID, so getting one wrong produces no error anywhere — just a saved session, on
// somebody else's machine, that no longer finds its plugin.
//
// WHY THE C++ EXPECTATIONS ARE REPEATED HERE. The same chain exists a second time in
// CE/src/Export/PanelIdentitySidecar.h, because a prebuilt player has to identify itself at load
// and cannot import JavaScript. Two implementations of one rule is a drift risk that no amount of
// care removes, so both are pinned to the same literal expectations: the cases below are mirrored
// by CE/tests/PanelIdentitySidecarTests.cpp. Change a default in one and its test fails; change it
// in both tests without changing both implementations and the C++ test fails against the C++.
//
// This is the same arrangement exportIdentity.test.js already has with PanelExportIdentityTests.cpp
// for the derivation itself. This file covers the step before it: reading the document.

import test from 'node:test';
import assert from 'node:assert/strict';

import { IDENTITY_DEFAULTS, identityInputsFromPanel } from '../src/CE_Application/utils/panelIdentityInputs.js';
import { deriveIdentity } from '../src/CE_Application/utils/exportIdentity.js';

const full = {
  name: 'GAIA Filter',
  panelGuid: 'guid-AAAA-1111',
  exportSettings: { pluginName: 'GAIA Filter', vendor: 'Tedjuh', manufacturerCode: 'Tdjh', version: '1.0.0' },
};

test('a fully specified panel uses exactly what it says', () => {
  const inputs = identityInputsFromPanel(full, 'gaia.cepanel');
  assert.deepEqual(inputs, {
    guid: 'guid-AAAA-1111',
    productName: 'GAIA Filter',
    vendor: 'Tedjuh',
    version: '1.0.0',
    manufacturerCode: 'Tdjh',
  });
});

test('the fully specified panel lands on the canonical identity', () => {
  // 'HlSQ' is the value exportIdentity.test.js and PanelExportIdentityTests.cpp both pin for this
  // fixture. Asserting it here joins the two halves: the document-reading step feeds the derivation
  // step the arguments it is pinned against, so the whole path from .cepanel to FUID is covered.
  const i = identityInputsFromPanel(full, 'gaia.cepanel');
  const id = deriveIdentity(i.guid, i.productName, i.vendor, i.manufacturerCode, i.version);
  assert.equal(id.pluginCode, 'HlSQ');
});

test('an empty exportSettings falls back to the documented defaults', () => {
  // Mirrored by "a panel with no exportSettings still derives an identity" in the C++ test.
  const inputs = identityInputsFromPanel({ name: 'Bare', panelGuid: 'abc-123' }, 'bare.cepanel');
  assert.equal(inputs.vendor, 'Tedjuh');
  assert.equal(inputs.manufacturerCode, 'Tdjh');
  assert.equal(inputs.version, '1.0.0');
  assert.equal(inputs.productName, 'Bare', 'the panel\'s own name is the product name');
});

test('with no name anywhere, the product name is built from the file name', () => {
  // Mirrored by "with no name at all, the product name is built from the file name".
  const inputs = identityInputsFromPanel({ panelGuid: 'abc-123' }, 'Custom Name.cepanel');
  assert.equal(inputs.productName, 'CEditor Custom Name');
});

test('a short manufacturer code is padded with x to exactly four', () => {
  // Mirrored by "a short manufacturer code is padded with 'x' to four". JUCE requires four
  // characters; a three-character code would produce a fourcc with a zero byte in it.
  assert.equal(identityInputsFromPanel({ panelGuid: 'g', exportSettings: { manufacturerCode: 'Ab' } }).manufacturerCode, 'Abxx');
  assert.equal(IDENTITY_DEFAULTS.padManufacturerCode('A'), 'Axxx');
  assert.equal(IDENTITY_DEFAULTS.padManufacturerCode('TooLong'), 'TooL', 'and a long one is truncated');
});

test('exportSettings.pluginName wins over the panel name', () => {
  // Mirrored by "exportSettings.pluginName wins over the panel's own name".
  const inputs = identityInputsFromPanel(
    { name: 'Ignored', panelGuid: 'g', exportSettings: { pluginName: 'Override' } }, 'x.cepanel');
  assert.equal(inputs.productName, 'Override');
});

test('whitespace-only settings are treated as absent, not as values', () => {
  // A field a user cleared in the UI arrives as '   ', and taking it literally would give a plugin
  // an empty vendor — and, because it feeds the hash, a different FUID from the same panel with the
  // field genuinely absent.
  const inputs = identityInputsFromPanel(
    { name: 'N', panelGuid: 'g', exportSettings: { vendor: '   ', version: '\t', pluginName: ' ' } }, 'x.cepanel');
  assert.equal(inputs.vendor, 'Tedjuh');
  assert.equal(inputs.version, '1.0.0');
  assert.equal(inputs.productName, 'N');
});

test('the CLI product-name override sits below exportSettings and above the panel name', () => {
  // Only the compiling exporter passes this, and only from the command line — a shipped export
  // never uses it. It must not outrank a setting the panel author actually saved.
  const withSetting = identityInputsFromPanel(
    { name: 'PanelName', panelGuid: 'g', exportSettings: { pluginName: 'Saved' } }, 'x.cepanel',
    { productName: 'FromCli' });
  assert.equal(withSetting.productName, 'Saved');

  const withoutSetting = identityInputsFromPanel(
    { name: 'PanelName', panelGuid: 'g' }, 'x.cepanel', { productName: 'FromCli' });
  assert.equal(withoutSetting.productName, 'FromCli');
});

test('a missing GUID is reported as empty rather than invented', () => {
  // The C++ side refuses to derive at all without one and keeps its compiled-in identity. Inventing
  // a GUID here would give two GUID-less panels the same FUID, which is the collision the whole
  // per-panel identity scheme exists to prevent.
  assert.equal(identityInputsFromPanel({ name: 'No GUID' }, 'x.cepanel').guid, '');
});
