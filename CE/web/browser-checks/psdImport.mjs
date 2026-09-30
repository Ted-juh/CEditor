/**
 * psdImport.mjs — File › New Panel from Photoshop Artwork, in the editor.
 *
 * A Photoshop file is written here with ag-psd (a dark plate with a light stripe, and a hidden
 * "components" group holding a knob, a vertical red slider and a green button), handed to the same
 * function the menu command calls, and the editor is then checked the way a person would see it:
 * a new panel of the file's size, three controls where the placeholders were, and the artwork —
 * without the placeholders — as its background.
 *
 * Run: CE_BEHAVIOUR_URL=http://127.0.0.1:5199/ node browser-checks/psdImport.mjs
 */
import assert from 'node:assert/strict';
import { writePsdUint8Array } from 'ag-psd';
import { chromium } from 'playwright-core';

const base = process.env.CE_BEHAVIOUR_URL ?? 'http://127.0.0.1:5199/';
const failures = [];
const check = (name, fn) => {
  try { fn(); console.log(`  ok  ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}\n       ${error.message}`); }
};

function solid(name, left, top, w, h, rgba, extra = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { name, left, top, right: left + w, bottom: top + h, imageData: { width: w, height: h, data }, ...extra };
}
const W = 480;
const H = 240;
const file = writePsdUint8Array({
  width: W,
  height: H,
  imageData: { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) },
  children: [
    solid('Plate', 0, 0, W, H, [30, 34, 40, 255]),
    solid('Stripe', 0, 200, W, 12, [220, 180, 60, 255]),
    { name: 'components', hidden: true, children: [
      solid('knob-cutoff', 40, 40, 80, 80, [128, 128, 128, 255]),
      solid('Layer 3', 200, 30, 24, 150, [230, 20, 20, 255]),
      solid('Layer 4', 300, 60, 90, 40, [20, 200, 30, 255]),
    ] },
  ],
}, { noBackground: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto(base);
await page.waitForFunction(() => !!document.querySelector('.menu-bar, [role="menubar"]'), null, { timeout: 60000 });

const result = await page.evaluate(async (bytes) => {
  const { importPsdPanelBytes } = await import('/src/CE_Application/stores/psdPanelImportActions.js');
  const panel = await importPsdPanelBytes(new Uint8Array(bytes), 'C:/art/Filter Module.psd');
  await new Promise((resolve) => setTimeout(resolve, 800));
  return {
    name: panel?.name,
    size: [panel?.width, panel?.height],
    background: String(panel?.bgImage ?? '').slice(0, 22),
    controls: (panel?.controls ?? []).map((c) => [c._children.Core.controlType, c._children.Core.name, c._children.Transform.x, c._children.Transform.y]),
    drawn: document.querySelectorAll('.canvas-control').length,
  };
}, [...file]);

console.log('  ', JSON.stringify(result));
check('a new panel named after the file, at the file\'s size', () => {
  assert.equal(result.name, 'Filter Module');
  assert.deepEqual(result.size, [W, H]);
});
check('the artwork is its background', () => assert.equal(result.background, 'data:image/png;base64,'));
check('three controls, where the placeholders were', () => assert.deepEqual(result.controls, [
  ['Knob', 'cutoff', 40, 40], ['Slider', 'Layer_3', 200, 30], ['Button', 'Layer_4', 300, 60],
]));
check('and on the canvas', () => assert.ok(result.drawn >= 3, `${result.drawn} drawn`));
await page.screenshot({ path: process.env.CE_SHOT ?? '/tmp/psd-import.png' });
check('no page errors', () => assert.deepEqual(errors, []));

await browser.close();
if (failures.length) { console.log(`\n${failures.length} failure(s)`); process.exit(1); }
console.log('\npsd import: all checks passed');
