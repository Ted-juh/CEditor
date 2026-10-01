// exportDocument.test.js — a saved .cepanel made complete before a plug-in is built from it.
//
// The bug this pins: export-panel-vst3.mjs derived the host parameter list from a saved file's
// sparse controls. On QA-08 that gave 5 parameters where the panel has 60.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { completeExportDocument, isSparseDocument } from '../../../tools/scripts/lib/exportDocument.mjs';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../../qa/${file}`, import.meta.url), 'utf8'));

test('a saved document is sparse; its completed form is not, and is left alone', async () => {
  const saved = read('QA-08-export.cepanel');
  assert.equal(isSparseDocument(saved), true);
  const complete = await completeExportDocument(saved, 'QA-08-export.cepanel');
  assert.equal(isSparseDocument(complete), false);
  assert.equal(await completeExportDocument(complete), complete, 'a complete document is returned as it is');
});

test('the parameter list comes from full controls, as the editor derives it', async () => {
  const saved = read('QA-08-export.cepanel');
  const fromSparse = deriveExportParameters(saved).length;
  const complete = await completeExportDocument(saved, 'QA-08-export.cepanel');
  const fromComplete = deriveExportParameters(complete).length;
  const fromEditor = deriveExportParameters({ ...saved, controls: saved.controls.map(expandControl) }).length;
  assert.equal(fromComplete, fromEditor);
  assert.equal(fromComplete, saved.exportParameters.length, 'what the editor baked on save');
  assert.ok(fromSparse < fromComplete, `the sparse derivation was the bug (${fromSparse} vs ${fromComplete})`);
});

test('the completed document keeps the panel identity and every control', async () => {
  const saved = read('QA-01-components.cepanel');
  const complete = await completeExportDocument(saved, 'QA-01-components.cepanel');
  assert.equal(complete.panelGuid, saved.panelGuid);
  assert.equal(complete.name, saved.name, 'the panel\'s own name, not its file\'s');
  assert.equal(complete.controls.length, saved.controls.length);
  assert.ok(complete.controls.every((control) => control._children?.Transform), 'every section written out');
});

test('what the app hands the exporter is marked complete, through its whole preparation', async () => {
  const { deserializePanel } = await import('../src/CE_Application/stores/panelModel.js');
  const { serializePanelForExport } = await import('../src/CE_Application/stores/panels.js');
  const { preparePanelForExport } = await import('../src/CE_Application/stores/panelExportPreparation.js');
  const text = readFileSync(new URL('../../qa/QA-08-export.cepanel', import.meta.url), 'utf8');
  const panel = deserializePanel(text, null, 'QA-08-export');
  const prepared = JSON.parse(await preparePanelForExport(serializePanelForExport(panel)));
  assert.equal(prepared.documentForm, 'complete');
  assert.equal(isSparseDocument(prepared), false);
  assert.equal(await completeExportDocument(prepared), prepared, 'so the exporter leaves it exactly as the app made it');
});
