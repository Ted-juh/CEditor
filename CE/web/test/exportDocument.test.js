// exportDocument.test.js — a saved .cepanel made into the export payload before a plug-in is built.
//
// The bug this pins: export-panel-vst3.mjs derived the host parameter list from a saved file's
// sparse controls. On QA-08 that gave 5 parameters where the panel has 60. The payload's controls
// are a diff too now, but derived from whole ones and carrying their defaults (exportForm.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { exportFormFor, isExportForm } from '../../../tools/scripts/lib/exportDocument.mjs';
import { deriveExportParameters } from '../src/CE_Application/utils/exportParameters.js';
import { expandControl } from '../src/CE_Application/stores/documentShape.js';

const read = (file) => JSON.parse(readFileSync(new URL(`../../qa/${file}`, import.meta.url), 'utf8'));

test('a saved document is not the payload; its export form is, and is left alone', async () => {
  const saved = read('QA-08-export.cepanel');
  assert.equal(isExportForm(saved), false);
  const payload = await exportFormFor(saved, 'QA-08-export.cepanel');
  assert.equal(isExportForm(payload), true);
  assert.ok(payload.controlDefaults?.types, 'it carries the defaults its controls are a diff against');
  assert.equal(await exportFormFor(payload), payload, 'a payload is returned as it is');
});

test('the parameter list comes from full controls, as the editor derives it', async () => {
  const saved = read('QA-08-export.cepanel');
  const fromSparse = deriveExportParameters(saved).length;
  const payload = await exportFormFor(saved, 'QA-08-export.cepanel');
  const fromPayload = payload.exportParameters.length;
  const fromEditor = deriveExportParameters({ ...saved, controls: saved.controls.map(expandControl) }).length;
  assert.equal(fromPayload, fromEditor);
  assert.equal(fromPayload, saved.exportParameters.length, 'what the editor baked on save');
  assert.ok(fromSparse < fromPayload, `the sparse derivation was the bug (${fromSparse} vs ${fromPayload})`);
});

test('the payload keeps the panel identity and every control', async () => {
  const saved = read('QA-01-components.cepanel');
  const payload = await exportFormFor(saved, 'QA-01-components.cepanel');
  assert.equal(payload.panelGuid, saved.panelGuid);
  assert.equal(payload.name, saved.name, 'the panel\'s own name, not its file\'s');
  assert.equal(payload.controls.length, saved.controls.length);
  assert.ok(payload.controls.every((control) => payload.controlDefaults.types[control._children.Core.controlType]),
    'the defaults of every control type it uses');
});

test('what the app hands the exporter is the payload, through its whole preparation', async () => {
  const { deserializePanel } = await import('../src/CE_Application/stores/panelModel.js');
  const { serializePanelForExport } = await import('../src/CE_Application/stores/panels.js');
  const { preparePanelForExport } = await import('../src/CE_Application/stores/panelExportPreparation.js');
  const text = readFileSync(new URL('../../qa/QA-08-export.cepanel', import.meta.url), 'utf8');
  const panel = deserializePanel(text, null, 'QA-08-export');
  const prepared = JSON.parse(await preparePanelForExport(serializePanelForExport(panel)));
  assert.equal(prepared.documentForm, 'export');
  assert.equal(isExportForm(prepared), true);
  assert.equal(await exportFormFor(prepared), prepared, 'so the exporter leaves it exactly as the app made it');
  assert.equal(prepared.exportParameters.length, 60, 'with the host parameters derived from whole controls');
});

// Rendered looks (utils/renderedLookCore.js): the editor bakes their images into its export; a saved
// file exported by the tools is baked in headless Chromium (tools/scripts/lib/bakeRenderedLooks.mjs).
const renderedStarter = () => {
  const doc = JSON.parse(readFileSync(new URL('../../panels/Control set starters/brassworks.cepanel', import.meta.url), 'utf8'));
  const first = (type) => doc.controls.find((control) => control._children.Core.controlType === type);
  const mark = (control, part, props) => {
    const parts = control._children.Parts ??= { _type: 'Parts', _children: {} };
    parts._children ??= {};
    parts._children[part] = { ...(parts._children[part] ?? {}), ...props };
  };
  mark(first('Knob'), 'bodyCap', { look: 'rendered', renderProfile: 'knurled', turns: true });
  mark(first('Slider'), 'pointerCurrent', { look: 'rendered', kind: 'block', renderTop: 'ridged' });
  mark(first('Button'), 'key', { look: 'rendered', renderTop: 'dish' });
  return doc;
};

test('a panel with no rendered part asks for no images and starts no browser', async () => {
  const { bakeRenderedLookImages } = await import('../../../tools/scripts/lib/bakeRenderedLooks.mjs');
  const { deserializePanel } = await import('../src/CE_Application/stores/panelModel.js');
  const doc = read('QA-08-export.cepanel');
  const panel = deserializePanel(JSON.stringify(doc), 'QA-08-export.cepanel', doc.name ?? null);
  assert.deepEqual(await bakeRenderedLookImages(panel), { images: {}, wanted: 0, reason: '' });
  assert.equal((await exportFormFor(doc, 'QA-08-export.cepanel')).renderedLookImages, undefined);
});

test('a saved panel\'s rendered parts are baked into its export where a browser is', { skip: !process.env.CHROMIUM_PATH && 'set CHROMIUM_PATH to draw them' }, async () => {
  const payload = await exportFormFor(renderedStarter(), 'brassworks.cepanel');
  const specs = Object.keys(payload.renderedLookImages ?? {}).map((key) => JSON.parse(key)[0]);
  // Eight turns of the knurled cap, the ridged fader cap and the dished key: what the parts ask for.
  assert.equal(specs.length, 10);
  assert.equal(specs.filter((spec) => spec.shape === 'knurled').length, 8);
  assert.deepEqual(specs.filter((spec) => spec.shape === 'block').map((spec) => spec.topKind).sort(), ['dish', 'ridged']);
  assert.ok(specs.every((spec) => spec.body !== '#C9CCD0' && spec.body !== '#2A2D31'), 'each coloured as its set draws it, not the fallback');
  for (const url of Object.values(payload.renderedLookImages)) assert.match(url, /^data:image\/png;base64,/);
});
