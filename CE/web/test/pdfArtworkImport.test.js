// File › New Panel / Update Panel / New Component from Vector Artwork with a PDF or an Illustrator file:
// read through its PDF part (utils/pdfArtwork.js, tested on its own in test/pdfArtwork.test.js), asked
// which artboard when there are several, and reported with where the names came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { panels, activePanel } from '../src/CE_Application/stores/panels.js';
import { importSvgPanelText, svgFromPdfBytes, pdfOriginText, updatePanelFromSvgText } from '../src/CE_Application/stores/svgPanelImportActions.js';
import { importSvgComponentText } from '../src/CE_Application/stores/artworkComponentActions.js';
import { answerDialog, clearScriptUi, currentNotifications, scriptDialog } from '../src/CE_Application/stores/scriptUi.js';
import { circle, illustratorPdf } from './support/pdfFixture.js';

const front = (pages = 1) => illustratorPdf({
  width: 300, height: 120, pages,
  layers: [
    { name: 'artwork', content: '0.15 g 0 0 300 120 re f' },
    { name: 'components', content: `1 0 0 rg ${circle(40, 60, 20)} f\n1 0 0 rg 100 20 16 80 re f` },
  ],
});
const lastNotice = () => currentNotifications().at(-1)?.message ?? '';

test('a PDF panel: its placeholders placed, and the notice says where they came from and that they were typed by colour', async () => {
  clearScriptUi();
  const read = await svgFromPdfBytes(front(), '/art/Synth front.pdf', { pdfjs });
  assert.ok(read, 'read');
  assert.deepEqual([read.origin.fileName, read.origin.page, read.origin.pages, read.origin.illustrator], ['Synth front.pdf', 1, 1, false]);
  const panel = importSvgPanelText(read.svg, '/art/Synth front.pdf', read.origin);
  assert.ok(panel);
  assert.equal(panel.name, 'Synth front');
  assert.equal(panel.controls.length, 2);
  assert.match(lastNotice(), /^Placed 2 control\(s\) on the artwork, read from Synth front\.pdf\./);
  assert.match(lastNotice(), /typed by their colour and shape, since a PDF keeps no names for them/);
});

test('Update Panel from an .ai: the question names the file, artboard included', async () => {
  clearScriptUi();
  const read = await svgFromPdfBytes(front(), 'Synth front.ai', { pdfjs });
  assert.equal(read.origin.illustrator, true);
  const before = get(panels).length;
  const panel = importSvgPanelText(read.svg, 'Synth front.ai', read.origin);
  assert.equal(get(panels).length, before + 1);
  assert.equal(get(activePanel)?.id, panel.id);
  let asked = '';
  updatePanelFromSvgText(read.svg, 'Synth front.ai', { origin: read.origin, confirm: (question) => { asked = question; return false; } });
  assert.match(asked, /^Update "Synth front" from Synth front\.ai\?/);
});

test('a file with several artboards asks which, in the app\'s own list; Cancel stops without a complaint', async () => {
  clearScriptUi();
  const unsubscribe = scriptDialog.subscribe((dialog) => {
    if (!dialog) return;
    assert.equal(dialog.ask, 'list');
    assert.equal(dialog.title, 'Which artboard?');
    assert.deepEqual(dialog.items, ['Artboard 1', 'Artboard 2', 'Artboard 3']);
    queueMicrotask(() => answerDialog('Artboard 2'));
  });
  const read = await svgFromPdfBytes(front(3), 'Front.ai', { pdfjs });
  unsubscribe();
  assert.deepEqual([read.origin.page, read.origin.pages], [2, 3]);
  assert.equal(pdfOriginText(read.origin), 'the PDF part of Front.ai, artboard 2 of 3');

  const stop = scriptDialog.subscribe((dialog) => { if (dialog) queueMicrotask(() => answerDialog(undefined)); });
  const cancelled = await svgFromPdfBytes(front(3), 'Front.ai', { pdfjs });
  stop();
  assert.equal(cancelled, null);
  assert.equal(currentNotifications().length, 0, 'nothing to report: the author chose not to');
});

test('an .ai knob: a dial, and the notice says it was read from the PDF part and named from its top-level layers', async () => {
  clearScriptUi();
  const bytes = illustratorPdf({
    width: 100, height: 100,
    layers: [
      { name: 'skirt', content: `0.3 g ${circle(50, 50, 40)} f` },
      { name: 'cap', content: `0.8 g ${circle(50, 50, 28)} f` },
      { name: 'pointer', content: '1 0.5 0 rg 48 60 4 22 re f' },
    ],
  });
  const read = await svgFromPdfBytes(bytes, 'Knob vintage.ai', { pdfjs });
  const document = await importSvgComponentText(read.svg, 'Knob vintage.ai', read.origin);
  assert.ok(document);
  assert.match(lastNotice(), /^A dial of 3 layers/);
  assert.match(lastNotice(), /Read from the PDF part of Knob vintage\.ai; named from its top-level layers: skirt, cap, pointer\./);
});

test('an Illustrator file saved without PDF compatibility is refused, saying how to save it', async () => {
  clearScriptUi();
  const old = new Uint8Array(Buffer.from('%!PS-Adobe-3.0 \n%%Creator: Adobe Illustrator(R) 8.0\n', 'latin1'));
  assert.equal(await svgFromPdfBytes(old, 'Old knob.ai', { pdfjs }), null);
  const notice = currentNotifications().at(-1);
  assert.equal(notice.kind, 'error');
  assert.match(notice.message, /saved without PDF compatibility.*Create PDF Compatible File/s);
});

test('the three artwork items say Vector Artwork, and the app\'s dialog offers SVG, PDF and Illustrator files', () => {
  const menu = readFileSync(new URL('../src/CE_Application/layout/MenuBar.svelte', import.meta.url), 'utf8');
  for (const label of ['New Panel from Vector Artwork...', 'Update Panel from Vector Artwork...', 'New Component from Vector Artwork...']) {
    assert.ok(menu.includes(`label: '${label}'`), label);
  }
  assert.doesNotMatch(menu, /from SVG Artwork/);
  const actions = readFileSync(new URL('../src/CE_Application/stores/svgPanelImportActions.js', import.meta.url), 'utf8');
  assert.match(actions, /patterns: '\*\.svg;\*\.pdf;\*\.ai'/);
  assert.match(actions, /input\.accept = '\.svg,\.pdf,\.ai,/);
});
