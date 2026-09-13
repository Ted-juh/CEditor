import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePanelForExport } from '../src/CE_Application/stores/panelExportPreparation.js';
import { createControl } from '../src/CE_Application/models/componentTypes.js';
import { fileCache } from '../src/CE_Application/stores/fileCache.js';

test('both export paths receive portable artwork, automation and current TypeScript', async () => {
  const artPath = 'C:/release-test/background.svg';
  const data = 'data:image/svg+xml;base64,PHN2Zy8+';
  fileCache.set({ [artPath]: data });
  const panel = {
    panelGuid: 'portable-export', name: 'Portable Export', filePath: 'C:/private/panel.cepanel',
    controls: [createControl('Knob')], bgImage: artPath,
    deviceSession: { restorePolicy: 'ask', marker: 'preserve recall' },
    scripts: [{ language: 'typescript', source: 'function onPanelReady() { const amount: number = 2; set("amount", amount); }', compiledJs: 'stale' }],
  };
  const source = JSON.stringify(panel);
  const result = JSON.parse(await preparePanelForExport(source));
  assert.equal(result.bgImage, data);
  assert.equal(result.filePath, undefined);
  assert.deepEqual(result.deviceSession, panel.deviceSession);
  assert.ok(result.exportParameters.length > 0, 'the knob must be host-automatable');
  assert.ok(result.scripting.apiVersion);
  assert.match(result.scripts[0].compiledJs, /amount = 2/);
  assert.doesNotMatch(result.scripts[0].compiledJs, /: number|stale/);
  assert.equal(JSON.stringify(panel), source, 'preparation does not modify the editable panel');
});

test('missing export artwork fails before a native build starts', async () => {
  fileCache.set({});
  await assert.rejects(preparePanelForExport(JSON.stringify({
    name: 'Missing artwork', panelGuid: 'missing-art', controls: [], bgImage: 'C:/missing/art.png',
  })), /panel assets could not be read.*art.png/);
});
