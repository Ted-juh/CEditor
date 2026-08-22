// exportIdentity.js mirrors C++ PanelExportIdentity (deriveIdentity) exactly — the Export settings
// UI previews what the export pipeline builds. These fixtures pin the JS side to the same values
// the C++ tests (PanelExportIdentityTests.cpp) and the export script's self-check assert, so drift
// between the two implementations fails here rather than shipping a plugin under the wrong identity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveIdentity } from '../src/CE_Application/utils/exportIdentity.js';

const FIXTURE = ['guid-AAAA-1111', 'GAIA Filter', 'Tedjuh', 'Tdjh', '1.0.0'];

test('pluginCode and auSubtype match the canonical C++ output', () => {
  const id = deriveIdentity(...FIXTURE);
  assert.equal(id.pluginCode, 'HlSQ');
  assert.equal(id.auSubtype, 'HU7n');
});

test('clapId is reverse-DNS, slugged, and ends in the guid hash', () => {
  const id = deriveIdentity(...FIXTURE);
  assert.match(id.clapId, /^com\.tedjuh\.gaia-filter\.[0-9a-f]{8}$/,
    `clapId shape: ${id.clapId}`);
});

test('clapId is stable for a guid and distinct across guids with the same name', () => {
  const a = deriveIdentity('guid-AAAA-1111', 'Same Name', 'Tedjuh', 'Tdjh', '1.0.0');
  const a2 = deriveIdentity('guid-AAAA-1111', 'Same Name', 'Tedjuh', 'Tdjh', '1.0.0');
  const b = deriveIdentity('guid-BBBB-2222', 'Same Name', 'Tedjuh', 'Tdjh', '1.0.0');
  assert.equal(a.clapId, a2.clapId, 'same guid -> same clapId');
  assert.notEqual(a.clapId, b.clapId, 'different guid -> different clapId (the Ctrlr fix, CLAP flavor)');
});

test('clapId degrades gracefully without vendor or name', () => {
  const id = deriveIdentity('guid-CCCC-3333', '', '', 'Tdjh', '1.0.0');
  assert.match(id.clapId, /^com\.ceditor\.[0-9a-f]{8}$/,
    `fallback vendor slug and no name segment: ${id.clapId}`);
});
