/**
 * Vector artwork from a PDF or an Illustrator file, in the running editor (utils/pdfArtwork.js): pdf.js
 * as the editor loads it (the browser build, its worker run on the page), an .ai knob opened as a dial
 * named from its top-level layers, and a PDF panel's coloured placeholders placed.
 *
 *   node browser-checks/vectorArtwork.mjs
 */
import assert from 'node:assert/strict';
import { boot } from './behaviourKit.mjs';
import { circle, illustratorPdf } from '../test/support/pdfFixture.js';

const kit = await boot({ width: 1400, height: 900 });
const { page } = kit;
const base64 = (bytes) => Buffer.from(bytes).toString('base64');

try {
  await kit.fresh();
  const knob = base64(illustratorPdf({
    width: 100, height: 100,
    layers: [
      { name: 'skirt', content: `0.3 g ${circle(50, 50, 40)} f` },
      { name: 'cap', content: `0.8 g ${circle(50, 50, 28)} f` },
      { name: 'pointer', content: '1 0.5 0 rg 48 60 4 22 re f' },
    ],
  }));
  const opened = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { svgFromPdfBytes } = await window.__ceImport('/src/CE_Application/stores/svgPanelImportActions.js');
    const { importSvgComponentText } = await window.__ceImport('/src/CE_Application/stores/artworkComponentActions.js');
    const { currentNotifications } = await window.__ceImport('/src/CE_Application/stores/scriptUi.js');
    const read = await svgFromPdfBytes(bytes, 'Knob vintage.ai');
    if (!read) return { error: currentNotifications().at(-1)?.message ?? 'not read' };
    const document = await importSvgComponentText(read.svg, 'Knob vintage.ai', read.origin);
    return { opened: !!document, notice: currentNotifications().at(-1)?.message ?? '' };
  }, knob);
  assert.equal(opened.error, undefined, opened.error);
  assert.ok(opened.opened, 'the component opened');
  assert.match(opened.notice, /^A dial of 3 layers.*Read from the PDF part of Knob vintage\.ai; named from its top-level layers: skirt, cap, pointer\./s);
  await page.waitForSelector('.artboard', { timeout: 30000 });
  console.log(`  ok  an .ai knob opens as a dial in the Component Designer: "${opened.notice}"`);

  const panel = base64(illustratorPdf({
    width: 300, height: 120,
    layers: [
      { name: 'artwork', content: '0.15 g 0 0 300 120 re f' },
      { name: 'components', content: `1 0 0 rg ${circle(40, 60, 20)} f\n1 0 0 rg 100 20 16 80 re f` },
    ],
  }));
  const placed = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const { svgFromPdfBytes, importSvgPanelText } = await window.__ceImport('/src/CE_Application/stores/svgPanelImportActions.js');
    const read = await svgFromPdfBytes(bytes, 'Synth front.pdf');
    const made = importSvgPanelText(read.svg, 'Synth front.pdf', read.origin);
    return { controls: made?.controls?.map((control) => control._type ?? control.type ?? '') ?? [], background: String(made?.bgImage ?? '').slice(0, 26) };
  }, panel);
  assert.equal(placed.controls.length, 2, `two controls: ${placed.controls}`);
  assert.equal(placed.background, 'data:image/svg+xml;base64,');
  console.log(`  ok  a PDF panel: ${placed.controls.length} controls placed on its artwork`);
  assert.deepEqual(kit.failures, [], 'the page must not throw');
  console.log('vectorArtwork: an .ai and a PDF come in through pdf.js as the editor loads it');
} finally {
  await kit.close();
}
